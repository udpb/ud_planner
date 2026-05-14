/**
 * POST /api/express/save
 *
 * 모드 3종 (body 의 옵션으로 결정):
 *   1. 일반 자동 저장 — debounced 1500ms 마다 호출. expressDraft 만 갱신.
 *   2. handoffToDeep=true — Deep Track 으로 넘어가기 전 인계.
 *      Project.proposalConcept/proposalBackground/keyPlanningPoints/acceptedAssetIds + ProposalSection 7건 시드.
 *      1차본 승인 안 해도 정밀기획으로 갈 때 Express 의 진행 내용이 Deep 에 반영됨.
 *   3. markCompleted=true — 1차본 승인 (자동 검수 + 인계 + isCompleted + deepSuggestions).
 *
 * 인계 정책:
 *   - 자동 저장 (1번) 은 Project 필드 안 덮어씀 — Deep 에서 직접 수정한 값 보존
 *   - 명시적 인계 (2·3번) 시점에만 Project 필드 + ProposalSection sync
 *
 * 관련: docs/architecture/express-mode.md §3.2 (장치 7) / §7
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { ExpressDraftSchema } from '@/lib/express/schema'
import { ConversationStateSchema } from '@/lib/express/conversation'
import {
  mapDraftToProjectFields,
  mapDraftToProposalSections,
  suggestDeepAreas,
} from '@/lib/express/handoff'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

const BodySchema = z.object({
  projectId: z.string().min(1),
  draft: z.unknown(),
  conversationState: z.unknown().optional(),
  /** 마지막 N 턴만 캐시 (기본 30) */
  cacheTurnsLimit: z.number().int().min(0).max(100).optional(),
  /** isCompleted=true 로 설정 (1차본 승인) */
  markCompleted: z.boolean().optional(),
  /**
   * Deep Track 으로 넘어갈 때 Project 필드 + ProposalSection 7건 시드.
   * markCompleted 가 true 면 자동으로 true 로 처리.
   */
  handoffToDeep: z.boolean().optional(),
})

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.issues },
        { status: 400 },
      )
    }
    const {
      projectId,
      draft,
      conversationState,
      cacheTurnsLimit = 30,
      markCompleted = false,
      handoffToDeep = false,
    } = parsed.data

    // 권한 — 본인 또는 미배정 프로젝트 (Wave 1)
    const access = await requireProjectAccess(projectId)
    if (!access.ok) return access.response!

    // markCompleted 면 자동으로 인계도 같이
    const shouldHandoff = markCompleted || handoffToDeep

    // ExpressDraft 검증
    const draftValidation = ExpressDraftSchema.safeParse(draft)
    if (!draftValidation.success) {
      return NextResponse.json(
        {
          error: 'ExpressDraft validation failed',
          issues: draftValidation.error.issues.slice(0, 10),
        },
        { status: 400 },
      )
    }
    let validDraft = draftValidation.data

    // ─────────────────────────────────────────
    // Server-side merge — server-derived 필드는 DB 가 source of truth
    // (Phase Wave 1, ADR-013 race fix):
    //   - autoDiagnosis  : /api/express/diagnose 가 결정
    //   - intendedDepartment : /api/express/channel 이 결정
    //   - inspectionResult : /api/express/inspect 가 결정
    // 클라이언트 autosave 가 이들을 모르고 보낼 수 있으므로 DB 에서 읽어 보존.
    // 정책: 클라이언트가 명시적으로 보낸 값이 있으면 그것 우선 (예: diagnose 응답 직후 setDraft).
    // 클라이언트 값이 undefined 이고 DB 에 있으면 DB 값 보존.
    // ─────────────────────────────────────────
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
      select: { expressDraft: true },
    })
    const dbDraft = dbProject?.expressDraft
      ? ExpressDraftSchema.safeParse(dbProject.expressDraft)
      : null
    const dbMeta = dbDraft?.success ? dbDraft.data.meta : null

    validDraft = {
      ...validDraft,
      meta: {
        ...validDraft.meta,
        autoDiagnosis: validDraft.meta.autoDiagnosis ?? dbMeta?.autoDiagnosis,
        intendedDepartment:
          validDraft.meta.intendedDepartment ?? dbMeta?.intendedDepartment,
        inspectionResult:
          validDraft.meta.inspectionResult ?? dbMeta?.inspectionResult,
      },
    }

    if (markCompleted) {
      validDraft = {
        ...validDraft,
        meta: {
          ...validDraft.meta,
          isCompleted: true,
          completedAt: new Date().toISOString(),
        },
      }
    }

    // ConversationState 검증 (선택)
    let cachedTurns: unknown = undefined
    if (conversationState) {
      const stateValidation = ConversationStateSchema.safeParse(conversationState)
      if (stateValidation.success) {
        const state = stateValidation.data
        cachedTurns = {
          ...state,
          turns: state.turns.slice(-cacheTurnsLimit),
        }
      }
    }

    // ─────────────────────────────────────────
    // 일반 저장 — expressDraft 만
    // ─────────────────────────────────────────
    if (!shouldHandoff) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          expressDraft: validDraft as unknown as object,
          expressActive: true,
          ...(cachedTurns ? { expressTurnsCache: cachedTurns as unknown as object } : {}),
        },
      })

      return NextResponse.json({
        ok: true,
        savedAt: new Date().toISOString(),
        isCompleted: validDraft.meta.isCompleted,
        handoff: null,
      })
    }

    // ─────────────────────────────────────────
    // 인계 모드 — Project 필드 + ProposalSection 시드
    // ─────────────────────────────────────────
    const projectFields = mapDraftToProjectFields(validDraft)
    const proposalSeeds = mapDraftToProposalSections(validDraft)

    // 정밀화 추천 영역 (markCompleted 시에만)
    let deepSuggestions: ReturnType<typeof suggestDeepAreas> = []
    if (markCompleted) {
      const projectMeta = await prisma.project.findUnique({
        where: { id: projectId },
        select: { totalBudgetVat: true, rfpParsed: true },
      })
      const rfp = (projectMeta?.rfpParsed as unknown as RfpParsed | null) ?? null
      const evalImpactItem = rfp?.evalCriteria?.find((c) => /성과|임팩트|kpi/.test(c.item))
      const evalImpactWeight = evalImpactItem ? evalImpactItem.score / 100 : null
      deepSuggestions = suggestDeepAreas({
        draft: validDraft,
        totalBudgetVat: projectMeta?.totalBudgetVat ?? null,
        evalImpactWeight,
      })
    }

    await prisma.$transaction(async (tx) => {
      // 1) Project 본체 + Express 슬롯 + 인계 필드들
      await tx.project.update({
        where: { id: projectId },
        data: {
          expressDraft: validDraft as unknown as object,
          expressActive: true,
          ...(cachedTurns ? { expressTurnsCache: cachedTurns as unknown as object } : {}),
          // Express → Deep 인계 필드들 (handoff.ts §1)
          ...(projectFields.proposalConcept !== undefined
            ? { proposalConcept: projectFields.proposalConcept }
            : {}),
          ...(projectFields.proposalBackground !== undefined
            ? { proposalBackground: projectFields.proposalBackground }
            : {}),
          ...(projectFields.keyPlanningPoints !== undefined
            ? { keyPlanningPoints: projectFields.keyPlanningPoints as unknown as object }
            : {}),
          ...(projectFields.acceptedAssetIds !== undefined
            ? { acceptedAssetIds: projectFields.acceptedAssetIds as unknown as object }
            : {}),
        },
      })

      // 2) ProposalSection 7건 시드 — version=1
      //    기존 (projectId, sectionNo, version=1) 가 있으면 isApproved=false 일 때만 갱신.
      //    isApproved=true 인 사용자 승인본은 보존.
      for (const seed of proposalSeeds) {
        const existing = await tx.proposalSection.findUnique({
          where: {
            projectId_sectionNo_version: {
              projectId,
              sectionNo: seed.sectionNo,
              version: 1,
            },
          },
        })
        if (existing) {
          if (!existing.isApproved) {
            await tx.proposalSection.update({
              where: { id: existing.id },
              data: { content: seed.content, title: seed.title },
            })
          }
        } else {
          await tx.proposalSection.create({
            data: {
              projectId,
              sectionNo: seed.sectionNo,
              title: seed.title,
              content: seed.content,
              version: 1,
              isApproved: false,
            },
          })
        }
      }
    })

    return NextResponse.json({
      ok: true,
      savedAt: new Date().toISOString(),
      isCompleted: validDraft.meta.isCompleted,
      handoff: {
        projectFieldsUpdated: Object.keys(projectFields).length,
        proposalSectionsSeeded: proposalSeeds.length,
        deepSuggestions,
        mode: markCompleted ? 'completed' : 'handoff',
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/express/save] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

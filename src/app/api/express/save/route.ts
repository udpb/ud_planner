/**
 * POST /api/express/save
 *
 * 자동 저장 — debounced 500~1500ms 마다 호출.
 * Body: { projectId, draft, conversationState? }
 * 검증: ExpressDraftSchema.safeParse + 길이 캡.
 *
 * 관련: docs/architecture/express-mode.md §3.2 (장치 7)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ExpressDraftSchema } from '@/lib/express/schema'
import { ConversationStateSchema } from '@/lib/express/conversation'
import {
  mapDraftToProjectFields,
  mapDraftToProposalSections,
  suggestDeepAreas,
} from '@/lib/express/handoff'
import type { RfpParsed } from '@/lib/claude'

const BodySchema = z.object({
  projectId: z.string().min(1),
  draft: z.unknown(),
  conversationState: z.unknown().optional(),
  /** 마지막 N 턴만 캐시 (기본 30) */
  cacheTurnsLimit: z.number().int().min(0).max(100).optional(),
  /** isCompleted=true 로 설정 (1차본 승인) */
  markCompleted: z.boolean().optional(),
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
    const { projectId, draft, conversationState, cacheTurnsLimit = 30, markCompleted } = parsed.data

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
        // 마지막 N 턴만 캐시
        cachedTurns = {
          ...state,
          turns: state.turns.slice(-cacheTurnsLimit),
        }
      }
    }

    // DB 저장 — markCompleted 시 Project 필드 + ProposalSection 시드까지 transaction
    if (markCompleted) {
      const projectFields = mapDraftToProjectFields(validDraft)
      const proposalSeeds = mapDraftToProposalSections(validDraft)

      // 정밀화 추천 영역 — RFP·예산 단서 활용
      const projectMeta = await prisma.project.findUnique({
        where: { id: projectId },
        select: { totalBudgetVat: true, rfpParsed: true },
      })
      const rfp = (projectMeta?.rfpParsed as unknown as RfpParsed | null) ?? null
      const evalImpactItem = rfp?.evalCriteria?.find((c) => /성과|임팩트|kpi/.test(c.item))
      const evalImpactWeight = evalImpactItem ? evalImpactItem.score / 100 : null
      const deepSuggestions = suggestDeepAreas({
        draft: validDraft,
        totalBudgetVat: projectMeta?.totalBudgetVat ?? null,
        evalImpactWeight,
      })

      await prisma.$transaction(async (tx) => {
        // 1) Project 본체 + Express 슬롯
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

        // 2) ProposalSection 시드 — version=1 우선
        for (const seed of proposalSeeds) {
          // 기존 동일 (projectId, sectionNo, version=1) 있으면 upsert
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
            // 기존이 있으면 isApproved 가 false 일 때만 갱신
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
        isCompleted: true,
        handoff: {
          projectFieldsUpdated: Object.keys(projectFields).length,
          proposalSectionsSeeded: proposalSeeds.length,
          deepSuggestions,
        },
      })
    }

    // 일반 저장 (markCompleted=false)
    await prisma.project.update({
      where: { id: projectId },
      data: {
        expressDraft: validDraft as unknown as object,
        expressActive: true, // 한 번이라도 저장되면 active
        ...(cachedTurns ? { expressTurnsCache: cachedTurns as unknown as object } : {}),
      },
    })

    return NextResponse.json({
      ok: true,
      savedAt: new Date().toISOString(),
      isCompleted: validDraft.meta.isCompleted,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/express/save] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

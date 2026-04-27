/**
 * POST /api/express/init
 *
 * Express 첫 진입 시 호출.
 *  - ExpressDraft 가 없으면 빈 draft 생성
 *  - RFP 가 있으면 자산 매칭 → differentiators 시드 + 첫 턴 자동 호출
 *  - expressActive = true
 *
 * Body: { projectId, autoFirstTurn? }
 * Response: { draft, state, aiTurn?, nextSlot, matchedAssets, autoCitations }
 *
 * 관련: docs/architecture/express-mode.md §2.4
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { matchAssetsToRfp } from '@/lib/asset-registry'
import {
  ExpressDraftSchema,
  emptyDraft,
  calcProgress,
  type ExpressDraft,
} from '@/lib/express/schema'
import {
  ConversationStateSchema,
  emptyConversation,
} from '@/lib/express/conversation'
import { computeActiveSlots } from '@/lib/express/active-slots'
import { seedDifferentiatorsFromMatches } from '@/lib/express/asset-mapper'
import { processTurn } from '@/lib/express/process-turn'
import { selectNextSlot } from '@/lib/express/slot-priority'
import { buildAutoCitations } from '@/lib/express/auto-citations'
import type { RfpParsed } from '@/lib/claude'
import type { ProgramProfile } from '@/lib/program-profile'

const BodySchema = z.object({
  projectId: z.string().min(1),
  autoFirstTurn: z.boolean().optional().default(true),
})

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
    }
    const { projectId, autoFirstTurn } = parsed.data

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        rfpParsed: true,
        programProfile: true,
        totalBudgetVat: true,
        expressDraft: true,
        expressTurnsCache: true,
      },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const rfp = (project.rfpParsed as unknown as RfpParsed) ?? undefined
    const profile = (project.programProfile as unknown as ProgramProfile) ?? undefined

    // 기존 draft 가 있으면 그대로, 없으면 새로 생성
    let draft: ExpressDraft = (() => {
      const fromDb = project.expressDraft
      if (fromDb) {
        const r = ExpressDraftSchema.safeParse(fromDb)
        if (r.success) return r.data
      }
      return emptyDraft()
    })()

    let state = (() => {
      const cache = project.expressTurnsCache
      if (cache) {
        const r = ConversationStateSchema.safeParse(cache)
        if (r.success) return r.data
      }
      return emptyConversation(projectId)
    })()

    // active slots 결정
    const activeSlotResult = computeActiveSlots(rfp, profile)
    draft.meta.activeSlots = [...activeSlotResult.active]
    draft.meta.skippedSlots = [...activeSlotResult.skipped]

    // 자산 매칭
    let matchedAssets: Awaited<ReturnType<typeof matchAssetsToRfp>> = []
    if (rfp) {
      matchedAssets = await matchAssetsToRfp({
        rfp,
        profile,
        limit: 10,
        minScore: 0.5,
      }).catch(() => [])

      // 처음이면 differentiators 자동 시드
      if (!draft.differentiators || draft.differentiators.length === 0) {
        draft = seedDifferentiatorsFromMatches(draft, matchedAssets, 5)
      }
    }

    // 부차 기능 1줄 자동 인용
    const autoCitations = buildAutoCitations({
      rfp,
      profile,
      totalBudgetVat: project.totalBudgetVat,
    })

    // 첫 턴 자동 호출 — RFP 있고 turns 가 없을 때만
    let aiTurn: unknown = null
    let nextSlot: string | null = selectNextSlot(draft, rfp)
    if (autoFirstTurn && rfp && state.turns.length === 0) {
      const firstResult = await processTurn({
        state,
        draft,
        rfp,
        profile,
        matchedAssets,
        pmInput: '',
        firstTurn: true,
      }).catch((err) => {
        console.warn('[/api/express/init] firstTurn failed:', err?.message)
        return null
      })
      if (firstResult && firstResult.ok) {
        draft = firstResult.draft
        state = firstResult.state
        aiTurn = firstResult.aiTurn
        nextSlot = firstResult.nextSlot
      }
    }

    // 저장
    await prisma.project.update({
      where: { id: projectId },
      data: {
        expressDraft: draft as unknown as object,
        expressActive: true,
        expressTurnsCache: {
          ...state,
          turns: state.turns.slice(-30),
        } as unknown as object,
      },
    })

    const progress = calcProgress(draft, !!rfp)

    return NextResponse.json({
      ok: true,
      draft,
      state,
      aiTurn,
      nextSlot,
      matchedAssets,
      autoCitations,
      progress,
      hasRfp: !!rfp,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/express/init] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/express/turn
 *
 * Express 챗봇 1턴 처리.
 * Body: { projectId, pmInput, draft, conversationState, forceSlot? }
 * Response: { ok, draft, state, aiTurn, nextSlot, validationErrors, ... }
 *
 * 관련: docs/architecture/express-mode.md §2.1
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { processTurn } from '@/lib/express/process-turn'
import { ExpressDraftSchema, emptyDraft } from '@/lib/express/schema'
import { ConversationStateSchema, emptyConversation } from '@/lib/express/conversation'
import { matchAssetsToRfp } from '@/lib/asset-registry'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'
import { log } from '@/lib/logger'

const BodySchema = z.object({
  projectId: z.string().min(1),
  pmInput: z.string().default(''),
  draft: z.unknown().optional(),
  conversationState: z.unknown().optional(),
  forceSlot: z.string().nullable().optional(),
  firstTurn: z.boolean().optional(),
})

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60초

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
    const { projectId, pmInput, forceSlot, firstTurn } = parsed.data

    // 프로젝트 조회 (RFP·ProgramProfile·기존 draft)
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        rfpParsed: true,
        programProfile: true,
        expressDraft: true,
        expressTurnsCache: true,
      },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Draft — body 우선, 없으면 DB, 없으면 empty
    const draft = (() => {
      const fromBody = parsed.data.draft
      if (fromBody) {
        const r = ExpressDraftSchema.safeParse(fromBody)
        if (r.success) return r.data
      }
      const fromDb = project.expressDraft
      if (fromDb) {
        const r = ExpressDraftSchema.safeParse(fromDb)
        if (r.success) return r.data
      }
      return emptyDraft()
    })()

    // ConversationState — body 우선, 없으면 cache, 없으면 empty
    const state = (() => {
      const fromBody = parsed.data.conversationState
      if (fromBody) {
        const r = ConversationStateSchema.safeParse(fromBody)
        if (r.success) return r.data
      }
      const cache = project.expressTurnsCache
      if (cache) {
        const r = ConversationStateSchema.safeParse(cache)
        if (r.success) return r.data
      }
      return emptyConversation(projectId)
    })()

    // RFP / Profile 추출
    const rfp = (project.rfpParsed as unknown as RfpParsed) ?? undefined
    const profile = (project.programProfile as unknown as ProgramProfile) ?? undefined

    // 매칭 자산 (RFP 있을 때만)
    const matchedAssets = rfp
      ? await matchAssetsToRfp({ rfp, profile, limit: 10, minScore: 0.5 }).catch(() => [])
      : []

    // 턴 처리
    const result = await processTurn({
      state,
      draft,
      rfp,
      profile,
      matchedAssets,
      pmInput,
      forceSlot: forceSlot === undefined ? undefined : forceSlot,
      firstTurn: firstTurn ?? false,
    })

    return NextResponse.json({
      ok: result.ok,
      draft: result.draft,
      state: result.state,
      aiTurn: result.aiTurn,
      pmTurn: result.pmTurn,
      nextSlot: result.nextSlot,
      validationErrors: result.validationErrors,
      externalLookupNeeded: result.externalLookupNeeded,
      fellbackToPlaceholder: result.fellbackToPlaceholder,
      aiProvider: result.aiProvider,
      aiModel: result.aiModel,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('express-turn-route', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

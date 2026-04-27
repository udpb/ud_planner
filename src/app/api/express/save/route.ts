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

    // DB 저장
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

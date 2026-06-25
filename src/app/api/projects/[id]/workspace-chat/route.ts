/**
 * /api/projects/[id]/workspace-chat — 워크스페이스 대화 영속 (BR-WS-20)
 *
 * WorkspaceChat 메시지는 client state 라 새로고침 시 welcome 으로 리셋된다.
 * PUT 으로 프로젝트별 대화를 서버에 저장 → 재진입 시 loadWorkspace 가 복원한다.
 *
 * 저장처: 기존 미사용 `Project.expressTurnsCache`(Json?) 재사용 — 스키마 변경 0.
 *   - Express 트랙은 ADR-029 폐기 수순이라 이 필드 현재 미사용(충돌 위험 낮음).
 *   - 이 필드는 워크스페이스 chat 전용 — read-merge 불필요(messages 통째 write).
 *
 * 인증: requireProjectAccess (planning-intent route 미러 — PM 본인/미배정/ADMIN·DIRECTOR/dev).
 * AI 호출 없음(순수 저장). 실패 시 500.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** WorkspaceChat 의 ChatMessage 과 동일 형태(저장 대상 최소 필드). */
interface StoredChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  choices?: unknown
  choicePicked?: boolean
}

/** 최근 N 개만 저장(무한 누적 방지). */
const MAX_STORED = 200

/**
 * 외부 입력(unknown[]) → 저장 가능한 메시지 배열로 정제.
 * 항목 형태({id,role,text})가 맞는 것만 통과 — 불량은 버린다(throw 금지).
 * choices/choicePicked 는 있으면 보존(형태 검증 없이 그대로 — 읽기 측에서 렌더 가드).
 */
function sanitizeMessages(input: unknown): StoredChatMessage[] {
  if (!Array.isArray(input)) return []
  const out: StoredChatMessage[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const m = raw as Record<string, unknown>
    if (typeof m.id !== 'string') continue
    if (m.role !== 'user' && m.role !== 'assistant') continue
    if (typeof m.text !== 'string') continue
    const msg: StoredChatMessage = { id: m.id, role: m.role, text: m.text }
    if (m.choices !== undefined) msg.choices = m.choices
    if (typeof m.choicePicked === 'boolean') msg.choicePicked = m.choicePicked
    out.push(msg)
  }
  return out.slice(-MAX_STORED)
}

// ─────────────────────────────────────────────────────────────────
// PUT — 대화 저장 (expressTurnsCache write)
// ─────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawMessages = (body as { messages?: unknown }).messages
  if (!Array.isArray(rawMessages)) {
    return NextResponse.json({ error: 'messages 누락/형식 오류' }, { status: 400 })
  }
  const messages = sanitizeMessages(rawMessages)

  try {
    await prisma.project.update({
      where: { id },
      data: { expressTurnsCache: messages as unknown as object },
    })
  } catch (err) {
    console.error('[workspace-chat] 저장 실패:', err)
    return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: messages.length })
}

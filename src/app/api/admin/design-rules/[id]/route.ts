/**
 * PATCH /api/admin/design-rules/[id] — DesignRule 검수 결과 되기록 (BR-2)
 *
 * Body: { status?: "draft"|"approved"|"rejected", reviewerNote?: string }
 *   - status 만 → status 갱신
 *   - reviewerNote 만 → 메모만 갱신 (status 는 현재값 유지로 다시 보냄)
 *   - 둘 다 → 함께 갱신
 *
 * saveRuleStatus 가 `data/program-design/design-rules.json` 의 해당 규칙
 * status/reviewerNote 라인만 surgical 패치(원자적 temp→rename). DB 아님 (JSON-first, ADR-028 Option B).
 *
 * 인증: ADMIN | DIRECTOR (검수 권한).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import {
  loadDesignRules,
  saveRuleStatus,
  RuleStatusSchema,
} from '@/lib/program-design/design-rule'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    status: RuleStatusSchema.optional(),
    reviewerNote: z.string().max(800).optional(),
  })
  .refine((b) => b.status !== undefined || b.reviewerNote !== undefined, {
    message: 'status 또는 reviewerNote 중 하나는 있어야 합니다.',
  })

async function ensureReviewer(): Promise<
  { ok: true; userId: string } | { ok: false; status: number; error: string }
> {
  const session = await auth()
  if (!session?.user) return { ok: false, status: 401, error: 'Not authenticated' }
  const role = (session.user as { role?: string }).role
  if (role !== 'ADMIN' && role !== 'DIRECTOR') {
    return { ok: false, status: 403, error: 'Forbidden — ADMIN/DIRECTOR 만 검수 가능' }
  }
  const userId = (session.user as { id?: string }).id ?? session.user.email ?? 'unknown'
  return { ok: true, userId }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await ensureReviewer()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const { id } = await params

  try {
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.issues },
        { status: 400 },
      )
    }
    const { status, reviewerNote } = parsed.data

    // status 미지정 시(메모만 변경) → 현재 status 유지를 위해 로드.
    let nextStatus = status
    if (nextStatus === undefined) {
      const set = await loadDesignRules()
      const current = set.rules.find((r) => r.id === id)
      if (!current) {
        return NextResponse.json({ error: `규칙을 찾지 못함: ${id}` }, { status: 404 })
      }
      nextStatus = current.status
    }

    const updated = await saveRuleStatus(id, nextStatus, reviewerNote)
    return NextResponse.json({ ok: true, rule: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // 규칙 미존재 → 404, 그 외 → 500.
    const notFound = msg.includes('찾지 못했습니다') || msg.includes('찾지 못함')
    console.error('[/api/admin/design-rules/[id]] PATCH error:', msg)
    return NextResponse.json({ error: msg }, { status: notFound ? 404 : 500 })
  }
}

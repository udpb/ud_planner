/**
 * GET /api/projects/[id]/predict-score
 *
 * 규칙 기반 예상 점수 계산 결과를 반환.
 * - 인증 필요 (NextAuth JWT 세션)
 * - evalStrategy 가 없으면 totalScore=0 인 빈 결과 반환 (에러 아님)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildPipelineContext } from '@/lib/pipeline-context'
import { calculatePredictedScore } from '@/modules/predicted-score/calculate'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const viewerId =
    (session.user as { id?: string })?.id ?? session.user.email ?? undefined

  try {
    const context = await buildPipelineContext(id, { viewerId })
    const breakdown = calculatePredictedScore(context)
    return NextResponse.json(breakdown)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (/not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    console.error('[predict-score] 계산 실패:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

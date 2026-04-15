/**
 * GET /api/projects/[id]/pipeline-context
 *
 * 단일 프로젝트의 모든 파이프라인 산출물을 PipelineContext 객체로 조립해 반환.
 * (data-contract.md §1.1 / §1.2 / §3 참조)
 *
 * - 인증 필요 (NextAuth JWT 세션)
 * - 권한별 필터링은 도입 전 — 일단 인증만 체크
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildPipelineContext } from '@/lib/pipeline-context'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const context = await buildPipelineContext(id)
    return NextResponse.json(context)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // 프로젝트 미존재는 404 로 매핑
    if (/not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    console.error('[pipeline-context] 조립 실패:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

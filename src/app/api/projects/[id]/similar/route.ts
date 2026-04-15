/**
 * GET /api/projects/[id]/similar
 *
 * 기준 프로젝트의 RFP 특성을 바탕으로 과거 유사 프로젝트 top N 을 반환한다.
 * AI 호출 없음 — 키워드 Jaccard / 발주처 / 예산 / 대상자 단계 가중 합산.
 *
 * 쿼리 파라미터:
 *   - topN        (기본 5)
 *   - minScore    (기본 0.2, 0~1)
 *   - includeLost (기본 true — 수주 실패 프로젝트도 참조 대상)
 *
 * 응답: SimilarProject[] (src/lib/pipeline-context.ts §1.2)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { findSimilarProjects } from '@/lib/similar-projects'

type Params = { params: Promise<{ id: string }> }

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

function parseMinScore(raw: string | null, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) return fallback
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const url = new URL(req.url)

  const topN = parsePositiveInt(url.searchParams.get('topN'), 5)
  const minScore = parseMinScore(url.searchParams.get('minScore'), 0.2)
  const includeLost = url.searchParams.get('includeLost') !== 'false'

  try {
    const results = await findSimilarProjects(id, { topN, minScore, includeLost })
    return NextResponse.json(results)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/projects/similar] 검색 실패:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

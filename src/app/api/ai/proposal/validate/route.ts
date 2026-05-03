/**
 * POST /api/ai/proposal/validate — Gate 3 AI 검증
 *
 * 제안서 섹션에 대해 3가지 AI 검증을 병렬 실행하여 Gate3Report 를 반환.
 *   3a. 당선 패턴 대조
 *   3b. 평가위원 시뮬레이션
 *   3c. 논리 체인 검증
 *
 * 자동 블록 없음 — 리포트만 반환, PM 최종 판단.
 *
 * Request:  { projectId, sectionNo, sectionContent }
 * Response: Gate3Report  |  { error }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildPipelineContext } from '@/lib/pipeline-context'
import type { ProposalSectionNo } from '@/lib/proposal-ai'
import { runGate3 } from '@/modules/gate3-validation/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 3 AI 검증 병렬 — 60초 위험 영역

function isValidSectionNo(n: unknown): n is ProposalSectionNo {
  return typeof n === 'number' && n >= 1 && n <= 7 && Number.isInteger(n)
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as {
      projectId?: string
      sectionNo?: number
      sectionContent?: string
    }
    const { projectId, sectionNo, sectionContent } = body

    if (!projectId || !isValidSectionNo(sectionNo) || !sectionContent) {
      return NextResponse.json(
        { error: 'projectId, sectionNo(1~7), sectionContent 필요' },
        { status: 400 },
      )
    }

    // 1. PipelineContext 조립
    const userId = (session.user as { id?: string }).id
    const context = await buildPipelineContext(projectId, {
      viewerId: typeof userId === 'string' ? userId : undefined,
    })

    // 2. Gate 3 검증 실행 (3개 병렬)
    const report = await runGate3(sectionNo, sectionContent, context)

    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gate 3 검증 실패'
    console.error('[gate3-validate] error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

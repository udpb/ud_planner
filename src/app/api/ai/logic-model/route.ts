/**
 * POST /api/ai/logic-model  (stateless)
 *
 * 커리큘럼·코치·예산 슬라이스를 바탕으로 결정론적 Activity/Input 을 생성하고
 * Claude 로 Output/Outcome/Impact 를 생성하여 LogicModel 을 반환.
 *
 * 저장 ❌ — PM 이 Step 5 UI 에서 확정한 후 별도 PATCH 가 저장함.
 *
 * 관련 문서:
 *   - 브리프: `.claude/agent-briefs/redesign/C2-logic-model-builder.md`
 *   - ADR-004: `docs/decisions/004-activity-session-mapping.md` (알고리즘)
 *   - ADR-001: `docs/decisions/001-pipeline-reorder.md` (커리큘럼 선행 원칙)
 *   - 데이터 계약: `docs/architecture/data-contract.md` §1.2 ImpactSlice
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildPipelineContext } from '@/lib/pipeline-context'
import { buildLogicModel } from '@/lib/logic-model-builder'

interface LogicModelRequestBody {
  projectId?: string
  impactGoal?: string
}

export async function POST(req: NextRequest) {
  // 인증
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 요청 파싱
  let body: LogicModelRequestBody
  try {
    body = (await req.json()) as LogicModelRequestBody
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const projectId = body.projectId?.trim()
  if (!projectId) {
    return NextResponse.json({ error: 'PROJECT_ID_REQUIRED' }, { status: 400 })
  }

  const impactGoal = body.impactGoal?.trim() ?? ''
  if (!impactGoal || impactGoal.length < 5) {
    return NextResponse.json({ error: 'IMPACT_GOAL_REQUIRED' }, { status: 400 })
  }

  // PipelineContext 조립
  let ctx: Awaited<ReturnType<typeof buildPipelineContext>>
  try {
    ctx = await buildPipelineContext(projectId, {
      viewerId: session.user.id ?? undefined,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Project not found')) {
      return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'CONTEXT_BUILD_FAILED', message: msg }, { status: 500 })
  }

  // ADR-001 원칙: 커리큘럼 선행
  if (!ctx.curriculum || ctx.curriculum.sessions.length === 0) {
    return NextResponse.json({ error: 'CURRICULUM_REQUIRED' }, { status: 400 })
  }

  if (!ctx.rfp) {
    return NextResponse.json({ error: 'RFP_REQUIRED' }, { status: 400 })
  }

  // Logic Model 생성 (AI 호출 + 재시도)
  const result = await buildLogicModel({
    rfp: ctx.rfp,
    curriculum: ctx.curriculum,
    coaches: ctx.coaches,
    budget: ctx.budget,
    impactGoal,
  })

  if (!result.ok) {
    console.error('[logic-model] 생성 실패:', result.error)
    return NextResponse.json(
      {
        error: 'AI_GENERATION_FAILED',
        message: result.error,
        ...(process.env.NODE_ENV !== 'production' && result.raw
          ? { raw: result.raw.slice(0, 2000) }
          : {}),
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ logicModel: result.data })
}

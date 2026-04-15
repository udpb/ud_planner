/**
 * PATCH /api/projects/[id]/rfp
 *
 * Step 1 (RFP + 기획 방향) 확정 저장 엔드포인트.
 *
 * 클라이언트 (B4 step-rfp.tsx) 가 PM 확정 시점에 호출.
 * B0 Prisma 신규 필드 4개에 partial update 를 수행한다:
 *   - proposalBackground  (string)
 *   - proposalConcept     (string, 300자 이내)
 *   - keyPlanningPoints   (string[], 최대 10개)
 *   - evalStrategy        (EvalStrategy | null)
 *
 * 인증: NextAuth 세션 필수.
 *
 * 관련:
 *   - 브리프: `.claude/agent-briefs/redesign/B4-step-rfp-redesign.md`
 *   - 데이터 계약: `docs/architecture/data-contract.md` §1.2 RfpSlice, §3
 *   - 타입 SSoT: `src/lib/pipeline-context.ts` (EvalStrategy)
 */

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────
// 입력 검증 스키마
// ─────────────────────────────────────────

const EvalStrategyTopItemSchema = z.object({
  name: z.string(),
  points: z.number().nonnegative(),
  section: z.string(),
  weight: z.number().min(0).max(1),
  guidance: z.string(),
})

const EvalStrategySchema = z
  .object({
    topItems: z.array(EvalStrategyTopItemSchema),
    sectionWeights: z.record(z.string(), z.number()),
    overallGuidance: z.array(z.string()),
    // 하위호환 필드 — 있어도 통과
    criteria: z.array(z.unknown()).optional(),
    topItem: z.string().optional(),
    summary: z.string().optional(),
  })
  .passthrough()

const PatchRfpSchema = z.object({
  proposalBackground: z.string().max(4000).optional(),
  proposalConcept: z.string().max(300).optional(),
  keyPlanningPoints: z.array(z.string().max(500)).max(10).optional(),
  evalStrategy: z.union([EvalStrategySchema, z.null()]).optional(),
})

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────
// PATCH 핸들러
// ─────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  // 인증
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // 프로젝트 존재 확인
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 })
  }

  // 요청 파싱
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const parsed = PatchRfpSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { proposalBackground, proposalConcept, keyPlanningPoints, evalStrategy } = parsed.data

  // 적어도 한 필드는 업데이트 대상이어야 함
  if (
    proposalBackground === undefined &&
    proposalConcept === undefined &&
    keyPlanningPoints === undefined &&
    evalStrategy === undefined
  ) {
    return NextResponse.json({ error: 'NO_FIELDS_TO_UPDATE' }, { status: 400 })
  }

  const data: Prisma.ProjectUpdateInput = {}
  if (proposalBackground !== undefined) data.proposalBackground = proposalBackground
  if (proposalConcept !== undefined) data.proposalConcept = proposalConcept
  if (keyPlanningPoints !== undefined) {
    data.keyPlanningPoints = keyPlanningPoints as unknown as Prisma.InputJsonValue
  }
  if (evalStrategy !== undefined) {
    // null 을 명시적으로 보내면 JSON null 로 저장
    data.evalStrategy =
      evalStrategy === null
        ? Prisma.JsonNull
        : (evalStrategy as unknown as Prisma.InputJsonValue)
  }

  try {
    const updated = await prisma.project.update({
      where: { id },
      data,
      select: { id: true, updatedAt: true },
    })
    return NextResponse.json({
      ok: true,
      projectId: updated.id,
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/projects/rfp] PATCH 실패:', err)
    return NextResponse.json({ error: 'DB_UPDATE_FAILED', message }, { status: 500 })
  }
}

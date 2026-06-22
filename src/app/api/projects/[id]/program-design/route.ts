/**
 * POST /api/projects/[id]/program-design  (BR-3b)
 *
 * 턴 기반 프로그램 기획 엔진(`planProgram`)을 production 라우트에 배선.
 *   - body: { precedent?, intent?, decisions?, save? }
 *       precedent / intent : 토대잡기 입력 (선례·담당자 의도)
 *       decisions          : 누적된 게이트 응답 (axis → 값) — 턴마다 재호출
 *       save               : true 면 최종안을 data/program-design/plans/<projectId>.json 저장
 *   - buildPlanInputFromProject → planProgram → ProgramPlan 반환.
 *     openGates 가 남아 있으면 그대로(구조 pending) — 추측 채움 금지(엔진 계약).
 *   - 권한: requireProjectAccess (신규 라우트 auth 강제).
 *
 * 엔진은 읽기만 — 이 라우트는 입력 합성·호출·(선택) 저장만 담당.
 */

import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

import { requireProjectAccess } from '@/lib/auth-helpers'
import { log } from '@/lib/logger'
import {
  buildPlanInputFromProject,
  PlanInputRfpMissingError,
} from '@/lib/program-design/plan-input'
import { planProgram } from '@/lib/program-design/generate-plan'
import type { ProgramPlan, PlanStructure } from '@/lib/program-design/plan-types'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// precedent / intent — summary(자유 텍스트) + decisions(축별 명시값, 선택).
const SideInputSchema = z
  .object({
    summary: z.string().optional(),
    decisions: z.record(z.string(), z.unknown()).optional(),
  })
  .optional()

// ── PM 편집 구조 (결함1: editedStructure) ──
// plan-types.ts `PlanStructure` 계약을 zod 로 미러 (계약 파일은 수정 0 — 여기서 검증만).
//   sessions(T1~T3) | individual/event(T4/T5) | pending. 필드는 PlanSession/NonSessionStage 와 일치.
const PlanSessionSchema = z.object({
  no: z.string(),
  title: z.string(),
  hours: z.number().nullable(),
  format: z.string(),
  kind: z.enum([
    'theory',
    'workshop',
    'coaching',
    'event',
    'milestone',
    'prelearning',
  ]),
  rationale: z.string(),
})
const NonSessionStageSchema = z.object({
  label: z.string(),
  content: z.string(),
  rationale: z.string(),
})
const EditedStructureSchema = z.union([
  z.object({ kind: z.literal('sessions'), sessions: z.array(PlanSessionSchema) }),
  z.object({
    kind: z.union([z.literal('individual'), z.literal('event')]),
    stages: z.array(NonSessionStageSchema),
  }),
  z.object({ kind: z.literal('pending'), note: z.string() }),
])

const BodySchema = z.object({
  precedent: SideInputSchema,
  intent: SideInputSchema,
  /** 누적 게이트 응답 (axis → 값). */
  decisions: z.record(z.string(), z.unknown()).optional(),
  /** true 면 최종안 저장 (openGates 0건일 때만 의미). */
  save: z.boolean().optional(),
  /**
   * PM 이 캔버스에서 편집한 구조 (결함1) — save:true 일 때 엔진 재생성 결과를
   * **이 값으로 덮어** 저장한다(PM 편집이 진실). 없으면 기존 동작(엔진 산출 저장).
   */
  editedStructure: EditedStructureSchema.optional(),
})

const PLANS_DIR = path.join(process.cwd(), 'data', 'program-design', 'plans')

/** 최종안 JSON 저장 (원자적 — tmp 작성 후 rename). */
async function savePlan(projectId: string, plan: ProgramPlan): Promise<string> {
  await fs.mkdir(PLANS_DIR, { recursive: true })
  const target = path.join(PLANS_DIR, `${projectId}.json`)
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`
  const payload = JSON.stringify(
    { projectId, savedAt: new Date().toISOString(), plan },
    null,
    2,
  )
  await fs.writeFile(tmp, payload, 'utf8')
  await fs.rename(tmp, target)
  return target
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params

  // 권한
  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  const body = await req.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  try {
    const input = await buildPlanInputFromProject(
      id,
      {
        precedent: parsed.data.precedent,
        intent: parsed.data.intent,
        decisions: parsed.data.decisions,
      },
      access.userId,
    )

    const plan = await planProgram(input)

    let savedPath: string | null = null
    if (parsed.data.save) {
      if (plan.openGates.length > 0) {
        return NextResponse.json(
          {
            error: 'GATES_OPEN',
            message: '미해소 게이트가 남아 있어 저장할 수 없습니다 — 게이트를 먼저 해소하세요.',
            plan,
          },
          { status: 409 },
        )
      }
      // 결함1: PM 편집이 진실 — editedStructure 가 오면 엔진 재생성 구조를 덮는다.
      //   (decisionLog/meta 는 엔진 최신값 유지, structure 만 PM 권위값.)
      if (parsed.data.editedStructure) {
        plan.structure = parsed.data.editedStructure as PlanStructure
      }
      savedPath = await savePlan(id, plan)
    }

    return NextResponse.json({ plan, saved: !!savedPath })
  } catch (e: unknown) {
    if (e instanceof PlanInputRfpMissingError) {
      return NextResponse.json(
        { error: 'RFP_SLICE_MISSING', message: e.message },
        { status: 400 },
      )
    }
    const message = e instanceof Error ? e.message : '기획 생성 실패'
    log.error('program-design', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 })
  }
}

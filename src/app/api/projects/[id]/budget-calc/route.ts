/**
 * POST /api/projects/[id]/budget-calc  (BR-WS-14 / SI-budget-calc)
 *
 * 예산 적산 엔진(`calcBudget`)을 production 라우트에 배선. **결정론(AI 없음).**
 *   - 입력 조립: project(총예산·채널·기간) + readSavedPlan(세션) + coachAssignments count.
 *   - calcBudget(rules, input) → BudgetResult JSON.
 *   - 권한: requireProjectAccess (신규 라우트 auth 강제).
 *
 * 단가·비율은 전부 budget-rules.json — 이 라우트는 입력 합성·호출만 담당(저장 X).
 */

import { NextResponse, type NextRequest } from 'next/server'

import { requireProjectAccess } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/logger'
import { readSavedPlan } from '@/lib/program-design/saved-plan'
import {
  calcBudget,
  loadBudgetRules,
  type BudgetCalcInput,
  type BudgetChannel,
} from '@/lib/program-design/budget-calc'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** eduStartDate~eduEndDate → 개월 수 (반올림, 최소 0). 둘 중 하나라도 없으면 0. */
function durationMonths(start: Date | null, end: Date | null): number {
  if (!start || !end) return 0
  const ms = end.getTime() - start.getTime()
  if (ms <= 0) return 0
  // 평균 월(365.25/12 일) 기준 반올림.
  const months = ms / (1000 * 60 * 60 * 24 * (365.25 / 12))
  return Math.max(0, Math.round(months))
}

/** projectType → 적산 채널. B2B 명시 외 전부 B2G(보수적 기본). */
function toChannel(projectType: string | null | undefined): BudgetChannel {
  return projectType?.toUpperCase().includes('B2B') ? 'B2B' : 'B2G'
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params

  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        projectType: true,
        totalBudgetVat: true,
        eduStartDate: true,
        eduEndDate: true,
        _count: { select: { coachAssignments: true } },
      },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // 세션 — 저장된 1차안(파일)에서 회차표면 추출. 없으면 빈 배열(엔진 graceful).
    const plan = await readSavedPlan(id).catch(() => null)
    const sessions =
      plan && plan.structure.kind === 'sessions'
        ? plan.structure.sessions.map((s) => ({
            kind: s.kind,
            hours: s.hours,
            title: s.title,
          }))
        : []

    const coachCount = project._count?.coachAssignments ?? 0

    const input: BudgetCalcInput = {
      totalBudget: project.totalBudgetVat ?? 0,
      channel: toChannel(project.projectType),
      sessions,
      coachCount,
      durationMonths: durationMonths(
        project.eduStartDate,
        project.eduEndDate,
      ),
    }

    const rules = await loadBudgetRules()
    const result = calcBudget(rules, input)

    return NextResponse.json({
      result,
      // 입력 에코 — 캔버스가 "근거 없음(세션·코치 0)" 안내에 사용.
      input: {
        channel: input.channel,
        sessionCount: input.sessions.length,
        coachCount: input.coachCount,
        durationMonths: input.durationMonths,
        hasBudget: input.totalBudget > 0,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '예산 적산 실패'
    log.error('budget-calc', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 })
  }
}

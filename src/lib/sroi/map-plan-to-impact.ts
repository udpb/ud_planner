/**
 * BR-SROI-1 — ProgramPlan → SROI 예측 항목(PredictItem) 매핑
 *
 * ⭐ 핵심 원칙 (브리프):
 *   1. **직접 도출(설계 사실)만 plan 에서 읽는다** — 참여 인원, 코칭 회수, 교육 회차 등.
 *   2. **결과 변수(신규고용·투자유치·창업전환·매출)는 설계가 아니다** — plan 에서 추측 생성
 *      절대 금지. 클라이언트 목표(kpiTargets)나 PM 입력에서만. 없으면 assumptions=missing
 *      으로 표시하고 그 카테고리는 **제외**(부분 예측). (SROI 예측은 불확실하다는 원칙)
 *   3. **하드코딩 수치 금지** — proxy 는 서비스에서, 변수는 plan/goal 에서. categoryId 도
 *      코드에 박지 않는다 — goal.categoryBindings 또는 라이브 계수 추론에서 온다.
 */

import type { ProgramPlan, PlanSession } from '@/lib/program-design/plan-types'
import type {
  Assumption,
  CategoryBindings,
  CoefficientsResponse,
  MappedImpact,
  PredictItem,
  SroiGoal,
  SroiKpiTarget,
} from './types'

// ─────────────────────────────────────────────────────────────────
// 설계 사실 추출 (plan 에서 직접 — 추측 아님)
// ─────────────────────────────────────────────────────────────────

/** 회차표 구조면 코칭 회차 수를 센다. T4 비회차면 coaching 단계 수를 센다. 모르면 0. */
function countCoachingTouches(plan: ProgramPlan): number {
  const s = plan.structure
  if (s.kind === 'sessions') {
    return s.sessions.filter((x: PlanSession) => x.kind === 'coaching').length
  }
  if (s.kind === 'individual' || s.kind === 'event') {
    // 비회차: 개별컨설팅/코칭 라벨 단계 수 (라벨 기반 — 수치 하드코딩 아님).
    return s.stages.filter((st) => /코칭|컨설팅|coaching|mentor/i.test(st.label)).length
  }
  return 0
}

/** 교육/세션 성격 회차 수 (theory/workshop/prelearning). 비회차/pending 이면 0. */
function countEducationSessions(plan: ProgramPlan): number {
  const s = plan.structure
  if (s.kind !== 'sessions') return 0
  return s.sessions.filter(
    (x: PlanSession) => x.kind === 'theory' || x.kind === 'workshop' || x.kind === 'prelearning',
  ).length
}

/** 행사 성격 회차/단계 수. */
function countEvents(plan: ProgramPlan): number {
  const s = plan.structure
  if (s.kind === 'sessions') {
    return s.sessions.filter((x: PlanSession) => x.kind === 'event' || x.kind === 'milestone').length
  }
  if (s.kind === 'event') return s.stages.length
  return 0
}

// ─────────────────────────────────────────────────────────────────
// 결과 변수 (목표/PM 입력에서만 — 추측 금지)
// ─────────────────────────────────────────────────────────────────

/** kpiTargets 에서 metric 키워드로 결과값을 찾는다. 없으면 null(추측 안 함). */
function findKpi(targets: SroiKpiTarget[] | undefined, pattern: RegExp): number | null {
  if (!targets) return null
  const hit = targets.find((t) => pattern.test(t.metric) && typeof t.targetValue === 'number')
  return hit ? (hit.targetValue as number) : null
}

interface OutcomeVar {
  /** PredictItem 필드명. */
  field: keyof Pick<
    PredictItem,
    'newEmployees' | 'investmentAmount' | 'bizFund' | 'revenue' | 'count'
  >
  /** categoryBindings 역할 키. */
  role: keyof CategoryBindings
  /** kpiTargets metric 매칭 패턴. */
  kpiPattern: RegExp
  /** pmInputs 에서 직접 받는 값(있으면). */
  pmValue?: number
  label: string
}

// ─────────────────────────────────────────────────────────────────
// 메인 매핑
// ─────────────────────────────────────────────────────────────────

/**
 * ProgramPlan + 목표/PM입력 → PredictItem[] + assumptions.
 *
 * @param plan  프로그램 기획안(구조에서 설계 사실만 읽음)
 * @param goal  목표/KPI/PM입력/바인딩 — 결과 변수와 인원·예산의 유일한 출처
 */
export function mapPlanToImpactItems(plan: ProgramPlan, goal: SroiGoal = {}): MappedImpact {
  const items: PredictItem[] = []
  const assumptions: Assumption[] = []
  const bindings = goal.categoryBindings ?? {}

  const participants = goal.totalParticipants
  if (typeof participants !== 'number') {
    assumptions.push({
      field: 'totalParticipants',
      status: 'missing',
      note: '참여 인원이 목표/입력에 없습니다 — PM 입력 필요(설계 회차로 추측하지 않음).',
    })
  }

  // ── (1) 설계 사실: 교육 ──
  const eduSessions = countEducationSessions(plan)
  if (bindings.education && eduSessions > 0) {
    const item: PredictItem = { categoryId: bindings.education, count: eduSessions }
    if (typeof participants === 'number') item.participants = participants
    items.push(item)
    assumptions.push({
      field: 'education.count',
      status: 'derived',
      note: `교육/세션 회차 ${eduSessions}건을 구조에서 직접 도출.`,
      value: eduSessions,
    })
  } else if (eduSessions > 0 && !bindings.education) {
    assumptions.push({
      field: 'education',
      status: 'missing',
      note: '교육 회차는 있으나 education categoryId 바인딩 없음 — 제외(PM 매핑 필요).',
    })
  }

  // ── (2) 설계 사실: 코칭 ──
  const coachingTouches = countCoachingTouches(plan)
  if (bindings.coaching && coachingTouches > 0) {
    const item: PredictItem = { categoryId: bindings.coaching, count: coachingTouches }
    if (typeof participants === 'number') item.participants = participants
    items.push(item)
    assumptions.push({
      field: 'coaching.count',
      status: 'derived',
      note: `1:1 코칭 접점 ${coachingTouches}건을 구조에서 직접 도출.`,
      value: coachingTouches,
    })
  } else if (coachingTouches > 0 && !bindings.coaching) {
    assumptions.push({
      field: 'coaching',
      status: 'missing',
      note: '코칭 접점은 있으나 coaching categoryId 바인딩 없음 — 제외(PM 매핑 필요).',
    })
  }

  // ── (3) 설계 사실: 행사 ──
  const events = countEvents(plan)
  if (bindings.event && events > 0) {
    const item: PredictItem = { categoryId: bindings.event }
    if (typeof participants === 'number') item.eventParticipants = participants
    items.push(item)
    assumptions.push({
      field: 'event.count',
      status: 'derived',
      note: `행사/마일스톤 ${events}건을 구조에서 직접 도출.`,
      value: events,
    })
  }

  // ── (4) 결과 변수: 목표/PM 입력에서만 (추측 생성 금지) ──
  const outcomeVars: OutcomeVar[] = [
    {
      field: 'newEmployees',
      role: 'employment',
      kpiPattern: /고용|채용|일자리|employ|job/i,
      pmValue: goal.pmInputs?.newEmployees,
      label: '신규 고용',
    },
    {
      field: 'investmentAmount',
      role: 'investment',
      kpiPattern: /투자|유치|invest|funding/i,
      pmValue: goal.pmInputs?.investmentAmount,
      label: '투자 유치',
    },
    {
      field: 'count',
      role: 'startup',
      kpiPattern: /창업\s*전환|창업\s*건|창업률|startup|incorporat/i,
      pmValue: goal.pmInputs?.startupConversions,
      label: '창업 전환',
    },
    {
      field: 'revenue',
      role: 'revenue',
      kpiPattern: /매출|revenue|sales/i,
      pmValue: goal.pmInputs?.revenue,
      label: '매출',
    },
    {
      field: 'bizFund',
      role: 'startup',
      kpiPattern: /창업\s*자금|사업화\s*자금|bizfund/i,
      pmValue: goal.pmInputs?.bizFund,
      label: '창업/사업화 자금',
    },
  ]

  for (const ov of outcomeVars) {
    const categoryId = bindings[ov.role]
    // 값 출처: PM 직접 입력 우선, 없으면 kpiTargets. 둘 다 없으면 추측하지 않고 제외.
    const fromPm = typeof ov.pmValue === 'number' ? ov.pmValue : null
    const fromKpi = fromPm === null ? findKpi(goal.kpiTargets, ov.kpiPattern) : null
    const value = fromPm ?? fromKpi

    if (value === null || value === undefined) {
      assumptions.push({
        field: ov.label,
        status: 'missing',
        note: `${ov.label}은 결과 변수 — 목표/PM 입력에 없어 제외(추측 생성 안 함). PM 입력 필요.`,
      })
      continue
    }
    if (!categoryId) {
      assumptions.push({
        field: ov.label,
        status: 'missing',
        note: `${ov.label} 값은 있으나 categoryId 바인딩 없음 — 제외(PM 매핑 필요).`,
        value,
      })
      continue
    }
    const item: PredictItem = { categoryId }
    item[ov.field] = value
    items.push(item)
    assumptions.push({
      field: ov.label,
      status: 'provided',
      note: `${ov.label} ${value} — ${fromPm !== null ? 'PM 입력' : '클라이언트 KPI 목표'}에서 받음(설계 도출 아님).`,
      value,
    })
  }

  return { items, assumptions }
}

// ─────────────────────────────────────────────────────────────────
// (선택) 라이브 계수에서 categoryBindings 추론 — categoryId 하드코딩 회피용
// ─────────────────────────────────────────────────────────────────

/**
 * 라이브 계수의 categoryName/impactTypeName/formulaVariables 를 보고 의미 역할 바인딩을
 * 추론한다. **categoryId 를 코드에 박지 않기 위한 보조** — 확정 매핑은 PM 이 명시하는 게 낫다.
 * 추론은 카테고리 이름/변수명(서비스 계약 어휘) 기반이지 수치 하드코딩이 아니다.
 */
export function resolveCategoryBindings(
  coeffs: CoefficientsResponse | null,
): CategoryBindings {
  const out: CategoryBindings = {}
  if (!coeffs) return out
  for (const c of coeffs.categories) {
    const hay = `${c.categoryName} ${c.impactTypeName} ${c.formulaVariables.join(' ')}`.toLowerCase()
    const has = (v: string) => c.formulaVariables.includes(v)
    if (!out.coaching && (has('coachesTrained') || /코칭|coaching|mentor/.test(hay))) {
      out.coaching = c.categoryId
    }
    if (!out.event && (has('eventParticipants') || /행사|event/.test(hay))) {
      out.event = c.categoryId
    }
    if (!out.employment && (has('newEmployees') || /고용|employ|job/.test(hay))) {
      out.employment = c.categoryId
    }
    if (!out.investment && (has('investmentAmount') || /투자|invest|funding/.test(hay))) {
      out.investment = c.categoryId
    }
    if (!out.revenue && (has('revenue') || /매출|revenue|sales/.test(hay))) {
      out.revenue = c.categoryId
    }
    if (!out.startup && (has('bizFund') || /창업|startup|incorporat/.test(hay))) {
      out.startup = c.categoryId
    }
    if (
      !out.education &&
      (has('participants') || /교육|강의|세션|education|training/.test(hay))
    ) {
      out.education = c.categoryId
    }
  }
  return out
}

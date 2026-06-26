/**
 * budget-calc — 예산 적산 엔진 (BR-WS-14 / SI-budget-calc)
 *
 * 워크스페이스 "예산 자동화" 캔버스의 진짜 적산 엔진. **결정론적(AI 없음)** —
 * 단가·비율은 전부 `data/program-design/budget-rules.json`(2026 단가표 + 워터폴,
 * 권위 데이터)에서 읽는다. **하드코딩 0.**
 *
 * 흐름:
 *   1. 커리큘럼 세션(kind/hours/title) + 코치 수 + 기간(개월) + 채널 + 총예산(R) 입력.
 *   2. 워터폴: R → VAT → R'(공급가) → IC/IDC → DR(사업예산).
 *   3. AC(실비) bottom-up: 세션 kind 별 코치료/강의료/행사비 + 운영·홍보·디자인 라인.
 *   4. PC(인건비): 기간 × 채널 PM급 monthly × 투입률.
 *   5. OR(영업이익) = DR − PC − AC, marginRate = OR / R'. 경고 산출.
 *
 * 산출은 **PM 편집 초안** — 세션↔단가 매핑은 합리적 기본값(완벽 불요, PM이 조정).
 * 저장은 이 범위 밖(BudgetCalcCanvas 의 client state 만).
 *
 * ⚠️ budget-rules.json 은 읽기 전용 — 절대 수정 금지. infer-budget.ts(top-down 비율,
 *    AI) 와는 별개 엔진 — 건드리지 않는다(향후 교차검증).
 *
 * ⚠️ **client-safe (BR-WS-15)**: 이 파일은 순수 `calcBudget` + 타입만 둔다 — `fs`/
 *    `path` import 없음. budget-rules.json 의 fs 로드는 `budget-rules-loader.ts`
 *    (server-only)로 분리했다 → BudgetCalcCanvas(client)가 calcBudget 을 직접
 *    import 해도 번들에 node:fs 가 끌려오지 않는다. **계산 로직은 분리 전후 동일.**
 *
 * Source: .claude/agent-briefs/BR-WS-14-budget-calc.md · BR-WS-15-stage-thread.md ·
 *         data/program-design/budget-rules.json
 */

import type { PlanSession } from './plan-types'

// ─────────────────────────────────────────────────────────────────
// budget-rules.json 부분 타입 (읽는 키만 — 전체 미러 아님)
// ─────────────────────────────────────────────────────────────────

interface CoachRateGrade {
  first1h?: number
  overPerH?: number
  perDay?: number
  perH?: number
  perMonth?: number
}

interface AcItemPattern {
  item: string
  n?: number
  median: number
}

interface PersonnelGrade {
  role: string
  hourly: number
  monthly: number
}

/** drSplitObserved 의 한 축 (median + range). */
interface DrSplitAxis {
  median: number
  range?: [number, number]
}

/**
 * 적산 수량 기본값 (ADR-030 — costingDefaults). 전부 optional — 없으면 코드가
 * graceful fallback(기존 매직넘버값). 단가는 여기 없다(위 섹션이 SSoT).
 */
interface CostingDefaults {
  opsFte?: {
    shortMonths?: number
    shortFte?: number
    longFte?: number
    minFte?: number
    /**
     * 세션 밀도(회차/개월) 가산 — opsFte 베이스에 회차 밀도를 더해 다회차 운영을
     * 현실화. 없으면 0(가산 없음 → 기존 동작). FTE 는 항상 [minFte, maxFte] 로 클램프.
     */
    perSessionPerMonth?: number
    maxFte?: number
  }
  pmInputRate?: { default?: number }
  coachingRatio?: number
  lectureRatio?: number
  eventCountMultiplier?: number
  /**
   * 코치 등급 기본 믹스 — 코칭/강의 AC 산출 시 메인 단가에 곱하는 유효 배수(가중).
   * 1.0 이면 전부 메인(기존 동작). 메인+보조 혼합을 반영하면 < 1.0 이 되어 AC 가
   * 현실화된다(보조 단가가 메인보다 낮으므로). 단가 자체는 손대지 않고 비율만 데이터.
   */
  coachGradeMix?: {
    /** 코칭 세션 유효 단가 배수 (메인 perDay 대비). 없으면 1(전부 메인). */
    coachingMainEquivalent?: number
    /** 강의 세션 유효 단가 배수 (메인 perDay 대비). 없으면 1(전부 메인). */
    lectureMainEquivalent?: number
  }
}

/** budget-rules.json 의 우리가 읽는 부분 (나머지 키는 무시 — passthrough). */
export interface BudgetRules {
  waterfall: {
    vatRate: number
    icRate: number
    idcRate: number
    drRate: number
    /** 26개 실예산 관찰 DR 분할 (ADR-030 가드 앵커 — 읽기 전용). */
    drSplitObserved?: {
      pcRate?: DrSplitAxis
      acRate?: DrSplitAxis
      orRate?: DrSplitAxis & { recommendedTarget?: number; guard?: string }
    }
  }
  /** ADR-030 — 적산 수량 기본값(가변·데이터화). 없으면 코드 fallback. */
  costingDefaults?: CostingDefaults
  coachRates2026: {
    코칭?: Record<string, CoachRateGrade>
    강의?: Record<string, CoachRateGrade>
    운영?: Record<string, CoachRateGrade>
  }
  designPrintPhoto2026?: {
    디자인?: Record<string, number>
  }
  personnelRatesB2GB2B?: {
    B2G?: { grades?: PersonnelGrade[] }
    B2B?: { grades?: PersonnelGrade[] }
  }
  acItemPatterns?: {
    items?: AcItemPattern[]
  }
}

// ─────────────────────────────────────────────────────────────────
// 입력 / 출력 타입
// ─────────────────────────────────────────────────────────────────

export type BudgetChannel = 'B2G' | 'B2B'

/** 적산 엔진 입력 — route 가 project + saved-plan + coach count 로 조립. */
export interface BudgetCalcInput {
  /** 총예산 R (VAT 포함). null/0 이면 워터폴 0 + 경고. */
  totalBudget: number
  channel: BudgetChannel
  /** 커리큘럼 세션 — kind/hours/title 만 사용(나머지 무시). */
  sessions: Array<Pick<PlanSession, 'kind' | 'hours' | 'title'>>
  /** 배정 코치 수 (없으면 1 기본). */
  coachCount: number
  /** 교육 기간(개월) — eduStartDate~eduEndDate 에서 산출. */
  durationMonths: number
}

/** 적산 라인 1건 (AC/PC 공통). */
export interface BudgetLine {
  label: string
  amount: number
  /** 산출 근거 (단가 × 수량 × 비율 출처). */
  basis: string
}

export interface BudgetWaterfall {
  /** R = 총예산(VAT 포함). */
  R: number
  /** VAT = R × vatRate / (1+vatRate). */
  VAT: number
  /** R' = R − VAT (공급가). */
  Rprime: number
  /** IC = R' × icRate (간접비). */
  IC: number
  /** IDC = R' × idcRate. */
  IDC: number
  /** DR = R' − IC − IDC (사업예산 = PC + AC + OR). */
  DR: number
}

export interface BudgetResult {
  waterfall: BudgetWaterfall
  /** AC(실비) 라인. */
  acLines: BudgetLine[]
  /** PC(인건비) 라인. */
  pcLines: BudgetLine[]
  /** AC = Σ acLines. */
  ac: number
  /** PC = Σ pcLines. */
  pc: number
  /** OR = DR − PC − AC (영업이익). */
  or: number
  /** marginRate = OR / R'. */
  marginRate: number
  /**
   * ADR-030 — 산출된 DR 분할 (각/DR). drSplitObserved 와 비교용. DR<=0 이면 0.
   * **재분배 아님** — bottom-up 결과를 관찰값과 견주는 진단 지표일 뿐.
   */
  split: {
    /** PC / DR. */
    pcRate: number
    /** AC / DR. */
    acRate: number
    /** OR / DR. */
    orRate: number
  }
  /** 경고 (적자/마진 부족/재검토). */
  warnings: string[]
  /** 근거 출처 표기. */
  source: string
}

// ─────────────────────────────────────────────────────────────────
// 적산 헬퍼 (단가는 전부 rules 에서 — 하드코딩 0)
// ─────────────────────────────────────────────────────────────────

const round = (n: number) => Math.round(n)

/** acItemPatterns 에서 title 부분 매칭으로 median 단가를 찾는다. 없으면 fallback. */
function acItemMedian(
  rules: BudgetRules,
  needles: string[],
  fallback: number,
): number {
  const items = rules.acItemPatterns?.items ?? []
  for (const needle of needles) {
    const hit = items.find((it) => it.item.includes(needle))
    if (hit && typeof hit.median === 'number') return hit.median
  }
  return fallback
}

/** 채널별 PM 급(사업PM·디렉터) monthly 인건비를 rules 에서. 없으면 0. */
function pmMonthly(rules: BudgetRules, channel: BudgetChannel): number {
  const grades = rules.personnelRatesB2GB2B?.[channel]?.grades ?? []
  // 'PM' 또는 '디렉터' 가 들어간 등급 우선 (B2G='…PM·Director', B2B='사업PM·디렉터').
  const pm = grades.find((g) => g.role.includes('PM') || g.role.includes('디렉터'))
  return pm?.monthly ?? 0
}

// ─────────────────────────────────────────────────────────────────
// costingDefaults (ADR-030) — 수량/투입률 데이터. 매직넘버 fallback 보존.
// ─────────────────────────────────────────────────────────────────

/** 매직넘버 fallback (costingDefaults 부재 시 기존 코드값 그대로 — 절대 던지지 않음). */
const COSTING_FALLBACK = {
  opsShortMonths: 3,
  opsShortFte: 0.5,
  opsLongFte: 0.5,
  opsMinFte: 0,
  opsPerSessionPerMonth: 0,
  opsMaxFte: 1,
  pmInputRate: 0.3,
  coachingRatio: 1,
  lectureRatio: 1,
  eventCountMultiplier: 1,
  coachingMainEquivalent: 1,
  lectureMainEquivalent: 1,
} as const

/** 유한·음수 아닌 number 만 통과(NaN·undefined·음수 → fallback). */
function safeNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback
}

/** costingDefaults 를 안전 정규화. 부재·부분 부재 모두 graceful — 던지지 않는다. */
function resolveCostingDefaults(rules: BudgetRules) {
  const cd = rules.costingDefaults
  const ops = cd?.opsFte
  const mix = cd?.coachGradeMix
  return {
    opsShortMonths: safeNum(ops?.shortMonths, COSTING_FALLBACK.opsShortMonths),
    opsShortFte: safeNum(ops?.shortFte, COSTING_FALLBACK.opsShortFte),
    opsLongFte: safeNum(ops?.longFte, COSTING_FALLBACK.opsLongFte),
    opsMinFte: safeNum(ops?.minFte, COSTING_FALLBACK.opsMinFte),
    opsPerSessionPerMonth: safeNum(
      ops?.perSessionPerMonth,
      COSTING_FALLBACK.opsPerSessionPerMonth,
    ),
    opsMaxFte: safeNum(ops?.maxFte, COSTING_FALLBACK.opsMaxFte),
    pmInputRate: safeNum(cd?.pmInputRate?.default, COSTING_FALLBACK.pmInputRate),
    coachingRatio: safeNum(cd?.coachingRatio, COSTING_FALLBACK.coachingRatio),
    lectureRatio: safeNum(cd?.lectureRatio, COSTING_FALLBACK.lectureRatio),
    eventCountMultiplier: safeNum(
      cd?.eventCountMultiplier,
      COSTING_FALLBACK.eventCountMultiplier,
    ),
    coachingMainEquivalent: safeNum(
      mix?.coachingMainEquivalent,
      COSTING_FALLBACK.coachingMainEquivalent,
    ),
    lectureMainEquivalent: safeNum(
      mix?.lectureMainEquivalent,
      COSTING_FALLBACK.lectureMainEquivalent,
    ),
  }
}

// ─────────────────────────────────────────────────────────────────
// 진단 (split + warnings) — 단일 소스 (ADR-030, BR-WS-25)
// ─────────────────────────────────────────────────────────────────

/** computeBudgetDiagnostics 입력 — 워터폴 산출 + (편집 반영) ac/pc. */
export interface BudgetDiagnosticsInput {
  /** 공급가 R'. 마진율·R<=0 경고용 (R'<=0 이면 총예산 미입력 간주). */
  Rprime: number
  /** 사업예산 DR. split·OR 기준. DR<=0 이면 split 0. */
  DR: number
  /** AC 합계 (편집 반영분). */
  ac: number
  /** PC 합계 (편집 반영분). */
  pc: number
  /**
   * 총예산 R (VAT 포함). R<=0 경고 판정용. 없으면 Rprime 로 대체 판정
   * (Rprime<=0 ⇔ R<=0). canvas 는 waterfall.R 를 넘긴다.
   */
  R?: number
}

/**
 * ADR-030 진단 — DR 분할(split) + 경고(warnings)를 **단일 소스**로 산출한다.
 * 엔진(calcBudget)과 캔버스(편집 후 재계산)가 둘 다 이 함수를 호출 → 중복 제거.
 *
 * **순수·결정론** — 재분배 없음(OR 잔차 그대로). drSplitObserved 는 가드/참조 앵커.
 * graceful — observed 부재여도 던지지 않고 가드 경고만 생략.
 */
export function computeBudgetDiagnostics(
  rules: BudgetRules,
  input: BudgetDiagnosticsInput,
): { split: BudgetResult['split']; warnings: string[] } {
  const { Rprime, DR, ac, pc } = input
  const R = typeof input.R === 'number' ? input.R : Rprime
  const or = DR - pc - ac
  const marginRate = Rprime > 0 ? or / Rprime : 0

  // ── DR 분할 지표 (각/DR) — 관찰값 비교용. 재분배 아님(진단만). ──
  const split = {
    pcRate: DR > 0 ? pc / DR : 0,
    acRate: DR > 0 ? ac / DR : 0,
    orRate: DR > 0 ? or / DR : 0,
  }

  // ── 경고 ──
  const warnings: string[] = []
  if (R <= 0) {
    warnings.push('총예산(R)이 없습니다 — RFP 분석에서 총 예산을 먼저 입력하세요.')
  }
  if (ac + pc > DR) {
    warnings.push(
      `실비(AC)+인건비(PC) 합계가 사업예산(DR)을 초과합니다 — 적자 위험. 항목 단가/투입률을 조정하세요.`,
    )
  }
  if (Rprime > 0 && marginRate < 0.05) {
    warnings.push(
      `마진율 ${(marginRate * 100).toFixed(1)}% — 권장 하한(5%) 미만. 영업이익 부족.`,
    )
  } else if (Rprime > 0 && marginRate > 0.2) {
    warnings.push(
      `마진율 ${(marginRate * 100).toFixed(1)}% — 권장 상한(20%) 초과. 적산 재검토 권장.`,
    )
  }

  // ── drSplitObserved 가드 진단 (ADR-030) ──
  // OR 이 관찰 range 밖(또는 >0.20)이면 "왜"를 짚는다. **재분배 없음 — 진단만.**
  const observed = rules.waterfall?.drSplitObserved
  if (DR > 0 && observed?.orRate) {
    const obsOr = observed.orRate
    const obsAc = observed.acRate
    const orRange = obsOr.range
    const outOfRange =
      (orRange ? split.orRate < orRange[0] || split.orRate > orRange[1] : false) ||
      split.orRate > 0.2
    if (outOfRange) {
      const pct = (n: number) => (n * 100).toFixed(1)
      const obsAcStr =
        obsAc && typeof obsAc.median === 'number'
          ? ` AC 계산 ${pct(split.acRate)}% vs 관찰 중앙 ${pct(obsAc.median)}% —`
          : ` AC 계산 ${pct(split.acRate)}% —`
      warnings.push(
        `마진 ${pct(split.orRate)}% (DR 기준) — 관찰 중앙 ${pct(obsOr.median)}% 밖.${obsAcStr} 운영비/행사/회차/코치등급/투입률 점검. (강제 보정 없음 — 직접 조정)`,
      )
    }
  }

  return { split, warnings }
}

// ─────────────────────────────────────────────────────────────────
// 메인 적산 (순수 결정론 — AI 없음)
// ─────────────────────────────────────────────────────────────────

/**
 * bottom-up 적산. 입력 → 워터폴 + AC/PC/OR + 경고.
 *
 * **모든 단가·비율은 rules(budget-rules.json)에서** 읽는다. 값이 없으면 graceful
 * 기본(0 또는 fallback) — 던지지 않음(워크스페이스는 떠야 함).
 */
export function calcBudget(
  rules: BudgetRules,
  input: BudgetCalcInput,
): BudgetResult {
  const { totalBudget, channel, sessions, coachCount, durationMonths } = input

  // ── 워터폴 (전부 rules.waterfall 비율) ──
  const R = Math.max(0, totalBudget)
  const { vatRate, icRate, idcRate } = rules.waterfall
  const VAT = round((R * vatRate) / (1 + vatRate))
  const Rprime = R - VAT
  const IC = round(Rprime * icRate)
  const IDC = round(Rprime * idcRate)
  const DR = Rprime - IC - IDC
  const waterfall: BudgetWaterfall = { R, VAT, Rprime, IC, IDC, DR }

  // 적산에 쓸 안전한 수치 (음수·NaN 방지).
  const coaches = Math.max(1, Math.round(coachCount || 1))
  const months = Math.max(0, durationMonths || 0)

  // ── 수량/투입률 기본값 (ADR-030 — costingDefaults, 매직넘버 제거) ──
  const cd = resolveCostingDefaults(rules)
  const sessionCount = sessions.length
  // 운영 FTE: 기간 비례(짧으면 shortFte, 길면 longFte) + 세션 밀도 가산
  // (회차/개월 × perSessionPerMonth). [minFte, maxFte] 로 클램프. perSessionPerMonth=0
  // 이면 가산 없음(기존 동작). 다회차·밀집 프로그램일수록 운영비(AC)가 현실화된다.
  const opsBaseFte = months >= cd.opsShortMonths ? cd.opsLongFte : cd.opsShortFte
  const sessionDensity = months > 0 ? sessionCount / months : 0
  const opsDensityBump = sessionDensity * cd.opsPerSessionPerMonth
  const opsFte = Math.min(
    cd.opsMaxFte,
    Math.max(cd.opsMinFte, opsBaseFte + opsDensityBump),
  )

  // ── AC(실비) bottom-up 초안 ──
  const acLines: BudgetLine[] = []

  // 단가 출처 (rules — 없으면 0 graceful).
  const coachingMain = rules.coachRates2026.코칭?.['메인']?.perDay ?? 0
  const lectureMain = rules.coachRates2026.강의?.['메인']?.perDay ?? 0
  const opsMain = rules.coachRates2026.운영?.['메인']?.perMonth ?? 0
  const keyVisualBasic =
    rules.designPrintPhoto2026?.디자인?.['키비주얼_기본패키지'] ?? 0

  // 세션 kind 집계.
  let coachingCount = 0
  let lectureCount = 0
  const eventLines: BudgetLine[] = []
  for (const s of sessions) {
    switch (s.kind) {
      case 'coaching':
        coachingCount += 1
        break
      case 'workshop':
      case 'theory':
        lectureCount += 1
        break
      case 'event':
      case 'milestone': {
        // title 매칭 → acItemPatterns 중앙단가. 없으면 성과공유회 기본.
        const title = s.title ?? ''
        let needles: string[]
        let label: string
        if (title.includes('데모') || title.includes('데모데이')) {
          needles = ['데모데이']
          label = `행사·데모데이 운영비 (${title || '데모데이'})`
        } else if (title.includes('박람') || title.includes('전시')) {
          needles = ['박람회']
          label = `행사·박람회 운영비 (${title || '박람회'})`
        } else if (title.includes('공모') || title.includes('경진')) {
          needles = ['공모전']
          label = `행사·공모전 운영비 (${title || '공모전'})`
        } else {
          // 기본 = 최종성과공유회.
          needles = ['최종성과공유회', '성과공유회']
          label = `행사·성과공유회 운영비 (${title || '성과공유회'})`
        }
        const median = acItemMedian(rules, needles, 0)
        const eventAmount = round(median * cd.eventCountMultiplier)
        eventLines.push({
          label,
          amount: eventAmount,
          basis: `2026 acItemPatterns 중앙단가 ${median.toLocaleString()}원 × ${cd.eventCountMultiplier}식`,
        })
        break
      }
      case 'prelearning':
      default:
        // 사전학습 등은 실비 0 (자체 비용 없음).
        break
    }
  }

  // 코칭료: 코칭 세션 × 메인 코치 perDay × 코치 수 × 투입비율 × 등급믹스(costingDefaults).
  // 등급믹스(coachingMainEquivalent)=메인+보조 혼합 유효배수(단가 불변, 비율만 데이터).
  if (coachingCount > 0 && coachingMain > 0) {
    const amount = round(
      coachingMain *
        coachingCount *
        coaches *
        cd.coachingRatio *
        cd.coachingMainEquivalent,
    )
    acLines.push({
      label: `코칭료 (${coaches}코치 × ${coachingCount}회)`,
      amount,
      basis: `2026 단가표 코칭.메인 perDay ${coachingMain.toLocaleString()}원 × ${coachingCount}회 × ${coaches}코치 × ${cd.coachingRatio} 비율 × 등급믹스 ${cd.coachingMainEquivalent}`,
    })
  }

  // 강의료: 강의/워크숍 세션 × 메인 강의 perDay × 투입비율 × 등급믹스(costingDefaults).
  if (lectureCount > 0 && lectureMain > 0) {
    const amount = round(
      lectureMain * lectureCount * cd.lectureRatio * cd.lectureMainEquivalent,
    )
    acLines.push({
      label: `강의료 (${lectureCount}회)`,
      amount,
      basis: `2026 단가표 강의.메인 perDay ${lectureMain.toLocaleString()}원 × ${lectureCount}회 × ${cd.lectureRatio} 비율 × 등급믹스 ${cd.lectureMainEquivalent}`,
    })
  }

  // 행사비 (세션에서 추출).
  acLines.push(...eventLines)

  // 운영비 = 기간(개월) × 운영.메인 perMonth × FTE(기간 비례, costingDefaults).
  if (months > 0 && opsMain > 0) {
    const amount = round(months * opsMain * opsFte)
    acLines.push({
      label: `운영비 (${months}개월 × ${opsFte} FTE)`,
      amount,
      basis: `2026 단가표 운영.메인 perMonth ${opsMain.toLocaleString()}원 × ${months}개월 × ${opsFte} FTE (기간 비례)`,
    })
  }

  // 홍보비 = acItemPatterns 홍보마케팅 (1식).
  const promoMedian = acItemMedian(rules, ['홍보마케팅', '홍보'], 0)
  if (promoMedian > 0) {
    acLines.push({
      label: '홍보·마케팅비 (1식)',
      amount: promoMedian,
      basis: `2026 acItemPatterns 홍보마케팅 중앙단가 ${promoMedian.toLocaleString()}원 × 1식`,
    })
  }

  // 디자인비 = designPrintPhoto 키비주얼 기본패키지 (1식).
  if (keyVisualBasic > 0) {
    acLines.push({
      label: '디자인비 (키비주얼 기본패키지, 1식)',
      amount: keyVisualBasic,
      basis: `2026 단가표 디자인.키비주얼_기본패키지 ${keyVisualBasic.toLocaleString()}원 × 1식`,
    })
  }

  const ac = acLines.reduce((sum, l) => sum + l.amount, 0)

  // ── PC(인건비) 초안 = 기간 × 채널 PM급 monthly × PM 투입률(costingDefaults) ──
  const pcRate = cd.pmInputRate
  const pcLines: BudgetLine[] = []
  const pmRate = pmMonthly(rules, channel)
  if (months > 0 && pmRate > 0) {
    const amount = round(months * pmRate * pcRate)
    pcLines.push({
      label: `사업 PM 인건비 (${months}개월 × ${round(pcRate * 100)}% 투입)`,
      amount,
      basis: `2026 personnelRatesB2GB2B.${channel} PM급 monthly ${pmRate.toLocaleString()}원 × ${months}개월 × ${pcRate}`,
    })
  }
  const pc = pcLines.reduce((sum, l) => sum + l.amount, 0)

  // ── OR(영업이익) + 마진율 ──
  // ⚠️ ADR-030 — OR 은 잔차 그대로. 재분배·target 마진 끼워맞춤 없음.
  const or = DR - pc - ac
  const marginRate = Rprime > 0 ? or / Rprime : 0

  // ── 진단(split + warnings) — 단일 소스 헬퍼 (BR-WS-25, canvas 와 공유) ──
  const { split, warnings } = computeBudgetDiagnostics(rules, {
    Rprime,
    DR,
    ac,
    pc,
    R,
  })

  return {
    waterfall,
    acLines,
    pcLines,
    ac,
    pc,
    or,
    marginRate,
    split,
    warnings,
    source: '2026 단가표 + 유사 29건',
  }
}

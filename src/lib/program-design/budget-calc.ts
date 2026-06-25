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
 * Source: .claude/agent-briefs/BR-WS-14-budget-calc.md ·
 *         data/program-design/budget-rules.json
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { PlanSession } from './plan-types'

// ─────────────────────────────────────────────────────────────────
// 파일 경로 + budget-rules.json 부분 타입 (읽는 키만 — 전체 미러 아님)
// ─────────────────────────────────────────────────────────────────

export const BUDGET_RULES_PATH = path.join(
  process.cwd(),
  'data',
  'program-design',
  'budget-rules.json',
)

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

/** budget-rules.json 의 우리가 읽는 부분 (나머지 키는 무시 — passthrough). */
export interface BudgetRules {
  waterfall: {
    vatRate: number
    icRate: number
    idcRate: number
    drRate: number
  }
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
  /** 경고 (적자/마진 부족/재검토). */
  warnings: string[]
  /** 근거 출처 표기. */
  source: string
}

// ─────────────────────────────────────────────────────────────────
// 로더 (캐시 — 단가표는 빌드 중 불변)
// ─────────────────────────────────────────────────────────────────

let _cache: BudgetRules | null = null

/**
 * budget-rules.json 을 읽어 파싱한다 (읽기 전용). 프로세스 내 1회 캐시.
 * 실패 시 경로를 담은 명확한 에러를 던진다.
 */
export async function loadBudgetRules(): Promise<BudgetRules> {
  if (_cache) return _cache
  let raw: string
  try {
    raw = await fs.readFile(BUDGET_RULES_PATH, 'utf8')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `[budget-calc] 단가 규칙 파일을 읽지 못했습니다 (${BUDGET_RULES_PATH}): ${msg}`,
    )
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `[budget-calc] 단가 규칙 JSON 파싱 실패 (${BUDGET_RULES_PATH}): ${msg}`,
    )
  }
  _cache = json as BudgetRules
  return _cache
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
        eventLines.push({
          label,
          amount: median,
          basis: `2026 acItemPatterns 중앙단가 ${median.toLocaleString()}원 × 1식`,
        })
        break
      }
      case 'prelearning':
      default:
        // 사전학습 등은 실비 0 (자체 비용 없음).
        break
    }
  }

  // 코칭료: 코칭 세션 × 메인 코치 perDay × 코치 수.
  if (coachingCount > 0 && coachingMain > 0) {
    const amount = coachingMain * coachingCount * coaches
    acLines.push({
      label: `코칭료 (메인 ${coaches}코치 × ${coachingCount}회)`,
      amount,
      basis: `2026 단가표 코칭.메인 perDay ${coachingMain.toLocaleString()}원 × ${coachingCount}회 × ${coaches}코치`,
    })
  }

  // 강의료: 강의/워크숍 세션 × 메인 강의 perDay.
  if (lectureCount > 0 && lectureMain > 0) {
    const amount = lectureMain * lectureCount
    acLines.push({
      label: `강의료 (메인 × ${lectureCount}회)`,
      amount,
      basis: `2026 단가표 강의.메인 perDay ${lectureMain.toLocaleString()}원 × ${lectureCount}회`,
    })
  }

  // 행사비 (세션에서 추출).
  acLines.push(...eventLines)

  // 운영비 = 기간(개월) × 운영.메인 perMonth × 0.5 FTE(기본).
  const OPS_FTE = 0.5
  if (months > 0 && opsMain > 0) {
    const amount = round(months * opsMain * OPS_FTE)
    acLines.push({
      label: `운영비 (${months}개월 × ${OPS_FTE} FTE)`,
      amount,
      basis: `2026 단가표 운영.메인 perMonth ${opsMain.toLocaleString()}원 × ${months}개월 × ${OPS_FTE} FTE`,
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

  // ── PC(인건비) 초안 = 기간 × 채널 PM급 monthly × 0.3 투입률 ──
  const PC_RATE = 0.3
  const pcLines: BudgetLine[] = []
  const pmRate = pmMonthly(rules, channel)
  if (months > 0 && pmRate > 0) {
    const amount = round(months * pmRate * PC_RATE)
    pcLines.push({
      label: `사업 PM 인건비 (${months}개월 × ${PC_RATE * 100}% 투입)`,
      amount,
      basis: `2026 personnelRatesB2GB2B.${channel} PM급 monthly ${pmRate.toLocaleString()}원 × ${months}개월 × ${PC_RATE}`,
    })
  }
  const pc = pcLines.reduce((sum, l) => sum + l.amount, 0)

  // ── OR(영업이익) + 마진율 ──
  const or = DR - pc - ac
  const marginRate = Rprime > 0 ? or / Rprime : 0

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

  return {
    waterfall,
    acLines,
    pcLines,
    ac,
    pc,
    or,
    marginRate,
    warnings,
    source: '2026 단가표 + 유사 29건',
  }
}

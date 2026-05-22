/**
 * F2 / B3 — 예산 자동 시드 엔진 (pure 함수)
 *
 * 입력: 커리큘럼·코치 수·대상 인원·운영 형식·CostRate 맵
 * 출력: AC BudgetItem draft 배열 + acTotal + rationale
 *
 * 운영 형식 (offline/online/hybrid) 별 카테고리 동적 분기 — 정형화 회피.
 * 모든 항목: amount = unitPrice * quantity (invariant).
 *
 * + seedMargin: 공급가 - PC - AC = 마진. 마진율 임계 경고.
 */

import type { CostRate } from './cost-defaults'

/** 운영 형식 — 카테고리 동적 분기 */
export type OperationFormat = 'offline' | 'online' | 'hybrid'

export interface AcItemDraft {
  wbsCode: string
  category: string
  name: string
  unit: string
  unitPrice: number
  quantity: number
  amount: number
  notes: string
  isAutoSeeded: boolean
}

export interface AutoSeedInput {
  curriculum: Array<{
    isTheory: boolean
    isActionWeek: boolean
    isCoaching1on1: boolean
    durationHours: number
  }>
  coachCount: number
  targetCount: number
  /** RFP 또는 PM 입력 — default 'offline' */
  operationFormat?: OperationFormat
  rates: Map<string, CostRate>
}

export interface AutoSeedResult {
  acItems: AcItemDraft[]
  acTotal: number
  rationale: string[]
}

/**
 * 내부 헬퍼 — rates 에서 CostRate 가져오고 누락 시 throw.
 * Fallback 까지 채워진 맵을 받기 때문에 정상 흐름에선 throw 안 됨.
 */
function getRate(rates: Map<string, CostRate>, wbsCode: string): CostRate {
  const r = rates.get(wbsCode)
  if (!r) {
    throw new Error(
      `[budget/auto-seed] CostRate missing for wbsCode=${wbsCode}. ` +
        `CostStandard seed 또는 FALLBACK_RATES 확인 필요.`,
    )
  }
  return r
}

/**
 * AC BudgetItem draft 자동 시드.
 *
 * 카테고리:
 *  1. 강사료 (이론 회차)
 *  2. 코치료 (실습 + Action Week — 시간)
 *  3. 1:1 코칭료
 *  4. 다과 (offline/hybrid)
 *  5. 교통비 (offline/hybrid)
 *  6. 운영비 (전 회차)
 *  7. 온라인 플랫폼 (online/hybrid)
 *  8. 장소비 (offline + 대상 30+)
 */
export function seedAcItems(input: AutoSeedInput): AutoSeedResult {
  const { curriculum, coachCount, targetCount, rates } = input
  const fmt: OperationFormat = input.operationFormat ?? 'offline'

  const sessionCount = curriculum.length
  const theoryCount = curriculum.filter((c) => c.isTheory).length
  // practiceCount / oneOnOneCount / actionWeekCount — 알고리즘 명세에 따라 사용
  // (실제 사용은 hours 합산이지만 추후 확장 대비 카운트도 유지)
  const oneOnOneCount = curriculum.filter((c) => c.isCoaching1on1).length
  const actionWeekCount = curriculum.filter((c) => c.isActionWeek).length
  // 명세 변수 보존 — practiceCount 는 rationale 에 미사용이지만 알고리즘 일관성 유지
  void curriculum.filter(
    (c) => !c.isTheory && !c.isCoaching1on1 && !c.isActionWeek,
  ).length
  void oneOnOneCount
  void actionWeekCount

  const items: AcItemDraft[] = []
  const rationale: string[] = []

  // 1. 강사료 (이론 회차 — 모든 형식)
  if (theoryCount > 0) {
    const r = getRate(rates, 'AC-01')
    items.push({
      wbsCode: 'AC-01',
      category: r.category,
      name: r.name,
      unit: r.unit,
      unitPrice: r.unitPrice,
      quantity: theoryCount,
      amount: r.unitPrice * theoryCount,
      notes: `이론 ${theoryCount}회차 × 강사료. 단가 출처: ${r.source}`,
      isAutoSeeded: true,
    })
    rationale.push(`강사료 ${theoryCount}회 (${r.source})`)
  }

  // 2. 코치료 (실습 + Action Week — 시간 단위)
  //    실습/Action Week 는 1:1 코칭이 아닌 모든 비-이론 세션 = c.isTheory===false && c.isCoaching1on1===false
  //    durationHours 누락 시 2시간 가정 (실습 기본).
  const practiceHoursTotal = curriculum
    .filter((c) => !c.isTheory && !c.isCoaching1on1)
    .reduce((sum, c) => sum + (c.durationHours ?? 2), 0)
  if (practiceHoursTotal > 0) {
    const r = getRate(rates, 'AC-02')
    items.push({
      wbsCode: 'AC-02',
      category: r.category,
      name: r.name,
      unit: r.unit,
      unitPrice: r.unitPrice,
      quantity: practiceHoursTotal,
      amount: r.unitPrice * practiceHoursTotal,
      notes: `실습·Action Week ${practiceHoursTotal}시간 × 코치단가. 단가 출처: ${r.source}`,
      isAutoSeeded: true,
    })
    rationale.push(`실습 코치료 ${practiceHoursTotal}h (${r.source})`)
  }

  // 3. 1:1 코칭료 (durationHours 누락 시 1시간 가정 — 1:1 기본)
  const oneOnOneHoursTotal = curriculum
    .filter((c) => c.isCoaching1on1)
    .reduce((sum, c) => sum + (c.durationHours ?? 1), 0)
  if (oneOnOneHoursTotal > 0) {
    const r = getRate(rates, 'AC-03')
    items.push({
      wbsCode: 'AC-03',
      category: r.category,
      name: r.name,
      unit: r.unit,
      unitPrice: r.unitPrice,
      quantity: oneOnOneHoursTotal,
      amount: r.unitPrice * oneOnOneHoursTotal,
      notes: `1:1 코칭 ${oneOnOneHoursTotal}시간. 단가 출처: ${r.source}`,
      isAutoSeeded: true,
    })
    rationale.push(`1:1 코칭료 ${oneOnOneHoursTotal}h (${r.source})`)
  }

  // 4. 다과 (offline / hybrid 만)
  if ((fmt === 'offline' || fmt === 'hybrid') && targetCount > 0 && sessionCount > 0) {
    const r = getRate(rates, 'AC-06')
    const offlineSessions =
      fmt === 'offline' ? sessionCount : Math.ceil(sessionCount / 2)
    items.push({
      wbsCode: 'AC-06',
      category: r.category,
      name: r.name,
      unit: r.unit,
      unitPrice: r.unitPrice,
      quantity: targetCount * offlineSessions,
      amount: r.unitPrice * targetCount * offlineSessions,
      notes: `${fmt} ${offlineSessions}회 × ${targetCount}명 다과. 단가 출처: ${r.source}`,
      isAutoSeeded: true,
    })
    rationale.push(`다과 (${fmt} ${offlineSessions}회)`)
  } else if (fmt === 'online') {
    rationale.push('다과 X (online 운영)')
  }

  // 5. 교통비 (offline / hybrid 만)
  if ((fmt === 'offline' || fmt === 'hybrid') && coachCount > 0 && sessionCount > 0) {
    const r = getRate(rates, 'AC-08')
    const offlineSessions =
      fmt === 'offline' ? sessionCount : Math.ceil(sessionCount / 2)
    items.push({
      wbsCode: 'AC-08',
      category: r.category,
      name: r.name,
      unit: r.unit,
      unitPrice: r.unitPrice,
      quantity: coachCount * offlineSessions,
      amount: r.unitPrice * coachCount * offlineSessions,
      notes: `${fmt} 강사·코치 ${coachCount}명 × ${offlineSessions}회 교통비. 단가 출처: ${r.source}`,
      isAutoSeeded: true,
    })
    rationale.push(`교통비 (${fmt})`)
  }

  // 6. 운영비 (모든 회차)
  if (sessionCount > 0) {
    const r9 = getRate(rates, 'AC-09')
    items.push({
      wbsCode: 'AC-09',
      category: r9.category,
      name: r9.name,
      unit: r9.unit,
      unitPrice: r9.unitPrice,
      quantity: sessionCount,
      amount: r9.unitPrice * sessionCount,
      notes: `${sessionCount}회차 × 운영비. 단가 출처: ${r9.source}`,
      isAutoSeeded: true,
    })
    rationale.push(`운영비 ${sessionCount}회`)
  }

  // 7. 온라인 플랫폼 (online / hybrid)
  if (fmt === 'online' || fmt === 'hybrid') {
    const r = getRate(rates, 'AC-10')
    // 사업 기간 추정 — 4 회차/월 가정, 최소 1개월
    const months = Math.max(1, Math.ceil(sessionCount / 4))
    items.push({
      wbsCode: 'AC-10',
      category: r.category,
      name: r.name,
      unit: r.unit,
      unitPrice: r.unitPrice,
      quantity: months,
      amount: r.unitPrice * months,
      notes: `${fmt} ${months}개월 × 온라인 플랫폼 (Zoom/LMS). 단가 출처: ${r.source}`,
      isAutoSeeded: true,
    })
    rationale.push(`온라인 플랫폼 ${months}개월`)
  }

  // 8. 장소비 (offline only + 대상 30+ 일 때만)
  if (fmt === 'offline' && targetCount >= 30 && sessionCount > 0) {
    const r = getRate(rates, 'AC-11')
    const days = Math.ceil(sessionCount / 2) // 회차 2회당 1일 가정
    items.push({
      wbsCode: 'AC-11',
      category: r.category,
      name: r.name,
      unit: r.unit,
      unitPrice: r.unitPrice,
      quantity: days,
      amount: r.unitPrice * days,
      notes: `대규모 offline ${days}일 × 교육장 임차. 단가 출처: ${r.source}`,
      isAutoSeeded: true,
    })
    rationale.push(`장소비 ${days}일 (대상 ${targetCount}≥30)`)
  }

  const acTotal = items.reduce((sum, i) => sum + i.amount, 0)
  return { acItems: items, acTotal, rationale }
}

// ─────────────────────────────────────────
// Margin
// ─────────────────────────────────────────

export interface MarginInput {
  supplyPrice: number
  pcTotal: number
  acTotal: number
}

export interface MarginResult {
  margin: number
  marginRate: number
  suggestion: string[]
}

/**
 * 마진 계산 + 임계 경고.
 *
 * - margin = supplyPrice - pcTotal - acTotal
 * - marginRate = margin / supplyPrice (supplyPrice<=0 일 땐 0)
 *
 * 경고:
 *  - supplyPrice ≤ 0: RFP/PM 입력 필요
 *  - rate < 5%: 적자 위험
 *  - rate < 10%: 안전선 미달 (권장 15~20%)
 *  - rate > 25%: 발주처 감액 위험 (BUD-003)
 */
export function seedMargin(input: MarginInput): MarginResult {
  const { supplyPrice, pcTotal, acTotal } = input
  const margin = supplyPrice - pcTotal - acTotal
  const marginRate = supplyPrice > 0 ? margin / supplyPrice : 0
  const suggestion: string[] = []

  if (supplyPrice <= 0) {
    suggestion.push('supplyPrice 미설정 — RFP 분석 또는 PM 입력 필요')
  }
  if (marginRate < 0.05) {
    suggestion.push(
      '마진 < 5% — 사업 운영 적자 위험. AC 강사료·코치료·장소비 단가 재검토 필요',
    )
  } else if (marginRate < 0.1) {
    suggestion.push('마진 < 10% — 안전선 미달 (권장 15~20%). 단가 또는 공급가 검토')
  } else if (marginRate > 0.25) {
    suggestion.push(
      '마진 > 25% — 발주처 감액 위험 (BUD-003). PC/AC 조정 또는 supplyPrice 재협상',
    )
  }

  return { margin, marginRate, suggestion }
}

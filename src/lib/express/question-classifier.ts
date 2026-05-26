/**
 * Question Classifier — F4 (Wave V, ADR-015 §7)
 *
 * PM 직접 카드 (pm-direct) 의 checklistItem 을 must/nice 로 자동 차등화.
 *
 * 두 단계:
 *   1. classifyByHeuristic(rfp, profile, channel) — RFP 결손 + 채널 룰로 가벼운 hint 생성
 *      → turn.ts prompt 의 [PM 직접 카드] 섹션에 주입 → AI 가 이를 보고 6~8 항목 분류
 *   2. AI 보강은 prompts/turn.ts 가 담당 (본 파일은 휴리스틱만)
 *
 * server / client 양쪽에서 import 가능 (React·DB 의존성 X).
 *
 * 관련 ADR: ADR-015 §7, ADR-013 (Express 2.0 채널 분기)
 * 관련 파일:
 *   - src/lib/express/conversation.ts (NormalizedChecklistItem)
 *   - src/lib/express/prompts/turn.ts ([PM 직접 카드] 섹션 — 본 hint 주입)
 *   - src/lib/express/process-turn.ts (호출자)
 */

import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'

// ─────────────────────────────────────────
// 1. 8 카테고리 정의 (turn.ts A~F + 후속 G·H 여지)
// ─────────────────────────────────────────

/**
 * pm-direct 카드의 8 가지 질문 카테고리.
 *
 * A~F 는 turn.ts §[PM 직접 카드] 와 동일. G·H 는 ADR-015 §7 의 후속 후보 —
 * 본 분류기는 hint 만 생성하므로, AI 가 G·H 를 만들지 결정.
 */
export type QuestionCategory =
  | 'A_evaluator_intent'     // 발주처 평가 의도 (작년 우승 이유 / 우려 리스크)
  | 'B_committee'            // 평가 위원·심사 구성
  | 'C_priority'             // 기관·사업 우선순위 (KPI / 핵심 지표)
  | 'D_retrospective'        // 작년·재작년 회고
  | 'E_budget_ops'           // 예산·운영
  | 'F_coach_trust'          // 코치·강사 신뢰
  | 'G_qualitative_kpi'      // (선택) 발주처 정성 KPI
  | 'H_esg_orientation'      // (선택) 내부 평가위원 ESG 성향

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  A_evaluator_intent: '발주처 평가 의도',
  B_committee: '평가 위원 구성',
  C_priority: '기관 우선순위',
  D_retrospective: '작년 회고',
  E_budget_ops: '예산·운영',
  F_coach_trust: '코치 신뢰',
  G_qualitative_kpi: '정성 KPI',
  H_esg_orientation: 'ESG 성향',
}

// ─────────────────────────────────────────
// 2. Hint 출력 — AI prompt 에 주입할 형식
// ─────────────────────────────────────────

export interface QuestionHint {
  category: QuestionCategory
  /** must = RFP 결손·발주처 우선순위 직접 영향. nice = 통화 여유 시 추가. */
  classification: 'must' | 'nice'
  /** 분류 근거 (1줄, 120자 이내). prompt + UI tooltip 양쪽에 사용. */
  reason: string
}

export interface ClassifyInput {
  rfp?: RfpParsed | null
  profile?: ProgramProfile | null
  /** B2G/B2B/renewal — RfpParsed.projectType 또는 별도 신호. renewal 은 명시 시그널 필요. */
  channel?: 'B2G' | 'B2B' | 'renewal'
}

// ─────────────────────────────────────────
// 3. 핵심 휴리스틱
// ─────────────────────────────────────────

/**
 * RFP 결손 + 채널 시그널 → must/nice 차등 hint.
 *
 * 룰 (위 → 아래 우선순위):
 *   - RFP 미업로드: 분류 무의미 → 빈 배열 (prompt 가 fallback 로 모두 must)
 *   - evalCriteria 누락·score=0: A 발주처 평가 의도 = must (어디에 비중을 둘지 모름)
 *   - totalBudgetVat & supplyPrice 모두 누락: E 예산 = must
 *   - 일정 (project + edu) 모두 누락: E 운영 = must (운영 일정 모름)
 *   - targetCount 누락: C 기관 우선순위 = must (규모 모름)
 *   - channel='B2G': B 평가 위원 = must (정부 사업은 위원 구성이 평가 핵심)
 *   - channel='renewal': D 작년 회고 = must (작년 평가 기반 개선이 핵심)
 *   - channel='B2B': C 우선순위 = must (B2B 는 발주처 KPI 가 평가 = 매출 영향)
 *   - 기본: nice
 *
 * AI 가 이 hint 를 받아 6~8 항목 선택 시 must 우선 + nice 보완으로 묶음.
 */
export function classifyByHeuristic(input: ClassifyInput): QuestionHint[] {
  const { rfp, profile, channel } = input

  // RFP 미파싱 — 분류 불가, 빈 배열 (prompt 가 모두 must fallback)
  if (!rfp) return []

  const hints: QuestionHint[] = []

  // ─ A: 발주처 평가 의도
  const evalScoreSum = (rfp.evalCriteria ?? []).reduce(
    (s, c) => s + (Number(c?.score) || 0),
    0,
  )
  if (!rfp.evalCriteria?.length || evalScoreSum === 0) {
    hints.push({
      category: 'A_evaluator_intent',
      classification: 'must',
      reason: 'RFP 평가배점 누락 — 발주처가 어디에 비중을 두는지 통화로 확인 필요',
    })
  } else {
    hints.push({
      category: 'A_evaluator_intent',
      classification: 'nice',
      reason: '평가배점은 RFP 에 있음 — 우승 키워드만 보완',
    })
  }

  // ─ B: 평가 위원 구성 — B2G 는 무조건 must
  if (channel === 'B2G') {
    hints.push({
      category: 'B_committee',
      classification: 'must',
      reason: 'B2G 사업 — 평가 위원 구성이 점수에 직접 영향',
    })
  } else {
    hints.push({
      category: 'B_committee',
      classification: 'nice',
      reason: 'B2B 는 위원 구성보다 발주처 의사결정자가 우선',
    })
  }

  // ─ C: 기관·사업 우선순위 — targetCount 누락 or B2B 면 must
  if (!rfp.targetCount || rfp.targetCount === 0) {
    hints.push({
      category: 'C_priority',
      classification: 'must',
      reason: 'RFP 참여자 규모 누락 — 기관이 어느 KPI 를 가장 중시하는지 확인 필요',
    })
  } else if (channel === 'B2B') {
    hints.push({
      category: 'C_priority',
      classification: 'must',
      reason: 'B2B — 발주처 내부 KPI 가 평가의 핵심',
    })
  } else {
    hints.push({
      category: 'C_priority',
      classification: 'nice',
      reason: '참여자 규모·평가배점이 RFP 에 있어 우선순위 추정 가능',
    })
  }

  // ─ D: 작년·재작년 회고 — renewal 일 때만 must
  if (channel === 'renewal') {
    hints.push({
      category: 'D_retrospective',
      classification: 'must',
      reason: '재공고·연속 사업 — 작년 평가 기반 개선이 1차본의 핵심',
    })
  } else {
    hints.push({
      category: 'D_retrospective',
      classification: 'nice',
      reason: '신규 사업 — 작년 회고는 통화 여유 시 보완',
    })
  }

  // ─ E: 예산·운영 — 예산·일정 누락 시 must
  const budgetMissing =
    (rfp.totalBudgetVat == null || rfp.totalBudgetVat === 0) &&
    (rfp.supplyPrice == null || rfp.supplyPrice === 0)
  const scheduleMissing =
    !rfp.projectStartDate && !rfp.projectEndDate && !rfp.eduStartDate && !rfp.eduEndDate
  if (budgetMissing || scheduleMissing) {
    const reasons: string[] = []
    if (budgetMissing) reasons.push('예산 누락')
    if (scheduleMissing) reasons.push('일정 누락')
    hints.push({
      category: 'E_budget_ops',
      classification: 'must',
      reason: `RFP ${reasons.join('·')} — 운영 PM 직접 확인 필요`,
    })
  } else {
    hints.push({
      category: 'E_budget_ops',
      classification: 'nice',
      reason: '예산·일정은 RFP 에 명시 — 항목별 우선 배분만 보완',
    })
  }

  // ─ F: 코치·강사 신뢰 — 항상 nice (통화 시간 여유 시)
  hints.push({
    category: 'F_coach_trust',
    classification: 'nice',
    reason: '코치 신뢰는 직접 평가 항목 아님 — 통화 여유 시',
  })

  // ─ Profile 기반 보강 (있을 때만)
  if (profile) {
    // primaryImpact 가 'ESG' 또는 '지속가능성' 포함 → H ESG 성향 = must
    const impacts = (profile.primaryImpact ?? []) as readonly string[]
    if (impacts.some((i) => /ESG|지속가능|환경/i.test(String(i)))) {
      hints.push({
        category: 'H_esg_orientation',
        classification: 'must',
        reason: 'ESG·지속가능성 임팩트 사업 — 평가위원 ESG 관점 확인이 차별화 포인트',
      })
    }
    // scale.budgetTier = '5억_이상' 또는 '3-5억' → G 정성 KPI = must
    // (대형 사업은 정량 지표 외 정성 평가 비중 큼)
    const tier = profile.scale?.budgetTier
    if (tier === '5억_이상' || tier === '3-5억') {
      hints.push({
        category: 'G_qualitative_kpi',
        classification: 'must',
        reason: `대형 사업 (${tier}) — 정량 지표 외 발주처가 보는 정성 KPI 확인 필요`,
      })
    }
  }

  return hints
}

// ─────────────────────────────────────────
// 4. Prompt 주입 형식 — turn.ts 가 호출
// ─────────────────────────────────────────

/**
 * QuestionHint[] 를 prompt 본문에 끼울 markdown 블록으로 변환.
 *
 * turn.ts §[PM 직접 카드] 직전에 주입 → AI 가 6~8 항목 선택할 때 must/nice 분류 가이드.
 */
export function formatHintsForPrompt(hints: readonly QuestionHint[]): string {
  if (hints.length === 0) {
    return '[PM 직접 카드 분류 hint — RFP 미파싱으로 hint 없음, 모든 항목을 must 로 분류]'
  }
  const mustList = hints.filter((h) => h.classification === 'must')
  const niceList = hints.filter((h) => h.classification === 'nice')
  const lines: string[] = []
  lines.push('[PM 직접 카드 분류 hint — 휴리스틱 결과, AI 가 이를 참고하여 분류]')
  lines.push('')
  if (mustList.length > 0) {
    lines.push('## must (필수 — RFP 결손 또는 채널 핵심):')
    for (const h of mustList) {
      lines.push(`- ${CATEGORY_LABELS[h.category]} (${h.category}): ${h.reason}`)
    }
  }
  if (niceList.length > 0) {
    lines.push('')
    lines.push('## nice (선택 — 통화 시간 여유 시):')
    for (const h of niceList) {
      lines.push(`- ${CATEGORY_LABELS[h.category]} (${h.category}): ${h.reason}`)
    }
  }
  lines.push('')
  lines.push('규칙: must 카테고리에서 최소 3개 ~ 최대 6개 항목 선택. nice 는 최대 3개. 전체 6~8개.')
  return lines.join('\n')
}

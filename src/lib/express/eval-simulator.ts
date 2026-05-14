/**
 * EvalSimulator — Express 2.0 (Phase M2, 2026-05-14)
 *
 * B2G 채널 전용 — RFP 평가배점 항목별로 ExpressDraft 가 현재 어느 정도 채워졌는지
 * 정량 시뮬레이션. evalCriteria 가 없으면 의미 없음 (B2B/renewal 은 보통 평가표 없음).
 *
 * 입력:
 *   - ExpressDraft.sections.*  (1~7)
 *   - RfpParsed.evalCriteria  (예: [{item: "교육 프로그램의 적절성", score: 30}])
 *
 * 산출:
 *   - 항목별 예상 점수 = 항목 만점 × 섹션 완성도(0~1)
 *   - 전체 예상 점수 합계
 *   - PM 가이드: 어느 항목이 점수 손실 큰가
 *
 * 비-AI — 규칙 기반. eval-strategy.ts 의 mapToSection 재사용.
 *
 * 관련: docs/decisions/013-express-v2-auto-diagnosis.md §결정 §2 (B2G 채널 메커니즘)
 */

import type { ExpressDraft, SectionKey } from './schema'
import { mapToSection, sectionLabel } from '@/lib/eval-strategy'
import type { ProposalSectionKey } from '@/lib/pipeline-context'

// ─────────────────────────────────────────
// 1. 입력 정규화 — RfpParsed.evalCriteria 형태
// ─────────────────────────────────────────

interface EvalCriteriaItem {
  item: string
  score: number
  notes?: string
}

export type EvalCriteriaInput =
  | Array<{ item: string; score: number; notes?: string }>
  | Array<{ name: string; points: number }>
  | null
  | undefined

function normalizeCriteria(input: EvalCriteriaInput): EvalCriteriaItem[] {
  if (!input || !Array.isArray(input)) return []
  const out: EvalCriteriaItem[] = []
  for (const e of input) {
    if (!e || typeof e !== 'object') continue
    const item =
      'item' in e && typeof e.item === 'string'
        ? e.item
        : 'name' in e && typeof e.name === 'string'
          ? e.name
          : ''
    const score =
      'score' in e && typeof e.score === 'number'
        ? e.score
        : 'points' in e && typeof e.points === 'number'
          ? e.points
          : NaN
    if (!item.trim() || !Number.isFinite(score) || score <= 0) continue
    out.push({ item: item.trim(), score })
  }
  return out
}

// ─────────────────────────────────────────
// 2. 결과 타입
// ─────────────────────────────────────────

export interface EvalSimulationItem {
  /** 평가 항목명 (RFP 원문) */
  criteriaName: string
  /** 만점 */
  maxPoints: number
  /** 매핑된 제안서 섹션 */
  proposalSection: ProposalSectionKey
  /** 매핑된 ExpressDraft 섹션 키 ("1"~"7") */
  draftSection: SectionKey
  /** 0~1 완성도 */
  completeness: number
  /** 예상 점수 = maxPoints × completeness */
  predictedScore: number
  /** 사유 (PM 한 줄 가이드) */
  reason: string
}

export interface EvalSimulation {
  /** 시뮬레이션 항목들 (배점 큰 순) */
  items: EvalSimulationItem[]
  /** 만점 합계 */
  totalMax: number
  /** 예상 점수 합계 */
  totalPredicted: number
  /** 완성도 평균 (가중) — 0~1 */
  weightedCompleteness: number
  /** 점수 손실 큰 상위 3 — PM 다음 액션 우선순위 */
  worstItems: EvalSimulationItem[]
  /** PM 가이드 1~3줄 */
  guidance: string[]
}

// ─────────────────────────────────────────
// 3. ProposalSection → ExpressDraft 섹션 매핑
// ─────────────────────────────────────────

const PROPOSAL_TO_DRAFT: Record<ProposalSectionKey, SectionKey> = {
  'proposal-background': '1',
  curriculum: '3',
  coaches: '4',
  budget: '5',
  impact: '6',
  'org-team': '7',
  other: '2',
}

// ─────────────────────────────────────────
// 4. 섹션 완성도 판정 (Express draft 기준)
// ─────────────────────────────────────────

interface CompletenessResult {
  completeness: number
  reason: string
}

function judgeSectionCompleteness(
  draft: ExpressDraft,
  section: SectionKey,
): CompletenessResult {
  const text = draft.sections?.[section] ?? ''
  const len = text.length

  if (len === 0) {
    return { completeness: 0, reason: '미작성' }
  }
  if (len < 200) {
    return { completeness: 0.3, reason: `${len}자 — 200자 미달 (도입부만)` }
  }
  if (len < 500) {
    return { completeness: 0.6, reason: `${len}자 — 도입부 + 본문 일부` }
  }
  if (len < 800) {
    return { completeness: 0.85, reason: `${len}자 — 충분히 작성됨` }
  }
  return { completeness: 1.0, reason: `${len}자 — 풀 본문` }
}

// 자산 인용 가산점 — narrativeSnippet 이 sections 에 들어가 있으면 +0.05 (최대 1.0)
function bonusForCitations(
  base: number,
  draft: ExpressDraft,
  section: SectionKey,
): { completeness: number; bonus: string | null } {
  const text = draft.sections?.[section] ?? ''
  const cites = (text.match(/\[자산 인용:/g) ?? []).length
  if (cites === 0) return { completeness: base, bonus: null }
  const bonus = Math.min(0.1, cites * 0.05)
  return {
    completeness: Math.min(1, base + bonus),
    bonus: ` + 자산 인용 ${cites}건`,
  }
}

// ─────────────────────────────────────────
// 5. 메인 시뮬레이터
// ─────────────────────────────────────────

export function simulateEvalScore(
  draft: ExpressDraft,
  evalCriteria: EvalCriteriaInput,
): EvalSimulation {
  const criteria = normalizeCriteria(evalCriteria)
  if (criteria.length === 0) {
    return {
      items: [],
      totalMax: 0,
      totalPredicted: 0,
      weightedCompleteness: 0,
      worstItems: [],
      guidance: ['RFP 평가배점 항목이 없어 시뮬레이션 불가 (B2B/renewal 일 가능성)'],
    }
  }

  // 점수 큰 순으로 정렬
  const sorted = [...criteria].sort((a, b) => b.score - a.score)

  const items: EvalSimulationItem[] = sorted.map((c) => {
    const proposalSection = mapToSection(c.item)
    const draftSection = PROPOSAL_TO_DRAFT[proposalSection]
    const base = judgeSectionCompleteness(draft, draftSection)
    const withBonus = bonusForCitations(base.completeness, draft, draftSection)
    const completeness = withBonus.completeness
    const reason = base.reason + (withBonus.bonus ?? '')
    const predictedScore = Math.round(c.score * completeness * 100) / 100
    return {
      criteriaName: c.item,
      maxPoints: c.score,
      proposalSection,
      draftSection,
      completeness,
      predictedScore,
      reason,
    }
  })

  const totalMax = items.reduce((s, i) => s + i.maxPoints, 0)
  const totalPredicted = items.reduce((s, i) => s + i.predictedScore, 0)
  const weightedCompleteness = totalMax > 0 ? totalPredicted / totalMax : 0

  // 손실 큰 항목 = maxPoints × (1 - completeness) 가장 큰 3
  const worstItems = [...items]
    .sort((a, b) => b.maxPoints * (1 - b.completeness) - a.maxPoints * (1 - a.completeness))
    .slice(0, 3)
    .filter((i) => i.completeness < 0.85) // 거의 다 채운 건 제외

  // PM 가이드 1~3줄
  const guidance: string[] = []
  if (totalMax > 0) {
    const pct = Math.round((totalPredicted / totalMax) * 100)
    guidance.push(`현재 예상 점수: ${Math.round(totalPredicted)} / ${totalMax} (${pct}%)`)
  }
  if (worstItems.length > 0) {
    const worst = worstItems[0]
    const loss = Math.round(worst.maxPoints * (1 - worst.completeness))
    guidance.push(
      `최대 손실: "${worst.criteriaName}" — ${sectionLabel(worst.proposalSection)} 섹션 보강 시 +${loss}점`,
    )
  }
  if (worstItems.length >= 2) {
    const total2 = worstItems
      .slice(0, 2)
      .reduce((s, i) => s + Math.round(i.maxPoints * (1 - i.completeness)), 0)
    guidance.push(`상위 2개 손실 합산 +${total2}점 회복 가능`)
  }

  return {
    items,
    totalMax,
    totalPredicted: Math.round(totalPredicted * 100) / 100,
    weightedCompleteness: Math.round(weightedCompleteness * 100) / 100,
    worstItems,
    guidance,
  }
}

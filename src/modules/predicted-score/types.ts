import type { ProposalSectionKey } from '@/lib/pipeline-context'

/**
 * 예상 점수 항목 — 평가배점 기준 단위.
 */
export interface PredictedScoreItem {
  sectionKey: ProposalSectionKey
  /** RFP 평가배점 항목 원본 점수 */
  maxPoints: number
  /** 현재 달성 점수 */
  currentScore: number
  /** 완성도 0~1 */
  completeness: number
  /** 점수 판단 사유 */
  reason: string
}

/**
 * 예상 점수 분해 — 규칙 기반 또는 AI 시뮬레이션 결과.
 */
export interface PredictedScoreBreakdown {
  totalScore: number
  items: PredictedScoreItem[]
  calculatedAt: string
  source: 'rule_based' | 'ai_simulation'
}

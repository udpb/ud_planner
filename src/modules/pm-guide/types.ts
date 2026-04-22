import type { WinningPatternRecord } from '@/lib/winning-patterns'
import type { ResearchRequest } from './research-prompts'

/**
 * pm-guide 모듈 고유 타입
 *
 * 흔한 실수 · 평가위원 관점 · UD 강점 팁 · 당선 패턴 · 리서치 요청을 하나로 묶는 구조.
 */

/** 스텝 키 유니온 — pm-guide 가 지원하는 6개 파이프라인 스텝 */
export type StepKey =
  | 'rfp'
  | 'curriculum'
  | 'coaches'
  | 'budget'
  | 'impact'
  | 'proposal'

/** 흔한 실수 단건 */
export interface CommonMistake {
  id: string
  /** 실수 명 */
  mistake: string
  /** 이 실수가 왜 문제인지 */
  consequence: string
  /** 어떻게 고치는지 */
  fix: string
}

/**
 * 리서치 요청 + 저장된 답변 상태를 결합한 형태.
 * Panel UI 가 "이미 답변했는지" 표시 + 답변 내용 미리보기에 사용.
 */
export interface ResolvedResearchRequest extends ResearchRequest {
  /** 이미 답변된 경우 저장된 텍스트 (없으면 undefined) */
  savedAnswer?: string
  /** 답변 저장 시각 (ISO string) */
  answeredAt?: string
}

/** resolvePmGuide 의 최종 반환 타입 */
export interface PmGuideContent {
  /** 스텝별 리서치 요청 (+ 저장된 답변 상태). 최상단 카드로 렌더. */
  researchRequests: ResolvedResearchRequest[]
  winningReferences: WinningPatternRecord[]
  evaluatorPerspective: string | null
  commonMistakes: CommonMistake[]
  udStrengthTips: string[]
}

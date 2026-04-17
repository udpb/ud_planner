import type { WinningPatternRecord } from '@/lib/winning-patterns'

/**
 * pm-guide 모듈 고유 타입
 *
 * 흔한 실수 · 평가위원 관점 · UD 강점 팁 · 당선 패턴을 하나로 묶는 구조.
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

/** resolvePmGuide 의 최종 반환 타입 */
export interface PmGuideContent {
  winningReferences: WinningPatternRecord[]
  evaluatorPerspective: string | null
  commonMistakes: CommonMistake[]
  udStrengthTips: string[]
}

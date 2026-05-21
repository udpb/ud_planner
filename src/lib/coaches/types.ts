/**
 * Coach Recommender — 공통 타입 + 가중치 + 임계값 (Wave V / F1, ADR-015)
 *
 * pure constants/types only. server·client 양쪽 import 가능.
 */

import type { MappedCoach } from './supabase-source'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'

// ─────────────────────────────────────────
// 1. 가중치 (합 = 1.0)
// ─────────────────────────────────────────

/**
 * 매칭 점수 5축 가중치. 합 1.0. ADR-015 H.1.c default + history 0.05 도입.
 *
 * 변경 시 반드시 ADR + 단위 테스트 갱신.
 */
export const RECOMMENDER_WEIGHTS = {
  /** RFP keywords ∩ coach.expertise/intro/career — 가장 직접적 매칭 */
  keyword: 0.4,
  /** RFP detectedTasks → EXPERTISE_OPTIONS hint 매핑 */
  task: 0.3,
  /** RFP region ∩ coach.regions (exact 1 / 부분 0.7 / 0) */
  region: 0.15,
  /** TIER1=1.0, TIER2=0.6, TIER3=0.3 */
  tier: 0.1,
  /** collaborationCount log + satisfactionAvg (UD 협업 history) */
  history: 0.05,
} as const

/**
 * 가중치 합 검증 — dev 에서만 console.error.
 * production 에서도 합이 1.0 아니면 점수 정규화가 깨지지만 throw 는 위험.
 */
if (process.env.NODE_ENV === 'development') {
  const sum =
    RECOMMENDER_WEIGHTS.keyword +
    RECOMMENDER_WEIGHTS.task +
    RECOMMENDER_WEIGHTS.region +
    RECOMMENDER_WEIGHTS.tier +
    RECOMMENDER_WEIGHTS.history
  if (Math.abs(sum - 1.0) > 1e-9) {
    console.error(
      `[coach-recommender] RECOMMENDER_WEIGHTS sum=${sum} ≠ 1.0 — 점수 정규화 깨짐. 가중치 재조정 필요.`,
    )
  }
}

// ─────────────────────────────────────────
// 2. 임계값
// ─────────────────────────────────────────

/**
 * 추천 풀 최소 노출 점수. 이 미만은 카드에서 제외 + "조건 부합 부족" 안내.
 * MIN_DISPLAY 까지는 노출 (회색 badge) — PM 이 부족함을 정직하게 인지.
 */
export const RECOMMENDATION_THRESHOLDS = {
  HIGH: 0.7, // green badge — 강력 추천
  MID: 0.5, // amber badge — 중간 추천
  MIN_DISPLAY: 0.3, // 이하 제외
} as const

/** 추천 풀 크기 배수 — 필요 수 × multiplier (ADR-015 본문 "5배수") */
export const POOL_MULTIPLIER = 5

/** 코치 수 추정 clamp */
export const COACH_COUNT_CLAMP = { MIN: 1, MAX: 8 } as const

// ─────────────────────────────────────────
// 3. 타입
// ─────────────────────────────────────────

/** 점수 산출 내역 — UI 의 score breakdown tooltip 에 사용 */
export interface ScoreBreakdown {
  keyword: number
  task: number
  region: number
  tier: number
  history: number
}

/** API 응답 의 단일 코치 추천 */
export interface CoachRecommendation {
  /** Prisma Coach.id (cuid) — 배정 API 호출 시 사용 */
  coachId: string
  /** Supabase external_id (numeric) — 동기화 검증 */
  githubId: number | null
  name: string
  organization: string | null
  position: string | null
  /** 'TIER1' | 'TIER2' | 'TIER3' */
  tier: string
  photoUrl: string | null
  expertise: string[]
  regions: string[]
  lectureRateMain: number | null
  coachRateMain: number | null

  /** 0~1, 가중치 적용된 최종 점수 */
  matchScore: number
  scoreBreakdown: ScoreBreakdown
  /** "AI/DX + 대학생 대상 + UD 협업 3건" 같은 한 줄 강점 */
  strengthOneLiner: string
}

/** required-count + coach-recommender 의 통합 응답 */
export interface RecommendCoachesResponse {
  /** 필요 코치 수 N */
  requiredN: number
  /** N 추정 근거 (PM 이 "왜 N 명?" toggle 시 보여줌) */
  rationale: string[]
  /** 추천 풀 (점수 desc, 길이 ≤ N × POOL_MULTIPLIER) */
  recommendations: CoachRecommendation[]
  /** 실제 풀 크기 (5N 못 채울 수도 있음) */
  poolSize: number
  /** ISO 8601 */
  generatedAt: string
}

/** recommender 입력 context */
export interface RecommendationContext {
  rfp: RfpParsed
  profile?: ProgramProfile
  requiredN: number
  coaches: MappedCoach[]
  /** default = POOL_MULTIPLIER (5) */
  poolMultiplier?: number
}

/** required-count 입력 (curriculum 은 optional — F0~F1 시점에 없을 수 있음) */
export interface RequiredCountInput {
  rfp: RfpParsed
  curriculum?: Array<{
    isCoaching1on1?: boolean
    isActionWeek?: boolean
  }>
}

/** required-count 결과 */
export interface RequiredCountResult {
  n: number
  rationale: string[]
}

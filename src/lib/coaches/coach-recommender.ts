/**
 * Coach Recommender — 점수 계산 + 풀 생성 (Wave V / F1, ADR-015)
 *
 * RFP + 715명 코치 풀 → 점수 desc 정렬 → 상위 N × POOL_MULTIPLIER 추출.
 *
 * 5축 가중치 (RECOMMENDER_WEIGHTS, 합 1.0, BR-WS-13 topic-fit 재조정):
 *   keyword 0.48 / task 0.30 / region 0.10 / tier 0.07 / history 0.05
 *
 * pure function — Prisma 호출 X. coachId / lectureRateMain / coachRateMain 는
 * 호출자(API route) 에서 prisma enrich.
 */

import type {
  RecommendationContext,
  CoachRecommendation,
  ScoreBreakdown,
} from './types'
import { RECOMMENDER_WEIGHTS, RECOMMENDATION_THRESHOLDS, POOL_MULTIPLIER } from './types'
import type { MappedCoach } from './supabase-source'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import { mapTasksToExpertise, normalizeExpertise } from './expertise-task-map'

// ─────────────────────────────────────────
// 1. 단일 코치 점수 계산
// ─────────────────────────────────────────

/**
 * coach 1명에 대한 5축 점수 산출.
 * 각 축은 0~1 raw score → RECOMMENDER_WEIGHTS 적용 후 breakdown 에 기록.
 * finalScore = breakdown 합 (자동으로 0~1 범위).
 */
export function scoreCoach(
  coach: MappedCoach,
  ctx: RecommendationContext,
): { score: number; breakdown: ScoreBreakdown } {
  const rfp = ctx.rfp
  const w = RECOMMENDER_WEIGHTS

  // ─── keyword score (0~1) ───
  const haystack = [
    ...coach.expertise,
    ...coach.industries,
    coach.intro ?? '',
    coach.careerHistory ?? '',
    coach.currentWork ?? '',
    coach.organization ?? '',
  ]
    .join(' ')
    .toLowerCase()

  const needles = [
    ...(rfp.keywords ?? []),
    ...(rfp.targetStage ?? []),
    rfp.targetAudience ?? '',
  ]
    .flatMap((s) => s.split(/[\s,·/]/))
    .filter((s) => s.length >= 2)
    .map((s) => s.toLowerCase())

  let keywordScore = 0
  if (needles.length > 0) {
    keywordScore = needles.filter((n) => haystack.includes(n)).length / needles.length
  }

  // ─── task score (0~1) ───
  const taskExpertiseSet = mapTasksToExpertise(rfp.detectedTasks ?? [])
  let taskScore = 0
  if (taskExpertiseSet.size > 0) {
    const coachExpertiseSet = new Set(coach.expertise.map(normalizeExpertise))
    const intersect = [...taskExpertiseSet].filter((t) => coachExpertiseSet.has(t)).length
    taskScore = intersect / taskExpertiseSet.size
  }

  // ─── region score (0~1) ───
  const rfpRegion = rfp.region
  let regionScore = 0.5 // neutral default
  if (rfpRegion && coach.regions.length > 0) {
    if (coach.regions.includes(rfpRegion)) {
      regionScore = 1.0
    } else if (
      coach.regions.some((r) => r.includes(rfpRegion) || rfpRegion.includes(r))
    ) {
      regionScore = 0.7
    } else {
      regionScore = 0
    }
  }

  // ─── tier score (0~1) ───
  let tierScore = 0
  if (coach.tier === 'TIER1') tierScore = 1.0
  else if (coach.tier === 'TIER2') tierScore = 0.6
  else if (coach.tier === 'TIER3') tierScore = 0.3

  // ─── history score (0~1) ───
  const collabScore = Math.min(1, Math.log10(1 + coach.collaborationCount) / 2)
  const satRaw = coach.satisfactionAvg ?? 0
  const satScore = satRaw >= 4.5 ? 1 : satRaw / 5
  const historyScore = (collabScore + satScore) / 2

  // ─── 최종 합산 ───
  const breakdown: ScoreBreakdown = {
    keyword: w.keyword * keywordScore,
    task: w.task * taskScore,
    region: w.region * regionScore,
    tier: w.tier * tierScore,
    history: w.history * historyScore,
  }
  const finalScore =
    breakdown.keyword + breakdown.task + breakdown.region + breakdown.tier + breakdown.history

  return { score: finalScore, breakdown }
}

// ─────────────────────────────────────────
// 2. 강점 1줄 생성
// ─────────────────────────────────────────

/**
 * 코치 카드의 "AI/DX + 대학생 대상 + UD 협업 3건" 같은 한 줄 강점.
 * 최대 3개 part 를 ' + ' 로 join. 비면 매칭 점수 fallback.
 */
export function buildStrengthOneLiner(
  coach: MappedCoach,
  rfp: RfpParsed,
  finalScore: number,
): string {
  const parts: string[] = []

  // 1. expertise — RFP keywords 와 substring 매칭되는 첫 expertise (정규화)
  //    없으면 coach.expertise[0] 정규화
  const keywords = (rfp.keywords ?? []).map((k) => k.toLowerCase())
  let topExpertise: string | null = null
  for (const e of coach.expertise) {
    const normalized = normalizeExpertise(e)
    const lower = normalized.toLowerCase()
    if (keywords.some((k) => lower.includes(k) || k.includes(lower))) {
      topExpertise = normalized
      break
    }
  }
  if (!topExpertise && coach.expertise[0]) {
    topExpertise = normalizeExpertise(coach.expertise[0])
  }
  if (topExpertise) parts.push(topExpertise)

  // 2. 대상 매칭 — rfp.targetAudience 의 token (≥2 자) 이
  //    coach.careerHistory / currentWork 에 포함되는지
  const audienceTokens = (rfp.targetAudience ?? '')
    .split(/[\s,·]/)
    .filter((s) => s.length >= 2)
  const coachExperience = [coach.careerHistory ?? '', coach.currentWork ?? '']
    .join(' ')
    .toLowerCase()
  const matchedAudience = audienceTokens.find((t) =>
    coachExperience.includes(t.toLowerCase()),
  )
  if (matchedAudience) parts.push(`${matchedAudience} 대상`)

  // 3. UD 협업 횟수 — collaborationCount > 0 일 때만
  if (coach.collaborationCount > 0) {
    parts.push(`UD 협업 ${coach.collaborationCount}건`)
  }

  // fallback
  if (parts.length === 0) {
    parts.push(`매칭 ${Math.round(finalScore * 100)}점`)
  }

  return parts.slice(0, 3).join(' + ')
}

// ─────────────────────────────────────────
// 3. 메인: 점수 계산 + 정렬 + 풀 추출
// ─────────────────────────────────────────

/**
 * RFP + 코치 풀 → CoachRecommendation[] (점수 desc, 길이 ≤ N × multiplier).
 *
 * pure — Prisma 호출 X. coachId / lectureRateMain / coachRateMain 는 caller 가 enrich.
 *
 * 절차:
 *   1. 모든 코치 점수 계산
 *   2. MIN_DISPLAY 미만 제외
 *   3. 점수 desc 정렬
 *   4. 상위 requiredN × multiplier 만 반환
 */
export function recommendCoaches(ctx: RecommendationContext): CoachRecommendation[] {
  const multiplier = ctx.poolMultiplier ?? POOL_MULTIPLIER
  const targetSize = ctx.requiredN * multiplier

  // 1. 모든 코치 점수 계산
  const scored = ctx.coaches.map((coach) => {
    const { score, breakdown } = scoreCoach(coach, ctx)
    return { coach, score, breakdown }
  })

  // 2. MIN_DISPLAY 미만 제외
  const filtered = scored.filter((s) => s.score >= RECOMMENDATION_THRESHOLDS.MIN_DISPLAY)

  // 3. 점수 desc 정렬
  filtered.sort((a, b) => b.score - a.score)

  // 4. 상위 targetSize 만
  const top = filtered.slice(0, targetSize)

  // 5. CoachRecommendation[] 변환
  return top.map(({ coach, score, breakdown }) => ({
    coachId: '', // API route 에서 prisma cuid 로 채움
    githubId: coach.githubId ?? null,
    name: coach.name,
    organization: coach.organization,
    position: coach.position,
    tier: coach.tier,
    photoUrl: coach.photoUrl,
    expertise: coach.expertise,
    regions: coach.regions,
    lectureRateMain: null, // API route 에서 prisma 로 채움
    coachRateMain: null,
    matchScore: score,
    scoreBreakdown: breakdown,
    strengthOneLiner: buildStrengthOneLiner(coach, ctx.rfp, score),
  }))
}

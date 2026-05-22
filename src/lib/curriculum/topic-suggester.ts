/**
 * Topic Suggester — F2 (Wave V, ADR-015, 2026-05-22)
 *
 * 커리큘럼 회차에 datacenter-stats 기반 inline citation hint 를 매핑.
 * AI outline 생성 후 후처리 — sessions[i].notes 끝에 stat citation 추가.
 *
 * 활용:
 *   - F1.5 의 findMatchingStats() 결과를 회차에 라운드로빈 분배
 *   - 진단 회차 (isDiagnostic) 는 자체 인용 이미 있으므로 skip
 *
 * pure function.
 */

import type { CurriculumSession } from '@/lib/ai/curriculum-types'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import {
  findMatchingStats,
  formatInlineCitation,
  type DataCenterStat,
} from '@/lib/research/datacenter-stats'
import {
  suggestActpreneurUniverses,
  type ActpreneurUniverse,
} from '@/lib/program-profile'

export interface TopicSuggestionInput {
  sessions: CurriculumSession[]
  rfp: RfpParsed
  /** 명시값. 없으면 suggestActpreneurUniverses 로 자동 추정 */
  universes?: ActpreneurUniverse[]
  /** 1개 회차당 최대 인용 수 — default 1 (정형화 회피) */
  maxCitationsPerSession?: number
}

export interface TopicSuggestionResult {
  sessions: CurriculumSession[]
  appliedCount: number
  universes: ActpreneurUniverse[]
  stats: DataCenterStat[]
}

/**
 * 회차별 stat citation 자동 추가.
 *
 * 알고리즘:
 *   1. universes 추정 (입력값 우선, 없으면 RFP 기반)
 *   2. findMatchingStats() top 5 stat
 *   3. 진단 회차 외 일반 회차에 라운드로빈 분배
 *   4. 같은 stat 중복 회피 (최소 한번씩)
 *
 * 정형화 회피: 회차당 1개 stat 만 (default). 모든 회차에 stat 박지 X.
 */
export function suggestTopicsForCurriculum(
  input: TopicSuggestionInput,
): TopicSuggestionResult {
  const maxPerSession = input.maxCitationsPerSession ?? 1

  // 1. universes 추정
  const universes =
    input.universes ??
    suggestActpreneurUniverses({
      keywords: input.rfp.keywords,
      targetStage: input.rfp.targetStage,
      targetSegment: input.rfp.targetAudience,
      detectedTasks: input.rfp.detectedTasks,
    })

  // 2. stat 매칭 — 정형화 회피 위해 top 3~5
  const matches = findMatchingStats({
    keywords: input.rfp.keywords ?? [],
    universes,
    limit: 5,
  })
  const stats = matches.map((m) => m.stat)

  if (stats.length === 0) {
    return {
      sessions: input.sessions,
      appliedCount: 0,
      universes,
      stats: [],
    }
  }

  // 3. 일반 회차 (진단 회차 외) 만 enrich 대상
  const enrichable = input.sessions
    .map((s, idx) => ({ session: s, idx }))
    .filter((x) => !x.session.isDiagnostic)

  // 4. 라운드로빈 분배 — stat N 개를 enrichable 회차에 골고루
  let appliedCount = 0
  const enrichedSessions = input.sessions.map((s, idx) => {
    if (s.isDiagnostic) return s
    const enrichableIdx = enrichable.findIndex((x) => x.idx === idx)
    if (enrichableIdx === -1) return s
    // 라운드로빈
    const statIdx = enrichableIdx % stats.length
    const stat = stats[statIdx]
    const citation = formatInlineCitation(stat)
    // 중복 회피 — notes 에 이미 같은 stat 있으면 skip
    if (s.notes?.includes(stat.source)) return s
    appliedCount++
    return {
      ...s,
      notes:
        s.notes && s.notes.length > 0
          ? `${s.notes}\n[참고 통계: ${stat.headline} ${citation}]`
          : `[참고 통계: ${stat.headline} ${citation}]`,
    }
  })

  return {
    sessions: enrichedSessions,
    appliedCount,
    universes,
    stats,
  }
}

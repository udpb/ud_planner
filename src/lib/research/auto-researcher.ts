/**
 * Auto-Researcher Orchestrator — F3 (Wave V, ADR-015)
 *
 * Tier 1 (datacenter-stats cache) → Tier 2 (Gemini grounding) → Tier 3 (PM 검토).
 *
 * - Tier 1: 외부 호출 0. F1.5 의 findMatchingStats 활용. 매칭 점수 ≥ 0.5 시 채택.
 * - Tier 2: Gemini grounding 1회. query-variation 으로 정형화 회피.
 * - Tier 3: 결과를 PM 에게 반환 — UI 가 수락/거절/다시 처리.
 *
 * server-only — web-search.ts 의존성.
 */

import 'server-only'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ActpreneurUniverse } from '@/lib/program-profile'
import {
  findMatchingStats,
  type DataCenterStat,
} from './datacenter-stats'
import { searchWeb } from './web-search'
import { buildCacheMatchKeywords, buildSearchQueries } from './query-variation'
import {
  TIER1_SCORE_THRESHOLD,
  type AutoResearchHit,
  type AutoResearchResult,
} from './types'
import { log } from '@/lib/logger'

export interface AutoResearchInput {
  /** AI 가 결정한 검색 topic */
  topic: string
  rfp: RfpParsed
  /** 명시값. 없으면 RFP 기반 추정 후 결과 universe 에 포함됨 */
  universes?: ActpreneurUniverse[]
  /** retry 시 1, 2, 3 — 3 초과 시 fallback */
  attempt?: number
  /** dedupe 대상 — 이미 사용된 source URL/source 명 */
  excludeSources?: string[]
}

/**
 * 메인 entry — Tier 1 시도 → miss 시 Tier 2.
 *
 * Tier 별 confidence:
 *   - cache (Tier 1) + score ≥ 0.75 → 'high'
 *   - cache (Tier 1) + score 0.5~0.75 → 'medium'
 *   - web (Tier 2) + URL 있음 → 'medium'
 *   - web (Tier 2) + URL 없음 → 'low'
 *   - fallback → 빈 배열 + fellbackTo
 */
export async function autoResearch(input: AutoResearchInput): Promise<AutoResearchResult> {
  const attempt = input.attempt ?? 1
  const excludeSources = input.excludeSources ?? []

  // ─────────────────────────────────────
  // Tier 1: datacenter-stats cache 매칭
  // ─────────────────────────────────────
  // attempt 1 에서만 Tier 1 시도 — retry 는 Tier 2 로 직행 (다른 결과 원할 때)
  if (attempt === 1) {
    const keywords = buildCacheMatchKeywords({ topic: input.topic, rfp: input.rfp })
    const matches = findMatchingStats({
      keywords,
      universes: input.universes,
      limit: 3,
    })

    if (matches.length > 0 && matches[0].score >= TIER1_SCORE_THRESHOLD) {
      log.info('research-tier1', `cache hit (score=${matches[0].score.toFixed(2)})`, {
        topic: input.topic,
        statId: matches[0].stat.id,
      })
      const hits = matches.map((m): AutoResearchHit => ({
        topic: input.topic,
        source: m.stat.source,
        year: m.stat.year,
        value: m.stat.value,
        summary: m.stat.description,
        sourceUrl: undefined, // datacenter-stats 는 URL 없음 — sourceReferences 활용 불가
        confidence: m.score >= 0.75 ? 'high' : 'medium',
        tier: 'cache',
        statId: m.stat.id,
      }))
      return {
        tier: 'cache',
        hits: hits.slice(0, 3),
        usedQueries: [],
      }
    }

    log.debug('research-tier1', 'cache miss', {
      topic: input.topic,
      topScore: matches[0]?.score ?? 0,
    })
  }

  // ─────────────────────────────────────
  // Tier 2: Gemini grounding 외부 검색
  // ─────────────────────────────────────
  const queries = buildSearchQueries({
    topic: input.topic,
    rfp: input.rfp,
    universes: input.universes ?? [],
    attempt,
  })

  const webResult = await searchWeb({
    queries,
    topic: input.topic,
    context: {
      projectName: input.rfp.projectName,
      client: input.rfp.client,
      targetAudience: input.rfp.targetAudience,
      keywords: input.rfp.keywords ?? [],
      universes: input.universes ?? [],
      channel: input.rfp.projectType ?? 'B2G',
    },
    excludeSources,
  })

  if (webResult.hits.length > 0) {
    return {
      tier: 'web',
      hits: webResult.hits.slice(0, 3),
      usedQueries: webResult.usedQueries,
    }
  }

  // ─────────────────────────────────────
  // Fallback: 모든 tier 실패 → PM 에게 manual 폴백 안내
  // ─────────────────────────────────────
  log.warn('research-fallback', `all tiers failed for topic: ${input.topic}`, {
    attempt,
  })
  return {
    tier: 'fallback',
    hits: [],
    usedQueries: webResult.usedQueries,
    fellbackTo: 'manual',
  }
}

/**
 * 헬퍼 — datacenter-stat → AutoResearchHit 변환 (외부 호출자 편의).
 * UI 가 stat 1건만 직접 add 할 때 사용 가능.
 */
export function statToHit(stat: DataCenterStat, confidence: 'high' | 'medium' = 'high'): AutoResearchHit {
  return {
    topic: stat.headline,
    source: stat.source,
    year: stat.year,
    value: stat.value,
    summary: stat.description,
    confidence,
    tier: 'cache',
    statId: stat.id,
  }
}

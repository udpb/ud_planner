/**
 * Auto-Research Types — F3 (Wave V, ADR-015)
 *
 * Tier 1 (datacenter-stats cache) → Tier 2 (Gemini grounding) → Tier 3 (PM 검토).
 *
 * pure types. server/client 양쪽 import 가능.
 */

import { z } from 'zod'

/** 결과의 출처 tier */
export type ResearchTier = 'cache' | 'web' | 'fallback'

/** 결과 신뢰도 */
export type ResearchConfidence = 'high' | 'medium' | 'low'

/** AutoResearch 결과의 단일 hit */
export const AutoResearchHitSchema = z.object({
  /** 검색 topic (AI 가 결정한 짧은 주제) */
  topic: z.string().min(2).max(100),
  /** 출처 (예: "통계청 청년경제활동조사") */
  source: z.string().min(2).max(200),
  /** 연도 또는 연도.월 (예: "2024" 또는 "2024.06") */
  year: z.string().min(4).max(10),
  /** 정량 수치 (예: "12.4%", "$480B", "57%") — 가능하면 한 줄에 1개 */
  value: z.string().max(60).optional(),
  /** 한 줄 요약 (60~120자 권장) */
  summary: z.string().min(20).max(400),
  /** Tier 1: datacenter-stats id / Tier 2: 검색 결과 URL */
  sourceUrl: z.string().optional(),
  /** Tier 1 = 'high' (datacenter-stats 검증된) / Tier 2 = 'medium' (web grounding + URL) / fallback = 'low' */
  confidence: z.enum(['high', 'medium', 'low']),
  /** 출처 tier */
  tier: z.enum(['cache', 'web', 'fallback']),
  /** Tier 1 일 때만 — datacenter-stats id */
  statId: z.string().optional(),
})

export type AutoResearchHit = z.infer<typeof AutoResearchHitSchema>

/** AutoResearch 전체 결과 */
export const AutoResearchResultSchema = z.object({
  /** 결과의 주된 tier (가장 신뢰도 높은 hit 의 tier) */
  tier: z.enum(['cache', 'web', 'fallback']),
  /** 결과 hits (정렬됨, top first) */
  hits: z.array(AutoResearchHitSchema),
  /** 실제 사용된 검색 query (Tier 2 만, 디버그용) */
  usedQueries: z.array(z.string()).default([]),
  /** fallback 발동 시 무엇으로 폴백할지 (manual / pm-direct) */
  fellbackTo: z.enum(['manual', 'pm-direct']).optional(),
})

export type AutoResearchResult = z.infer<typeof AutoResearchResultSchema>

/** API 요청 body — POST /api/express/auto-research */
export const AutoResearchRequestSchema = z.object({
  projectId: z.string().min(1),
  topic: z.string().min(2).max(100),
  /** 'auto' = 신규 호출 / 'retry' = attempt 증가 */
  mode: z.enum(['auto', 'retry']).default('auto'),
  /** retry 시 1, 2, 3 — 3 초과 시 fallback */
  attempt: z.number().int().min(1).max(3).default(1),
})

export type AutoResearchRequest = z.infer<typeof AutoResearchRequestSchema>

/** API 요청 body — POST /api/express/accept-research */
export const AcceptResearchRequestSchema = z.object({
  projectId: z.string().min(1),
  /** 클라이언트가 보유한 현재 draft (acceptResearch 후 업데이트되어 반환됨) */
  draft: z.unknown(), // ExpressDraft 자체 — runtime 검증은 route 에서 ExpressDraftSchema.safeParse
  /** PM 이 수락한 hits (1건 이상) */
  hits: z.array(AutoResearchHitSchema).min(1),
})

export type AcceptResearchRequest = z.infer<typeof AcceptResearchRequestSchema>

/** 최대 retry attempt — server-side 강제 */
export const MAX_RESEARCH_ATTEMPT = 3 as const

/** Tier 1 (datacenter-stats) 채택 임계값 */
export const TIER1_SCORE_THRESHOLD = 0.5 as const

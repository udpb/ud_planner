/**
 * Sphere 2 — Match Tuple Algorithm (W2)
 *
 * PRD-v11.0 §4.4 — 새 RFP 의 3-tuple 후보 → 시드된 WinningPattern · ContentAsset
 * 와 매칭 → top N (message · content) 반환.
 *
 * 알고리즘:
 *   1. extractRfpTuple — RFP 의 messageVector + contentKeywords 생성 (LLM 1 + embedding)
 *   2. Message 매칭: WinningPattern.messageVector 와 pairwise cosine
 *   3. Content 매칭: ContentAsset 조회 (channel 필터) + BM25 keyword + embedding cosine
 *   4. 통합 점수: 0.35×msgSim + 0.30×logicSim + 0.20×contentSim + 0.10×channel + 0.05×winRate
 *   5. MMR (Maximum Marginal Relevance) 다양성 강제 → 반복 출력 방지
 *
 * 호출 횟수: RFP 1건 = 1 LLM + 1 embedding (matching 자체는 DB query + 메모리 연산).
 *
 * server-only 의도.
 */

import { prisma } from '@/lib/prisma'
import { log } from '@/lib/logger'
import {
  cosineSimilarity,
  cosineSimilarityNormalized,
  mmr,
  graphSimilarity,
} from './vector-utils'
import { extractRfpTuple } from './rfp-tuple-extractor'
import type {
  Channel,
  LogicGraph,
  MatchTupleInput,
  MatchTupleOutput,
  MessageMatch,
  ContentMatch,
  MatchedConcept,
  ConceptMatchedAsset,
  Message,
  Outcome,
} from './types'

// ─────────────────────────────────────────
// 가중치 (PRD-v11.0 §4.4)
// ─────────────────────────────────────────

/**
 * 가중치 — message + logic + channel + winRate (Pattern 매칭 기준).
 *
 * PRD-v11.0 §4.4 의 기본 0.35·0.30·0.10·0.05 의 변형:
 * - content sim 은 ContentAsset 매칭 단계에서 별도 점수 (Pattern 점수에는 미반영)
 * - logic 30% 추가로 변별력 ↑ (W3)
 */
const WEIGHTS = {
  message: 0.4,
  logic: 0.3,
  channel: 0.2,
  winRate: 0.1,
} as const

/** logicSim 의 hybrid 비율 — 0.6 × embedding cosine + 0.4 × graph Jaccard */
const LOGIC_HYBRID = { embed: 0.6, jaccard: 0.4 } as const

const MMR_LAMBDA = 0.7
const DEFAULT_LIMIT = 5
const DEFAULT_MMR_THRESHOLD = 0.45

// ─────────────────────────────────────────
// BM25-lite (keyword overlap based)
// ─────────────────────────────────────────

/**
 * 단순 BM25-lite — RFP keywords 와 ContentAsset 의 narrativeSnippet/keywords
 * 단어 overlap 정규화 점수 (0~1).
 *
 * 전체 BM25 (TF·IDF·doc length) 는 코퍼스 크기 작아 (~250 ContentAsset) 필요 X.
 * 단순 keyword 매칭으로 충분.
 */
function bm25LiteScore(
  rfpKeywords: readonly string[],
  assetText: string,
  assetKeywords: readonly string[] = [],
): number {
  if (rfpKeywords.length === 0) return 0
  const haystack = (assetText + ' ' + assetKeywords.join(' ')).toLowerCase()
  let hits = 0
  for (const kw of rfpKeywords) {
    if (haystack.includes(kw.toLowerCase())) hits++
  }
  return hits / rfpKeywords.length
}

// ─────────────────────────────────────────
// Win-rate bonus (AssetUsage 기반)
// ─────────────────────────────────────────

/**
 * 단순 win-rate bonus — 자산이 과거 수주된 비율 (Laplace smoothing).
 *
 * 향후 PRD-v11.0 §4.2 의 정교한 win-rate 매트릭스 (채널별·시간감쇠) 로 확장.
 */
async function computeWinRateBonus(assetId: string): Promise<number> {
  const usages = await prisma.assetUsage.findMany({
    where: { assetId, wonProject: { not: null } },
    select: { wonProject: true, techScore: true },
  })
  if (usages.length === 0) return 0
  const wins = usages.filter((u) => u.wonProject === true).length
  // Laplace: (wins + 1) / (total + 2) — 신규 자산 보호
  return (wins + 1) / (usages.length + 2)
}

// ─────────────────────────────────────────
// Channel match bonus
// ─────────────────────────────────────────

function channelMatchScore(patternChannel: string | null, rfpChannel: Channel): number {
  if (!patternChannel) return 0.5 // 모름 — 중립
  return patternChannel === rfpChannel ? 1.0 : 0.3
}

// ─────────────────────────────────────────
// Logic 매칭 — hybrid (embedding cosine + graph Jaccard)
// ─────────────────────────────────────────

/**
 * Logic graph 매칭 점수 (0~1). hybrid:
 *   - 0.6 × embedding cosine (의미적 유사도 — graph 직렬화 → embedding)
 *   - 0.4 × graph Jaccard (구조적 유사도 — node/edge 집합 overlap)
 *
 * RFP 또는 Pattern 의 logicGraph/vector 가 비어있으면 0 (안전).
 *
 * 주의: graph Jaccard 는 type+label 정확 매칭이라 한국어 LLM 출력의 변동 (예: "활동" vs "Activity")
 * 에 약함. embedding cosine 이 의미 기반 보완.
 */
function computeLogicSim(args: {
  rfpVector: readonly number[]
  rfpGraph: LogicGraph | null
  patternVector: readonly number[]
  patternGraph: LogicGraph | null
}): number {
  const { rfpVector, rfpGraph, patternVector, patternGraph } = args

  // 1. Embedding cosine — vector 둘 다 있을 때만
  const embedSim =
    rfpVector.length > 0 && patternVector.length > 0
      ? cosineSimilarityNormalized(rfpVector, patternVector)
      : 0

  // 2. Graph Jaccard — graph 둘 다 있을 때만
  const jacSim = rfpGraph && patternGraph ? graphSimilarity(rfpGraph, patternGraph) : 0

  // 한 쪽이라도 0 이면 단일 신호만 사용 (가중 합 X)
  if (embedSim === 0 && jacSim === 0) return 0
  if (embedSim === 0) return jacSim
  if (jacSim === 0) return embedSim
  return LOGIC_HYBRID.embed * embedSim + LOGIC_HYBRID.jaccard * jacSim
}

// ─────────────────────────────────────────
// ContentAsset scoring + MMR helper (W10 — assetType 별 재사용)
// ─────────────────────────────────────────

interface ScoredAsset {
  id: string
  name: string
  narrativeSnippet: string
  embedding: number[]
  applicableSections: unknown
  sourceTier: string | null
}

function scoreAndMmr(
  rfpEstimate: { messageVector: number[]; contentKeywords: string[] },
  assets: Array<{
    id: string
    name: string
    narrativeSnippet: string
    embedding: number[]
    keywords: unknown
    applicableSections: unknown
    sourceTier: string | null
  }>,
  options: {
    limit: number
    bm25Weight: number // 0~1 (남은 비중은 embedding)
    cutThreshold: number
    mmrThreshold: number
  },
): ContentMatch[] {
  if (assets.length === 0) return []
  const { limit, bm25Weight, cutThreshold, mmrThreshold } = options
  const embedWeight = 1 - bm25Weight

  const scored = assets.map((asset) => {
    const bm25 = bm25LiteScore(
      rfpEstimate.contentKeywords,
      asset.narrativeSnippet,
      Array.isArray(asset.keywords) ? (asset.keywords as string[]) : [],
    )
    const embedSim = cosineSimilarityNormalized(rfpEstimate.messageVector, asset.embedding)
    const score = bm25Weight * bm25 + embedWeight * embedSim
    return { asset, score }
  })

  const mmrInput = scored
    .filter((c) => c.score > cutThreshold)
    .map((c) => ({
      item: c,
      relevance: c.score,
      vector: c.asset.embedding,
    }))

  const mmrResult = mmr(mmrInput, limit, { lambda: MMR_LAMBDA, threshold: mmrThreshold })

  return mmrResult.map((r) => ({
    assetId: r.item.asset.id,
    matchScore: r.item.score,
    narrativeSnippet: r.item.asset.narrativeSnippet.slice(0, 600),
    sectionHint: Array.isArray(r.item.asset.applicableSections)
      ? ((r.item.asset.applicableSections as string[])[0] ?? undefined)
      : undefined,
    sourceTier: r.item.asset.sourceTier ?? undefined,
    mmrScore: r.mmrScore,
  }))
}

// ─────────────────────────────────────────
// Concept 매칭 (W15 — Layer 3 Ontology 활용)
// ─────────────────────────────────────────

/**
 * RFP keywords → Concept entity 매칭.
 *
 * 3 단계:
 *   1. Concept name 정확 매칭 (case-insensitive) — weight 1.0
 *   2. Concept aliases contains 매칭 — weight 0.7
 *   3. 향후 embedding cosine (cold keyword 의 fuzzy 매칭) — 추후
 */
async function matchConceptsByKeywords(
  keywords: readonly string[],
): Promise<MatchedConcept[]> {
  if (keywords.length === 0) return []
  const matches = new Map<string, MatchedConcept>()

  for (const kwRaw of keywords) {
    const kw = kwRaw.trim()
    if (kw.length < 2) continue

    // 1. exact name (case-insensitive)
    const byName = await prisma.concept.findMany({
      where: { name: { equals: kw, mode: 'insensitive' } },
      select: { id: true, name: true, type: true, assetCount: true },
    })
    for (const c of byName) {
      if (!matches.has(c.id)) {
        matches.set(c.id, {
          conceptId: c.id,
          name: c.name,
          type: c.type,
          weight: 1.0,
          matchedBy: 'name',
          assetCount: c.assetCount,
          matchedKeyword: kw,
        })
      }
    }

    // 2. alias contains
    const byAlias = await prisma.concept.findMany({
      where: { aliases: { has: kw } },
      select: { id: true, name: true, type: true, assetCount: true },
    })
    for (const c of byAlias) {
      if (!matches.has(c.id)) {
        matches.set(c.id, {
          conceptId: c.id,
          name: c.name,
          type: c.type,
          weight: 0.7,
          matchedBy: 'alias',
          assetCount: c.assetCount,
          matchedKeyword: kw,
        })
      }
    }
  }

  return Array.from(matches.values()).sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight
    return b.assetCount - a.assetCount
  })
}

/**
 * 매칭된 Concept → AssetConcept join → 연결 자산 top N.
 *
 * 점수: concept.weight × assetConcept.weight + isCore bonus.
 */
async function conceptToAssets(
  matched: MatchedConcept[],
  limit: number,
): Promise<ConceptMatchedAsset[]> {
  if (matched.length === 0) return []
  const conceptIds = matched.map((c) => c.conceptId)
  const conceptMap = new Map(matched.map((c) => [c.conceptId, c]))

  // AssetConcept join — 매칭된 concept 의 모든 자산
  const acRows = await prisma.assetConcept.findMany({
    where: { conceptId: { in: conceptIds } },
    select: {
      assetId: true,
      conceptId: true,
      weight: true,
      isCore: true,
    },
  })

  // 자산별 best score (여러 concept 으로 매칭 가능 — max 선택)
  interface AssetScore {
    assetId: string
    matchedConceptId: string
    score: number
    isCore: boolean
  }
  const bestByAsset = new Map<string, AssetScore>()
  for (const ac of acRows) {
    const c = conceptMap.get(ac.conceptId)
    if (!c) continue
    const score = c.weight * ac.weight + (ac.isCore ? 0.15 : 0)
    const existing = bestByAsset.get(ac.assetId)
    if (!existing || existing.score < score) {
      bestByAsset.set(ac.assetId, {
        assetId: ac.assetId,
        matchedConceptId: ac.conceptId,
        score,
        isCore: ac.isCore,
      })
    }
  }

  // top N
  const sorted = Array.from(bestByAsset.values()).sort((a, b) => b.score - a.score)
  const topN = sorted.slice(0, limit)
  if (topN.length === 0) return []

  // 자산 메타 fetch
  const assetIds = topN.map((s) => s.assetId)
  const assets = await prisma.contentAsset.findMany({
    where: { id: { in: assetIds } },
    select: {
      id: true,
      name: true,
      assetType: true,
      narrativeSnippet: true,
      sourceTier: true,
    },
  })
  const assetMap = new Map(assets.map((a) => [a.id, a]))

  return topN
    .map((s): ConceptMatchedAsset | null => {
      const asset = assetMap.get(s.assetId)
      const concept = conceptMap.get(s.matchedConceptId)
      if (!asset || !concept) return null
      return {
        assetId: asset.id,
        assetName: asset.name,
        assetType: asset.assetType,
        matchedConcept: concept.name,
        matchedConceptType: concept.type,
        matchScore: s.score,
        narrativeSnippet: asset.narrativeSnippet.slice(0, 600),
        sourceTier: asset.sourceTier ?? undefined,
        isCore: s.isCore,
      }
    })
    .filter((x): x is ConceptMatchedAsset => x !== null)
}

// ─────────────────────────────────────────
// 메인 매칭 함수
// ─────────────────────────────────────────

export async function matchTuple(input: MatchTupleInput): Promise<MatchTupleOutput> {
  const startedAt = Date.now()
  const limit = input.limit ?? DEFAULT_LIMIT
  const mmrThreshold = input.mmrThreshold ?? DEFAULT_MMR_THRESHOLD

  // ─────────────────────────────────────────
  // 1. RFP → 3-tuple 후보 추정 (1 LLM + 1 embedding)
  // ─────────────────────────────────────────

  const rfpEstimate = await extractRfpTuple({
    rfpText: input.rfp.text,
    keywords: input.rfp.keywords,
    objectives: input.rfp.objectives,
    evalCriteria: input.rfp.evalCriteria,
    channel: input.channel,
  })

  log.info('inference', '[match-tuple] RFP 추정 완료', {
    channel: input.channel,
    channelHint: rfpEstimate.channelHint,
    keywordsCount: rfpEstimate.contentKeywords.length,
    rfpVectorDim: rfpEstimate.messageVector.length,
  })

  // ─────────────────────────────────────────
  // 2. WinningPattern 전체 조회 (message 있는 것만)
  // ─────────────────────────────────────────

  const patterns = await prisma.winningPattern.findMany({
    where: {
      message: { not: undefined },
      outcome: { in: ['won', 'pending'] },
    },
    select: {
      id: true,
      sourceProject: true,
      channelType: true,
      outcome: true,
      message: true,
      messageVector: true,
      logicGraph: true,
      logicGraphVector: true,
      contentRefs: true,
    },
  })

  log.debug('inference', `[match-tuple] WinningPattern 후보 ${patterns.length}건`)

  // ─────────────────────────────────────────
  // 3. Message 매칭 — cosine + 채널 + winRate (Promise.all batch winRate)
  // ─────────────────────────────────────────

  const messageScored: Array<{
    pattern: (typeof patterns)[0]
    msgSim: number
    logicSim: number
    channelBonus: number
    matchScore: number
  }> = []

  for (const pattern of patterns) {
    const vec = pattern.messageVector as unknown as number[]
    if (!Array.isArray(vec) || vec.length === 0) continue
    const msgSim = cosineSimilarityNormalized(rfpEstimate.messageVector, vec)
    const channelBonus = channelMatchScore(pattern.channelType, input.channel)

    // logic 매칭 (W3) — hybrid embedding + Jaccard
    const patternLogicVec = pattern.logicGraphVector as unknown as number[]
    const patternLogicGraph = pattern.logicGraph as unknown as LogicGraph | null
    const logicSim = computeLogicSim({
      rfpVector: rfpEstimate.logicGraphVector,
      rfpGraph: rfpEstimate.logicGraph,
      patternVector: Array.isArray(patternLogicVec) ? patternLogicVec : [],
      patternGraph: patternLogicGraph,
    })

    // 1차 score — winRate 제외 (비싸므로 top N+5 만)
    const partialScore =
      WEIGHTS.message * msgSim +
      WEIGHTS.logic * logicSim +
      WEIGHTS.channel * channelBonus
    messageScored.push({ pattern, msgSim, logicSim, channelBonus, matchScore: partialScore })
  }

  messageScored.sort((a, b) => b.matchScore - a.matchScore)

  // top (limit + 5) 에만 winRate 추가 계산 (비용 절약)
  const topCandidates = messageScored.slice(0, limit + 5)

  const messageMatches: MessageMatch[] = []
  for (const c of topCandidates) {
    // winRate — pattern 의 contentRefs 첫 자산으로 estimate (단순화)
    let winRate = 0
    if (c.pattern.contentRefs && c.pattern.contentRefs.length > 0) {
      winRate = await computeWinRateBonus(c.pattern.contentRefs[0])
    }
    const finalScore =
      WEIGHTS.message * c.msgSim +
      WEIGHTS.logic * c.logicSim +
      WEIGHTS.channel * c.channelBonus +
      WEIGHTS.winRate * winRate
    messageMatches.push({
      patternId: c.pattern.id,
      matchScore: finalScore,
      message: c.pattern.message as unknown as Message,
      sourceProject: c.pattern.sourceProject,
      outcome: c.pattern.outcome as Outcome,
      breakdown: {
        messageSim: c.msgSim,
        logicSim: c.logicSim, // W3 — embedding cosine + Jaccard hybrid
        contentSim: 0, // 별도 ContentAsset 매칭으로 분리 (W2 v1)
        channelMatch: c.channelBonus,
        winRateBonus: winRate,
      },
    })
  }

  messageMatches.sort((a, b) => b.matchScore - a.matchScore)
  const topMessages = messageMatches.slice(0, limit)

  // ─────────────────────────────────────────
  // 4. Content 매칭 — assetType 별 분리 (W10)
  //    proposal 자산: 시드된 제안서 narrative — 도메인 매칭 우선
  //    methodology 자산: 회사 IP (ACTT/AX/DOGS 등) — 항상 top N 노출
  // ─────────────────────────────────────────

  const allAssets = await prisma.contentAsset.findMany({
    where: { status: { not: 'archived' } },
    select: {
      id: true,
      name: true,
      narrativeSnippet: true,
      embedding: true,
      keywords: true,
      applicableSections: true,
      sourceTier: true,
      category: true,
      assetType: true,
    },
  })
  const assetsWithEmbed = allAssets.filter(
    (a) => Array.isArray(a.embedding) && a.embedding.length > 0,
  )
  const proposalAssets = assetsWithEmbed.filter((a) => a.assetType === 'proposal')
  const methodologyAssets = assetsWithEmbed.filter((a) => a.assetType === 'methodology')
  const caseAssets = assetsWithEmbed.filter((a) => a.assetType === 'case')
  log.debug(
    'inference',
    `[match-tuple] ContentAsset 후보: proposal=${proposalAssets.length}, methodology=${methodologyAssets.length}, case=${caseAssets.length}`,
  )

  // proposal 자산 매칭 — BM25 + embedding hybrid (도메인 매칭 우선)
  const topContents = scoreAndMmr(rfpEstimate, proposalAssets, {
    limit,
    bm25Weight: 0.4,
    cutThreshold: 0.2,
    mmrThreshold,
  })

  // methodology 자산 매칭 — embedding 우선 (도메인 keyword 없을 수 있음) + 낮은 cut
  // 회사 IP 는 RFP 도메인과 멀어도 인용 가치 → cut 0.05, MMR threshold 낮춤
  const topMethodologyAssets = scoreAndMmr(rfpEstimate, methodologyAssets, {
    limit,
    bm25Weight: 0.2, // BM25 비중 ↓ (keyword 도메인 mismatch 가능)
    cutThreshold: 0.05, // 거의 안 자름 — 차별화 인용 항상 가능
    mmrThreshold: 0.3, // 다양성 더 강조 (다양한 IP 노출)
  })

  // case 자산 매칭 (W13) — 결과보고서 기반 지표·레슨. 도메인 매칭 우선 (proposal 과 유사)
  const topCaseAssets = scoreAndMmr(rfpEstimate, caseAssets, {
    limit,
    bm25Weight: 0.4, // 도메인 keyword 매칭 중요 (사업명·분야 일치)
    cutThreshold: 0.15, // proposal 보다 약간 낮춤 (사례 풀이 작음)
    mmrThreshold: 0.4, // 다양한 사례 노출
  })

  // ─────────────────────────────────────────
  // 5. Concept 매칭 (W15 — Layer 3 Ontology)
  //    RFP keywords → Concept entity → AssetConcept join → 자산
  // ─────────────────────────────────────────

  const matchedConcepts = await matchConceptsByKeywords(rfpEstimate.contentKeywords)
  const topConceptAssets = await conceptToAssets(matchedConcepts, limit * 2)
  log.debug(
    'inference',
    `[match-tuple] Concept 매칭: ${matchedConcepts.length} concepts → ${topConceptAssets.length} assets`,
  )

  // ─────────────────────────────────────────
  // 6. 결과 반환
  // ─────────────────────────────────────────

  const elapsedMs = Date.now() - startedAt
  log.info('inference', `[match-tuple] 완료`, {
    channel: input.channel,
    topMessageCount: topMessages.length,
    topContentCount: topContents.length,
    topMethodologyCount: topMethodologyAssets.length,
    topCaseCount: topCaseAssets.length,
    matchedConcepts: matchedConcepts.length,
    conceptAssets: topConceptAssets.length,
    totalCandidates: {
      messages: messageScored.length,
      proposalContents: proposalAssets.length,
      methodologyAssets: methodologyAssets.length,
      caseAssets: caseAssets.length,
    },
    elapsedMs,
  })

  return {
    messages: topMessages,
    contents: topContents,
    methodologyAssets: topMethodologyAssets,
    caseAssets: topCaseAssets,
    matchedConcepts,
    conceptAssets: topConceptAssets,
    rfpEstimate: {
      messageVector: rfpEstimate.messageVector,
      logicGraph: rfpEstimate.logicGraph,
      contentKeywords: rfpEstimate.contentKeywords,
    },
    totalCandidates: {
      messages: messageScored.length,
      contents: proposalAssets.length,
      methodologyAssets: methodologyAssets.length,
      caseAssets: caseAssets.length,
      matchedConcepts: matchedConcepts.length,
      conceptAssets: topConceptAssets.length,
    },
    elapsedMs,
  }
}

// 미사용 import 경고 회피 — cosineSimilarity 는 mmr 내부에서만 (재export)
void cosineSimilarity

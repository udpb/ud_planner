/**
 * POST /api/v1/inference/match-tuple
 *
 * Sphere 2 (AI 두뇌) 의 매칭 entry point.
 *
 * 새 RFP 1건 → 시드된 WinningPattern · ContentAsset 과 3-tuple 매칭 → top N 반환.
 * PRD-v11.0 §4.4 의 알고리즘 구현.
 *
 * 흐름:
 *   1. Auth
 *   2. Rate limit (분당 10회 — LLM 1 + embedding 1 호출)
 *   3. Body 검증 (zod)
 *   4. matchTuple 호출 (extractRfpTuple → cosine 매칭 → BM25 + MMR)
 *   5. top messages + top contents 반환
 *
 * 비용: RFP 1건 ~$0.003 (Gemini Flash 1 호출 + embedding 1 호출).
 *
 * 관련 ADR: ADR-017 (Wave W 톤 자산화), PRD-v11.0 §4.4
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth-helpers'
import { checkRateLimit, getClientIp, AI_RATE_LIMIT } from '@/lib/rate-limit'
import { matchTuple } from '@/lib/inference/match-tuple'
import { ChannelSchema } from '@/lib/inference/types'
import { log } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // LLM 1 + embedding 1 + DB query ≤ 20초 안전

// ─────────────────────────────────────────
// Request body schema
// ─────────────────────────────────────────

const EvalCriterionSchema = z.object({
  item: z.string().min(1).max(200),
  score: z.number().min(0).max(100),
})

const MatchTupleRequestSchema = z.object({
  /** RFP 의 구조화 결과 */
  rfp: z.object({
    text: z.string().min(200, 'RFP 본문은 최소 200자').max(200_000),
    keywords: z.array(z.string()).optional(),
    objectives: z.array(z.string()).optional(),
    evalCriteria: z.array(EvalCriterionSchema).optional(),
  }),
  /** ProgramProfile snapshot (있으면 hint 로 주입) — 자유 형식 */
  profile: z.unknown().optional(),
  /** 매칭 채널 */
  channel: ChannelSchema,
  /** top N (기본 5) */
  limit: z.number().int().min(1).max(20).optional(),
  /** MMR 다양성 threshold (기본 0.45) */
  mmrThreshold: z.number().min(0).max(1).optional(),
})

type MatchTupleRequest = z.infer<typeof MatchTupleRequestSchema>

// ─────────────────────────────────────────
// Handler
// ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startedAt = Date.now()

  // 1. Auth
  const auth = await requireAuth()
  if (!auth.ok) return auth.response!

  // 2. Rate limit — LLM 1 + embedding 1 → 분당 10회 (AI_RATE_LIMIT 기본 적용)
  const userId = auth.userId ?? 'anon'
  const limitKey = `match-tuple:${userId}:${getClientIp(req)}`
  const rl = checkRateLimit({
    key: limitKey,
    limit: 10, // 분당 10회 — LLM 10 + embedding 10 = 20 호출/분 ≈ Gemini RPM 의 30%
    windowMs: AI_RATE_LIMIT.windowMs,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: 'RATE_LIMIT',
        message: `요청 한도 초과. ${rl.retryAfterSec}초 후 재시도.`,
        retryAfterSec: rl.retryAfterSec,
      },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  // 3. Body 검증
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'request body must be valid JSON' },
      { status: 400 },
    )
  }

  const parsed = MatchTupleRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION',
        message: 'request body 검증 실패',
        issues: parsed.error.issues.slice(0, 5).map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 },
    )
  }

  const input: MatchTupleRequest = parsed.data

  log.info('api', '[match-tuple] 요청 수신', {
    userId,
    channel: input.channel,
    rfpChars: input.rfp.text.length,
    keywordsCount: input.rfp.keywords?.length ?? 0,
    objectivesCount: input.rfp.objectives?.length ?? 0,
    limit: input.limit,
  })

  // 4. matchTuple 호출
  try {
    const result = await matchTuple({
      rfp: input.rfp,
      profile: input.profile,
      channel: input.channel,
      limit: input.limit,
      mmrThreshold: input.mmrThreshold,
    })

    // 5. 결과 반환 — vector 는 size 만, 본문은 preview
    return NextResponse.json({
      ok: true,
      channel: input.channel,
      messages: result.messages.map((m) => ({
        patternId: m.patternId,
        matchScore: Number(m.matchScore.toFixed(4)),
        sourceProject: m.sourceProject,
        outcome: m.outcome,
        message: {
          slogan: m.message.slogan,
          keyMessages: m.message.keyMessages,
          beforeAfter: m.message.beforeAfter,
        },
        breakdown: {
          messageSim: Number(m.breakdown.messageSim.toFixed(4)),
          logicSim: Number(m.breakdown.logicSim.toFixed(4)),
          contentSim: Number(m.breakdown.contentSim.toFixed(4)),
          channelMatch: Number(m.breakdown.channelMatch.toFixed(4)),
          winRateBonus: Number(m.breakdown.winRateBonus.toFixed(4)),
        },
      })),
      contents: result.contents.map((c) => ({
        assetId: c.assetId,
        matchScore: Number(c.matchScore.toFixed(4)),
        mmrScore: Number(c.mmrScore.toFixed(4)),
        sectionHint: c.sectionHint,
        sourceTier: c.sourceTier,
        narrativeSnippet: c.narrativeSnippet,
      })),
      methodologyAssets: result.methodologyAssets.map((c) => ({
        assetId: c.assetId,
        matchScore: Number(c.matchScore.toFixed(4)),
        mmrScore: Number(c.mmrScore.toFixed(4)),
        sectionHint: c.sectionHint,
        sourceTier: c.sourceTier,
        narrativeSnippet: c.narrativeSnippet,
      })),
      caseAssets: result.caseAssets.map((c) => ({
        assetId: c.assetId,
        matchScore: Number(c.matchScore.toFixed(4)),
        mmrScore: Number(c.mmrScore.toFixed(4)),
        sectionHint: c.sectionHint,
        sourceTier: c.sourceTier,
        narrativeSnippet: c.narrativeSnippet,
      })),
      matchedConcepts: result.matchedConcepts.map((c) => ({
        conceptId: c.conceptId,
        name: c.name,
        type: c.type,
        weight: Number(c.weight.toFixed(2)),
        matchedBy: c.matchedBy,
        assetCount: c.assetCount,
        matchedKeyword: c.matchedKeyword,
      })),
      conceptAssets: result.conceptAssets.map((c) => ({
        assetId: c.assetId,
        assetName: c.assetName,
        assetType: c.assetType,
        matchedConcept: c.matchedConcept,
        matchedConceptType: c.matchedConceptType,
        matchScore: Number(c.matchScore.toFixed(4)),
        isCore: c.isCore,
        sourceTier: c.sourceTier,
        narrativeSnippet: c.narrativeSnippet,
      })),
      rfpEstimate: {
        // vector 자체는 무거우니 dim 만
        messageVectorDim: result.rfpEstimate.messageVector.length,
        contentKeywords: result.rfpEstimate.contentKeywords,
        logicGraph: result.rfpEstimate.logicGraph
          ? {
              nodeCount: result.rfpEstimate.logicGraph.nodes.length,
              edgeCount: result.rfpEstimate.logicGraph.edges.length,
              sectionOrder: result.rfpEstimate.logicGraph.sectionOrder,
            }
          : null,
      },
      meta: {
        totalCandidates: result.totalCandidates,
        elapsedMs: Date.now() - startedAt,
        innerElapsedMs: result.elapsedMs,
      },
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    log.error('api', '[match-tuple] 실패', {
      userId,
      channel: input.channel,
      elapsedMs: Date.now() - startedAt,
      err: errMsg,
    })
    return NextResponse.json(
      {
        error: 'MATCH_FAILED',
        message: errMsg.slice(0, 500),
        channel: input.channel,
      },
      { status: 500 },
    )
  }
}

/**
 * GET — health check only (debug 용).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/v1/inference/match-tuple',
    purpose: 'Sphere 2 — 새 RFP → 시드된 3-tuple 매칭 (top N messages + contents)',
    expectedCostUsd: 0.003,
    maxDurationSec: 30,
  })
}

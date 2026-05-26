/**
 * POST /api/v1/inference/extract-tuple
 *
 * Sphere 2 (AI 두뇌) 의 ingest entry point.
 *
 * 제안서 본문 1건 → 3-tuple (Message + LogicStructure + Content) 분해 + DB 저장.
 * PRD-v11.0 §4.3 의 알고리즘 구현.
 *
 * 흐름:
 *   1. Auth (인증된 사용자만)
 *   2. Rate limit (분당 5회 — LLM 3 호출이라 비쌈)
 *   3. Body 검증 (zod)
 *   4. extractTuple 호출 (3 LLM + embedding + DB 저장)
 *   5. 결과 반환 (Message preview + Logic summary + ContentAsset id[])
 *
 * dryRun=true 면 DB 저장 skip — 알고리즘만 검증 (테스트용).
 *
 * 비용: 제안서 1건 ~$0.015 (Gemini 3.1 Pro Preview).
 *
 * 관련 ADR: ADR-017 (Wave W 톤 자산화)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth-helpers'
import { checkRateLimit, getClientIp, AI_RATE_LIMIT } from '@/lib/rate-limit'
import { extractTuple } from '@/lib/inference/extract-tuple'
import { ChannelSchema, OutcomeSchema } from '@/lib/inference/types'
import { log } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 3 LLM 병렬 + embedding ~30~45초

// ─────────────────────────────────────────
// Request body schema
// ─────────────────────────────────────────

const ExtractTupleRequestSchema = z.object({
  /** 제안서 본문 (PDF/PPTX 에서 추출된 텍스트 또는 직접 입력) */
  proposalText: z.string().min(500, '제안서 본문은 최소 500자').max(150_000),
  /** 제안서 메타 */
  sourceProject: z.string().min(1).max(200),
  sourceClient: z.string().max(200).optional(),
  outcome: OutcomeSchema,
  channel: ChannelSchema,
  /** 패배 시 사유 (선택) */
  lossReason: z.string().max(500).optional(),
  /** 자료 source */
  sourceType: z
    .enum(['drive', 'slack', 'manual', 'product-api', 'archive'])
    .optional(),
  sourceRef: z.string().max(500).optional(),
  publishedAt: z
    .string()
    .datetime()
    .optional()
    .transform((s) => (s ? new Date(s) : undefined)),
  /** true 면 DB 저장 skip — 결과만 반환 (테스트용) */
  dryRun: z.boolean().optional().default(false),
})

type ExtractTupleRequest = z.infer<typeof ExtractTupleRequestSchema>

// ─────────────────────────────────────────
// Handler
// ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startedAt = Date.now()

  // 1. Auth
  const auth = await requireAuth()
  if (!auth.ok) return auth.response!

  // 2. Rate limit — IP·user 기반, 분당 5회 (AI_RATE_LIMIT 의 절반)
  const userId = auth.userId ?? 'anon'
  const limitKey = `extract-tuple:${userId}:${getClientIp(req)}`
  const rl = checkRateLimit({
    key: limitKey,
    limit: 5, // 분당 5회 — LLM 3호출 × 5 = 15회/분 ≈ Gemini RPM 의 25%
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

  const parsed = ExtractTupleRequestSchema.safeParse(body)
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

  const input: ExtractTupleRequest = parsed.data

  log.info('api', '[extract-tuple] 요청 수신', {
    userId,
    sourceProject: input.sourceProject,
    outcome: input.outcome,
    channel: input.channel,
    proposalChars: input.proposalText.length,
    dryRun: input.dryRun,
  })

  // 4. extractTuple 호출
  try {
    const result = await extractTuple(
      {
        proposalText: input.proposalText,
        sourceProject: input.sourceProject,
        sourceClient: input.sourceClient,
        outcome: input.outcome,
        channel: input.channel,
        lossReason: input.lossReason,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        publishedAt: input.publishedAt,
      },
      { dryRun: input.dryRun },
    )

    // 5. 결과 반환 — preview 만 (전체 vector 는 큼)
    return NextResponse.json({
      ok: true,
      dryRun: input.dryRun,
      patternId: result.patternId,
      contentAssetIds: result.contentAssetIds,
      message: {
        slogan: result.message.slogan,
        keyMessages: result.message.keyMessages,
        beforeAfter: result.message.beforeAfter,
      },
      tonePatterns: {
        openingsCount: result.tonePatterns.openings.length,
        transitionsCount: result.tonePatterns.transitions.length,
        avoidedWordsCount: result.tonePatterns.avoidedWords.length,
        signatureNumbersCount: result.tonePatterns.signatureNumbers.length,
        // 첫 3 개씩 preview
        preview: {
          openings: result.tonePatterns.openings.slice(0, 3),
          avoidedWords: result.tonePatterns.avoidedWords.slice(0, 5),
          signatureNumbers: result.tonePatterns.signatureNumbers.slice(0, 5),
        },
      },
      logicGraph: {
        nodeCount: result.logicGraph.nodes.length,
        edgeCount: result.logicGraph.edges.length,
        sectionOrder: result.logicGraph.sectionOrder,
        // 첫 5 노드 preview
        nodesPreview: result.logicGraph.nodes.slice(0, 5),
      },
      contentChunks: result.contentChunks.map((c) => ({
        sectionHint: c.sectionHint,
        category: c.category,
        evidenceType: c.evidenceType,
        sourceTier: c.sourceTier,
        keyNumbersCount: c.keyNumbers.length,
        textPreview: c.text.slice(0, 120),
      })),
      // 메타
      meta: {
        confidence: result.confidence,
        totalTokensUsed: result.totalTokensUsed,
        costUsd: result.costUsd,
        elapsedMs: Date.now() - startedAt,
        messageVectorDim: result.messageVector.length,
        logicGraphVectorDim: result.logicGraphVector.length,
      },
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    log.error('api', '[extract-tuple] 실패', {
      userId,
      sourceProject: input.sourceProject,
      elapsedMs: Date.now() - startedAt,
      err: errMsg,
    })
    return NextResponse.json(
      {
        error: 'EXTRACTION_FAILED',
        message: errMsg.slice(0, 500),
        sourceProject: input.sourceProject,
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
    endpoint: 'POST /api/v1/inference/extract-tuple',
    purpose: 'Sphere 2 — 제안서 1건 → 3-tuple 분해 + DB 저장',
    expectedCostUsd: 0.015,
    maxDurationSec: 60,
  })
}

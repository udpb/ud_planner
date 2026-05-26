/**
 * Sphere 2 — Extract Tuple Orchestrator
 *
 * PRD-v11.0 §4.3 — 3 LLM 호출 통합 + DB 저장.
 *
 * 흐름:
 *   1. semantic chunking (LLM X, pure)
 *   2. 3 LLM 호출 병렬:
 *      - extractMessage (LLM #1)
 *      - extractLogic (LLM #2)
 *      - extractContentBatch (LLM #3 × N chunks)
 *   3. embedding 생성 (message · logicGraph)
 *   4. DB 저장 (WinningPattern + ContentAsset row)
 *
 * 비용: 제안서 1건 ≈ $0.015 (Gemini 3.1 Pro Preview).
 *
 * dry-run 모드: DB 저장 skip · 결과만 반환 (테스트용).
 */

// server-only 의도 — prisma/invokeAi 가 client bundle 에서 자연 fail.

import { log } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { extractMessage } from './message-extractor'
import { extractLogic } from './logic-extractor'
import { extractContentBulk } from './content-extractor'
import { embed, embedBatch, embedLogicGraph } from './vector-utils'
import {
  type ExtractTupleInput,
  type ExtractTupleOutput,
  EXPECTED_COST_PER_PROPOSAL_USD,
} from './types'

export interface ExtractTupleOptions {
  /** true 면 DB 저장 skip — 결과만 반환 (테스트·검증용) */
  dryRun?: boolean
}

/**
 * 제안서 1건 → 3-tuple 분해 + 저장.
 *
 * dryRun=true 면 DB 호출 0 — 결과만 반환.
 * dryRun=false 면 WinningPattern + ContentAsset row 생성.
 */
export async function extractTuple(
  input: ExtractTupleInput,
  options: ExtractTupleOptions = {},
): Promise<ExtractTupleOutput> {
  const startedAt = Date.now()
  const dryRun = options.dryRun ?? false

  log.info('inference', `[extract-tuple] 시작`, {
    sourceProject: input.sourceProject,
    outcome: input.outcome,
    channel: input.channel,
    proposalChars: input.proposalText.length,
    dryRun,
  })

  // ─────────────────────────────────────────
  // 1. message + logic 2 LLM 병렬 (전체 PDF 받음)
  //    content 는 message 결과를 prompt 에 주입해 sequential — 퀄리티↑
  // ─────────────────────────────────────────

  const sourceHintForContent = mapSourceHint(input.sourceType, input.sourceRef)

  const [messageResult, logicResult] = await Promise.all([
    extractMessage({
      proposalText: input.proposalText,
      sourceProject: input.sourceProject,
      channel: input.channel,
    }),
    extractLogic({
      proposalText: input.proposalText,
      sourceProject: input.sourceProject,
      channel: input.channel,
    }),
  ])

  log.info('inference', `[extract-tuple] message + logic 완료`, {
    sourceProject: input.sourceProject,
    messageConfidence: messageResult.confidence,
    logicConfidence: logicResult.confidence,
    ms: Date.now() - startedAt,
  })

  // ─────────────────────────────────────────
  // 2. content-bulk 1 LLM 호출 — 자산 5~12개 일괄 추출
  //    (2026-05-24 — 퀄리티 최우선 결정: chunk 별 N 호출 폐기)
  //    messageContext 주입 → 자산 선별 정확도 ↑
  // ─────────────────────────────────────────

  const contentResult = await extractContentBulk({
    proposalText: input.proposalText,
    sourceProject: input.sourceProject,
    channel: input.channel,
    messageContext: {
      slogan: messageResult.message.slogan,
      keyMessages: messageResult.message.keyMessages,
    },
    sourceHint: sourceHintForContent,
  })

  log.info('inference', `[extract-tuple] content-bulk 완료`, {
    sourceProject: input.sourceProject,
    assetCount: contentResult.chunks.length,
    contentConfidence: contentResult.confidence,
    ms: Date.now() - startedAt,
  })

  // ─────────────────────────────────────────
  // 3. Embedding 생성 (병렬)
  // ─────────────────────────────────────────

  const messageText =
    messageResult.message.slogan +
    ' ' +
    messageResult.message.keyMessages.join(' ')

  const [messageVector, logicGraphVector] = await Promise.all([
    embed(messageText),
    embedLogicGraph(logicResult.logicGraph),
  ])

  // ─────────────────────────────────────────
  // 4. DB 저장 (dryRun=false 면)
  // ─────────────────────────────────────────

  let patternId = `dry-run-${Date.now()}`
  let contentAssetIds: string[] = []

  if (!dryRun) {
    const stub = await persistTuple({
      input,
      message: messageResult.message,
      messageVector,
      tonePatterns: messageResult.tonePatterns,
      logicGraph: logicResult.logicGraph,
      logicGraphVector,
      contentChunks: contentResult.chunks,
    })
    patternId = stub.patternId
    contentAssetIds = stub.contentAssetIds
  }

  // ─────────────────────────────────────────
  // 5. 결과 반환
  // ─────────────────────────────────────────

  const totalTokens =
    messageResult.tokensUsed + logicResult.tokensUsed + contentResult.tokensUsed

  const result: ExtractTupleOutput = {
    patternId,
    message: messageResult.message,
    messageVector,
    tonePatterns: messageResult.tonePatterns,
    logicGraph: logicResult.logicGraph,
    logicGraphVector,
    contentAssetIds,
    contentChunks: contentResult.chunks,
    totalTokensUsed: totalTokens,
    costUsd: EXPECTED_COST_PER_PROPOSAL_USD,
    confidence:
      (messageResult.confidence +
        logicResult.confidence +
        contentResult.confidence) /
      3,
  }

  log.info('inference', `[extract-tuple] 종료`, {
    sourceProject: input.sourceProject,
    patternId,
    contentAssetCount: contentAssetIds.length,
    confidence: result.confidence,
    totalMs: Date.now() - startedAt,
    estCostUsd: result.costUsd,
  })

  return result
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function mapSourceHint(
  sourceType: ExtractTupleInput['sourceType'],
  sourceRef: ExtractTupleInput['sourceRef'],
):
  | 'drive-won'
  | 'drive-archive'
  | 'hbr'
  | 'ssir'
  | 'triple-light'
  | 'internal'
  | undefined {
  if (!sourceType) return undefined
  if (sourceType === 'drive') {
    if (sourceRef && /\/수주\//.test(sourceRef)) return 'drive-won'
    return 'drive-archive'
  }
  if (sourceType === 'manual' || sourceType === 'product-api') return 'internal'
  // 외부 url 기반 추론 (sourceRef 가 url 인 경우)
  if (sourceRef && /hbr\.org/.test(sourceRef)) return 'hbr'
  if (sourceRef && /ssir\.org/.test(sourceRef)) return 'ssir'
  if (sourceRef && /triplelight/.test(sourceRef)) return 'triple-light'
  return undefined
}

/**
 * DB 저장 — Wave W (PRD-v11.0 §4.3) 활성화 (2026-05-23 migration `sphere2_3tuple`).
 *
 * 순서:
 *   1. chunk embedding 배치 생성 (Gemini text-embedding-004)
 *   2. WinningPattern row 생성 (3-tuple 핵심)
 *   3. ContentAsset row × N 생성 (각 chunk = 1 asset)
 *   4. WinningPattern.contentRefs 에 ContentAsset.id[] 저장
 *
 * Transaction:
 *   - 단일 transaction (`prisma.$transaction`) — 중간 실패 시 전체 롤백
 *   - 단, embedding 호출 (외부 API) 은 transaction 밖
 */
async function persistTuple(args: {
  input: ExtractTupleInput
  message: ExtractTupleOutput['message']
  messageVector: number[]
  tonePatterns: ExtractTupleOutput['tonePatterns']
  logicGraph: ExtractTupleOutput['logicGraph']
  logicGraphVector: number[]
  contentChunks: ExtractTupleOutput['contentChunks']
}): Promise<{ patternId: string; contentAssetIds: string[] }> {
  const { input, contentChunks } = args

  // ─────────────────────────────────────────
  // 1. chunk embeddings 생성 (transaction 밖 — 외부 API)
  // ─────────────────────────────────────────

  let chunkEmbeddings: number[][] = []
  if (contentChunks.length > 0) {
    try {
      chunkEmbeddings = await embedBatch(contentChunks.map((c) => c.text))
    } catch (e) {
      log.warn('inference', '[persistTuple] chunk embedding 실패 — empty 로 진행', {
        sourceProject: input.sourceProject,
        chunkCount: contentChunks.length,
        err: e instanceof Error ? e.message : String(e),
      })
      chunkEmbeddings = contentChunks.map(() => [])
    }
  }

  // ─────────────────────────────────────────
  // 2. Transaction — WinningPattern + ContentAsset × N + contentRefs 갱신
  // ─────────────────────────────────────────

  const result = await prisma.$transaction(async (tx) => {
    // 2-1. WinningPattern row 생성
    const pattern = await tx.winningPattern.create({
      data: {
        sourceProject: input.sourceProject,
        sourceClient: input.sourceClient ?? null,
        sectionKey: 'overall', // 통째 ingest — section 별 추출은 매칭 단계에서
        channelType: input.channel,
        outcome: input.outcome,
        // 기존 호환 컬럼
        snippet: input.proposalText.slice(0, 2000),
        whyItWorks: `Sphere 2 ingest · message confidence + logic confidence 평균`,
        tags: [input.channel, input.outcome, `source:${input.sourceType ?? 'manual'}`],
        // Wave W 신규 — 3-tuple
        message: args.message as never,
        messageVector: args.messageVector,
        tonePatterns: args.tonePatterns as never,
        logicGraph: args.logicGraph as never,
        logicGraphVector: args.logicGraphVector,
        lossReason: input.lossReason ?? null,
      },
    })

    // 2-2. ContentAsset row × N 생성
    const createdAssets = await Promise.all(
      contentChunks.map((chunk, i) =>
        tx.contentAsset.create({
          data: {
            // LLM 이 작성한 name 우선 (예: "Alumni Hub 261명 코치 풀")
            // 없으면 fallback (회귀 호환)
            name: chunk.name
              ? `${input.sourceProject} · ${chunk.name}`
              : `${input.sourceProject} — chunk ${i + 1}`,
            category: chunk.category,
            // 3중 태그 (기존 schema)
            applicableSections: chunk.sectionHint ? [chunk.sectionHint] : [],
            valueChainStage: 'output', // 기본 — 추후 정교화
            evidenceType: chunk.evidenceType,
            // 매칭 보조
            keywords: [],
            // embedding
            embedding: chunkEmbeddings[i] ?? [],
            embeddingModel: chunkEmbeddings[i]?.length
              ? 'gemini-embedding-001'
              : null,
            embeddedAt: chunkEmbeddings[i]?.length ? new Date() : null,
            // 본문
            narrativeSnippet: chunk.text,
            keyNumbers: chunk.keyNumbers as never,
            // 상태
            status: 'developing', // 검수 전 — UD Labs admin 이 stable 로 승격
            version: 1,
            lastReviewedAt: new Date(),
            // Wave W 신규 — source 추적
            sourceTier: chunk.sourceTier ?? 'medium',
            sourceType: input.sourceType ?? 'manual',
            sourceRef: input.sourceRef ?? null,
            publishedAt: input.publishedAt ?? null,
          },
        }),
      ),
    )

    // 2-3. WinningPattern.contentRefs 갱신
    await tx.winningPattern.update({
      where: { id: pattern.id },
      data: { contentRefs: createdAssets.map((a) => a.id) },
    })

    return {
      patternId: pattern.id,
      contentAssetIds: createdAssets.map((a) => a.id),
    }
  })

  log.info('inference', '[persistTuple] 저장 완료', {
    sourceProject: input.sourceProject,
    patternId: result.patternId,
    contentAssetCount: result.contentAssetIds.length,
    messageVectorDim: args.messageVector.length,
    chunkEmbeddingsCreated: chunkEmbeddings.filter((e) => e.length > 0).length,
  })

  return result
}

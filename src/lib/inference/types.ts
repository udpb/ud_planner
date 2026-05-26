/**
 * Sphere 2 (AI 두뇌) — 3-Tuple 학습 타입 정의
 *
 * PRD-v11.0 §4.1 (3-tuple 정의) · §4.3 (ingest 알고리즘) · §4.4 (매칭 알고리즘)
 *
 * 제안서 1건 = Message + LogicStructure + Content 의 3-tuple 분해.
 * 단어 단위 RAG chunk 의 4 한계 (단어 매몰·과노출·반복·맥락 손실) 대응을 위한
 * 의미 단위 학습 구조.
 *
 * 본 파일은 순수 타입 정의 (런타임 X). server / client 양쪽 import 가능.
 */

import { z } from 'zod'

// ─────────────────────────────────────────
// 1. Channel (B2G / B2B / renewal) — 매칭 가중치 분기
// ─────────────────────────────────────────

export const CHANNEL_VALUES = ['B2G', 'B2B', 'renewal'] as const
export type Channel = (typeof CHANNEL_VALUES)[number]

export const ChannelSchema = z.enum(CHANNEL_VALUES)

// ─────────────────────────────────────────
// 2. Outcome — 수주·패배·진행 (패배도 동등 학습)
// ─────────────────────────────────────────

export const OUTCOME_VALUES = ['won', 'lost', 'pending'] as const
export type Outcome = (typeof OUTCOME_VALUES)[number]

export const OutcomeSchema = z.enum(OUTCOME_VALUES)

// ─────────────────────────────────────────
// 3. Message Tuple (Sphere 2 의 ① — "왜 우리인가" 의 설득 핵심)
// ─────────────────────────────────────────

export const MessageSchema = z.object({
  /** 핵심 1줄 슬로건 (20~120자) */
  slogan: z.string().min(20).max(120),
  /** 키 메시지 3개 (각 8~80자) */
  keyMessages: z.array(z.string().min(8).max(80)).length(3),
  /** Before/After 차이 (각 20~300자) */
  beforeAfter: z.object({
    before: z.string().min(20).max(300),
    after: z.string().min(20).max(300),
  }),
})

export type Message = z.infer<typeof MessageSchema>

/**
 * 톤 패턴 — 표현 다양성 학습 (반복 출력 방지의 핵심)
 *
 * - openings: 섹션 시작에 자주 쓰는 표현 패턴 ("우리는 ··· 합니다" 등)
 * - transitions: 섹션 전환 표현 ("따라서" / "이를 위해" / "그 결과")
 * - closingPhrases: 마무리 표현
 * - avoidedWords: 이 제안서가 회피한 단어 (다른 제안서 생성 시 회피 hint)
 * - signatureNumbers: 시그니처 수치 ({value, context} — 예: {value:"20,211명", context:"누적 양성"})
 */
export const TonePatternsSchema = z.object({
  openings: z.array(z.string()).max(10),
  transitions: z.array(z.string()).max(10),
  closingPhrases: z.array(z.string()).max(10),
  avoidedWords: z.array(z.string()).max(20),
  signatureNumbers: z
    .array(
      z.object({
        value: z.string(),
        context: z.string(),
      }),
    )
    .max(15),
})

export type TonePatterns = z.infer<typeof TonePatternsSchema>

// ─────────────────────────────────────────
// 4. LogicStructure Tuple (Sphere 2 의 ② — 섹션 간 인과 chain)
// ─────────────────────────────────────────

export const LogicNodeTypeSchema = z.enum([
  'activity', // 활동 (커리큘럼·코칭 등)
  'output', // 산출물 (수치·제품)
  'outcome', // 학습자·팀의 변화
  'impact', // 사회적 임팩트
  'input', // 자원 (예산·코치)
  'context', // 배경·시장
])

export type LogicNodeType = z.infer<typeof LogicNodeTypeSchema>

// LLM 이 가끔 enum 외 값 출력 → fallback 적용 (전체 fail 방지).
const NODE_TYPE_VALUES = [
  'activity',
  'output',
  'outcome',
  'impact',
  'input',
  'context',
] as const

const EDGE_RELATION_VALUES = [
  'causes',
  'enables',
  'precedes',
  'supports',
  'measures',
] as const

export const LogicNodeSchema = z.object({
  id: z.string(), // 'n1' / 'n2' / ...
  type: z
    .string()
    .transform((v) =>
      (NODE_TYPE_VALUES as readonly string[]).includes(v)
        ? (v as LogicNodeType)
        : ('activity' as const),
    ),
  label: z.string().max(120),
})

export const LogicEdgeRelationSchema = z.enum(EDGE_RELATION_VALUES)

export const LogicEdgeSchema = z.object({
  from: z.string(), // node id
  to: z.string(),
  // LLM 이 가끔 relation 자체를 빠뜨림 또는 다른 값 출력 → 'causes' fallback
  relation: z.preprocess(
    (v) => (typeof v === 'string' ? v : 'causes'),
    z
      .string()
      .transform((v) =>
        (EDGE_RELATION_VALUES as readonly string[]).includes(v)
          ? (v as (typeof EDGE_RELATION_VALUES)[number])
          : ('causes' as const),
      ),
  ),
})

/**
 * Logic graph — 제안서의 섹션 간 인과 chain.
 *
 * sectionOrder: 7 섹션의 실제 순서 (['1','2','3','4','5','6','7'] 또는 변형).
 * 같은 RFP 라도 채널별로 섹션 순서가 다를 수 있음 (B2G 는 통계 먼저, B2B 는 문제정의 먼저 등).
 */
export const LogicGraphSchema = z.object({
  nodes: z.array(LogicNodeSchema).min(3).max(30),
  edges: z.array(LogicEdgeSchema).min(2).max(60),
  // 짧은 제안서 (특강·계약서 등) 는 섹션 적을 수 있음 → min 1
  // LLM 이 7섹션 RFP 에서 sectionOrder 를 작은 단위로 쪼개 출력하면 10 초과 가능 — slice 로 안전 cap
  sectionOrder: z.preprocess(
    (val) => (Array.isArray(val) ? val.slice(0, 10) : val),
    z.array(z.string()).min(1).max(10),
  ),
})

export type LogicGraph = z.infer<typeof LogicGraphSchema>

// ─────────────────────────────────────────
// 5. Content Tuple (Sphere 2 의 ③ — 구체 fact·수치·인용)
// ─────────────────────────────────────────

export const KeyNumberSchema = z.object({
  value: z.string(), // "20,211명" / "32개월" / "95%"
  unit: z.string().optional(), // '명' / '개월' / '%'
  context: z.string().max(200), // "누적 양성" / "운영 기간"
  source: z.string().optional(), // 출처 (통계청·내부 자료 등)
})

export type KeyNumber = z.infer<typeof KeyNumberSchema>

/**
 * Content chunk — 의미 단위로 잘린 본문 조각.
 *
 * v11.0 의 chunking 전략: hierarchical semantic chunking
 *   - 1차: 섹션 boundary (sections.1 / sections.2 등)
 *   - 2차: 단락 boundary (\n\n)
 *   - 3차: 길이 boundary (min 200자, max 800자)
 *   - 의미 boundary 우선 — 단어 단위 X
 */
export const ContentChunkSchema = z.object({
  /**
   * narrative snippet — LLM 이 압축·정제한 인용 가능 텍스트 (200~600자).
   * raw chunk 원문 X. 다른 RFP 매칭 시 prompt 에 즉시 인용 가능한 품질.
   */
  text: z.string().min(50).max(1500),

  /**
   * context (Anthropic Contextual Retrieval) — 이 자산이 전체 제안서에서의 위치·역할.
   * 예: "B2G 사업의 핵심 차별화 자산. ② 추진전략 섹션의 근거로 인용된 정량 데이터."
   * RAG 매칭 정확도 향상의 핵심.
   */
  context: z.string().max(400).optional(),

  sectionHint: z.string().optional(), // '1'..'7' 추정
  category: z.enum([
    'methodology',
    'content',
    'product',
    'human',
    'data',
    'framework',
  ]),
  evidenceType: z.enum(['quantitative', 'structural', 'case', 'methodology']),
  keyNumbers: z.array(KeyNumberSchema).max(15),
  sourceTier: z.enum(['high', 'medium', 'low', 'internal']).optional(),
  /** 자산 이름 (LLM 이 작성, 검색·display 용) */
  name: z.string().min(3).max(120).optional(),
})

export type ContentChunk = z.infer<typeof ContentChunkSchema>

// ─────────────────────────────────────────
// 6. ExtractTuple — ingest 입출력
// ─────────────────────────────────────────

export interface ExtractTupleInput {
  /** 제안서 원문 (PDF/PPTX 에서 추출된 텍스트) */
  proposalText: string
  /** 제안서 메타 */
  sourceProject: string
  sourceClient?: string
  outcome: Outcome
  channel: Channel
  /** 패배 시 사유 (선택) */
  lossReason?: string
  /** 자료 source */
  sourceType?: 'drive' | 'slack' | 'manual' | 'product-api' | 'archive'
  sourceRef?: string
  publishedAt?: Date
}

export interface ExtractTupleOutput {
  /** WinningPattern row 의 PK */
  patternId: string
  /** Message tuple */
  message: Message
  messageVector: number[]
  tonePatterns: TonePatterns
  /** LogicStructure tuple */
  logicGraph: LogicGraph
  logicGraphVector: number[]
  /** Content tuple — 생성된 ContentAsset id 들 */
  contentAssetIds: string[]
  contentChunks: ContentChunk[]
  /** 메타 */
  totalTokensUsed: number
  costUsd: number
  /** LLM 응답의 평균 confidence */
  confidence: number
}

// ─────────────────────────────────────────
// 7. MatchTuple — 매칭 입출력
// ─────────────────────────────────────────

export interface MatchTupleInput {
  /** RFP 의 구조화 결과 */
  rfp: {
    text: string
    keywords?: string[]
    objectives?: string[]
    evalCriteria?: Array<{ item: string; score: number }>
  }
  /** ProgramProfile snapshot (있으면) */
  profile?: unknown
  channel: Channel
  /** 매칭 결과 개수 */
  limit?: number
  /** MMR 다양성 threshold (기본 0.45) */
  mmrThreshold?: number
}

export interface MessageMatch {
  patternId: string
  matchScore: number
  message: Message
  sourceProject: string
  outcome: Outcome
  /** 점수 분해 (디버그) */
  breakdown: {
    messageSim: number
    logicSim: number
    contentSim: number
    channelMatch: number
    winRateBonus: number
  }
}

export interface ContentMatch {
  assetId: string
  matchScore: number
  narrativeSnippet: string
  sectionHint?: string
  sourceTier?: string
  /** MMR diversity score */
  mmrScore: number
}

// Wave W W15 (2026-05-26) — Concept 매칭 layer
export interface MatchedConcept {
  conceptId: string
  name: string
  type: string
  /** 매칭 강도: 1.0 = exact name, 0.7 = alias */
  weight: number
  matchedBy: 'name' | 'alias' | 'embedding'
  /** 이 Concept 의 총 자산 수 */
  assetCount: number
  /** 매칭된 RFP 키워드 */
  matchedKeyword: string
}

export interface ConceptMatchedAsset {
  assetId: string
  assetName: string
  assetType: string // 'proposal' | 'methodology' | 'case' | 'company'
  matchedConcept: string // concept name (어떤 concept 으로 매칭됐는지)
  matchedConceptType: string
  matchScore: number // concept.weight × assetConcept.weight
  narrativeSnippet: string
  sourceTier?: string
  isCore: boolean // 자산에서 이 concept 이 core 인지
}

export interface MatchTupleOutput {
  messages: MessageMatch[]
  /**
   * proposal 자산 매칭 — 시드된 제안서의 narrative chunk (도메인 매칭).
   * 기존 'contents' 필드 그대로 (backward compat).
   */
  contents: ContentMatch[]
  /**
   * Wave W W10 (2026-05-25): methodology 자산 별도 노출.
   * ud Labs 의 회사 IP (ACTT · AX · DOGS · 5D · Act-preneur 7steps 등).
   * 항상 top N 으로 노출 — RFP 도메인과 거리가 멀어도 차별화 인용 가능.
   */
  methodologyAssets: ContentMatch[]
  /**
   * Wave W W13 (2026-05-26): case 자산 별도 노출.
   * 결과보고서 기반 — 비슷한 사업의 실제 지표·레슨런.
   * RFP 도메인 매칭 우선 (proposal 과 유사 — bm25 + embedding).
   */
  caseAssets: ContentMatch[]
  /**
   * Wave W W15 (2026-05-26): RFP 의 키워드 → Concept 매칭.
   * 자산 횡단 entity 매칭으로 정확도·설명 가능성 ↑.
   */
  matchedConcepts: MatchedConcept[]
  /**
   * W15: 매칭된 Concept → AssetConcept → 자산.
   * proposal·methodology·case 모두 포함 (concept 기반).
   */
  conceptAssets: ConceptMatchedAsset[]
  /** 디버그: RFP 의 3-tuple 후보 */
  rfpEstimate: {
    messageVector: number[]
    logicGraph: LogicGraph | null
    contentKeywords: string[]
  }
  /** 메타 */
  totalCandidates: {
    messages: number
    contents: number
    methodologyAssets: number
    caseAssets: number
    matchedConcepts: number
    conceptAssets: number
  }
  elapsedMs: number
}

// ─────────────────────────────────────────
// 8. 비용·토큰 상수 (PRD-v11.0 §4.3)
// ─────────────────────────────────────────

export const EXTRACT_TOKEN_BUDGET = {
  /** LLM #1: Message 추출 */
  message: 400,
  /** LLM #2: LogicStructure 추출 */
  logic: 600,
  /** LLM #3: Content chunk + keyNumbers (per chunk) */
  contentPerChunk: 200,
  /** Embedding (text-embedding-004) — 무관 토큰 */
  embeddingDimension: 768,
} as const

/**
 * 제안서 1건 ingest 예상 비용 (Gemini 3.1 Pro Preview 기준).
 * - Input: ~10K 자 (제안서) ≈ 7K 토큰
 * - Output: 400 + 600 + 800 (chunks × 평균 4개) = ~1800 토큰
 * - 총 ≈ $0.015/건 (Gemini 3.1 Pro Preview 가격 기준)
 */
export const EXPECTED_COST_PER_PROPOSAL_USD = 0.015

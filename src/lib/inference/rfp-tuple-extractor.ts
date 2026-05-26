/**
 * Sphere 2 — RFP Tuple Extractor (matching pre-step)
 *
 * PRD-v11.0 §4.4 — 새 RFP 가 들어왔을 때, 어떤 message·logic·content 가 적합할지
 * LLM 으로 후보 추정. 그 결과를 match-tuple 의 cosine 매칭 input 으로 사용.
 *
 * 호출 횟수: RFP 1건 당 1 LLM (Gemini Flash · ~10초) + 1 embedding 호출.
 *
 * server-only 의도 — invokeAi 가 client bundle 에서 자연 fail.
 */

import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import { embed, embedLogicGraph } from './vector-utils'
import type { Channel, LogicGraph } from './types'
import { LogicGraphSchema } from './types'
import { z } from 'zod'

// ─────────────────────────────────────────
// RFP 용 lenient logicGraph (hint 용 — 매칭 input 아님)
// LLM Flash 가 nodes 를 string array 로 반환할 때 graceful 처리
// ─────────────────────────────────────────

/** LLM 변동 흡수 — nodes/edges 가 string 이거나 형식 안 맞으면 null 반환 (extract-tuple 의 엄격 schema 와 분리) */
function coerceLogicGraphLenient(raw: unknown): LogicGraph | null {
  if (!raw || typeof raw !== 'object') return null
  // 1차: 엄격 schema 시도
  const strict = LogicGraphSchema.safeParse(raw)
  if (strict.success) return strict.data
  // 2차: nodes 가 string[] 면 객체로 변환
  const obj = raw as { nodes?: unknown; edges?: unknown; sectionOrder?: unknown }
  if (Array.isArray(obj.nodes) && Array.isArray(obj.edges)) {
    const nodes = obj.nodes
      .map((n, i): { id: string; type: 'activity'; label: string } | null => {
        if (typeof n === 'string') return { id: `n${i + 1}`, type: 'activity', label: n.slice(0, 120) }
        if (n && typeof n === 'object') {
          const o = n as { id?: unknown; type?: unknown; label?: unknown }
          const label = typeof o.label === 'string' ? o.label : String(o.label ?? '')
          if (!label) return null
          return {
            id: typeof o.id === 'string' ? o.id : `n${i + 1}`,
            type: 'activity',
            label: label.slice(0, 120),
          }
        }
        return null
      })
      .filter((n): n is { id: string; type: 'activity'; label: string } => n !== null)
    const edges = obj.edges
      .map((e): { from: string; to: string; relation: 'causes' } | null => {
        if (e && typeof e === 'object') {
          const o = e as { from?: unknown; to?: unknown }
          if (typeof o.from === 'string' && typeof o.to === 'string') {
            return { from: o.from, to: o.to, relation: 'causes' }
          }
        }
        return null
      })
      .filter((e): e is { from: string; to: string; relation: 'causes' } => e !== null)
    if (nodes.length >= 3 && edges.length >= 2) {
      const sectionOrder = Array.isArray(obj.sectionOrder)
        ? obj.sectionOrder.map(String).slice(0, 10)
        : ['1', '2', '3']
      const coerced = LogicGraphSchema.safeParse({ nodes, edges, sectionOrder })
      if (coerced.success) return coerced.data
    }
  }
  return null
}

// ─────────────────────────────────────────
// Input
// ─────────────────────────────────────────

export interface RfpExtractInput {
  /** RFP 본문 (parse-rfp 결과의 텍스트 또는 원문) */
  rfpText: string
  /** RFP 의 구조화 일부 (있으면 추정 정확도 ↑) */
  keywords?: string[]
  objectives?: string[]
  evalCriteria?: Array<{ item: string; score: number }>
  channel: Channel
  /** ProgramProfile snapshot (있으면 hint 로 주입) */
  profileSummary?: string
}

// ─────────────────────────────────────────
// LLM 응답 schema
// ─────────────────────────────────────────

const RfpHintsResponseSchema = z.object({
  /** 이 RFP 에 가장 적합한 메시지 hint (실제 작성 X — 매칭용 의미 vector 생성용) */
  messageHints: z.object({
    /** 핵심 메시지 1줄 — 어떤 톤·관점이 평가위원에 먹힐지 */
    sloganHint: z.string().min(20).max(200),
    /** 강조할 키 메시지 3개 hint */
    keyMessagesHint: z.array(z.string()).min(2).max(5),
    /** Before/After 추정 */
    beforeAfterHint: z.object({
      before: z.string().min(15).max(200),
      after: z.string().min(15).max(200),
    }),
  }),
  /** 이 RFP 에 적합한 logic chain 추정 (optional · lenient — LLM 변동 흡수 위해 unknown) */
  logicGraph: z.unknown().optional(),
  /** Content 매칭용 keyword (BM25 입력) — RFP 의 핵심 단어·도메인 용어 */
  contentKeywords: z.array(z.string().min(2).max(50)).min(3).max(30),
  /** 자동 채널 검증 — LLM 이 본 RFP 의 적합 채널 (input 채널과 다르면 hint) */
  channelHint: z.enum(['B2G', 'B2B', 'renewal']).optional(),
  confidence: z.number().min(0).max(1),
})

// ─────────────────────────────────────────
// Output
// ─────────────────────────────────────────

export interface RfpEstimate {
  /** 768/3072 dim message vector — Gemini embedding */
  messageVector: number[]
  /** LLM 추정 logic graph (있으면) */
  logicGraph: LogicGraph | null
  /** Logic graph 직렬화 → embedding (logicGraph null 이면 빈 배열) */
  logicGraphVector: number[]
  /** Content 매칭용 keyword */
  contentKeywords: string[]
  /** LLM 의 channel 추정 (input 과 다르면 warning) */
  channelHint?: Channel
  /** LLM 응답의 confidence */
  confidence: number
  /** 메타 */
  tokensUsed: number
  elapsedMs: number
}

const SYSTEM_PROMPT = `당신은 언더독스 제안서 사전 분석 전문가입니다.
RFP (제안 요청서) 본문을 받아 어떤 "메시지·논리·내용" 이 적합할지 추정합니다.

⚠️ 중요: 실제 제안서 작성 X. **매칭용 hint 생성**.
- LLM 이 추정한 messageHints 는 embedding vector 로 변환되어 시드된 WinningPattern 과 cosine 매칭.
- contentKeywords 는 BM25 검색 input.

**messageHints**:
- sloganHint: 이 RFP 에 적합한 핵심 메시지 (어떤 톤·관점)
- keyMessagesHint: 3개 강조 메시지
- beforeAfterHint: 발주처가 보는 현 상태 → 우리가 만들 변화

**logicGraph** (필수 — 매칭 변별력의 핵심):
- RFP 가 전제하는 인과 chain 을 최선을 다해 추정
- 형식: { nodes: [{id, type, label}], edges: [{from, to, relation}], sectionOrder: [...] }
  - id: 'n1', 'n2', ... (문자열)
  - type: 'activity' | 'output' | 'outcome' | 'impact' | 'input' | 'context' 중 1개
  - label: 한국어 노드 명칭 (최대 120자)
  - edges.from / edges.to: node id
  - edges.relation: 'causes' | 'enables' | 'precedes' | 'supports' | 'measures'
  - sectionOrder: 섹션 순서 (예: ['1','2','3','4','5','6','7'])
- 최소 nodes 3개 + edges 2개 — 모호해도 반드시 추정 (omit X)
- 예: [{id:'n1',type:'context',label:'창업 의지 청년 존재'}, {id:'n2',type:'activity',label:'1박2일 해커톤 운영'}, {id:'n3',type:'outcome',label:'MVP 도출'}]

**contentKeywords** (3~30개):
- RFP 의 핵심 단어·도메인 용어 (예: "예비창업패키지", "AX 컨설팅", "사회적 가치")
- 너무 일반적 단어 X (예: "교육", "사업")

**channelHint**:
- RFP 본문 보고 B2G·B2B·renewal 추정
- input channel 과 다르면 PM 에게 hint

JSON 만 출력.`

function buildPrompt(input: RfpExtractInput): string {
  const meta: string[] = []
  if (input.keywords?.length) meta.push(`Keywords: ${input.keywords.join(', ')}`)
  if (input.objectives?.length) meta.push(`Objectives: ${input.objectives.join(' / ')}`)
  if (input.evalCriteria?.length) {
    const top = input.evalCriteria.slice(0, 5).map((c) => `${c.item}(${c.score})`)
    meta.push(`평가배점: ${top.join(', ')}`)
  }
  if (input.profileSummary) meta.push(`ProgramProfile: ${input.profileSummary}`)

  return `${SYSTEM_PROMPT}

[RFP 정보]
채널: ${input.channel}
${meta.join('\n')}

[RFP 본문 — 발췌]
${input.rfpText.slice(0, 8000)}

[출력 JSON 스키마]
{
  "messageHints": {
    "sloganHint": "...",
    "keyMessagesHint": ["...", "...", "..."],
    "beforeAfterHint": { "before": "...", "after": "..." }
  },
  "logicGraph": {
    "nodes": [
      {"id":"n1","type":"context","label":"..."},
      {"id":"n2","type":"activity","label":"..."},
      {"id":"n3","type":"outcome","label":"..."}
    ],
    "edges": [
      {"from":"n1","to":"n2","relation":"enables"},
      {"from":"n2","to":"n3","relation":"causes"}
    ],
    "sectionOrder": ["1","2","3","4","5","6","7"]
  },
  "contentKeywords": ["...", "...", "..."],
  "channelHint": "B2G",
  "confidence": 0.87
}

JSON 만 출력.`
}

/**
 * 새 RFP → 3-tuple 매칭 hint 생성.
 *
 * 흐름:
 *   1. LLM 1 호출 — messageHints + logicGraph(optional) + contentKeywords
 *   2. messageHints (sloganHint + keyMessagesHint join) → embedding (1 호출)
 *   3. RfpEstimate 반환
 */
export async function extractRfpTuple(input: RfpExtractInput): Promise<RfpEstimate> {
  const startedAt = Date.now()
  const prompt = buildPrompt(input)

  const aiResult = await invokeAi({
    prompt,
    maxTokens: 8192, // Gemini Flash thinking 대응
    temperature: 0.3,
    label: `rfp-tuple:${input.channel}`,
  })

  let parsed: unknown
  try {
    parsed = safeParseJson(aiResult.raw, `rfp-tuple:${input.channel}`)
  } catch (e) {
    log.error('inference', '[rfp-tuple] JSON 파싱 실패', {
      channel: input.channel,
      err: e instanceof Error ? e.message : String(e),
    })
    throw e
  }

  const validated = RfpHintsResponseSchema.safeParse(parsed)
  if (!validated.success) {
    log.error('inference', '[rfp-tuple] 스키마 검증 실패', {
      issues: validated.error.issues.slice(0, 3),
    })
    throw new Error(
      `[rfp-tuple] schema 검증 실패: ${validated.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .slice(0, 3)
        .join(' / ')}`,
    )
  }

  // messageHints → embedding 생성 (매칭 시 WinningPattern.messageVector 와 cosine)
  const messageText =
    validated.data.messageHints.sloganHint +
    ' ' +
    validated.data.messageHints.keyMessagesHint.join(' ')

  // logicGraph 는 lenient coerce — 실패해도 매칭은 계속 진행 (logicSim 만 0)
  const logicGraph = coerceLogicGraphLenient(validated.data.logicGraph)
  if (validated.data.logicGraph && !logicGraph) {
    log.warn('inference', '[rfp-tuple] logicGraph 변환 실패 — null 로 fallback (매칭 진행)', {
      channel: input.channel,
    })
  }

  // message vector + logic graph vector 병렬 embedding
  const [messageVector, logicGraphVector] = await Promise.all([
    embed(messageText),
    logicGraph ? embedLogicGraph(logicGraph) : Promise.resolve([] as number[]),
  ])

  const result: RfpEstimate = {
    messageVector,
    logicGraph,
    logicGraphVector,
    contentKeywords: validated.data.contentKeywords,
    channelHint: validated.data.channelHint,
    confidence: validated.data.confidence,
    tokensUsed: aiResult.raw.length,
    elapsedMs: Date.now() - startedAt,
  }

  log.info('inference', `[rfp-tuple] 완료`, {
    channel: input.channel,
    channelHint: result.channelHint,
    keywordsCount: result.contentKeywords.length,
    hasLogicGraph: result.logicGraph !== null,
    logicVecDim: result.logicGraphVector.length,
    confidence: result.confidence,
    elapsedMs: result.elapsedMs,
    provider: aiResult.provider,
  })

  return result
}

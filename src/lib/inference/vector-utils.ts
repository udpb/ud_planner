/**
 * Sphere 2 — Vector 유틸리티
 *
 * PRD-v11.0 §4.4 (매칭 알고리즘) — embedding cosine + MMR 다양성.
 *
 * 자산 ~100 건 규모 — pgvector 없이 Float[] + 자체 cosine 으로 충분.
 * 1000+ 자산 시점에 pgvector 활성화 ADR 별도.
 *
 * server-only — Gemini embedding API 호출 포함.
 */

// server-only — 의도상 server 전용. 단, scripts/ 환경에서도 import 가능하도록
// 'server-only' 패키지 미사용. client bundle 에서 import 시 fetch 호출 자체가
// CORS·env 미존재로 자연스럽게 fail (이중 보호).

import { log } from '@/lib/logger'

// ─────────────────────────────────────────
// 1. Cosine Similarity
// ─────────────────────────────────────────

/**
 * 두 벡터의 cosine similarity. -1 ~ 1 (정규화 안 됨) 또는 0 ~ 1 (정규화).
 *
 * 입력 벡터가 비어있거나 다른 차원이면 0 반환 (안전).
 *
 * 성능: O(dim). 768 dim 기준 ~3μs/호출. 1000건 자산 매칭 시 3ms.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    const va = a[i] ?? 0
    const vb = b[i] ?? 0
    dot += va * vb
    normA += va * va
    normB += vb * vb
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Cosine similarity 를 [0, 1] 범위로 정규화. 매칭 점수로 직접 쓸 수 있음.
 *
 * 일반 cosine 의 음수 값은 거의 의미 없음 (text embedding 은 대부분 양수 영역).
 * 안전하게 max(0, x) 처리.
 */
export function cosineSimilarityNormalized(
  a: readonly number[],
  b: readonly number[],
): number {
  return Math.max(0, cosineSimilarity(a, b))
}

// ─────────────────────────────────────────
// 2. Gemini Embedding 호출
// ─────────────────────────────────────────

/**
 * 텍스트 → 768 dim vector (Gemini gemini-embedding-001).
 *
 * 정책:
 * - 단일 텍스트 입력 (배치는 embedBatch 사용)
 * - 텍스트 길이 max 2048 토큰 (~8K 자) — 초과 시 trim
 * - API 키 없으면 throw (fallback X — embedding 은 핵심 인프라)
 *
 * 비용: $0.00001/1K char (Gemini gemini-embedding-001 가격 기준). 무시 가능.
 */
export async function embed(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('[embed] empty text')
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('[embed] GEMINI_API_KEY missing')
  }

  // 길이 trim (8K 자 = ~2K 토큰)
  const trimmed = text.length > 8000 ? text.slice(0, 8000) : text

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`
  const body = {
    model: 'models/gemini-embedding-001',
    content: { parts: [{ text: trimmed }] },
  }

  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '(no body)')
      throw new Error(
        `[embed] HTTP ${res.status} — ${errText.slice(0, 200)}`,
      )
    }

    const data = (await res.json()) as {
      embedding?: { values?: number[] }
    }
    const vec = data.embedding?.values

    if (!Array.isArray(vec) || vec.length === 0) {
      throw new Error('[embed] empty embedding in response')
    }

    log.debug('embed', `text → vec(${vec.length})`, {
      ms: Date.now() - startedAt,
      chars: trimmed.length,
    })

    return vec
  } catch (e) {
    log.error('embed', '실패', {
      ms: Date.now() - startedAt,
      err: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}

/**
 * 배치 embedding. Gemini gemini-embedding-001 의 batchEmbedContents 활용.
 *
 * - 최대 100 chunk 권장 (API limit)
 * - 한 chunk 가 fail 해도 전체 fail (atomic)
 */
export async function embedBatch(texts: readonly string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  if (texts.length > 100) {
    throw new Error(`[embedBatch] max 100 chunks · got ${texts.length}`)
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('[embedBatch] GEMINI_API_KEY missing')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${apiKey}`
  const body = {
    requests: texts.map((t) => ({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text: t.slice(0, 8000) }] },
    })),
  }

  const startedAt = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '(no body)')
    throw new Error(`[embedBatch] HTTP ${res.status} — ${errText.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    embeddings?: Array<{ values?: number[] }>
  }
  const vecs = data.embeddings ?? []

  if (vecs.length !== texts.length) {
    throw new Error(
      `[embedBatch] count mismatch: input ${texts.length}, output ${vecs.length}`,
    )
  }

  log.debug('embed', `batch ${texts.length} → vec[]`, {
    ms: Date.now() - startedAt,
  })

  return vecs.map((v) => v.values ?? [])
}

// ─────────────────────────────────────────
// 3. MMR (Maximum Marginal Relevance) — 다양성 강제
// ─────────────────────────────────────────

export interface MmrCandidate<T> {
  item: T
  /** 원본 매칭 점수 (0~1) */
  relevance: number
  /** 다양성 비교용 벡터 (cosine 비교 기준) */
  vector: number[]
}

export interface MmrResult<T> extends MmrCandidate<T> {
  /** MMR 점수 (relevance × λ - maxSim × (1-λ)) */
  mmrScore: number
}

/**
 * Maximum Marginal Relevance — 다양성 강제 알고리즘.
 *
 * Carbonell & Goldstein 1998. RAG 의 "반복 출력 / 과노출" 문제 대응의 표준.
 *
 * 동작:
 *   1. 가장 relevance 높은 항목 1개 선택
 *   2. 이후 각 후보의 점수 = λ × relevance - (1-λ) × maxSim(이미 선택된 것들)
 *   3. 점수 가장 높은 것 선택 · 반복
 *   4. limit 도달 또는 점수 < threshold 시 종료
 *
 * 매개변수:
 *   - lambda: 0.7 (relevance 70% · diversity 30%) — PRD §4.4 기본
 *   - threshold: 0.45 — 이하면 cutoff
 *
 * 성능: O(N × limit × dim) — N=50, limit=10, dim=768 → ~400K 연산 (~50ms)
 */
export function mmr<T>(
  candidates: readonly MmrCandidate<T>[],
  limit: number,
  options: { lambda?: number; threshold?: number } = {},
): MmrResult<T>[] {
  const lambda = options.lambda ?? 0.7
  const threshold = options.threshold ?? 0.45

  if (candidates.length === 0 || limit <= 0) return []

  // 1. 가장 relevance 높은 첫 항목 선택
  const sorted = [...candidates].sort((a, b) => b.relevance - a.relevance)
  const selected: MmrResult<T>[] = [
    { ...sorted[0], mmrScore: sorted[0].relevance },
  ]
  const remaining = sorted.slice(1)

  // 2. 반복 선택
  while (selected.length < limit && remaining.length > 0) {
    let bestIdx = -1
    let bestScore = -Infinity

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i]
      // 이미 선택된 것들과의 최대 유사도
      let maxSim = 0
      for (const sel of selected) {
        const sim = cosineSimilarity(cand.vector, sel.vector)
        if (sim > maxSim) maxSim = sim
      }
      const mmrScore = lambda * cand.relevance - (1 - lambda) * maxSim
      if (mmrScore > bestScore) {
        bestScore = mmrScore
        bestIdx = i
      }
    }

    if (bestIdx === -1 || bestScore < threshold) break

    const chosen = remaining.splice(bestIdx, 1)[0]
    selected.push({ ...chosen, mmrScore: bestScore })
  }

  return selected
}

// ─────────────────────────────────────────
// 4. Graph → Vector (단순화 — graph2vec 없이 텍스트 embedding 활용)
// ─────────────────────────────────────────

/**
 * LogicGraph → 768 dim vector.
 *
 * 정식 graph2vec (node2vec + edge encoding) 은 별도 라이브러리 필요.
 * 본 함수는 단순 우회: graph 를 텍스트로 직렬화 → text embedding.
 *
 * 직렬화 형식:
 *   "[type:label] -relation-> [type:label] ..."
 *
 * 한계: edge ordering 에 민감. 같은 graph 의 다른 직렬화 → 다른 vector.
 * 보완: 노드를 type+label 알파벳 순으로 정렬.
 *
 * 향후 ADR: 자산 1000+ 시점에 실제 graph2vec 도입 검토.
 */
export function serializeLogicGraph(graph: {
  nodes: Array<{ id: string; type: string; label: string }>
  edges: Array<{ from: string; to: string; relation: string }>
}): string {
  // 노드 정렬 (type, label) — 직렬화 안정성
  const sortedNodes = [...graph.nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type)
    return a.label.localeCompare(b.label)
  })

  const nodeMap = new Map(sortedNodes.map((n) => [n.id, n]))

  // 노드 표현
  const nodeStrs = sortedNodes.map((n) => `[${n.type}:${n.label}]`)

  // 엣지 표현 (from·to 의 sorted index 기준)
  const edgeStrs = graph.edges
    .map((e) => {
      const from = nodeMap.get(e.from)
      const to = nodeMap.get(e.to)
      if (!from || !to) return null
      return `[${from.type}:${from.label}] -${e.relation}-> [${to.type}:${to.label}]`
    })
    .filter((s): s is string => s !== null)
    .sort() // edge 도 정렬

  return `Nodes:\n${nodeStrs.join('\n')}\n\nEdges:\n${edgeStrs.join('\n')}`
}

/**
 * LogicGraph → 768 dim vector (embedding 호출).
 */
export async function embedLogicGraph(graph: {
  nodes: Array<{ id: string; type: string; label: string }>
  edges: Array<{ from: string; to: string; relation: string }>
}): Promise<number[]> {
  const serialized = serializeLogicGraph(graph)
  return embed(serialized)
}

// ─────────────────────────────────────────
// 5. 단순 graph edit distance (보조 매칭 신호)
// ─────────────────────────────────────────

/**
 * 두 graph 의 단순 edit distance (0~1 정규화).
 *
 * 정식 graph edit distance 는 NP-hard. 본 함수는 근사:
 *   - node 집합의 Jaccard (type+label 기준)
 *   - edge 집합의 Jaccard (from-relation-to 기준)
 *   - 평균
 *
 * 0 = 완전 다름, 1 = 동일.
 */
export function graphSimilarity(
  a: {
    nodes: Array<{ type: string; label: string }>
    edges: Array<{ from: string; to: string; relation: string }>
  },
  b: {
    nodes: Array<{ type: string; label: string }>
    edges: Array<{ from: string; to: string; relation: string }>
  },
): number {
  // Node Jaccard
  const aNodes = new Set(a.nodes.map((n) => `${n.type}:${n.label}`))
  const bNodes = new Set(b.nodes.map((n) => `${n.type}:${n.label}`))
  const nodeUnion = new Set([...aNodes, ...bNodes])
  const nodeIntersect = new Set([...aNodes].filter((x) => bNodes.has(x)))
  const nodeJac = nodeUnion.size === 0 ? 0 : nodeIntersect.size / nodeUnion.size

  // Edge Jaccard (from·to 의 type:label 기반)
  const aEdges = new Set(a.edges.map((e) => `${e.from}-${e.relation}-${e.to}`))
  const bEdges = new Set(b.edges.map((e) => `${e.from}-${e.relation}-${e.to}`))
  const edgeUnion = new Set([...aEdges, ...bEdges])
  const edgeIntersect = new Set([...aEdges].filter((x) => bEdges.has(x)))
  const edgeJac = edgeUnion.size === 0 ? 0 : edgeIntersect.size / edgeUnion.size

  return (nodeJac + edgeJac) / 2
}

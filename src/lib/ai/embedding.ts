/**
 * Embedding — Gemini text-embedding-004 래퍼 (Wave N4, 2026-05-15)
 *
 * 768 dim. ContentAsset.embedding 에 저장.
 *
 * 사용:
 *   const vec = await generateEmbedding('AI 솔로프리너 과정 — 1주차 발견 모듈')
 *   const matches = topKBySimilarity(queryVec, candidateVecs, 5)
 */

// NOTE: 'server-only' 가드 미사용 — CLI 스크립트 (scripts/embed-assets.ts) 에서도
// 직접 import 함. 어차피 GEMINI_API_KEY 가 노드 환경에서만 노출되므로 브라우저
// 번들에 들어가도 동작 안 함. import 가 client 에서 일어나지 않도록 호출 측에서
// 관리 (현재는 API route 와 CLI 만 사용).
import { GoogleGenerativeAI } from '@google/generative-ai'

// 2026-05-15 N4: gemini-embedding-001 (dim 3072). 다른 키 tier 에서 text-embedding-004
//  는 안 보이는 경우가 있어 안정 모델로 픽스.
const EMBEDDING_MODEL = 'gemini-embedding-001'
export const EMBEDDING_MODEL_LABEL = EMBEDDING_MODEL
export const EMBEDDING_DIM = 3072

let _client: GoogleGenerativeAI | null = null

function getClient(): GoogleGenerativeAI {
  if (_client) return _client
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('[embedding] GEMINI_API_KEY 환경변수 미설정')
  }
  _client = new GoogleGenerativeAI(apiKey)
  return _client
}

/**
 * 단일 텍스트 → embedding vector (768 dim).
 * 입력 길이 30K 자 초과 시 절단.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('[embedding] 빈 텍스트')
  }
  const input = text.length > 30_000 ? text.slice(0, 30_000) : text
  const model = getClient().getGenerativeModel({ model: EMBEDDING_MODEL })
  const r = await model.embedContent(input)
  const values = r.embedding.values
  if (!values || values.length === 0) {
    throw new Error('[embedding] empty embedding from Gemini')
  }
  return values
}

/**
 * 다건 텍스트 임베딩 — Gemini batchEmbedContents 호출.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const model = getClient().getGenerativeModel({ model: EMBEDDING_MODEL })
  const r = await model.batchEmbedContents({
    requests: texts.map((t) => ({
      content: { role: 'user', parts: [{ text: t.slice(0, 30_000) }] },
    })),
  })
  return r.embeddings.map((e) => e.values)
}

// ─────────────────────────────────────────
// 코사인 유사도 헬퍼
// ─────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/**
 * 후보들 중 query 와 유사도 높은 순 topK.
 */
export function topKBySimilarity<T extends { embedding?: number[] | null }>(
  query: number[],
  candidates: T[],
  k = 5,
): Array<{ item: T; similarity: number }> {
  const scored = candidates
    .map((item) => ({
      item,
      similarity: item.embedding ? cosineSimilarity(query, item.embedding) : -1,
    }))
    .filter((x) => x.similarity > 0)
  scored.sort((a, b) => b.similarity - a.similarity)
  return scored.slice(0, k)
}

/**
 * 자산 임베딩에 쓸 정규화된 텍스트.
 * narrativeSnippet · name · keywords · keyNumbers 합쳐서 의미 풍부하게.
 */
export function buildAssetEmbeddingText(asset: {
  name: string
  narrativeSnippet: string
  keywords?: string[] | null
  keyNumbers?: string[] | null
}): string {
  const parts = [asset.name, asset.narrativeSnippet]
  if (asset.keywords?.length) parts.push(`키워드: ${asset.keywords.join(', ')}`)
  if (asset.keyNumbers?.length) parts.push(`수치: ${asset.keyNumbers.join(', ')}`)
  return parts.join('\n')
}

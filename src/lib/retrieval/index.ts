/**
 * 단일 검색 계약 — `retrieve()` (RET-1, Tech Spec §4).
 *
 * 생성 파이프라인이 쓸 단일 진입점. 기존 분산 검색(winning-reference·asset-registry)을
 * **후보 생성기로 wrap**(본문 로직 변경 X — 호출만)해 정규화하고, RRF 융합 →
 * (옵션) 다중쿼리 → (옵션) LLM rerank → top-N 으로 묶는다.
 *
 * 흐름 (Tech Spec §4.2):
 *   queries = useMultiQuery ? [q, hyde(q), ...decompose(q)] : [q]
 *   각 query 별 denseCandidates + keywordCandidates
 *   fused = RRF([...all lists])
 *   useRerank!==false ? rerank(q, fused[:40], topN) : fused[:topN]
 *
 * ⚠️ 런타임 한계(RET-1): 로컬 DB drift 로 실데이터 E2E 는 보류. DoD 는 순수함수 단위검증.
 *   pgvector 바인딩·실 라벨 매핑은 DATA-2 후.
 */

import 'server-only'

import { retrieveWinningPassages } from '@/lib/express/winning-reference'
import { matchAssetsToRfp } from '@/lib/asset-registry'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import { log } from '@/lib/logger'

import type { Candidate, RetrieveQuery, RetrieveOptions, RetrievedChunk } from './types'
import { reciprocalRankFusion } from './fusion'
import { rerank } from './rerank'
import { expandQueries } from './multi-query'

// ─────────────────────────────────────────
// 후보 생성기 (기존 모듈 wrap — 정규화만)
// ─────────────────────────────────────────

const CHANNELS = ['B2G', 'B2B', 'renewal'] as const
type Channel = (typeof CHANNELS)[number]

function asChannel(c: string | undefined): Channel | undefined {
  return c && (CHANNELS as readonly string[]).includes(c) ? (c as Channel) : undefined
}

/**
 * dense 후보 — winning-reference 의미검색 + asset-registry 임베딩/키워드 매칭을 호출해
 * Candidate[] 로 정규화. 두 소스 모두 graceful(데이터 없으면 빈 배열).
 *
 * NOTE: asset-registry 의 matchAssetsToRfp 는 RfpParsed 를 받으므로, free-text 질의에서
 *   매칭에 실제로 쓰이는 텍스트 필드(summary·objectives·keywords)만 채운 최소 RfpParsed 를
 *   구성해 전달한다. (기존 모듈 시그니처에 맞춘 어댑트 — 본문 로직 무변경.)
 */
async function denseCandidates(
  q: RetrieveQuery,
  kDense = 40,
): Promise<Candidate[]> {
  const channel = asChannel(q.channel)
  const out: Candidate[] = []

  // 1) 당선 제안서 passage (의미검색, 여러 제안서 횡단)
  try {
    const passages = await retrieveWinningPassages(q.text, { channel, topK: kDense })
    for (let i = 0; i < passages.length; i++) {
      const p = passages[i]
      out.push({
        id: `winning:${p.projectName}:${i}`,
        source: 'winning',
        text: p.text,
        rawScore: p.similarity, // cosine 0~1
        citation: { docId: p.projectName, chunkId: p.sectionHint ?? undefined },
      })
    }
  } catch (e) {
    log.warn('retrieve', 'winning passage 후보 실패 → skip', {
      err: e instanceof Error ? e.message : String(e),
    })
  }

  // 2) 자산 매칭 (keyword + narrativeSnippet semantic — asset-registry 점수 공식)
  try {
    const rfpLike = queryToRfpLike(q)
    const matches = await matchAssetsToRfp({ rfp: rfpLike, limit: kDense })
    for (const m of matches) {
      out.push({
        id: `asset:${m.asset.id}:${m.section}`,
        source: 'asset',
        text: m.asset.narrativeSnippet,
        rawScore: m.matchScore, // 0~1
        citation: { assetId: m.asset.id },
      })
    }
  } catch (e) {
    log.warn('retrieve', 'asset 후보 실패 → skip', {
      err: e instanceof Error ? e.message : String(e),
    })
  }

  return dedupeById(out).slice(0, kDense)
}

/**
 * keyword 후보 — 전용 BM25/키워드 스코어러가 (아직) 없으므로, asset-registry 의
 * 키워드 기반 매칭을 keyword 후보로 재사용한다(narrativeSnippet semantic bonus 포함).
 * dense 후보와 id 가 겹칠 수 있으나 RRF 가 id 로 병합하므로 안전(순위 신호만 합산).
 *
 * NOTE: winning-reference 에는 별도 키워드 전용 export 가 없다(findWinningReference 는
 *   내부에서 키워드+의미검색을 합치는 고수준 함수). 본문 로직 변경 금지 제약상 여기서
 *   분해하지 않고, 키워드 신호는 자산 매칭으로 커버한다. 당선청크 전용 BM25 는 RET-2/DATA-2.
 */
async function keywordCandidates(
  q: RetrieveQuery,
  kKeyword = 40,
): Promise<Candidate[]> {
  const out: Candidate[] = []
  try {
    const rfpLike = queryToRfpLike(q)
    const matches = await matchAssetsToRfp({ rfp: rfpLike, limit: kKeyword })
    for (const m of matches) {
      // 키워드 매칭 이유가 있는 후보만 keyword 리스트로(순수 키워드 신호)
      const isKeywordHit = m.matchReasons.some((r) => r.includes('키워드'))
      if (!isKeywordHit) continue
      out.push({
        id: `asset:${m.asset.id}:${m.section}`,
        source: 'asset',
        text: m.asset.narrativeSnippet,
        rawScore: m.matchScore,
        citation: { assetId: m.asset.id },
      })
    }
  } catch (e) {
    log.warn('retrieve', 'keyword 후보 실패 → skip', {
      err: e instanceof Error ? e.message : String(e),
    })
  }
  return dedupeById(out).slice(0, kKeyword)
}

/** free-text 질의 → matchAssetsToRfp 가 읽는 텍스트 필드만 채운 최소 RfpParsed. */
function queryToRfpLike(q: RetrieveQuery): RfpParsed {
  const tokens = q.text.split(/\s+/).filter((t) => t.length >= 2).slice(0, 12)
  return {
    projectName: q.text.slice(0, 120),
    client: '',
    totalBudgetVat: null,
    supplyPrice: null,
    projectStartDate: null,
    projectEndDate: null,
    eduStartDate: null,
    eduEndDate: null,
    targetAudience: '',
    targetCount: null,
    targetStage: [],
    objectives: [],
    deliverables: [],
    evalCriteria: [],
    constraints: [],
    requiredPersonnel: [],
    keywords: tokens,
    projectType: q.channel === 'B2B' ? 'B2B' : 'B2G',
    region: '',
    summary: q.text,
  }
}

/** id 기준 중복 제거 — 첫 등장(최고 rawScore 가정 X, 입력 순서) 보존. */
function dedupeById(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>()
  const out: Candidate[] = []
  for (const c of cands) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    out.push(c)
  }
  return out
}

// ─────────────────────────────────────────
// retrieve() — 단일 계약 조립
// ─────────────────────────────────────────

const FUSE_DEPTH = 40 // rerank 에 넘길 융합 후보 깊이

/**
 * 단일 검색 계약. 품질-우선 기본값(깊게 검색 → rerank → top-8).
 *
 * @param q 질의(텍스트 + 채널/과업유형 필터)
 * @param opts 검색 옵션 (kDense·kKeyword·topN·useMultiQuery·useRerank)
 * @returns 최종 RetrievedChunk[] (rerank 점수 내림차순)
 */
export async function retrieve(
  q: RetrieveQuery,
  opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const kDense = opts.kDense ?? 40
  const kKeyword = opts.kKeyword ?? 40
  const topN = opts.topN ?? 8

  // 1) 다중쿼리 확장 (옵션)
  const queries = opts.useMultiQuery ? await expandQueries(q.text) : [q.text]

  // 2) 각 쿼리별 dense + keyword 후보 (병렬)
  const lists: Candidate[][] = []
  await Promise.all(
    queries.map(async (text) => {
      const subQ: RetrieveQuery = { ...q, text }
      const [dense, keyword] = await Promise.all([
        denseCandidates(subQ, kDense),
        keywordCandidates(subQ, kKeyword),
      ])
      lists.push(dense, keyword)
    }),
  )

  // 3) RRF 융합 (순수)
  const fused = reciprocalRankFusion(lists)

  // 4) rerank (기본 on, 품질 핵심) 또는 융합 점수로 top-N
  if (opts.useRerank === false) {
    return fused.slice(0, topN).map((c) => ({ ...c, score: c.rawScore }))
  }
  return rerank(q.text, fused.slice(0, FUSE_DEPTH), topN)
}

// 계약 표면 re-export (호출부 편의)
export type { Candidate, RetrieveQuery, RetrieveOptions, RetrievedChunk } from './types'
export { reciprocalRankFusion } from './fusion'
export { generateContextBlurb } from './context-blurb'

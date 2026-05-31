/**
 * 검색 품질 평가 — recall@k · MRR (RET-1, Tech Spec §4.4).
 *
 * 라벨셋(RFP → 기대 당선문서/자산 id)에 대해 retrieve() 결과의 회귀를 잰다.
 * 임베딩·청킹·rerank 변경 시 회귀 게이트. 지표 계산은 **순수함수**(LLM·DB 무관).
 *
 * 하니스(runRetrievalEval)는 라벨 픽스처를 로드해 retrieve() 를 돌리는 구조만 완성한다.
 * 실 id 매핑은 데이터가 있을 때(DATA-2 후) — 픽스처는 placeholder 스캐폴드(TODO).
 */

import type { RetrievedChunk } from '@/lib/retrieval/types'

// ─────────────────────────────────────────
// 1. 순수 지표
// ─────────────────────────────────────────

/** RetrievedChunk → 비교용 id 집합 후보(citation 의 어떤 id 든 매칭 허용). */
export function chunkIds(chunk: RetrievedChunk): string[] {
  const c = chunk.citation
  return [c.docId, c.chunkId, c.assetId, chunk.id].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  )
}

/**
 * recall@k — 상위 k 개 검색 결과가 기대 id 중 몇 비율을 포함하는지.
 *
 * @param retrievedIds 검색 결과 id 리스트(순위순). 문자열 id 배열.
 * @param expectedIds 기대(정답) id 집합.
 * @param k 상위 k 컷오프.
 * @returns 0~1. expected 가 비면 1(평가 대상 없음 = 완전 충족 간주).
 */
export function recallAtK(
  retrievedIds: string[],
  expectedIds: string[],
  k: number,
): number {
  if (expectedIds.length === 0) return 1
  const topK = new Set(retrievedIds.slice(0, k))
  const hit = expectedIds.filter((e) => topK.has(e)).length
  return hit / expectedIds.length
}

/**
 * MRR — 첫 정답이 등장하는 순위의 역수(1-based). 정답이 없으면 0.
 *
 * @param retrievedIds 검색 결과 id 리스트(순위순).
 * @param expectedIds 기대 id 집합.
 * @returns 0~1.
 */
export function mrr(retrievedIds: string[], expectedIds: string[]): number {
  if (expectedIds.length === 0) return 0
  const expected = new Set(expectedIds)
  for (let i = 0; i < retrievedIds.length; i++) {
    if (expected.has(retrievedIds[i])) return 1 / (i + 1)
  }
  return 0
}

// ─────────────────────────────────────────
// 2. 평가 하니스 (구조만 — 실 라벨 매핑은 DATA-2 후)
// ─────────────────────────────────────────

/** 라벨 1건 — RFP(질의) → 기대 결과 id. */
export interface RetrievalLabel {
  label: string
  query: string
  channel?: string
  /** 기대 당선문서/자산 id (placeholder — 데이터 확보 후 실 id 매핑) */
  expectedIds: string[]
}

export interface EvalCaseResult {
  label: string
  recallAt5: number
  recallAt8: number
  mrr: number
  retrievedCount: number
}

export interface EvalSummary {
  cases: EvalCaseResult[]
  meanRecallAt5: number
  meanRecallAt8: number
  meanMrr: number
  /** expectedIds 가 모두 placeholder(빈) 면 true — 지표 신뢰 불가 표시 */
  unlabeled: boolean
}

/** retrieve() 시그니처(주입형 — 하니스 테스트·실행 분리). */
export type RetrieveFn = (
  q: { text: string; channel?: string },
  opts?: { topN?: number; useRerank?: boolean; useMultiQuery?: boolean },
) => Promise<RetrievedChunk[]>

/**
 * 라벨셋을 돌려 평가 지표 산출. retrieveFn 은 주입(실행 시 @/lib/retrieval retrieve,
 * 테스트 시 스텁). 각 케이스에서 검색 결과 id → recall@5/8 · MRR.
 *
 * ⚠️ 실 id 매핑 전(expectedIds 전부 빈) 에는 지표가 무의미 → unlabeled=true 로 표시.
 */
export async function runRetrievalEval(
  labels: RetrievalLabel[],
  retrieveFn: RetrieveFn,
): Promise<EvalSummary> {
  const cases: EvalCaseResult[] = []
  for (const lbl of labels) {
    const chunks = await retrieveFn({ text: lbl.query, channel: lbl.channel }, { topN: 8 })
    const ids = chunks.flatMap(chunkIds)
    cases.push({
      label: lbl.label,
      recallAt5: recallAtK(ids, lbl.expectedIds, 5),
      recallAt8: recallAtK(ids, lbl.expectedIds, 8),
      mrr: mrr(ids, lbl.expectedIds),
      retrievedCount: chunks.length,
    })
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  return {
    cases,
    meanRecallAt5: mean(cases.map((c) => c.recallAt5)),
    meanRecallAt8: mean(cases.map((c) => c.recallAt8)),
    meanMrr: mean(cases.map((c) => c.mrr)),
    unlabeled: labels.every((l) => l.expectedIds.length === 0),
  }
}

/**
 * Reciprocal Rank Fusion (RRF) — RET-1, Tech Spec §4.2.
 *
 * 여러 후보 리스트(dense·keyword·다중쿼리)를 순위 기반으로 융합. 점수 스케일이
 * 서로 다른(cosine vs matchScore) 리스트를 공정하게 합치는 표준 기법.
 *
 * 순수함수 — LLM·DB 무관. 단위 테스트 대상(scripts/test-retrieval-units.ts).
 */

import type { Candidate } from './types'

/**
 * 표준 RRF: 각 리스트에서 후보의 (0-based) 순위 rank 에 대해 1/(k+rank+1) 누적.
 * 같은 id 는 병합·합산. 결과는 융합 점수 내림차순.
 *
 * - `k` (기본 60): 상위 순위 가중 완충 상수(원논문 Cormack 2009 권장값).
 * - 병합된 후보의 `rawScore` 는 융합 점수로 덮어쓴다(이후 단계가 정렬 신호로 사용).
 * - 동일 id 가 여러 리스트에 있으면 첫 등장 메타(source·text·citation)를 보존.
 *
 * @param lists 후보 리스트들 (각 리스트는 자체 내림차순 가정 — 들어온 순서를 rank 로 사용)
 * @param k RRF 상수
 * @returns 융합·정렬된 Candidate[] (rawScore = RRF 점수)
 */
export function reciprocalRankFusion(
  lists: Candidate[][],
  k = 60,
): Candidate[] {
  const merged = new Map<string, { cand: Candidate; score: number }>()

  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const cand = list[rank]
      if (!cand || !cand.id) continue
      const contribution = 1 / (k + rank + 1)
      const existing = merged.get(cand.id)
      if (existing) {
        existing.score += contribution
      } else {
        merged.set(cand.id, { cand, score: contribution })
      }
    }
  }

  return Array.from(merged.values())
    .map(({ cand, score }) => ({ ...cand, rawScore: score }))
    .sort((a, b) => b.rawScore - a.rawScore)
}

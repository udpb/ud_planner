/**
 * RET-1 — 순수함수 단위 smoke (node assert, tsx 실행).
 *
 * 실행: npx tsx scripts/test-retrieval-units.ts
 *
 * 대상: reciprocalRankFusion(RRF) · recallAtK · mrr — LLM·DB 불요.
 * vitest 미도입이라 node:assert 로 하드코딩 입력 assert. 실패 시 비0 종료.
 *
 * ⚠️ 이 스크립트는 순수함수만 import 한다(retrieval/index.ts 의 server-only·DB 경로는
 *    import 하지 않음). fusion.ts·retrieval-eval.ts 는 타입 외 런타임 의존이 없다.
 */

import assert from 'node:assert/strict'

import { reciprocalRankFusion } from '../src/lib/retrieval/fusion'
import type { Candidate } from '../src/lib/retrieval/types'
import { recallAtK, mrr } from '../src/lib/eval/retrieval-eval'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

function cand(id: string, rawScore = 0): Candidate {
  return { id, source: 'asset', text: id, rawScore, citation: { assetId: id } }
}

console.log('RET-1 단위 smoke')

// ── RRF ──────────────────────────────────────────────
console.log('reciprocalRankFusion:')

check('빈 입력 → 빈 결과', () => {
  assert.deepEqual(reciprocalRankFusion([]), [])
  assert.deepEqual(reciprocalRankFusion([[]]), [])
})

check('단일 리스트 — 순위 보존 + RRF 점수 단조감소', () => {
  const out = reciprocalRankFusion([[cand('a'), cand('b'), cand('c')]], 60)
  assert.equal(out.length, 3)
  assert.deepEqual(out.map((c) => c.id), ['a', 'b', 'c'])
  // 1/(60+1) > 1/(60+2) > 1/(60+3)
  assert.ok(out[0].rawScore > out[1].rawScore)
  assert.ok(out[1].rawScore > out[2].rawScore)
  assert.ok(Math.abs(out[0].rawScore - 1 / 61) < 1e-12)
})

check('두 리스트 — 양쪽 1위인 id 가 한쪽만 등장한 id 를 이긴다', () => {
  // listA: x(0) y(1) ;  listB: x(0) z(1)
  // x = 1/61 + 1/61 = 2/61 ; y = 1/62 ; z = 1/62
  const out = reciprocalRankFusion([
    [cand('x'), cand('y')],
    [cand('x'), cand('z')],
  ])
  assert.equal(out[0].id, 'x')
  assert.ok(Math.abs(out[0].rawScore - 2 / 61) < 1e-12)
  // y, z 동점 — 둘 다 x 보다 낮음
  assert.equal(out.length, 3)
  assert.ok(out[1].rawScore < out[0].rawScore)
  assert.ok(Math.abs(out[1].rawScore - 1 / 62) < 1e-12)
})

check('id 병합 — 중복 id 는 점수 합산, 결과에 1회만', () => {
  const out = reciprocalRankFusion([[cand('dup')], [cand('dup')], [cand('dup')]])
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'dup')
  assert.ok(Math.abs(out[0].rawScore - 3 / 61) < 1e-12)
})

check('k 가 작을수록 상위 순위 가중 ↑', () => {
  const small = reciprocalRankFusion([[cand('a'), cand('b')]], 1)
  // 1/(1+1)=0.5 , 1/(1+2)=0.333...
  assert.ok(Math.abs(small[0].rawScore - 0.5) < 1e-12)
  assert.ok(Math.abs(small[1].rawScore - 1 / 3) < 1e-12)
})

// ── recallAtK ────────────────────────────────────────
console.log('recallAtK:')

check('완전 적중 → 1', () => {
  assert.equal(recallAtK(['a', 'b', 'c'], ['a', 'b'], 5), 1)
})

check('부분 적중 → 비율', () => {
  // expected a,b,c 중 top-5 에 a,c → 2/3
  assert.ok(Math.abs(recallAtK(['a', 'x', 'c', 'y', 'z'], ['a', 'b', 'c'], 5) - 2 / 3) < 1e-12)
})

check('k 컷오프 적용 — 정답이 컷 밖이면 미포함', () => {
  // expected b 가 index 3 → k=3(0..2)면 미포함
  assert.equal(recallAtK(['x', 'y', 'z', 'b'], ['b'], 3), 0)
  assert.equal(recallAtK(['x', 'y', 'z', 'b'], ['b'], 4), 1)
})

check('expected 비면 1 (평가 대상 없음)', () => {
  assert.equal(recallAtK(['a'], [], 5), 1)
})

// ── mrr ──────────────────────────────────────────────
console.log('mrr:')

check('첫 위치 정답 → 1', () => {
  assert.equal(mrr(['a', 'b'], ['a']), 1)
})

check('세 번째 위치 정답 → 1/3', () => {
  assert.ok(Math.abs(mrr(['x', 'y', 'a', 'b'], ['a']) - 1 / 3) < 1e-12)
})

check('정답 없음 → 0', () => {
  assert.equal(mrr(['x', 'y'], ['a']), 0)
})

check('expected 비면 0', () => {
  assert.equal(mrr(['x'], []), 0)
})

check('가장 이른 정답 순위 사용', () => {
  // a(idx2), b(idx0) 둘 다 정답 → 첫 등장(b, idx0) → 1
  assert.equal(mrr(['b', 'x', 'a'], ['a', 'b']), 1)
})

console.log(`\n✅ 모든 단위 검증 통과 (${passed} cases)`)

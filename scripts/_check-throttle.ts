/**
 * QUAL-THROTTLE (2026-06-06) — limiter 동시성 캡 + 백오프/429 판별 결정론적 검증.
 *
 * 실행: npx tsx scripts/_check-throttle.ts
 *
 * 단언:
 *   (a) createLimiter(N) 는 동시 실행 active 가 절대 N 을 넘지 않게 직렬화하고,
 *       모든 작업의 결과·순서를 입력과 동일하게 보존한다(reject 도 전파).
 *   (b) expBackoffDelay 는 지수 증가(2^attempt)·cap 상한·jitter 범위를 만족한다.
 *   (c) is429 / isPrepaymentExhausted 가 Gemini 에러 메시지를 올바르게 분류한다.
 *
 * ⚠️ LLM/DB/네트워크 호출 없음 · 백그라운드 프로세스 없음. 1회 검증 후 종료.
 */
import {
  createLimiter,
  expBackoffDelay,
  is429,
  isPrepaymentExhausted,
} from '../src/lib/util/limit'

const fails: string[] = []
function assert(cond: boolean, msg: string) {
  if (!cond) fails.push(msg)
}

// ─────────────────────────────────────────
// (a) limiter: 동시성 ≤ N · 순서/값 보존 · reject 전파
// ─────────────────────────────────────────
async function checkLimiter() {
  for (const N of [1, 2, 3]) {
    const limit = createLimiter(N)
    let active = 0
    let peak = 0
    const order: number[] = []
    const tasks = Array.from({ length: 12 }, (_, i) =>
      limit(async () => {
        active++
        peak = Math.max(peak, active)
        // 짧은 비동기 일 — 동시 실행 창을 만들되 결정론적으로 짧게.
        await new Promise((r) => setTimeout(r, (i % 3) + 1))
        active--
        order.push(i)
        return i * 10
      }),
    )
    const results = await Promise.all(tasks)
    assert(peak <= N, `limiter(N=${N}) 동시성 초과: peak=${peak}`)
    assert(peak >= 1, `limiter(N=${N}) 실행 안 됨: peak=${peak}`)
    // run() 의 resolve 값은 입력 순서와 1:1 (Promise.all 순서 보존)
    const expected = Array.from({ length: 12 }, (_, i) => i * 10)
    assert(
      JSON.stringify(results) === JSON.stringify(expected),
      `limiter(N=${N}) 결과 순서/값 불일치`,
    )
    console.log(`  limiter(N=${N}): peak=${peak} (≤${N}) · 결과 ${results.length}개 순서보존 ✅`)
  }

  // reject 전파: 실패 작업의 reject 가 그대로 전파되고 limiter 가 막히지 않음.
  const limit = createLimiter(2)
  const settled = await Promise.allSettled([
    limit(async () => {
      throw new Error('boom')
    }),
    limit(async () => 'ok'),
    limit(async () => 'ok2'),
  ])
  assert(settled[0].status === 'rejected', 'limiter reject 전파 실패')
  assert(
    settled[1].status === 'fulfilled' && settled[2].status === 'fulfilled',
    'limiter: reject 후 후속 작업 차단됨',
  )
  console.log('  limiter reject 전파 + 후속 진행 ✅')
}

// ─────────────────────────────────────────
// (b) expBackoffDelay: 지수·cap·jitter 범위
// ─────────────────────────────────────────
function checkBackoff() {
  const base = 800
  const cap = 20_000
  // jitter=0 으로 고정 → 순수 지수 검증.
  const d0 = expBackoffDelay(0, { base, cap, jitter: 0 })
  const d1 = expBackoffDelay(1, { base, cap, jitter: 0 })
  const d2 = expBackoffDelay(2, { base, cap, jitter: 0 })
  assert(d0 === base, `backoff attempt0 != base: ${d0}`)
  assert(d1 === base * 2, `backoff attempt1 != base*2: ${d1}`)
  assert(d2 === base * 4, `backoff attempt2 != base*4: ${d2}`)
  assert(d2 > d1 && d1 > d0, 'backoff 단조증가 아님')

  // cap 상한: 큰 attempt 는 cap 으로 클램프.
  const dBig = expBackoffDelay(20, { base, cap, jitter: 0 })
  assert(dBig === cap, `backoff cap 미적용: ${dBig}`)

  // jitter 범위: [exp, exp+base) — 무작위 100회 모두 범위 내.
  for (let i = 0; i < 100; i++) {
    const d = expBackoffDelay(0, { base, cap })
    assert(d >= base && d < base + base, `backoff jitter 범위 벗어남: ${d}`)
  }
  console.log(`  backoff: ${d0} → ${d1} → ${d2} (지수) · cap=${dBig} · jitter 범위 OK ✅`)
}

// ─────────────────────────────────────────
// (c) 429 / prepay 분류
// ─────────────────────────────────────────
function checkClassify() {
  const pos = [
    { status: 429 },
    { code: 429 },
    new Error('429 RESOURCE_EXHAUSTED'),
    new Error('Resource exhausted: quota'),
    new Error('Too Many Requests'),
    new Error('rate limit exceeded'),
  ]
  for (const e of pos) assert(is429(e), `is429 false-negative: ${JSON.stringify(String((e as Error).message ?? e))}`)

  const neg = [new Error('invalid argument'), new Error('500 internal'), undefined, null]
  for (const e of neg) assert(!is429(e), `is429 false-positive: ${String(e)}`)

  assert(
    isPrepaymentExhausted(new Error('429: prepayment credits depleted')),
    'prepay 미탐지',
  )
  assert(
    !isPrepaymentExhausted(new Error('429 RESOURCE_EXHAUSTED (per-minute quota)')),
    'prepay 오탐(일반 분당 429)',
  )
  console.log('  is429 / isPrepaymentExhausted 분류 ✅')
}

async function main() {
  console.log('\n[QUAL-THROTTLE] limiter + backoff 결정론 검증\n')
  await checkLimiter()
  checkBackoff()
  checkClassify()
  console.log('')
  if (fails.length === 0) {
    console.log('✅ PASS — limiter 동시성 캡 · 지수 백오프 · 429 분류 전부 검증.')
  } else {
    console.log('❌ FAIL:')
    for (const f of fails) console.log(`   - ${f}`)
    process.exitCode = 1
  }
}

main()

/**
 * 경량 동시성 limiter + 백오프 헬퍼 (QUAL-THROTTLE, 2026-06-06)
 *
 * 외부 의존성(p-limit 등) 없이 ~수십 줄로 (1) 동시 실행 N 캡, (2) 429 지수 백오프
 * 지연 계산, (3) Gemini 429/소진 메시지 판별을 제공한다. 전부 순수·결정론적(테스트 가능).
 *
 * 사용처:
 *   - gather.ts: 섹션·과업 retrieve 동시성 캡(rerank/임베딩 LLM 버스트 → 429 방지).
 *   - ai-fallback.ts: 같은 모델 429 백오프 재시도(폴백 체인 진입 전).
 */

/** N개까지만 동시에 실행하는 limiter. `run(fn)` 의 resolve/reject 순서·값은 입력과 동일 보장. */
export function createLimiter(concurrency: number) {
  const max = Math.max(1, Math.floor(concurrency))
  let active = 0
  const queue: Array<() => void> = []

  const next = () => {
    if (active >= max) return
    const job = queue.shift()
    if (job) job()
  }

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active++
        // fn() 동기 throw 도 안전하게 reject 로 흡수
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            active--
            next()
          })
      }
      if (active < max) start()
      else queue.push(start)
    })
  }
}

/**
 * 지수 백오프 지연(ms) — base * 2^attempt + jitter, cap 상한.
 * attempt 는 0-기반(0 = 첫 재시도 전 대기). jitter 는 [0, base) 균등.
 *
 * 순수성을 위해 jitter 소스를 주입 가능(테스트는 0 또는 고정값 주입).
 */
export function expBackoffDelay(
  attempt: number,
  opts: { base?: number; cap?: number; jitter?: number } = {},
): number {
  const base = opts.base ?? 800
  const cap = opts.cap ?? 20_000
  const exp = base * Math.pow(2, Math.max(0, attempt))
  const jitter = opts.jitter ?? Math.random() * base
  return Math.min(cap, exp + jitter)
}

/** Gemini 429 / RESOURCE_EXHAUSTED 류 에러인지(메시지·status 매칭, graceful). */
export function is429(err: unknown): boolean {
  const e = err as { status?: number; code?: number; message?: string } | undefined
  if (e?.status === 429 || e?.code === 429) return true
  const msg = String(e?.message ?? err ?? '').toLowerCase()
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('resource exhausted') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit')
  )
}

/**
 * 선결제 크레딧 소진(prepayment credits) 류 429 — 시간 지나도 안 풀린다.
 * 이런 429 는 백오프 재시도 무의미 → 빠르게 폴백/실패시킨다.
 */
export function isPrepaymentExhausted(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase()
  return msg.includes('prepayment credit') || msg.includes('prepaid') || msg.includes('billing')
}

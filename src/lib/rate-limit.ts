/**
 * 단순 in-memory rate limiter (Phase 4-coach-integration, 2026-05-03)
 *
 * AI 라우트 보호 — 외부 deps 없이 sliding window 기반.
 *
 * 한계:
 *   - serverless 환경 (Vercel) 에서는 instance 별 카운터 → 분산 환경에서 정확 X.
 *     단, ud-ops 는 Hobby plan 단일 region (icn1) 이라 충분.
 *   - 인스턴스 cold start 시 카운터 초기화 — 공격자 입장에서 우회 가능하지만
 *     운영 사용자 보호로는 충분.
 *
 * 향후 정식 도입 시: Upstash Redis · Vercel KV · CloudFlare Durable Objects.
 *
 * 사용 예:
 *   import { checkRateLimit } from '@/lib/rate-limit'
 *   const limit = checkRateLimit({ key: ip, limit: 10, windowMs: 60_000 })
 *   if (!limit.allowed) {
 *     return NextResponse.json({ error: 'Rate limit', retryAfter: limit.retryAfterSec }, { status: 429 })
 *   }
 */

import { log } from '@/lib/logger'

interface Bucket {
  count: number
  windowStart: number
}

const buckets = new Map<string, Bucket>()

// 메모리 누수 방지 — 1만 개 이상 쌓이면 가장 오래된 절반 제거
const MAX_BUCKETS = 10_000

export interface RateLimitOptions {
  /** 식별 키 (IP, user id 등) */
  key: string
  /** 윈도 내 허용 호출 수 */
  limit: number
  /** 윈도 길이 (ms) */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

export function checkRateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(opts.key)

  // 새 또는 만료된 윈도 → 리셋
  if (!bucket || now - bucket.windowStart >= opts.windowMs) {
    buckets.set(opts.key, { count: 1, windowStart: now })
    if (buckets.size > MAX_BUCKETS) cleanupOldBuckets()
    return { allowed: true, remaining: opts.limit - 1, retryAfterSec: 0 }
  }

  // 현재 윈도 내 — count 증가
  bucket.count += 1
  if (bucket.count <= opts.limit) {
    return { allowed: true, remaining: opts.limit - bucket.count, retryAfterSec: 0 }
  }

  // 초과
  const retryAfterSec = Math.ceil((bucket.windowStart + opts.windowMs - now) / 1000)
  log.warn('rate-limit', 'limit exceeded', {
    key: opts.key.slice(0, 80),
    count: bucket.count,
    limit: opts.limit,
    retryAfterSec,
  })
  return { allowed: false, remaining: 0, retryAfterSec }
}

function cleanupOldBuckets() {
  const entries = [...buckets.entries()]
  entries.sort((a, b) => a[1].windowStart - b[1].windowStart)
  const toRemove = entries.slice(0, Math.floor(MAX_BUCKETS / 2))
  for (const [k] of toRemove) buckets.delete(k)
  log.info('rate-limit', 'bucket cleanup', { removed: toRemove.length })
}

/**
 * Next.js Request 에서 client IP 추출 (Vercel 환경 호환).
 * x-forwarded-for 우선, 없으면 x-real-ip, 그것도 없으면 'unknown'.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    // 여러 IP 가 있으면 첫 번째 (실제 client)
    return forwarded.split(',')[0].trim()
  }
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}

/**
 * AI 라우트 표준 정책 — IP 별 분당 10회.
 * 무거운 호출 (curriculum / proposal) 보호용. 일반 read API 는 적용 X.
 */
export const AI_RATE_LIMIT = {
  limit: 10,
  windowMs: 60_000,
} as const

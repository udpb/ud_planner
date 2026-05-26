/**
 * Public API auth — W32 (Phase E)
 *
 * Bearer token 인증 + rate-limit. 외부 시스템 (Bizinfo cron, 코치 도구 등) 연동용.
 *
 * 토큰 source:
 *   - env BRAIN_PUBLIC_API_TOKEN — 단일 master token (간단)
 *   - 향후 DB 의 ApiKey 모델로 확장 가능
 *
 * 사용:
 *   const auth = requireBrainApiAuth(req)
 *   if (!auth.ok) return auth.response
 */

import { NextRequest, NextResponse } from 'next/server'

export interface BrainApiAuthResult {
  ok: boolean
  token?: string
  response?: NextResponse
}

const PUBLIC_TOKEN_ENV = 'BRAIN_PUBLIC_API_TOKEN'

export function requireBrainApiAuth(req: NextRequest): BrainApiAuthResult {
  const expected = process.env[PUBLIC_TOKEN_ENV]
  if (!expected) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'NOT_CONFIGURED',
          message: `Public API 비활성화 — env ${PUBLIC_TOKEN_ENV} 설정 필요`,
        },
        { status: 503 },
      ),
    }
  }

  const auth = req.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Authorization: Bearer <token> 헤더 필요',
        },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
      ),
    }
  }

  if (m[1] !== expected) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'INVALID_TOKEN', message: '토큰 불일치' },
        { status: 401 },
      ),
    }
  }

  return { ok: true, token: m[1] }
}

// ─────────────────────────────────────────
// Rate limit — IP + token 기반 (in-memory; 운영은 Redis 권장)
// ─────────────────────────────────────────

const buckets = new Map<string, { count: number; resetAt: number }>()

export function brainApiRateLimit(key: string, limit = 60, windowMs = 60_000): {
  ok: boolean
  remaining: number
  resetAt: number
} {
  const now = Date.now()
  const cur = buckets.get(key)
  if (!cur || now > cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs }
  }
  if (cur.count >= limit) {
    return { ok: false, remaining: 0, resetAt: cur.resetAt }
  }
  cur.count++
  return { ok: true, remaining: limit - cur.count, resetAt: cur.resetAt }
}

export function getClientKey(req: NextRequest, token?: string): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  return `brain-api:${token?.slice(0, 8) ?? 'anon'}:${ip}`
}

/**
 * GET /api/dev/sentry-test
 *
 * Sentry 통합 검증용 — production 차단, 환경변수 SENTRY_DSN 동작 확인.
 *
 * 사용:
 *   curl https://ud-planner.vercel.app/api/dev/sentry-test
 *   → log.error 발생 → Sentry Issues 에 도착해야 함
 *
 * 보호: NODE_ENV !== 'production' 또는 ?key=E2E_SECRET 일치 시만 동작.
 */

import { NextRequest, NextResponse } from 'next/server'
import { log } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // production 에서도 호출 가능하지만 secret 필요
  const url = new URL(req.url)
  const providedKey = url.searchParams.get('key')
  const expectedKey = process.env.E2E_SECRET

  if (process.env.NODE_ENV === 'production' && providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 1. log.error 호출 — Sentry 통합이면 자동 captureMessage
  log.error('sentry-test', new Error('Sentry 통합 검증 — 의도적 에러 (무시 가능)'), {
    triggeredAt: new Date().toISOString(),
    userAgent: req.headers.get('user-agent')?.slice(0, 100),
  })

  // 2. log.warn 도 테스트
  log.warn('sentry-test', '경고 레벨 검증', { level: 'warn' })

  // 3. 응답
  return NextResponse.json({
    ok: true,
    message: 'log.error / log.warn 호출됨. Sentry Issues 에 도착했는지 확인하세요.',
    env: {
      NODE_ENV: process.env.NODE_ENV,
      hasSentryDsn: !!process.env.SENTRY_DSN,
      sentryDsnPrefix: process.env.SENTRY_DSN?.slice(0, 30) + '...',
    },
    timestamp: new Date().toISOString(),
  })
}

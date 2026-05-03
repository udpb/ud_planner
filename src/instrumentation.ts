/**
 * Next.js Instrumentation hook (Phase 4-coach-integration, 2026-05-03)
 *
 * Next.js 가 server runtime 시작 직후 1회 실행. 글로벌 모니터링 셋업.
 *
 * Sentry 통합:
 *   1. SENTRY_DSN 환경변수 있으면 활성
 *   2. globalThis.__sentry__ 에 등록 → src/lib/logger.ts emit() 가 자동 라우팅
 *   3. 별도 wrapper 코드 불필요 — log.error / log.warn 만 호출하면 자동 수집
 *
 * 참고: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

export async function register() {
  // Sentry 활성 — DSN 있을 때만 (개발/프리뷰는 미설정 default)
  if (!process.env.SENTRY_DSN) {
    return
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      // 운영 트래픽이 작아 모두 수집해도 부담 X
      tracesSampleRate: 1.0,
      // PII 보호 — 자동 스크럽
      sendDefaultPii: false,
    })

    // logger.ts 에서 자동 라우팅하도록 등록
    const g = globalThis as { __sentry__?: unknown }
    g.__sentry__ = {
      captureException: (err: unknown, ctx?: Record<string, unknown>) =>
        Sentry.captureException(err, ctx ? { extra: ctx } : undefined),
      captureMessage: (msg: string, ctx?: Record<string, unknown>) => {
        // logger.ts 의 level 은 'warn' / 'error' / 'info' / 'debug'.
        // Sentry 는 'warning' / 'error' / 'info' / 'debug' / 'fatal' 사용.
        const lvRaw = ctx?.level as string | undefined
        const sentryLevel: 'info' | 'warning' | 'error' | 'debug' =
          lvRaw === 'warn'
            ? 'warning'
            : lvRaw === 'error'
              ? 'error'
              : lvRaw === 'debug'
                ? 'debug'
                : 'info'
        Sentry.captureMessage(msg, { level: sentryLevel, extra: ctx })
      },
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 1.0,
    })
  }
}

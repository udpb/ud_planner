/**
 * 구조화 로거 (Phase 3.3, 2026-05-03)
 *
 * Vercel logs (또는 console) 으로 흘러가는 운영 로그를 구조화해 grep / 필터 가능하게.
 * Sentry / Datadog 등 외부 deps 추가 없이 console + JSON 기반으로 운영.
 *
 * 사용 예:
 *   import { log } from '@/lib/logger'
 *   log.info('proposal-section', { sectionNo: 3, ms: 1234, retried: false })
 *   log.warn('ai-fallback', '1차 호출 실패 → 재시도', { provider: 'gemini' })
 *   log.error('parse-rfp', err, { fileSize: 23456 })
 *
 * 로그 형식 (JSON 한 줄):
 *   {"ts":"2026-05-03T...","level":"info","scope":"proposal-section","msg":"...","ms":1234,...}
 *
 * 환경변수:
 *   LOG_LEVEL = 'debug' | 'info' | 'warn' | 'error' (default: 'info' in prod, 'debug' otherwise)
 *   LOG_PRETTY = '1' 이면 pretty-print (개발 중)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function getMinLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL || '').toLowerCase()
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') return env
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

const MIN_LEVEL = getMinLevel()
const PRETTY = process.env.LOG_PRETTY === '1' || process.env.NODE_ENV !== 'production'

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[MIN_LEVEL]
}

function emit(level: LogLevel, scope: string, msg: string, fields?: Record<string, unknown>) {
  if (!shouldLog(level)) return
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(fields ?? {}),
  }
  if (PRETTY) {
    const tag = level === 'error' ? '🔴' : level === 'warn' ? '🟡' : level === 'info' ? '🔵' : '⚪'
    const fieldStr = fields && Object.keys(fields).length
      ? ' ' + Object.entries(fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
      : ''
    const line = `${tag} [${scope}] ${msg}${fieldStr}`
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  } else {
    // JSON 한 줄 — Vercel / Datadog 등이 parsing 가능
    const line = JSON.stringify(payload)
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }
}

/** 에러 객체를 직렬화 가능한 평탄 dict 로 변환 */
function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message,
      ...(err.stack && process.env.NODE_ENV !== 'production'
        ? { stack: err.stack.slice(0, 1000) }
        : {}),
    }
  }
  return { error: String(err).slice(0, 500) }
}

export const log = {
  debug(scope: string, msg: string, fields?: Record<string, unknown>) {
    emit('debug', scope, msg, fields)
  },
  info(scope: string, msg: string, fields?: Record<string, unknown>) {
    emit('info', scope, msg, fields)
  },
  warn(scope: string, msg: string, fields?: Record<string, unknown>) {
    emit('warn', scope, msg, fields)
  },
  error(scope: string, err: unknown, fields?: Record<string, unknown>) {
    emit('error', scope, err instanceof Error ? err.message : String(err), {
      ...serializeError(err),
      ...(fields ?? {}),
    })
  },
}

/**
 * 함수 실행 시간 측정 + 자동 로깅 (운영 핫패스 모니터링용).
 *
 * 사용:
 *   const result = await timed('proposal-section-3', () => generateProposalSection(...))
 */
export async function timed<T>(
  scope: string,
  fn: () => Promise<T> | T,
  fields?: Record<string, unknown>,
): Promise<T> {
  const t0 = Date.now()
  try {
    const result = await fn()
    log.info(scope, 'ok', { ms: Date.now() - t0, ...(fields ?? {}) })
    return result
  } catch (err) {
    log.error(scope, err, { ms: Date.now() - t0, ...(fields ?? {}) })
    throw err
  }
}

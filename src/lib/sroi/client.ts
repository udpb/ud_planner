/**
 * BR-SROI-1 — impact-measurement SROI 서비스 클라이언트 (라이브 호출)
 *
 * ⭐ graceful 필수. SROI 는 옵션 렌즈다 — 서비스 URL/토큰이 없거나, 다운이거나,
 *    4xx/5xx 를 주거나, 타임아웃이어도 **null 반환 + log.warn** 한다. **throw 금지**
 *    (앱이 죽으면 안 됨).
 *
 * 토큰은 env(SERVICE_API_TOKEN)에서만 읽는다 — 코드/로그/커밋에 절대 넣지 않는다.
 */

import { log } from '@/lib/logger'
import type {
  CoefficientsResponse,
  PredictRequest,
  PredictResponse,
} from './types'

const SCOPE = 'sroi-client'

/** 라이브 호출 타임아웃 (ms). 무한 대기 방지 — 서비스 느리면 graceful null. */
const REQUEST_TIMEOUT_MS = 8_000

/** env 미지정 시 기본 서비스 URL (BR-SROI-1 §Prerequisites). */
const DEFAULT_SERVICE_URL = 'https://impact-measurement-udi.vercel.app'

export interface ServiceConfig {
  baseUrl: string
  token: string
}

/**
 * env 에서 서비스 설정을 읽는다. **토큰 없으면 null**(클라이언트 비활성 — graceful).
 *   - SROI_SERVICE_URL : 미지정 시 DEFAULT_SERVICE_URL.
 *   - SERVICE_API_TOKEN: 없으면 비활성(null). URL 만 있고 토큰 없으면 호출 불가로 본다.
 */
export function getServiceConfig(): ServiceConfig | null {
  const token = process.env.SERVICE_API_TOKEN?.trim()
  if (!token) {
    log.warn(SCOPE, 'SERVICE_API_TOKEN 미설정 — SROI 클라이언트 비활성(graceful null)')
    return null
  }
  const baseUrl = (process.env.SROI_SERVICE_URL?.trim() || DEFAULT_SERVICE_URL).replace(
    /\/+$/,
    '',
  )
  return { baseUrl, token }
}

/**
 * 공통 fetch — 타임아웃 + Bearer + JSON. 실패 경로는 전부 null(throw 금지).
 * 토큰은 헤더에만 쓰고 절대 로그에 남기지 않는다.
 */
async function fetchJson<T>(
  cfg: ServiceConfig,
  path: string,
  init: RequestInit,
  label: string,
): Promise<T | null> {
  const url = `${cfg.baseUrl}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.token}`,
        ...(init.headers ?? {}),
      },
    })
    if (!res.ok) {
      // 4xx/5xx → graceful null. 본문은 디버그용으로만 짧게(토큰 미포함).
      const body = await res.text().catch(() => '')
      log.warn(SCOPE, `${label} — 서비스 ${res.status} 응답(graceful null)`, {
        path,
        status: res.status,
        bodySnippet: body.slice(0, 200),
        ms: Date.now() - startedAt,
      })
      return null
    }
    const json = (await res.json()) as T
    log.info(SCOPE, `${label} — 성공`, { path, ms: Date.now() - startedAt })
    return json
  } catch (err: unknown) {
    // 네트워크 실패/타임아웃(abort)/JSON 파싱 실패 → graceful null.
    const aborted = (err as { name?: string })?.name === 'AbortError'
    log.warn(SCOPE, `${label} — ${aborted ? '타임아웃' : '네트워크/파싱 실패'}(graceful null)`, {
      path,
      ms: Date.now() - startedAt,
      error: String((err as { message?: string })?.message ?? err).slice(0, 200),
    })
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GET /api/v1/coefficients?country=KR — 카테고리별 proxy(계수) 조회.
 * config 없으면(토큰 미설정) null. 네트워크/4xx-5xx 도 null.
 */
export async function fetchCoefficients(
  country = 'KR',
): Promise<CoefficientsResponse | null> {
  const cfg = getServiceConfig()
  if (!cfg) return null
  const qs = new URLSearchParams({ country }).toString()
  return fetchJson<CoefficientsResponse>(
    cfg,
    `/api/v1/coefficients?${qs}`,
    { method: 'GET' },
    'fetchCoefficients',
  )
}

/**
 * POST /api/v1/measurements/predict — 라이브 예측(서비스 산식·리포트 핸드오프).
 * config 없으면 null. 네트워크/4xx-5xx 도 null.
 */
export async function requestPrediction(
  body: PredictRequest,
): Promise<PredictResponse | null> {
  const cfg = getServiceConfig()
  if (!cfg) return null
  return fetchJson<PredictResponse>(
    cfg,
    '/api/v1/measurements/predict',
    { method: 'POST', body: JSON.stringify(body) },
    'requestPrediction',
  )
}

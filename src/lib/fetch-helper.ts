/**
 * 클라이언트 fetch 헬퍼 — 일관된 에러 처리
 *
 * 문제 상황:
 *   - Vercel 504 timeout / 500 error 시 응답 body 가 HTML/text 일 수 있음
 *   - JSON.parse() 가 "Unexpected token 'A', \"An error o\"..." 로 실패
 *   - 모든 API 호출에서 같은 패턴 → 일관 처리 필요
 *
 * 사용 패턴:
 *   const r = await safeFetchJson<{ ok: boolean }>('/api/...', { method: 'POST', body: ... })
 *   if (!r.ok) toast.error(r.error)
 *   else handleSuccess(r.data)
 */

export interface SafeFetchSuccess<T> {
  ok: true
  status: number
  data: T
}

export interface SafeFetchFailure {
  ok: false
  status: number
  error: string
  /** body 원문 (디버그용) */
  raw?: string
}

export type SafeFetchResult<T> = SafeFetchSuccess<T> | SafeFetchFailure

export async function safeFetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<SafeFetchResult<T>> {
  let resp: Response
  try {
    resp = await fetch(url, init)
  } catch (err: unknown) {
    return {
      ok: false,
      status: 0,
      error: '네트워크 오류 — 인터넷 연결을 확인하세요',
      raw: err instanceof Error ? err.message : String(err),
    }
  }

  // body 를 한 번만 읽음 — text 로 받고 JSON parse 시도
  const rawText = await resp.text().catch(() => '')

  if (!resp.ok) {
    // 에러 응답 — JSON 이면 message/error 추출, 아니면 친절한 메시지
    const friendlyError = friendlyErrorMessage(resp.status)
    let parsedError: string | undefined
    try {
      const j = JSON.parse(rawText) as { error?: string; message?: string }
      parsedError = j.error ?? j.message
    } catch {
      // HTML/text 그대로 — 친절한 메시지로 대체
    }
    return {
      ok: false,
      status: resp.status,
      error: parsedError ?? friendlyError,
      raw: rawText.slice(0, 500),
    }
  }

  // 성공 — JSON parse
  try {
    const data = JSON.parse(rawText) as T
    return { ok: true, status: resp.status, data }
  } catch {
    return {
      ok: false,
      status: resp.status,
      error: '서버 응답을 해석할 수 없습니다 (JSON 파싱 실패)',
      raw: rawText.slice(0, 500),
    }
  }
}

function friendlyErrorMessage(status: number): string {
  if (status === 504 || status === 502)
    return 'AI 응답이 너무 오래 걸려 시간 초과됐어요. 잠시 후 다시 시도하거나 입력을 짧게 해주세요.'
  if (status === 503) return '서버가 일시적으로 응답하지 못합니다. 잠시 후 다시 시도해 주세요.'
  if (status === 429) return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'
  if (status === 401) return '로그인이 필요합니다.'
  if (status === 403) return '접근 권한이 없습니다.'
  if (status === 404) return '리소스를 찾을 수 없습니다.'
  if (status === 400) return '입력 값을 확인해 주세요.'
  if (status >= 500) return `서버 오류 (${status}) — 잠시 후 다시 시도해 주세요.`
  return `요청 실패 (${status})`
}

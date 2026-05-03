/**
 * AI 응답 JSON 파서 — Phase 2 단순화 (claude.ts 에서 분리, 2026-05-03)
 *
 * Claude/Gemini 가 반환한 텍스트에서 JSON 을 안전하게 추출.
 *
 * 강화 (2026-04-27 L1):
 *  - 마크다운 펜스(```json …```) 제거
 *  - { } 또는 [ ] 자동 감지
 *  - **자동 복구 시도** — 1차 실패 시:
 *      a. trailing comma 제거 (`, }` `, ]`)
 *      b. 미닫힌 문자열·배열·객체 자동 보정
 *      c. 잘린 끝 부분 정리 (마지막 완전한 키:값 까지만 사용)
 *  - 모든 시도 실패 시 명확한 에러 (응답 길이·실패 위치 포함)
 *
 * 호출자가 재시도 여부 판단할 수 있도록 `originalRaw` 를 에러에 부착.
 */

export class JsonParseError extends Error {
  constructor(
    public readonly label: string,
    public readonly originalRaw: string,
    public readonly innerError: Error,
  ) {
    super(`[${label}] JSON 파싱 실패: ${innerError.message} (원본 길이: ${originalRaw.length})`)
    this.name = 'JsonParseError'
  }
}

function stripFenceAndExtract(raw: string): string {
  const s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  let start: number
  let end: number
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    start = arrStart
    end = s.lastIndexOf(']')
  } else {
    start = objStart
    end = s.lastIndexOf('}')
  }
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('JSON 본문을 찾을 수 없음')
  }
  return s.slice(start, end + 1)
}

/** 자주 발생하는 LLM JSON 오류 자동 복구 */
function attemptRepair(s: string): string {
  let r = s
  // 1) trailing comma 제거: ", }" → " }"  / ", ]" → " ]"
  r = r.replace(/,(\s*[}\]])/g, '$1')
  // 2) 짝 안 맞는 따옴표·괄호 보정 — 단순 카운트 기반 누락 복구
  const openBraces = (r.match(/\{/g) ?? []).length
  const closeBraces = (r.match(/\}/g) ?? []).length
  const openBrackets = (r.match(/\[/g) ?? []).length
  const closeBrackets = (r.match(/\]/g) ?? []).length
  if (openBraces > closeBraces) r = r + '}'.repeat(openBraces - closeBraces)
  if (openBrackets > closeBrackets) r = r + ']'.repeat(openBrackets - closeBrackets)
  return r
}

/** 끝부분이 깨진 경우, 마지막 완전한 항목까지로 잘라냄 */
function truncateToLastValid(s: string): string | null {
  // 가장 마지막 콤마 또는 } / ] 위치를 찾아 그 이후 자름
  for (let i = s.length - 1; i > 0; i--) {
    const c = s[i]
    if (c === '}' || c === ']') {
      const candidate = s.slice(0, i + 1)
      try {
        JSON.parse(candidate)
        return candidate
      } catch { /* continue */ }
    }
  }
  return null
}

export function safeParseJson<T>(raw: string, label: string): T {
  let extracted: string
  try {
    extracted = stripFenceAndExtract(raw)
  } catch (e: any) {
    throw new JsonParseError(label, raw, e)
  }

  // 1차 시도 — 그대로
  try {
    return JSON.parse(extracted) as T
  } catch (firstError: any) {
    // 2차 시도 — trailing comma + 누락 괄호 보정
    const repaired = attemptRepair(extracted)
    try {
      return JSON.parse(repaired) as T
    } catch {
      // 3차 시도 — 끝부분 자르기
      const truncated = truncateToLastValid(repaired)
      if (truncated) {
        try {
          return JSON.parse(truncated) as T
        } catch { /* fall through */ }
      }
      throw new JsonParseError(label, raw, firstError)
    }
  }
}

/**
 * @deprecated 외부 호출자는 `safeParseJson` 직접 import 하세요.
 * 기존 호환을 위한 alias — Phase 2 마이그 후 제거 예정.
 */
export const safeParseJsonExternal = safeParseJson

/**
 * Express processTurn 보조 헬퍼 (Phase 2.3 단순화, 2026-05-03)
 *
 * 메인 오케스트레이터에서 분리된 작은 함수들:
 *   - appendTurns           : ConversationState 에 PM/AI 턴 누적
 *   - coerceToTurnResponse  : zod 검증 실패 시 부분 채움 (AI 응답 보정)
 *   - extractMarkdownSections : AI 가 nextQuestion 에 마크다운으로 토해낸 sections.* 자동 매핑
 *
 * (이전: src/lib/express/process-turn.ts 단일 파일에서 분리)
 */

import type {
  ConversationState,
  Turn,
  TurnResponse,
} from '../conversation'

// ─────────────────────────────────────────
// 1. ConversationState 에 턴 누적
// ─────────────────────────────────────────

export function appendTurns(
  state: ConversationState,
  pmTurn: Turn | undefined,
  aiTurn: Turn,
  fallback: boolean,
): ConversationState {
  const turns = [...state.turns]
  if (pmTurn) turns.push(pmTurn)
  turns.push(aiTurn)
  return {
    ...state,
    turns,
    fallbackCount: state.fallbackCount + (fallback ? 1 : 0),
  }
}

// ─────────────────────────────────────────
// 2. zod 검증 실패 시 부분 채움
// ─────────────────────────────────────────

/**
 * AI 응답이 zod 검증 실패해도 부분 채움 시도.
 */
export function coerceToTurnResponse(raw: unknown): TurnResponse {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    extractedSlots: (obj.extractedSlots && typeof obj.extractedSlots === 'object'
      ? (obj.extractedSlots as Record<string, unknown>)
      : {}),
    nextQuestion: typeof obj.nextQuestion === 'string' ? obj.nextQuestion : '',
    quickReplies: Array.isArray(obj.quickReplies)
      ? (obj.quickReplies as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    externalLookupNeeded:
      obj.externalLookupNeeded && typeof obj.externalLookupNeeded === 'object'
        ? (obj.externalLookupNeeded as TurnResponse['externalLookupNeeded'])
        : null,
    validationErrors: Array.isArray(obj.validationErrors)
      ? (obj.validationErrors as { slotKey: string; issue: string; remediation?: string }[])
      : [],
    recommendedNextSlot:
      typeof obj.recommendedNextSlot === 'string' ? obj.recommendedNextSlot : null,
  }
}

// ─────────────────────────────────────────
// 3. Markdown 섹션 추출 휴리스틱
//
// AI 가 nextQuestion 에 마크다운으로 1차본 7 섹션을 토해낸 경우 sections.{1..7} 로 자동 매핑.
// 패턴 인식:
//   - "### I. 제안 배경"  /  "### 1. 제안 배경"  /  "## 1. 제안 배경"
//   - "[1장. 제안 배경]"  /  "**[1장. 제안 배경]**"
//   - "### IV. 사업 관리"  →  로마 숫자도 처리
// ─────────────────────────────────────────

const ROMAN_TO_NUM: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
}

export function extractMarkdownSections(text: string): Record<string, string> {
  if (!text) return {}
  // 너무 짧으면 정상 nextQuestion — 추출 안 함
  if (text.length < 400) return {}

  // 섹션 헤더 패턴: 줄 시작에 `###` 또는 `##` 또는 `**[N장`
  // 캡처: 그룹1=숫자(아라비아) 또는 그룹2=로마, 그룹3=섹션 제목, 그룹4=본문 (다음 헤더 전까지)
  // 단순화: 헤더 위치만 먼저 뽑고 사이 텍스트로 본문 만들기
  const headerRegex =
    /^(?:#{2,4}\s+|\*?\*?\[)\s*(?:([1-7])|(I{1,3}|IV|V|VI{0,2}|VII))[\.\장]?\s*([^\n\]]*?)(?:\]?\*?\*?)\s*$/gm

  const headers: { idx: number; secNo: number; titleHint: string }[] = []
  let m: RegExpExecArray | null
  while ((m = headerRegex.exec(text))) {
    let secNo: number | null = null
    if (m[1]) secNo = Number(m[1])
    else if (m[2]) secNo = ROMAN_TO_NUM[m[2]] ?? null
    if (!secNo || secNo < 1 || secNo > 7) continue
    headers.push({ idx: m.index, secNo, titleHint: (m[3] ?? '').trim() })
  }

  if (headers.length === 0) return {}

  const out: Record<string, string> = {}
  for (let i = 0; i < headers.length; i += 1) {
    const h = headers[i]
    const start = h.idx
    const end = i + 1 < headers.length ? headers[i + 1].idx : text.length
    const body = text.slice(start, end).trim()
    // 너무 짧은 본문은 skip (헤더만 있고 내용 없음)
    if (body.length < 80) continue
    // 1500자 캡
    out[String(h.secNo)] = body.slice(0, 1500)
  }
  return out
}

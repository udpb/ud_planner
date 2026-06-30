/**
 * concept-context — 컨셉 메시지 value-chain 관통 헬퍼 (ADR-031 Wave 4)
 *
 * 정한 컨셉(`strategicNotes.concept`: winTheme · keyMessages[3] · differentiation)을
 * 하류 AI 프롬프트(커리큘럼 rationale · SROI 내러티브 · 제안서 섹션)에 **context 로 주입**
 * 하기 위한 공통 포맷터. 한 곳에서 포맷해 중복을 막는다.
 *
 * 원칙 (ADR-031 §③ 연장):
 *   - **프롬프트 컨텍스트 추가만** — 엔진 로직·출력 스키마 무변경.
 *   - 컨셉 부재/불완전 → 빈 문자열('') 반환 → 블록 생략(graceful, 회귀 0).
 *   - 억지 삽입 금지 — "자연스럽게 반영" 지시. 점수/합격/SROI 단정 금지(기존 규칙 유지).
 *
 * 이 모듈은 순수(pure) — fetch·AI 호출 없음. ConceptShape 또는 StrategicNotes 를 받아 문자열만 반환.
 */

import type { ConceptShape } from '@/lib/program-design/concept-synth'

/** conceptContextBlock 입력 — ConceptShape 직접, 또는 concept 를 품은 strategicNotes 형태. */
type ConceptContextInput =
  | ConceptShape
  | { concept?: ConceptShape | null }
  | null
  | undefined

/** 입력에서 ConceptShape 를 안전 추출 (둘 중 어느 형태든 허용). */
function pickConcept(input: ConceptContextInput): ConceptShape | undefined {
  if (!input || typeof input !== 'object') return undefined
  // { concept } 래퍼 형태
  if ('concept' in input) {
    const c = (input as { concept?: ConceptShape | null }).concept
    return c ?? undefined
  }
  // ConceptShape 직접
  return input as ConceptShape
}

/** 메시지 배열을 정확히 3줄(있는 만큼)로 — 빈/공백 제거. */
function cleanMessages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const m of raw) {
    if (typeof m !== 'string') continue
    const v = m.trim()
    if (v) out.push(v)
    if (out.length >= 3) break
  }
  return out
}

/**
 * 컨셉 블록 — 전 단계 일관 관통용 프롬프트 컨텍스트.
 *
 * @param input         ConceptShape 또는 { concept } (strategicNotes 등)
 * @param outputLabel   이 산출물 이름 (예: '커리큘럼 설계 근거', 'SROI 내러티브', '제안서 본문').
 *                      마지막 지시 줄에 들어가 "이 산출물에 반영" 문장을 자연스럽게 만든다.
 * @returns 포맷된 블록 문자열. 컨셉 부재/불완전(winTheme·메시지 모두 없음)이면 '' (블록 생략).
 */
export function conceptContextBlock(
  input: ConceptContextInput,
  outputLabel = '이 산출물',
): string {
  const concept = pickConcept(input)
  if (!concept) return ''

  const winTheme = typeof concept.winTheme === 'string' ? concept.winTheme.trim() : ''
  const messages = cleanMessages(concept.keyMessages)
  const differentiation =
    typeof concept.differentiation === 'string' ? concept.differentiation.trim() : ''

  // winTheme·메시지가 모두 없으면 의미 있는 컨셉이 아님 → 생략 (graceful).
  if (!winTheme && messages.length === 0) return ''

  const lines: string[] = []
  lines.push('[프로그램 컨셉 — 전 단계 일관 관통]')
  if (winTheme) lines.push(`컨셉: ${winTheme}`)
  if (messages.length > 0) {
    lines.push('핵심 메시지:')
    messages.forEach((m, i) => lines.push(`${i + 1}. ${m}`))
  }
  if (differentiation) lines.push(`차별점: ${differentiation}`)
  lines.push(
    `→ 위 메시지가 ${outputLabel}에 일관되게 반영되어야 한다(억지 삽입 금지, 자연스럽게). 점수·합격·SROI 수치를 단정하지 말 것.`,
  )
  return lines.join('\n')
}

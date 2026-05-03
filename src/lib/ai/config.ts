/**
 * AI 호출 정책 상수 (Phase 1 — DIAGNOSIS 2026-05-03)
 *
 * 모든 AI 호출의 max_tokens 를 5 카테고리로 표준화. 매직 넘버 제거.
 *
 * 정책:
 *   - LIGHT    (4096)  : 짧은 응답 — 1~2 문장 / 단순 분류 / 개선 제안
 *   - STANDARD (8192)  : 일반 응답 — 챗봇 1턴 / 검수 / 단일 섹션
 *   - LARGE    (12288) : 큰 응답 — RFP 파싱 / Logic Model / 제안서 단일 섹션 (기존 16384 → 60s 안전 마진)
 *   - OUTLINE  (6144)  : 분할 호출 1단계 — 골격만
 *   - DETAILS  (8192)  : 분할 호출 2단계 — outline 기반 detail 보강
 *
 * 16384 는 사용 안 함 (60초 timeout 위험). 더 큰 응답이 필요하면 분할 호출 패턴.
 *
 * 사용 예:
 *   await invokeAi({ prompt, maxTokens: AI_TOKENS.LARGE, label: 'parse-rfp' })
 */

export const AI_TOKENS = {
  LIGHT: 4096,
  STANDARD: 8192,
  LARGE: 12288,
  OUTLINE: 6144,
  DETAILS: 8192,
} as const

export type AiTokenSize = keyof typeof AI_TOKENS

/**
 * route 별 권장 maxTokens (참고용 — 호출자가 직접 import 해도 됨).
 *
 * 새 호출 추가 시 이 표 갱신.
 */
export const AI_TOKEN_MAP = {
  // Express
  'express-turn': AI_TOKENS.STANDARD,
  'express-first-turn': AI_TOKENS.STANDARD,
  'express-turn-retry': AI_TOKENS.STANDARD,
  'express-inspect': AI_TOKENS.STANDARD,
  'interview-extract': AI_TOKENS.STANDARD,

  // Deep Track
  'parse-rfp': AI_TOKENS.LARGE,
  'planning-direction': AI_TOKENS.LIGHT,
  'logic-model-builder': AI_TOKENS.LARGE,
  'logic-model-builder.retry': AI_TOKENS.LARGE,
  'suggest-impact-goal': AI_TOKENS.STANDARD,
  'curriculum': AI_TOKENS.LARGE, // single-shot fallback
  'curriculum-outline': AI_TOKENS.OUTLINE,
  'curriculum-details': AI_TOKENS.DETAILS,
  'proposal-section': AI_TOKENS.LARGE,
  'proposal-improve': AI_TOKENS.LIGHT,

  // Planning Agent
  'planning-agent.tool': AI_TOKENS.LARGE,
} as const

/**
 * Express Track 챗봇 대화 상태 (Phase L Wave L2, ADR-011)
 *
 * 메모리 + DB 캐시(`Project.expressTurnsCache`) 양쪽에 머무름.
 * processTurn → invokeAi → safeParseJson → mergeExtractedSlots 흐름의 입출력.
 *
 * 관련 문서: docs/architecture/express-mode.md §1.2 / §2.1
 */

import { z } from 'zod'

// ─────────────────────────────────────────
// 1. 한 턴
// ─────────────────────────────────────────

export const TurnSchema = z.object({
  id: z.string(),
  role: z.enum(['ai', 'pm']),
  text: z.string(),
  /** 이 턴에서 추출된 슬롯 (Partial Extraction 결과) */
  extractedSlots: z.record(z.string(), z.unknown()).optional(),
  /** 외부 LLM 카드 트리거 (있으면 UI 가 카드 렌더) */
  externalLookupNeeded: z.unknown().optional(),
  /** AI 가 다음 채울 슬롯 (UI 표시용) */
  targetSlot: z.string().optional(),
  /** AI 발화 동안 사용한 모델 (디버깅) */
  aiModel: z.string().optional(),
  createdAt: z.string().datetime(),
})

export type Turn = z.infer<typeof TurnSchema>

// ─────────────────────────────────────────
// 2. 슬롯 검증 에러 (UI 표시용)
// ─────────────────────────────────────────

export const ValidationErrorSchema = z.object({
  slotKey: z.string(),
  zodIssue: z.string(),
  remediation: z.string().optional(),
})

export type ValidationError = z.infer<typeof ValidationErrorSchema>

// ─────────────────────────────────────────
// 3. 외부 리서치 카드 (3 유형)
// ─────────────────────────────────────────

export const ExternalLookupRequestSchema = z.object({
  type: z.enum(['pm-direct', 'external-llm', 'auto-extract']),
  topic: z.string(),
  /** external-llm 일 때만 — AI 가 만든 외부 LLM 프롬프트 */
  generatedPrompt: z.string().optional(),
  /** pm-direct 일 때만 — PM 이 통화·확인할 항목 */
  checklistItems: z.array(z.string()).optional(),
  /** auto-extract 일 때 — 자동으로 무엇이 채워졌는지 한 줄 설명 */
  autoNote: z.string().optional(),
})

export type ExternalLookupRequest = z.infer<typeof ExternalLookupRequestSchema>

// ─────────────────────────────────────────
// 4. 대화 상태 (전체)
// ─────────────────────────────────────────

export const ConversationStateSchema = z.object({
  projectId: z.string(),
  turns: z.array(TurnSchema),
  /** selectNextSlot 결과 */
  currentSlot: z.string().nullable(),
  /** 외부 답을 기다리는 슬롯 */
  pendingExternalLookup: ExternalLookupRequestSchema.optional(),
  validationErrors: z.array(ValidationErrorSchema).default([]),
  /** AI 가 막혀서 fallback 메시지를 띄운 횟수 (디버깅) */
  fallbackCount: z.number().default(0),
})

export type ConversationState = z.infer<typeof ConversationStateSchema>

// ─────────────────────────────────────────
// 5. AI 응답 JSON 스키마 (processTurn 출력)
// ─────────────────────────────────────────

export const TurnResponseSchema = z.object({
  /** 이 턴에서 추출한 슬롯 (key=slotKey, value=내용) */
  extractedSlots: z.record(z.string(), z.unknown()).default({}),
  /** PM 에게 던질 다음 질문 (또는 빈 문자열이면 카드만 표시) */
  nextQuestion: z.string(),
  /** 외부 자료가 필요하면 채움 */
  externalLookupNeeded: ExternalLookupRequestSchema.optional().nullable(),
  /** zod 검증 실패 (이번 턴 슬롯이 길이 미달 등) */
  validationErrors: z
    .array(
      z.object({
        slotKey: z.string(),
        issue: z.string(),
        remediation: z.string().optional(),
      }),
    )
    .default([]),
  /** AI 가 다음에 채울 슬롯 추천 (없으면 selectNextSlot 룰 우선) */
  recommendedNextSlot: z.string().optional().nullable(),
})

export type TurnResponse = z.infer<typeof TurnResponseSchema>

// ─────────────────────────────────────────
// 6. 빈 ConversationState
// ─────────────────────────────────────────

export function emptyConversation(projectId: string): ConversationState {
  return {
    projectId,
    turns: [],
    currentSlot: null,
    validationErrors: [],
    fallbackCount: 0,
  }
}

// ─────────────────────────────────────────
// 7. 턴 ID 생성
// ─────────────────────────────────────────

let turnCounter = 0
export function newTurnId(): string {
  turnCounter += 1
  return `t_${Date.now().toString(36)}_${turnCounter.toString(36)}`
}

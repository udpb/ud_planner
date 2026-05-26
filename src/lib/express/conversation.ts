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

// 순서 — TurnSchema 가 ExternalLookupRequestSchema 참조하므로 위에서 먼저 정의

/**
 * F4 (Wave V, ADR-015 §7): pm-direct 카드의 checklistItem 차등화.
 *
 * 기존 형식 (string) 은 회귀 호환을 위해 union 으로 유지 — 과거 expressTurnsCache
 * 의 직렬화된 turn 데이터가 깨지면 안 됨. normalizeChecklistItems() 가 둘 다
 * `NormalizedChecklistItem` 으로 변환.
 *
 * - must: RFP 누락 정보 / 발주처 우선순위 직접 영향 / 평가배점 가중 항목
 * - nice: 통화 시간 여유 시 추가 질문 (작년 회고·코치 신뢰 등)
 */
export const ChecklistItemSchema = z.union([
  // 회귀 호환 — 기존 string[] 캐시
  z.string(),
  // F4 신규 — 분류 + 근거
  z.object({
    item: z.string(),
    classification: z.enum(['must', 'nice']).default('must'),
    reason: z.string().max(120).optional(),
  }),
])

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>

export interface NormalizedChecklistItem {
  item: string
  classification: 'must' | 'nice'
  reason?: string
}

/**
 * 회귀 호환 normalizer — string[] / object[] 어느 쪽이 와도 동일 형식 반환.
 * UI · 로깅 · prompt 어디서나 이 함수를 거쳐 사용.
 */
export function normalizeChecklistItems(
  items: readonly ChecklistItem[] | undefined | null,
): NormalizedChecklistItem[] {
  if (!items || items.length === 0) return []
  return items.map((it) => {
    if (typeof it === 'string') {
      return {
        item: it,
        classification: 'must' as const,
        reason: '회귀 호환 — 분류 정보 없음',
      }
    }
    return {
      item: it.item,
      classification: it.classification ?? 'must',
      reason: it.reason,
    }
  })
}

export const ExternalLookupRequestSchema = z.object({
  // F3 (Wave V): 'auto-research' 추가 — AI 자동 리서치 (Tier 1 datacenter-stats →
  // Tier 2 Gemini grounding → Tier 3 PM 검토). flag ON 시 process-turn 이
  // 'external-llm' 을 자동으로 'auto-research' 로 rewrite.
  type: z.enum(['pm-direct', 'external-llm', 'auto-extract', 'auto-research']),
  topic: z.string(),
  /** external-llm 일 때만 — AI 가 만든 외부 LLM 프롬프트 */
  generatedPrompt: z.string().optional(),
  /**
   * pm-direct 일 때만 — PM 이 통화·확인할 항목.
   *
   * F4 (ADR-015 §7): 항목별 must/nice 차등 + 분류 근거 (reason). 회귀 호환을
   * 위해 string[] 도 받음 → UI/로깅에선 normalizeChecklistItems() 거쳐 사용.
   */
  checklistItems: z.array(ChecklistItemSchema).optional(),
  /** auto-extract 일 때 — 자동으로 무엇이 채워졌는지 한 줄 설명 */
  autoNote: z.string().optional(),
})

export type ExternalLookupRequest = z.infer<typeof ExternalLookupRequestSchema>

export const TurnSchema = z.object({
  id: z.string(),
  role: z.enum(['ai', 'pm']),
  text: z.string(),
  /** 이 턴에서 추출된 슬롯 (Partial Extraction 결과) */
  extractedSlots: z.record(z.string(), z.unknown()).optional(),
  /** 외부 LLM 카드 트리거 (있으면 UI 가 카드 렌더) — Phase L 카드 인라인 fix */
  externalLookupNeeded: ExternalLookupRequestSchema.optional(),
  /** PM 클릭으로 답할 수 있는 객관식 옵션 (UI 가 chip 버튼으로 렌더) */
  quickReplies: z.array(z.string()).max(8).optional(),
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
// 3. 외부 리서치 카드 (3 유형) — TurnSchema 위에서 이미 정의됨 (위로 이동)
// ─────────────────────────────────────────
// (중복 제거 — 윗부분 참조)

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
  /** PM 이 클릭 한 번으로 답할 수 있는 객관식 옵션 (4~6개 권장) */
  quickReplies: z.array(z.string()).max(8).default([]),
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

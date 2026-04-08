/**
 * Planning Agent — In-Memory State Store
 *
 * Phase 1: 메모리 기반 세션 저장소.
 * Phase 2에서 DB(PlanningIntent / AgentSession 모델)로 영구화.
 *
 * 동시 세션 지원, 세션 ID 기반 조회/업데이트.
 */

import { randomUUID } from 'crypto'
import type {
  AgentState,
  AgentStatus,
  Message,
  MessageRole,
  PartialPlanningIntent,
  Question,
  StrategicSlot,
} from './types'

// ─────────────────────────────────────────
// 메모리 저장소
// ─────────────────────────────────────────

const sessions = new Map<string, AgentState>()

// ─────────────────────────────────────────
// 세션 생성
// ─────────────────────────────────────────

export function createSession(
  intent: PartialPlanningIntent,
  options: { projectId?: string; status?: AgentStatus } = {},
): AgentState {
  const sessionId = randomUUID()
  const now = new Date().toISOString()

  const state: AgentState = {
    sessionId,
    projectId: options.projectId,
    intent,
    history: [],
    status: options.status ?? 'preprocessing',
    currentQuestion: null,
    askedQuestionIds: [],
    createdAt: now,
    updatedAt: now,
  }

  sessions.set(sessionId, state)
  return state
}

// ─────────────────────────────────────────
// 세션 조회
// ─────────────────────────────────────────

export function getSession(sessionId: string): AgentState | null {
  return sessions.get(sessionId) ?? null
}

export function listSessions(): AgentState[] {
  return [...sessions.values()]
}

// ─────────────────────────────────────────
// 세션 업데이트
// ─────────────────────────────────────────

/**
 * 세션을 통째로 교체. 불변성 패턴 — 호출자는 새 state를 만들고 이걸 호출.
 */
export function updateSession(state: AgentState): AgentState {
  const updated: AgentState = {
    ...state,
    updatedAt: new Date().toISOString(),
  }
  sessions.set(state.sessionId, updated)
  return updated
}

// ─────────────────────────────────────────
// 헬퍼: 메시지 추가
// ─────────────────────────────────────────

export function createMessage(
  role: MessageRole,
  content: string,
  options: {
    questionId?: string
    filledSlots?: StrategicSlot[]
  } = {},
): Message {
  return {
    id: randomUUID(),
    role,
    content,
    timestamp: new Date().toISOString(),
    questionId: options.questionId,
    filledSlots: options.filledSlots,
  }
}

/**
 * 세션에 메시지 추가 (불변성 유지).
 */
export function appendMessage(state: AgentState, message: Message): AgentState {
  return {
    ...state,
    history: [...state.history, message],
    updatedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────
// 헬퍼: 질문 진행
// ─────────────────────────────────────────

/**
 * 현재 질문을 설정하고 askedQuestionIds에 추가.
 */
export function setCurrentQuestion(
  state: AgentState,
  question: Question,
): AgentState {
  return {
    ...state,
    currentQuestion: question,
    askedQuestionIds: state.askedQuestionIds.includes(question.id)
      ? state.askedQuestionIds
      : [...state.askedQuestionIds, question.id],
    updatedAt: new Date().toISOString(),
  }
}

/**
 * 현재 질문 클리어 (다음 질문 대기 상태).
 */
export function clearCurrentQuestion(state: AgentState): AgentState {
  return {
    ...state,
    currentQuestion: null,
    updatedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────
// 헬퍼: 상태 변경
// ─────────────────────────────────────────

export function setStatus(state: AgentState, status: AgentStatus): AgentState {
  return {
    ...state,
    status,
    updatedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────
// 헬퍼: Intent 업데이트
// ─────────────────────────────────────────

export function setIntent(
  state: AgentState,
  intent: PartialPlanningIntent,
): AgentState {
  return {
    ...state,
    intent,
    updatedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────
// 디버그/관리
// ─────────────────────────────────────────

/**
 * 모든 세션 클리어 (테스트용).
 */
export function clearAllSessions(): void {
  sessions.clear()
}

/**
 * 세션 수 반환.
 */
export function getSessionCount(): number {
  return sessions.size
}

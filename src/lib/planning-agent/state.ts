/**
 * Planning Agent — State Store (In-Memory + DB 영속화)
 *
 * Phase 1: 메모리 기반 세션 저장소 (빠른 읽기/쓰기).
 * Phase 2: DB 동기화 레이어 — 매 턴 후 DB에 저장, 세션 resume 지원.
 *
 * 패턴: write-through — 메모리에 먼저 쓰고, 비동기로 DB에 동기화.
 */

import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
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
// 메모리 저장소 (빠른 액세스용, DB가 source of truth)
// ─────────────────────────────────────────

const sessions = new Map<string, AgentState>()

// ─────────────────────────────────────────
// AgentStatus ↔ Prisma enum 매핑
// ─────────────────────────────────────────
const STATUS_TO_DB: Record<AgentStatus, string> = {
  idle: 'IDLE',
  preprocessing: 'PREPROCESSING',
  interviewing: 'INTERVIEWING',
  synthesizing: 'SYNTHESIZING',
  completed: 'COMPLETED',
  paused: 'PAUSED',
}

const DB_TO_STATUS: Record<string, AgentStatus> = {
  IDLE: 'idle',
  PREPROCESSING: 'preprocessing',
  INTERVIEWING: 'interviewing',
  SYNTHESIZING: 'synthesizing',
  COMPLETED: 'completed',
  PAUSED: 'paused',
}

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
    followupCountByQuestion: {},
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

/**
 * 특정 질문의 재질문 카운트 증가.
 */
export function incrementFollowupCount(
  state: AgentState,
  questionId: string,
): AgentState {
  return {
    ...state,
    followupCountByQuestion: {
      ...state.followupCountByQuestion,
      [questionId]: (state.followupCountByQuestion[questionId] ?? 0) + 1,
    },
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

// ═════════════════════════════════════════
// DB 영속화 (Phase 2)
// ═════════════════════════════════════════

/**
 * AgentState를 DB에 저장 (upsert).
 * 매 턴 후 호출하여 DB를 최신 상태로 유지.
 * 실패해도 인메모리 상태는 유지 — 다음 턴에서 재시도.
 */
export async function persistSession(state: AgentState): Promise<void> {
  try {
    const dbStatus = STATUS_TO_DB[state.status] ?? 'IDLE'
    const completeness = state.intent.metadata?.completeness ?? 0
    const turnsCompleted = state.intent.metadata?.turnsCompleted ?? state.history.filter(m => m.role === 'user').length

    await prisma.agentSession.upsert({
      where: { id: state.sessionId },
      create: {
        id: state.sessionId,
        projectId: state.projectId ?? null,
        channel: state.intent.channel?.type ?? 'bid',
        status: dbStatus as any,
        stateJson: state as any,
        turnsCompleted,
        completeness,
      },
      update: {
        status: dbStatus as any,
        stateJson: state as any,
        turnsCompleted,
        completeness,
      },
    })

    // 완료 시 PlanningIntentRecord도 저장/업데이트
    if (state.status === 'completed' && state.intent) {
      await prisma.planningIntentRecord.upsert({
        where: { sessionId: state.sessionId },
        create: {
          sessionId: state.sessionId,
          projectId: state.projectId ?? null,
          intentJson: state.intent as any,
          completeness,
          confidence: state.intent.metadata?.confidence ?? 'low',
        },
        update: {
          intentJson: state.intent as any,
          completeness,
          confidence: state.intent.metadata?.confidence ?? 'low',
          version: { increment: 1 },
        },
      })
    }
  } catch (err) {
    console.error('[persistSession] DB 저장 실패 (인메모리는 유지):', err)
  }
}

/**
 * DB에서 세션을 로드 (resume 용).
 * 메모리에 없으면 DB에서 가져와 메모리에 캐시.
 */
export async function loadSession(sessionId: string): Promise<AgentState | null> {
  // 메모리에 있으면 바로 반환
  const cached = sessions.get(sessionId)
  if (cached) return cached

  // DB에서 로드
  try {
    const row = await prisma.agentSession.findUnique({
      where: { id: sessionId },
    })
    if (!row?.stateJson) return null

    const state = row.stateJson as unknown as AgentState
    // DB status를 AgentStatus로 역매핑
    state.status = DB_TO_STATUS[row.status] ?? 'preprocessing'
    // 메모리에 캐시
    sessions.set(sessionId, state)
    return state
  } catch (err) {
    console.error('[loadSession] DB 로드 실패:', err)
    return null
  }
}

/**
 * 프로젝트별 세션 목록 조회 (최근 순).
 */
export async function listSessionsFromDb(projectId?: string): Promise<Array<{
  id: string
  channel: string
  status: string
  completeness: number
  turnsCompleted: number
  createdAt: Date
  updatedAt: Date
}>> {
  try {
    const where = projectId ? { projectId } : {}
    return await prisma.agentSession.findMany({
      where,
      select: {
        id: true,
        channel: true,
        status: true,
        completeness: true,
        turnsCompleted: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    })
  } catch (err) {
    console.error('[listSessionsFromDb] 실패:', err)
    return []
  }
}

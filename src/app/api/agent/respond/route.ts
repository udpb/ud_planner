/**
 * POST /api/agent/respond
 *
 * 진행 중인 Agent 세션에 사용자 답변 전달.
 *
 * Stateless: 클라이언트가 state를 통째로 가지고 매 요청에 포함한다.
 * → Next.js dev Fast Refresh로 인한 in-memory Map 리셋 문제 해결
 * → Phase 2+ DB 영구화에도 자연스럽게 연결됨
 *
 * Request:
 *   {
 *     state: AgentState               // 이전 턴의 state 전체
 *     userMessage?: string            // 사용자 답변
 *     skipCurrentQuestion?: boolean   // 현재 질문 건너뛰기
 *   }
 *
 * Response:
 *   {
 *     state: AgentState
 *     agentMessage: Message
 *     isComplete: boolean
 *     finalIntent?: PlanningIntent  // 완료 시
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { runAgentTurn } from '@/lib/planning-agent/agent'
import { persistSession } from '@/lib/planning-agent/state'
import type { AgentState } from '@/lib/planning-agent/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { state, userMessage, skipCurrentQuestion } = body as {
      state: AgentState
      userMessage?: string
      skipCurrentQuestion?: boolean
    }

    if (!state || !state.sessionId) {
      return NextResponse.json(
        { error: 'state가 필요합니다 (sessionId, intent, history 포함)' },
        { status: 400 },
      )
    }

    if (!userMessage && !skipCurrentQuestion) {
      return NextResponse.json(
        { error: 'userMessage 또는 skipCurrentQuestion 중 하나가 필요합니다' },
        { status: 400 },
      )
    }

    if (state.status === 'completed') {
      return NextResponse.json(
        { error: '이 세션은 이미 완료되었습니다' },
        { status: 409 },
      )
    }

    const result = await runAgentTurn({
      state,
      userMessage,
      skipCurrentQuestion,
    })

    // DB에 세션 영속화 (매 턴 후)
    persistSession(result.state).catch(() => {})

    return NextResponse.json({
      state: result.state,
      agentMessage: result.agentMessage,
      isComplete: result.isComplete,
      finalIntent: result.finalIntent,
    })
  } catch (err: any) {
    console.error('[POST /api/agent/respond] error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Agent 응답 실패' },
      { status: 500 },
    )
  }
}

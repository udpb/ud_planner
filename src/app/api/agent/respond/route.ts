/**
 * POST /api/agent/respond
 *
 * 진행 중인 Agent 세션에 사용자 답변 전달.
 *
 * Request:
 *   {
 *     sessionId: string
 *     userMessage?: string         // 사용자 답변
 *     skipCurrentQuestion?: boolean // 현재 질문 건너뛰기
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
import { getSession } from '@/lib/planning-agent/state'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, userMessage, skipCurrentQuestion } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId가 필요합니다' }, { status: 400 })
    }

    if (!userMessage && !skipCurrentQuestion) {
      return NextResponse.json(
        { error: 'userMessage 또는 skipCurrentQuestion 중 하나가 필요합니다' },
        { status: 400 },
      )
    }

    const state = getSession(sessionId)
    if (!state) {
      return NextResponse.json(
        { error: `세션을 찾을 수 없습니다: ${sessionId}` },
        { status: 404 },
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

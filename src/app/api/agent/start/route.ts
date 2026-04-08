/**
 * POST /api/agent/start
 *
 * 새 Agent 세션을 시작한다.
 *
 * Request:
 *   {
 *     channel: 'bid' | 'lead' | 'renewal'
 *     // bid 모드:
 *     rfpText?: string
 *     // lead 모드:
 *     leadData?: { ... LeadContext fields ... }
 *     // renewal 모드:
 *     renewalData?: { ... RenewalContext fields ... }
 *
 *     meta?: { source?, sourceDetail?, assignedPm? }
 *   }
 *
 * Response:
 *   {
 *     sessionId: string
 *     state: AgentState
 *     agentMessage: Message
 *     isComplete: boolean
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { runAgentTurn } from '@/lib/planning-agent/agent'
import type { ChannelInput } from '@/lib/planning-agent/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { channel, rfpText, leadData, renewalData, meta = {} } = body

    if (!channel || !['bid', 'lead', 'renewal'].includes(channel)) {
      return NextResponse.json(
        { error: "channel은 'bid', 'lead', 'renewal' 중 하나여야 합니다" },
        { status: 400 },
      )
    }

    // 채널별 입력 검증 + 빌드
    let channelInput: ChannelInput
    if (channel === 'bid') {
      if (!rfpText || rfpText.trim().length < 100) {
        return NextResponse.json(
          { error: 'bid 모드에는 rfpText가 필요합니다 (최소 100자)' },
          { status: 400 },
        )
      }
      channelInput = { channel: 'bid', rfpText, meta }
    } else if (channel === 'lead') {
      if (!leadData || !leadData.clientName) {
        return NextResponse.json(
          { error: 'lead 모드에는 leadData (clientName 포함)가 필요합니다' },
          { status: 400 },
        )
      }
      channelInput = { channel: 'lead', leadData, meta }
    } else {
      // renewal
      if (!renewalData || !renewalData.previousProjectName) {
        return NextResponse.json(
          { error: 'renewal 모드에는 renewalData (previousProjectName 포함)가 필요합니다' },
          { status: 400 },
        )
      }
      channelInput = { channel: 'renewal', renewalData, meta }
    }

    const result = await runAgentTurn({ channelInput })

    return NextResponse.json({
      sessionId: result.state.sessionId,
      state: result.state,
      agentMessage: result.agentMessage,
      isComplete: result.isComplete,
      finalIntent: result.finalIntent,
    })
  } catch (err: any) {
    console.error('[POST /api/agent/start] error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Agent 시작 실패' },
      { status: 500 },
    )
  }
}

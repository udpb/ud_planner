/**
 * /agent-test
 *
 * Planning Agent 격리 테스트 페이지.
 * RFP 텍스트를 paste → Agent와 대화 → 최종 PlanningIntent 확인.
 *
 * Phase 1.5의 사용자 검증 시점.
 */

import { AgentChatUI } from './agent-chat-ui'

export const metadata = {
  title: 'Planning Agent — 격리 테스트',
}

export default function AgentTestPage() {
  return <AgentChatUI />
}

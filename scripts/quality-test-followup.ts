/**
 * 꼬리질문 발동 테스트 — 짧지만 정보가 있는 답변으로 테스트.
 * "worthDigging=true" 가 발동되어 깊이 파고드는지 확인.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const envPath = path.join(process.cwd(), '.env')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  const k = t.slice(0, eq).trim()
  let v = t.slice(eq + 1).trim()
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

import { runAgentTurn } from '../src/lib/planning-agent/agent'
import type { AgentState, AgentTurnOutput } from '../src/lib/planning-agent/types'

const RFP = `계원예술대학교 세대융합창업 프로그램 운영 과업지시서.
과업예산: 6000만원(VAT포함). 기간: 2025.11~12월. 대상: 청년(만39세이하)+시니어(만50세이상).
5~6주 프로그램. 필수요건: 5천만원이상 단일사업 운영 실적.
우대: 자체 콘텐츠, 글로벌 네트워크, 코치풀, ESG 경험.`

// 의도적으로 짧지만 흥미로운 실마리가 있는 답변
const SHALLOW_ANSWERS = [
  '50플러스재단 사업 경험이 있어서 참여하기로 했음',  // → 꼬리: "그 경험에서 구체적으로 뭘 배웠나?"
  '대학이니까 보고서가 중요할 듯',                    // → 꼬리: "어떤 보고서? 정량? 정성?"
  '팀이 깨지면 안 됨',                               // → 꼬리: "구체적으로 어떤 상황에서 깨질 위험?"
  '상상우리가 경쟁사',                                // → 꼬리: "그들 대비 우리 강점은?"
  '모객이 어려울 수 있음',                            // → 꼬리: "왜? 어떤 채널 문제?"
  '담당자가 꼼꼼한 편',                               // → 꼬리: "어떻게 아는지?"
  '시니어 인턴십 해본 적 있음',                        // → 꼬리: "결과는? 교훈은?"
]

async function main() {
  console.log('🔍 꼬리질문 발동 테스트 (짧은 답변)\n')
  const t0 = Date.now()

  let output = await runAgentTurn({
    channelInput: { channel: 'bid', rfpText: RFP, meta: {} },
  })
  let state: AgentState = output.state
  console.log('✅ 세션 시작\n')

  let answerIdx = 0
  let deepFollowupCount = 0
  let weakFollowupCount = 0
  let totalTurns = 0

  while (!output.isComplete && totalTurns < 20) {
    // Agent의 메시지 출력 (마지막 메시지)
    const lastMsg = state.history[state.history.length - 1]
    if (lastMsg?.role === 'agent') {
      const isFollowup = lastMsg.content.includes('한 가지 더') || lastMsg.content.includes('다른 각도')
      const tag = isFollowup ? '  🔄' : '  📝'
      console.log(`${tag} Agent: ${lastMsg.content.slice(0, 120)}...`)
    }

    // 답변
    const answer = answerIdx < SHALLOW_ANSWERS.length
      ? SHALLOW_ANSWERS[answerIdx]
      : '잘 모르겠음'

    console.log(`  💬 PM: "${answer}"`)

    output = await runAgentTurn({ state, userMessage: answer })
    state = output.state
    totalTurns++

    // 꼬리질문 감지
    const newMsg = state.history[state.history.length - 1]
    if (newMsg?.role === 'agent') {
      if (newMsg.content.includes('한 가지 더')) {
        deepFollowupCount++
        console.log(`  ✨ 꼬리질문 발동!`)
        // 꼬리질문에는 같은 인덱스의 답변 + 약간 더 구체적으로
        continue // answerIdx를 증가시키지 않음
      }
      if (newMsg.content.includes('다른 각도')) {
        weakFollowupCount++
        console.log(`  ⚠️ 빈약 재질문 발동`)
      }
    }
    answerIdx++
    console.log('')
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`📊 결과`)
  console.log(`총 턴: ${totalTurns}`)
  console.log(`꼬리질문 발동: ${deepFollowupCount}회 (worthDigging)`)
  console.log(`빈약 재질문 발동: ${weakFollowupCount}회 (needsFollowup)`)
  console.log(`완전성: ${state.intent.metadata.completeness}/100`)
  console.log(`소요: ${((Date.now() - t0) / 1000).toFixed(1)}초`)

  // 채워진 슬롯 확인
  const ctx = state.intent.strategicContext
  for (const [k, v] of Object.entries(ctx)) {
    const val = Array.isArray(v) ? v.join(' / ') : String(v ?? '')
    const hasAppend = val.includes('[추가 — 꼬리질문 답변]')
    console.log(`  ${hasAppend ? '✨' : '·'} ${k}: ${val.slice(0, 100)}${val.length > 100 ? '...' : ''}`)
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })

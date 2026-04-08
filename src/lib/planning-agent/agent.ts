/**
 * Planning Agent — Main Loop
 *
 * runAgentTurn(input) → output
 *
 * 3가지 시나리오:
 * 1. 새 세션 시작 (channelInput 전달) → 채널 전처리 → 첫 질문 생성
 * 2. 사용자 답변 (state + userMessage) → 슬롯 추출 → 다음 질문 or 종료
 * 3. 질문 스킵 (state + skipCurrentQuestion) → 다음 질문
 */

import type {
  AgentState,
  AgentTurnInput,
  AgentTurnOutput,
  Message,
  PartialPlanningIntent,
  PlanningIntent,
  Question,
  ChannelInput,
} from './types'
import { preprocessChannelInput } from './channel-preprocessors'
import {
  createSession,
  appendMessage,
  createMessage,
  setCurrentQuestion,
  clearCurrentQuestion,
  setStatus,
  setIntent,
  updateSession,
} from './state'
import {
  decideNextQuestion,
  extractSlotFromAnswer,
  synthesizeStrategy,
  generateFollowupQuestion,
} from './tools'
import {
  updateIntentSlot,
  updateIntentSlots,
  isInterviewComplete,
  finalizeIntent,
  incrementTurn,
} from './intent-schema'

// ─────────────────────────────────────────
// 메인 함수
// ─────────────────────────────────────────

/**
 * Agent의 한 턴을 진행한다.
 *
 * - 새 세션: channelInput만 전달 → 채널 전처리 → 첫 질문 메시지 반환
 * - 답변 처리: state + userMessage → 슬롯 추출 → 다음 질문 or 종료
 * - 스킵: state + skipCurrentQuestion → 다음 질문
 */
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnOutput> {
  // ── 시나리오 1: 새 세션 시작 ──────────────────────────────
  if (!input.state) {
    if (!input.channelInput) {
      throw new Error('[runAgentTurn] 새 세션을 시작하려면 channelInput이 필요합니다')
    }
    return startNewSession(input.channelInput, input.projectId)
  }

  let state = input.state

  // ── 시나리오 3: 질문 스킵 ─────────────────────────────────
  if (input.skipCurrentQuestion) {
    return await progressToNextQuestion(state, '(건너뜀)')
  }

  // ── 시나리오 2: 사용자 답변 처리 ──────────────────────────
  if (input.userMessage) {
    return await processUserAnswer(state, input.userMessage)
  }

  throw new Error('[runAgentTurn] userMessage 또는 skipCurrentQuestion 중 하나가 필요합니다')
}

// ─────────────────────────────────────────
// 시나리오 1: 새 세션 시작
// ─────────────────────────────────────────

async function startNewSession(
  channelInput: ChannelInput,
  projectId?: string,
): Promise<AgentTurnOutput> {
  // 1. 채널 전처리 (RFP 파싱, 리드 폼 처리, renewal 데이터 처리)
  const intent = await preprocessChannelInput(channelInput)

  // 2. 세션 생성
  let state = createSession(intent, { projectId, status: 'preprocessing' })

  // 3. 첫 안내 메시지 (Agent가 PM에게 인사 + 채널 확인)
  const welcomeContent = buildWelcomeMessage(intent)
  const welcomeMsg = createMessage('agent', welcomeContent)
  state = appendMessage(state, welcomeMsg)

  // 4. 첫 질문 결정
  const firstQuestion = decideNextQuestion(intent, state.askedQuestionIds)
  if (!firstQuestion) {
    // 질문이 없으면 (드물지만) 바로 종료
    return await finalizeAndComplete(state)
  }

  // 5. 첫 질문 메시지 생성
  const questionMsg = buildQuestionMessage(firstQuestion, intent.channel.type)
  state = appendMessage(state, questionMsg)
  state = setCurrentQuestion(state, firstQuestion)
  state = setStatus(state, 'interviewing')
  state = updateSession(state)

  return {
    state,
    agentMessage: questionMsg,
    isComplete: false,
  }
}

// ─────────────────────────────────────────
// 시나리오 2: 사용자 답변 처리
// ─────────────────────────────────────────

async function processUserAnswer(
  state: AgentState,
  userMessage: string,
): Promise<AgentTurnOutput> {
  // 현재 질문을 로컬 변수로 캡처 (state 재할당으로 인한 narrowing 손실 방지)
  const currentQuestion = state.currentQuestion
  if (!currentQuestion) {
    throw new Error('[processUserAnswer] currentQuestion이 없습니다 — 답변할 질문이 없음')
  }

  const channel = state.intent.channel.type

  // 1. 사용자 메시지 저장
  const userMsg = createMessage('user', userMessage, {
    questionId: currentQuestion.id,
  })
  state = appendMessage(state, userMsg)

  // 2. Claude로 답변에서 슬롯 추출
  let extraction
  try {
    extraction = await extractSlotFromAnswer(
      currentQuestion,
      userMessage,
      channel,
      state.intent,
    )
  } catch (err: any) {
    // 추출 실패 — 일단 PM 답변 그대로 슬롯에 저장하고 진행
    console.error('[Agent] Slot extraction failed:', err.message)
    const newIntent = updateIntentSlot(
      state.intent,
      currentQuestion.slot,
      userMessage as any,
    )
    state = setIntent(state, newIntent)
    return await progressToNextQuestion(state, userMessage)
  }

  // 3. 답변 품질 평가 — 너무 빈약하면 재질문
  const isAnswerTooWeak =
    !extraction.quality.hasSubstance &&
    extraction.quality.needsFollowup &&
    state.askedQuestionIds.filter((id) => id === currentQuestion.id).length < 2 // 같은 질문 2번 이상은 안 함

  if (isAnswerTooWeak) {
    return await askFollowup(state, userMessage)
  }

  // 4. 슬롯 업데이트 (primary + secondary 모두)
  const updates: Partial<typeof state.intent.strategicContext> = {}
  if (extraction.primaryValue) {
    if (currentQuestion.slot === 'riskFactors') {
      // 배열 필드는 split 처리
      updates.riskFactors = parseArrayValue(extraction.primaryValue)
    } else {
      updates[currentQuestion.slot] = extraction.primaryValue as any
    }
  }
  for (const sec of extraction.secondarySlots ?? []) {
    if (sec.confidence === 'low') continue
    if (sec.slot === 'riskFactors') {
      updates.riskFactors = [...(updates.riskFactors ?? []), ...parseArrayValue(sec.value)]
    } else {
      // primary가 이미 있으면 덮어쓰지 않음
      if (!updates[sec.slot]) {
        updates[sec.slot] = sec.value as any
      }
    }
  }

  const newIntent = updateIntentSlots(state.intent, updates)
  state = setIntent(state, newIntent)

  // 5. 다음 질문 또는 종료
  return await progressToNextQuestion(state, userMessage)
}

// ─────────────────────────────────────────
// 시나리오 3: 다음 질문으로 진행
// ─────────────────────────────────────────

async function progressToNextQuestion(
  state: AgentState,
  _lastUserMessage: string,
): Promise<AgentTurnOutput> {
  // 인터뷰 완료 체크
  if (isInterviewComplete(state.intent.strategicContext)) {
    return await finalizeAndComplete(state)
  }

  // 다음 질문 결정
  const nextQuestion = decideNextQuestion(state.intent, state.askedQuestionIds)
  if (!nextQuestion) {
    // 더 물을 게 없음 → 종료
    return await finalizeAndComplete(state)
  }

  // 다음 질문 메시지 생성
  const channel = state.intent.channel.type
  const questionMsg = buildQuestionMessage(nextQuestion, channel)
  state = clearCurrentQuestion(state)
  state = appendMessage(state, questionMsg)
  state = setCurrentQuestion(state, nextQuestion)
  state = updateSession(state)

  return {
    state,
    agentMessage: questionMsg,
    isComplete: false,
  }
}

// ─────────────────────────────────────────
// 재질문 생성 (답변이 모호할 때)
// ─────────────────────────────────────────

async function askFollowup(
  state: AgentState,
  userAnswer: string,
): Promise<AgentTurnOutput> {
  const currentQuestion = state.currentQuestion
  if (!currentQuestion) {
    return await progressToNextQuestion(state, userAnswer)
  }

  try {
    const followup = await generateFollowupQuestion(
      currentQuestion,
      userAnswer,
      state.intent.channel.type,
    )
    const followupMsg = createMessage(
      'agent',
      `답변이 조금 더 구체적이면 좋겠어요. 다른 각도로 여쭤볼게요:\n\n${followup.followupQuestion}`,
      { questionId: currentQuestion.id },
    )
    state = appendMessage(state, followupMsg)
    state = updateSession(state)
    return {
      state,
      agentMessage: followupMsg,
      isComplete: false,
    }
  } catch (err: any) {
    // 재질문 생성 실패 → 그냥 다음 질문으로
    console.error('[Agent] Followup generation failed:', err.message)
    return await progressToNextQuestion(state, userAnswer)
  }
}

// ─────────────────────────────────────────
// 인터뷰 완료 처리
// ─────────────────────────────────────────

async function finalizeAndComplete(state: AgentState): Promise<AgentTurnOutput> {
  state = setStatus(state, 'synthesizing')
  state = updateSession(state)

  // derivedStrategy 종합 (Claude 호출)
  let derivedStrategy
  try {
    derivedStrategy = await synthesizeStrategy(state.intent)
  } catch (err: any) {
    console.error('[Agent] Strategy synthesis failed:', err.message)
    // 실패해도 빈 전략으로 종료
    derivedStrategy = {
      keyMessages: [],
      differentiators: [],
      coachProfile: '',
      sectionVBonus: [],
      riskMitigation: [],
    }
  }

  const finalIntent: PartialPlanningIntent = {
    ...state.intent,
    derivedStrategy,
  }
  state = setIntent(state, finalIntent)
  state = setStatus(state, 'completed')
  state = clearCurrentQuestion(state)

  // 완료 메시지
  const completionMsg = createMessage(
    'agent',
    buildCompletionMessage(finalIntent),
  )
  state = appendMessage(state, completionMsg)
  state = updateSession(state)

  // 완전한 PlanningIntent로 finalize
  let fullIntent: PlanningIntent | undefined
  try {
    fullIntent = finalizeIntent(finalIntent)
  } catch (err: any) {
    console.error('[Agent] Finalize failed:', err.message)
  }

  return {
    state,
    agentMessage: completionMsg,
    isComplete: true,
    finalIntent: fullIntent,
  }
}

// ─────────────────────────────────────────
// 메시지 빌더들
// ─────────────────────────────────────────

function buildWelcomeMessage(intent: PartialPlanningIntent): string {
  const channel = intent.channel.type
  const channelLabel = {
    bid: '나라장터 입찰',
    lead: 'B2B 영업 리드',
    renewal: '연속 사업',
  }[channel]

  let projectName = ''
  if (intent.bidContext) projectName = intent.bidContext.rfpFacts.projectName
  else if (intent.leadContext) projectName = intent.leadContext.clientName
  else if (intent.renewalContext) projectName = intent.renewalContext.previousProjectName

  return `안녕하세요. 언더독스 사업 기획 공동기획자입니다.

[${channelLabel}] **${projectName}** 사업의 기획을 도와드리겠습니다.

이제부터 7개 정도의 핵심 질문을 드릴 거예요. 각 질문에 자유롭게 답변해주시면 됩니다. 답변이 어려우면 "잘 모름"이라고 답하셔도 OK — 다른 각도로 다시 물어볼게요.

목표는 "PM이 충분히 고민하고 구조적으로 끄집어낼 수 있도록" 도와드리는 거예요. 시작하겠습니다.`
}

function buildQuestionMessage(question: Question, channel: PartialPlanningIntent['channel']['type']): Message {
  const prompt = question.prompt[channel]
  const examples = question.examples[channel]

  let content = prompt + '\n'

  if (examples && examples.length > 0) {
    content += '\n💡 답변 예시:\n'
    examples.forEach((ex, i) => {
      content += `   ${i + 1}. ${ex}\n`
    })
  }

  content += `\n📏 ${question.lengthGuide}`

  return createMessage('agent', content, { questionId: question.id })
}

function buildCompletionMessage(intent: PartialPlanningIntent): string {
  const completeness = intent.metadata.completeness
  const turns = intent.metadata.turnsCompleted

  let summary = `인터뷰가 완료되었습니다. 🎯\n\n`
  summary += `📊 **결과 요약**\n`
  summary += `- 진행 턴: ${turns}회\n`
  summary += `- 완전성: ${completeness}/100 (${intent.metadata.confidence})\n`

  if (intent.derivedStrategy) {
    const ds = intent.derivedStrategy
    if (ds.keyMessages.length > 0) {
      summary += `\n🔑 **도출된 키 메시지** (${ds.keyMessages.length}개)\n`
      ds.keyMessages.slice(0, 3).forEach((m, i) => {
        summary += `   ${i + 1}. ${m}\n`
      })
    }
    if (ds.coachProfile) {
      summary += `\n👤 **이상적 코치 프로필**\n   ${ds.coachProfile}\n`
    }
    if (ds.sectionVBonus.length > 0) {
      summary += `\n🎁 **추가 제안 아이디어** (${ds.sectionVBonus.length}개)\n`
      ds.sectionVBonus.slice(0, 3).forEach((b, i) => {
        summary += `   ${i + 1}. ${b}\n`
      })
    }
  }

  summary += `\n이 결과는 코치 추천 + 제안서 생성에 활용됩니다.`
  return summary
}

// ─────────────────────────────────────────
// 헬퍼: 배열 필드 파싱
// ─────────────────────────────────────────

function parseArrayValue(value: string | string[]): string[] {
  if (Array.isArray(value)) return value
  // "1) ... 2) ..." 또는 "- ... - ..." 형식 시도
  const splits = value
    .split(/[\n,]|(?:\d+[).]|[-•])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
  return splits.length > 0 ? splits : [value]
}

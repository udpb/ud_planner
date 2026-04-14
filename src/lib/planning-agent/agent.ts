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
  incrementFollowupCount,
} from './state'
import {
  decideNextQuestion,
  extractSlotFromAnswer,
  synthesizeStrategy,
  generateFollowupQuestion,
  generateDynamicQuestions,
} from './tools'
import {
  updateIntentSlot,
  updateIntentSlots,
  finalizeIntent,
  incrementTurn,
} from './intent-schema'
import { buildRfpIntelligenceBrief } from './prompts'

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

  // 2.5. RFP 기반 동적 질문 생성 — 백그라운드에서 실행 (첫 응답 속도 최적화)
  // 고정 질문으로 먼저 시작하고, 동적 질문은 다음 턴부터 적용
  generateDynamicQuestions(intent).then((dynamicPrompts) => {
    if (Object.keys(dynamicPrompts).length > 0) {
      const current = state
      updateSession({ ...current, dynamicQuestionPrompts: dynamicPrompts })
    }
  }).catch(() => {})

  // 3. 첫 안내 메시지 (Agent가 PM에게 인사 + RFP 분석 공유)
  const welcomeContent = buildWelcomeMessage(intent)
  const welcomeMsg = createMessage('agent', welcomeContent)
  state = appendMessage(state, welcomeMsg)

  // 4. 첫 질문 결정
  const firstQuestion = decideNextQuestion(intent, state.askedQuestionIds)
  if (!firstQuestion) {
    // 질문이 없으면 (드물지만) 바로 종료
    return await finalizeAndComplete(state)
  }

  // 5. 첫 질문 메시지 생성 (RFP 맥락 주입)
  const questionMsg = buildQuestionMessage(firstQuestion, state)
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

  // 3. 답변 품질 평가 — 너무 빈약하면 재질문 (단, 1번까지만)
  const followupCount = state.followupCountByQuestion[currentQuestion.id] ?? 0
  const isAnswerTooWeak =
    !extraction.quality.hasSubstance &&
    extraction.quality.needsFollowup &&
    followupCount < 1 // 1번 재질문 후엔 그대로 받아들이기

  if (isAnswerTooWeak) {
    return await askFollowup(state, userMessage)
  }

  // hasSubstance가 false라도 followupCount >= 1이면 그대로 진행 (무한 askFollowup 방지)
  // → 빈 슬롯으로 진행되며, 나중에 derivedStrategy 종합 시 빈 슬롯은 무시

  // 4. 슬롯 업데이트
  // - primary: 항상 저장 (단, hasSubstance=false면 빈약한 답변이라 슬롯 안 채움)
  // - secondary: confidence='high'만 받음 (PM 깊이 있는 사고를 위해 명시적 질문은 한 번씩 다 던져야 함)
  const updates: Partial<typeof state.intent.strategicContext> = {}

  // LLM이 list형 슬롯(riskFactors)에서 string 대신 array를 반환할 수 있음
  // → primaryValue/secondaryValue를 안전하게 string으로 정규화
  const primaryValueStr = normalizeToString(extraction.primaryValue)

  // primary 처리: hasSubstance=true 이거나, 이미 1번 재질문 후 (followupCount >= 1) 인 경우만 저장
  // → "잘 모름" 류의 빈약한 답변이 슬롯에 저장되는 것 방지
  const shouldStorePrimary =
    primaryValueStr.trim().length >= 5 &&
    (extraction.quality.hasSubstance || followupCount >= 1)

  if (shouldStorePrimary) {
    if (currentQuestion.slot === 'riskFactors') {
      // 꼬리질문 후 답변이면 기존 배열에 추가
      const existing = state.intent.strategicContext.riskFactors ?? []
      updates.riskFactors = [...existing, ...parseArrayValue(primaryValueStr)]
    } else {
      // 꼬리질문 후 답변이면 기존 값에 append (구분선으로)
      const existingVal = (state.intent.strategicContext as any)[currentQuestion.slot]
      if (followupCount >= 1 && existingVal && typeof existingVal === 'string' && existingVal.trim().length > 5) {
        updates[currentQuestion.slot] = `${existingVal}\n\n[추가 — 꼬리질문 답변]\n${primaryValueStr}` as any
      } else {
        updates[currentQuestion.slot] = primaryValueStr as any
      }
    }
  }

  // secondary 처리: confidence='high'만, 그리고 의미 있는 길이일 때만
  for (const sec of extraction.secondarySlots ?? []) {
    if (sec.confidence !== 'high') continue
    const secValueStr = normalizeToString(sec.value)
    if (secValueStr.trim().length < 10) continue
    if (sec.slot === 'riskFactors') {
      updates.riskFactors = [...(updates.riskFactors ?? []), ...parseArrayValue(secValueStr)]
    } else {
      if (!updates[sec.slot]) {
        updates[sec.slot] = secValueStr as any
      }
    }
  }

  const newIntent = updateIntentSlots(state.intent, updates)
  state = setIntent(state, newIntent)

  // 5. 꼬리질문 — 답변이 있지만 더 파면 가치 있을 때 (1회 한도)
  const shouldDeepDig =
    extraction.quality.worthDigging &&
    extraction.quality.hasSubstance &&
    extraction.quality.deepFollowupQuestion &&
    followupCount < 1 // weak followup과 같은 카운터 공유 — 질문당 총 1회

  if (shouldDeepDig) {
    return await askDeepFollowup(state, extraction.quality.deepFollowupQuestion!, currentQuestion)
  }

  // 6. 다음 질문 또는 종료 (전략적 반응을 extraction에서 가져와서 전달 — 추가 API 호출 없음)
  const reaction = extraction.strategicReaction ?? ''
  return await progressToNextQuestion(state, userMessage, reaction)
}

// ─────────────────────────────────────────
// 시나리오 3: 다음 질문으로 진행
// ─────────────────────────────────────────

async function progressToNextQuestion(
  state: AgentState,
  _lastUserMessage: string,
  reactionText?: string,
): Promise<AgentTurnOutput> {
  const nextQuestion = decideNextQuestion(state.intent, state.askedQuestionIds)
  if (!nextQuestion) {
    return await finalizeAndComplete(state)
  }

  // 다음 질문 메시지 생성
  const questionMsg = buildQuestionMessage(nextQuestion, state)

  // 전략적 반응이 있으면 질문 앞에 prepend (extraction에서 이미 생성됨 — 추가 API 호출 없음)
  if (reactionText) {
    questionMsg.content = reactionText + '\n\n---\n\n' + questionMsg.content
  }

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

  // 재질문 카운트 증가 (재질문 한도 추적용)
  state = incrementFollowupCount(state, currentQuestion.id)

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
// 꼬리질문 (답변이 있지만 더 파고들 가치가 있을 때)
// ─────────────────────────────────────────

async function askDeepFollowup(
  state: AgentState,
  deepQuestion: string,
  currentQuestion: Question,
): Promise<AgentTurnOutput> {
  // 카운트 증가 (weak followup과 공유 — 질문당 총 1회)
  state = incrementFollowupCount(state, currentQuestion.id)

  const followupMsg = createMessage(
    'agent',
    `좋은 포인트입니다. 여기서 한 가지 더 여쭤볼게요:\n\n${deepQuestion}`,
    { questionId: currentQuestion.id },
  )
  state = appendMessage(state, followupMsg)
  state = updateSession(state)

  return {
    state,
    agentMessage: followupMsg,
    isComplete: false,
  }
}

// ─────────────────────────────────────────
// 인터뷰 완료 처리
// ─────────────────────────────────────────

async function finalizeAndComplete(state: AgentState): Promise<AgentTurnOutput> {
  state = setStatus(state, 'synthesizing')
  state = updateSession(state)

  // derivedStrategy 종합 (LLM 호출 — 대화 원문 포함)
  let derivedStrategy
  try {
    derivedStrategy = await synthesizeStrategy(state.intent, state.history)
  } catch (err: any) {
    console.error('[Agent] Strategy synthesis failed:', err.message, err.status ?? '', JSON.stringify(err.error ?? '').slice(0, 300))
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

  // RFP 핵심 분석을 먼저 공유 — "먼저 제시"
  const rfpBrief = buildRfpIntelligenceBrief(intent)

  return `**${projectName}** 사업 RFP를 분석했습니다.

${rfpBrief}

---

위 분석을 바탕으로 수주 전략을 함께 잡아보겠습니다. 몇 가지 핵심 질문을 드릴 건데, 정답을 찾는 게 아니라 PM의 판단과 감을 끌어내는 게 목적이에요. 편하게 답변해주세요.`
}

function buildQuestionMessage(question: Question, state: AgentState): Message {
  const channel = state.intent.channel.type

  // 동적 질문이 있으면 사용, 없으면 고정 질문 fallback
  const dynamicPrompt = state.dynamicQuestionPrompts?.[question.slot]
  const prompt = dynamicPrompt || question.prompt[channel]
  const examples = question.examples[channel]

  let content = prompt + '\n'

  // 동적 질문에는 예시 생략 (이미 RFP 맥락이 포함됨)
  if (!dynamicPrompt && examples && examples.length > 0) {
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
  summary += `📊 **결과 요약** — ${turns}턴, 완전성 ${completeness}/100 (${intent.metadata.confidence})\n`

  if (intent.derivedStrategy) {
    const ds = intent.derivedStrategy

    // 포지셔닝
    if (ds.positioning?.oneLiner) {
      summary += `\n🎯 **포지셔닝**\n${ds.positioning.oneLiner}\n`
    }
    if (ds.positioning?.whyUnderdogs) {
      summary += `\n${ds.positioning.whyUnderdogs}\n`
    }

    // RFP 심층 분석
    if (ds.rfpAnalysis) {
      summary += `\n📋 **RFP 심층 분석**\n`
      if (ds.rfpAnalysis.clientIntentInference) {
        summary += `발주기관 의도: ${ds.rfpAnalysis.clientIntentInference}\n`
      }
      if (ds.rfpAnalysis.evalCriteriaStrategy) {
        summary += `\n평가배점 공략:\n`
        if (typeof ds.rfpAnalysis.evalCriteriaStrategy === 'string') {
          summary += `${ds.rfpAnalysis.evalCriteriaStrategy}\n`
        } else {
          ds.rfpAnalysis.evalCriteriaStrategy.forEach((e: any) => {
            summary += `  · ${e.item}(${e.score}점) → ${e.emphasis}\n`
          })
        }
      }
      if (ds.rfpAnalysis.hiddenRequirements?.length > 0) {
        summary += `\n숨은 요구: ${ds.rfpAnalysis.hiddenRequirements.join(' / ')}\n`
      }
    }

    // 커리큘럼 방향
    if (ds.curriculumDirection) {
      summary += `\n📚 **커리큘럼 방향**\n`
      summary += `설계 원칙: ${ds.curriculumDirection.designPrinciple}\n`
      if (ds.curriculumDirection.weeklyOutline?.length > 0) {
        ds.curriculumDirection.weeklyOutline.forEach((w) => {
          summary += `  [${w.week}] ${w.focus} — ${w.keyActivity}\n`
        })
      }
      if (ds.curriculumDirection.formatMix) {
        summary += `형태: ${ds.curriculumDirection.formatMix}\n`
      }
    }

    // 키 메시지
    if (ds.keyMessages.length > 0) {
      summary += `\n🔑 **키 메시지** (${ds.keyMessages.length}개)\n`
      ds.keyMessages.forEach((m, i) => {
        summary += `   ${i + 1}. ${m}\n`
      })
    }

    // 예산
    if (ds.budgetGuideline?.overallApproach) {
      summary += `\n💰 **예산 가이드**: ${ds.budgetGuideline.overallApproach}\n`
    }

    // 리스크 매트릭스
    if (ds.riskMatrix && ds.riskMatrix.length > 0) {
      summary += `\n⚠️ **리스크 매트릭스** (${ds.riskMatrix.length}개)\n`
      ds.riskMatrix.forEach((r) => {
        summary += `  · [${r.probability}/${r.impact}] ${r.risk} → ${r.mitigation.slice(0, 80)}\n`
      })
    }
  }

  summary += `\n이 결과는 코치 추천 + 제안서 생성에 활용됩니다.`
  return summary
}

// ─────────────────────────────────────────
// 헬퍼: LLM 응답 정규화
// ─────────────────────────────────────────

/**
 * LLM이 string 슬롯에 대해 array/object를 반환할 수 있음 (특히 list-like 의미일 때).
 * 안전하게 string으로 정규화. null/undefined는 빈 문자열.
 */
function normalizeToString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((v) => normalizeToString(v))
      .filter((s) => s.length > 0)
      .join(' / ')
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value)
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

/**
 * Planning Agent — Tools (Claude API 호출 함수들)
 *
 * Agent.ts가 호출하는 핵심 LLM 작업들.
 * 모두 비동기 함수, Claude Sonnet 4.6 사용.
 */

import { anthropic, CLAUDE_MODEL } from '@/lib/claude'
import type {
  PartialPlanningIntent,
  Question,
  SlotExtraction,
  DerivedStrategy,
  ProjectChannel,
  StrategicSlot,
  Message,
} from './types'
import { summarizeIntent } from './intent-schema'
import {
  buildSlotExtractionPrompt,
  buildSynthesisPrompt,
  buildFollowupSuggestionPrompt,
  buildRfpIntelligenceBrief,
} from './prompts'

// ─────────────────────────────────────────
// JSON 파싱 헬퍼 (claude.ts의 safeParseJson 패턴)
// ─────────────────────────────────────────

function safeParseJson<T>(raw: string, label: string): T {
  let s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  let start: number
  let end: number
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    start = arrStart
    end = s.lastIndexOf(']')
  } else {
    start = objStart
    end = s.lastIndexOf('}')
  }
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`[${label}] AI 응답에서 JSON을 찾을 수 없습니다. 응답 일부: ${s.slice(0, 200)}`)
  }
  s = s.slice(start, end + 1)
  try {
    return JSON.parse(s) as T
  } catch (e: any) {
    throw new Error(`[${label}] JSON 파싱 실패: ${e.message}`)
  }
}

// ─────────────────────────────────────────
// Tool 1: 사용자 답변에서 슬롯 추출
// ─────────────────────────────────────────

/**
 * 사용자가 자유 답변을 했을 때 → Claude로 슬롯 값 + 품질 평가 추출.
 */
export async function extractSlotFromAnswer(
  question: Question,
  userAnswer: string,
  channel: ProjectChannel,
  intent: PartialPlanningIntent,
): Promise<SlotExtraction> {
  const intentSummary = summarizeIntent(intent)
  const prompt = buildSlotExtractionPrompt(question, userAnswer, channel, intentSummary)

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    json_mode: true,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const raw = (msg.content[0] as any).text.trim()
  return safeParseJson<SlotExtraction>(raw, 'extractSlotFromAnswer')
}

// ─────────────────────────────────────────
// Tool 2: 재질문 생성 (답변이 모호할 때)
// ─────────────────────────────────────────

interface FollowupSuggestion {
  followupQuestion: string
  rationale: string
}

export async function generateFollowupQuestion(
  question: Question,
  userAnswer: string,
  channel: ProjectChannel,
): Promise<FollowupSuggestion> {
  const prompt = buildFollowupSuggestionPrompt(question, userAnswer, channel)

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    json_mode: true,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const raw = (msg.content[0] as any).text.trim()
  return safeParseJson<FollowupSuggestion>(raw, 'generateFollowupQuestion')
}

// ─────────────────────────────────────────
// Tool 3: derivedStrategy 종합
// ─────────────────────────────────────────

/**
 * 인터뷰가 충분히 진행됐을 때 → 전체 정보 종합 → 풍부한 DerivedStrategy 생성.
 * conversationHistory를 받아서 PM의 원문 뉘앙스까지 반영.
 */
export async function synthesizeStrategy(
  intent: PartialPlanningIntent,
  conversationHistory?: Message[],
): Promise<DerivedStrategy> {
  const prompt = buildSynthesisPrompt(intent, conversationHistory)

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 32000, // Pro: thinking ~20K + output ~12K = 32K 필요
    json_mode: true,   // Gemini JSON 모드 강제 — 마크다운 출력 방지
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const raw = (msg.content[0] as any).text.trim()
  const result = safeParseJson<DerivedStrategy>(raw, 'synthesizeStrategy')

  // 기본값 보정 (기존 필드 + 새 필드)
  return {
    keyMessages: result.keyMessages ?? [],
    differentiators: result.differentiators ?? [],
    coachProfile: result.coachProfile ?? '',
    sectionVBonus: result.sectionVBonus ?? [],
    riskMitigation: result.riskMitigation ?? [],
    rfpAnalysis: result.rfpAnalysis,
    positioning: result.positioning,
    curriculumDirection: result.curriculumDirection,
    evalStrategy: result.evalStrategy,
    budgetGuideline: result.budgetGuideline,
    riskMatrix: result.riskMatrix,
  }
}

// ─────────────────────────────────────────
// Tool 4: RFP 완전성 분석 (간단 휴리스틱)
// ─────────────────────────────────────────

/**
 * RFP 정보가 얼마나 완전한지 분석. Claude 호출 없이 휴리스틱.
 */
export function analyzeRfpCompleteness(intent: PartialPlanningIntent): {
  score: number
  missingFields: string[]
  warnings: string[]
} {
  const missingFields: string[] = []
  const warnings: string[] = []

  if (intent.channel.type !== 'bid' || !intent.bidContext) {
    return { score: 0, missingFields: ['(non-bid channel)'], warnings: [] }
  }

  const rfp = intent.bidContext.rfpFacts
  let score = 0
  const maxScore = 10

  if (rfp.projectName) score += 1
  else missingFields.push('projectName')
  if (rfp.client) score += 1
  else missingFields.push('client')
  if (rfp.totalBudgetVat || rfp.supplyPrice) score += 1
  else missingFields.push('budget')
  if (rfp.targetAudience && rfp.targetCount) score += 1
  else missingFields.push('target')
  if (rfp.objectives && rfp.objectives.length >= 2) score += 1
  else missingFields.push('objectives (2+)')
  if (rfp.evalCriteria && rfp.evalCriteria.length > 0) score += 2
  else missingFields.push('evalCriteria')
  if (rfp.eduStartDate && rfp.eduEndDate) score += 1
  else missingFields.push('eduDate')
  if (rfp.targetStage && rfp.targetStage.length > 0) score += 1
  else missingFields.push('targetStage')
  if (rfp.constraints && rfp.constraints.length > 0) score += 1
  else warnings.push('constraints not specified')

  return {
    score: Math.round((score / maxScore) * 100),
    missingFields,
    warnings,
  }
}

// ─────────────────────────────────────────
// Tool 5: 다음 질문 결정 (결정론적)
// ─────────────────────────────────────────

import { DEFAULT_QUESTION_ORDER, getQuestionForSlot } from './question-bank'
import { isSlotFilled } from './intent-schema'

/**
 * 다음에 물어볼 질문 결정.
 * Phase 1: 결정론적 — DEFAULT_QUESTION_ORDER 순서대로, 이미 *물어본* 질문만 스킵.
 *
 * 중요: secondary slot 추출로 슬롯이 채워졌더라도 명시적 질문은 한 번씩 다 던진다.
 * PM이 "이미 답변했음"이라고 답해도 상관없음 — 깊이 있는 사고 유도가 목적.
 *
 * Phase 2+: Claude 기반 동적 우선순위 가능.
 */
export function decideNextQuestion(
  intent: PartialPlanningIntent,
  askedQuestionIds: string[],
): Question | null {
  for (const slot of DEFAULT_QUESTION_ORDER) {
    const q = getQuestionForSlot(slot)
    if (!q) continue
    if (askedQuestionIds.includes(q.id)) continue
    return q
  }
  return null
}

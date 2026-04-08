/**
 * Planning Agent — Intent Schema Utilities (v2: 채널 인식)
 *
 * PlanningIntent의 생성, 검증, 완전성 계산을 담당하는 순수 함수.
 * side effect 없음 — 모두 deterministic.
 */

import type {
  PlanningIntent,
  PartialPlanningIntent,
  StrategicContext,
  StrategicSlot,
  IntentMetadata,
  ChannelMeta,
  BidContext,
  LeadContext,
  RenewalContext,
  ProjectChannel,
} from './types'
import { STRATEGIC_SLOTS } from './types'

// ─────────────────────────────────────────
// 슬롯별 가중치
// ─────────────────────────────────────────

/**
 * 각 슬롯이 기획 품질에 기여하는 정도. 합계 100.
 */
export const SLOT_WEIGHTS: Record<StrategicSlot, number> = {
  participationDecision: 20,   // 가장 중요 — 참여 결정 + 경쟁력
  clientHiddenWants: 20,       // 가장 중요 — 진짜 의도
  mustNotFail: 15,             // 실패 회피
  competitorWeakness: 15,      // 경쟁 차별화
  riskFactors: 10,
  decisionMakers: 10,
  pastSimilarProjects: 10,
}

/**
 * core 슬롯 — 인터뷰에서 반드시 다뤄야 할 것들.
 */
export const CORE_SLOTS: StrategicSlot[] = [
  'participationDecision',
  'clientHiddenWants',
  'mustNotFail',
  'competitorWeakness',
  'riskFactors',
  'decisionMakers',
]

// ─────────────────────────────────────────
// 빈 컨텍스트 생성
// ─────────────────────────────────────────

export function emptyStrategicContext(): StrategicContext {
  return {
    participationDecision: '',
    clientHiddenWants: '',
    mustNotFail: '',
    competitorWeakness: '',
    riskFactors: [],
    decisionMakers: '',
    pastSimilarProjects: '',
  }
}

export function createInitialMetadata(): IntentMetadata {
  const now = new Date().toISOString()
  return {
    completeness: 0,
    confidence: 'low',
    turnsCompleted: 0,
    unfilledSlots: [...STRATEGIC_SLOTS],
    startedAt: now,
    updatedAt: now,
    isComplete: false,
  }
}

// ─────────────────────────────────────────
// 채널별 Intent 초기화
// ─────────────────────────────────────────

/**
 * 채널과 컨텍스트를 받아 초기 PartialPlanningIntent 생성.
 */
export function createInitialIntent(
  channel: ChannelMeta,
  context: {
    bidContext?: BidContext
    leadContext?: LeadContext
    renewalContext?: RenewalContext
  } = {},
): PartialPlanningIntent {
  // 채널과 컨텍스트 일치 검증
  if (channel.type === 'bid' && !context.bidContext) {
    throw new Error('[createInitialIntent] bid 채널에는 bidContext가 필요합니다')
  }
  if (channel.type === 'lead' && !context.leadContext) {
    throw new Error('[createInitialIntent] lead 채널에는 leadContext가 필요합니다')
  }
  if (channel.type === 'renewal' && !context.renewalContext) {
    throw new Error('[createInitialIntent] renewal 채널에는 renewalContext가 필요합니다')
  }

  return {
    channel,
    bidContext: context.bidContext,
    leadContext: context.leadContext,
    renewalContext: context.renewalContext,
    strategicContext: {},
    derivedStrategy: null,
    metadata: createInitialMetadata(),
  }
}

/**
 * 활성 채널 반환 (bidContext / leadContext / renewalContext 중 뭐가 있는지).
 */
export function getActiveChannel(intent: PartialPlanningIntent): ProjectChannel {
  return intent.channel.type
}

// ─────────────────────────────────────────
// 슬롯 상태 체크
// ─────────────────────────────────────────

/**
 * 특정 슬롯이 "채워진" 것으로 간주되는지 판단.
 * 최소 길이 10자 (모호한 1-2단어 답변 방지).
 */
export function isSlotFilled(
  context: Partial<StrategicContext>,
  slot: StrategicSlot,
): boolean {
  const value = context[slot]
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.length > 0 && value.some((v) => v.trim().length >= 5)
  if (typeof value === 'string') return value.trim().length >= 10
  return false
}

export function getUnfilledSlots(
  context: Partial<StrategicContext>,
): StrategicSlot[] {
  return STRATEGIC_SLOTS.filter((slot) => !isSlotFilled(context, slot))
}

export function getFilledSlots(
  context: Partial<StrategicContext>,
): StrategicSlot[] {
  return STRATEGIC_SLOTS.filter((slot) => isSlotFilled(context, slot))
}

// ─────────────────────────────────────────
// Completeness 계산
// ─────────────────────────────────────────

export function calculateCompleteness(
  context: Partial<StrategicContext>,
): number {
  let total = 0
  for (const slot of STRATEGIC_SLOTS) {
    if (isSlotFilled(context, slot)) {
      total += SLOT_WEIGHTS[slot]
    }
  }
  return Math.min(100, Math.round(total))
}

export function calculateConfidence(
  completeness: number,
): IntentMetadata['confidence'] {
  if (completeness >= 80) return 'high'
  if (completeness >= 50) return 'medium'
  return 'low'
}

/**
 * 인터뷰가 "충분히 완료"되었는지 판단.
 */
export function isInterviewComplete(
  context: Partial<StrategicContext>,
): boolean {
  const completeness = calculateCompleteness(context)
  if (completeness >= 85) return true

  const coreFilledCount = CORE_SLOTS.filter((slot) => isSlotFilled(context, slot)).length
  return coreFilledCount === CORE_SLOTS.length
}

// ─────────────────────────────────────────
// Intent 업데이트
// ─────────────────────────────────────────

/**
 * 슬롯 값 업데이트 + 메타데이터 자동 갱신.
 * 불변성 유지.
 */
export function updateIntentSlot<S extends StrategicSlot>(
  intent: PartialPlanningIntent,
  slot: S,
  value: StrategicContext[S],
): PartialPlanningIntent {
  const newContext = {
    ...intent.strategicContext,
    [slot]: value,
  }
  const completeness = calculateCompleteness(newContext)
  const confidence = calculateConfidence(completeness)
  const unfilledSlots = getUnfilledSlots(newContext)
  const isComplete = isInterviewComplete(newContext)

  return {
    ...intent,
    strategicContext: newContext,
    metadata: {
      ...intent.metadata,
      completeness,
      confidence,
      unfilledSlots,
      isComplete,
      turnsCompleted: intent.metadata.turnsCompleted + 1,
      updatedAt: new Date().toISOString(),
    },
  }
}

/**
 * 여러 슬롯을 한 번에 업데이트 (예: 한 답변에서 여러 슬롯이 추출됐을 때).
 */
export function updateIntentSlots(
  intent: PartialPlanningIntent,
  updates: Partial<StrategicContext>,
): PartialPlanningIntent {
  const newContext = {
    ...intent.strategicContext,
    ...updates,
  }
  const completeness = calculateCompleteness(newContext)
  const confidence = calculateConfidence(completeness)
  const unfilledSlots = getUnfilledSlots(newContext)
  const isComplete = isInterviewComplete(newContext)

  return {
    ...intent,
    strategicContext: newContext,
    metadata: {
      ...intent.metadata,
      completeness,
      confidence,
      unfilledSlots,
      isComplete,
      turnsCompleted: intent.metadata.turnsCompleted + 1,
      updatedAt: new Date().toISOString(),
    },
  }
}

export function incrementTurn(intent: PartialPlanningIntent): PartialPlanningIntent {
  return {
    ...intent,
    metadata: {
      ...intent.metadata,
      turnsCompleted: intent.metadata.turnsCompleted + 1,
      updatedAt: new Date().toISOString(),
    },
  }
}

// ─────────────────────────────────────────
// 완료 승격 (Partial → Full)
// ─────────────────────────────────────────

export function finalizeIntent(intent: PartialPlanningIntent): PlanningIntent {
  if (!intent.derivedStrategy) {
    throw new Error('[finalizeIntent] derivedStrategy is null — synthesizer has not run yet')
  }

  const fullContext: StrategicContext = {
    participationDecision: intent.strategicContext.participationDecision ?? '',
    clientHiddenWants: intent.strategicContext.clientHiddenWants ?? '',
    mustNotFail: intent.strategicContext.mustNotFail ?? '',
    competitorWeakness: intent.strategicContext.competitorWeakness ?? '',
    riskFactors: intent.strategicContext.riskFactors ?? [],
    decisionMakers: intent.strategicContext.decisionMakers ?? '',
    pastSimilarProjects: intent.strategicContext.pastSimilarProjects ?? '',
  }

  return {
    channel: intent.channel,
    bidContext: intent.bidContext,
    leadContext: intent.leadContext,
    renewalContext: intent.renewalContext,
    strategicContext: fullContext,
    derivedStrategy: intent.derivedStrategy,
    metadata: {
      ...intent.metadata,
      isComplete: true,
      updatedAt: new Date().toISOString(),
    },
  }
}

// ─────────────────────────────────────────
// 요약 (디버깅/로깅용)
// ─────────────────────────────────────────

export function summarizeIntent(intent: PartialPlanningIntent): string {
  const filled = getFilledSlots(intent.strategicContext)
  const unfilled = getUnfilledSlots(intent.strategicContext)

  // 채널별 프로젝트 이름 추출
  let projectName = '(unknown)'
  if (intent.bidContext) projectName = intent.bidContext.rfpFacts.projectName || '(RFP 파싱 중)'
  else if (intent.leadContext) projectName = intent.leadContext.clientName || '(리드)'
  else if (intent.renewalContext) projectName = intent.renewalContext.previousProjectName || '(연속 사업)'

  return [
    `Channel: ${intent.channel.type} (${intent.channel.source})`,
    `Project: ${projectName}`,
    `Completeness: ${intent.metadata.completeness}/100 (${intent.metadata.confidence})`,
    `Turns: ${intent.metadata.turnsCompleted}`,
    `Filled: ${filled.join(', ') || '(none)'}`,
    `Unfilled: ${unfilled.join(', ') || '(none)'}`,
    `Strategy: ${intent.derivedStrategy ? 'synthesized' : 'not yet'}`,
  ].join('\n')
}

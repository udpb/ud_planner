/**
 * Planning Agent — Channel Preprocessors
 *
 * 채널별 raw 입력을 받아 초기 PartialPlanningIntent를 만드는 함수들.
 * 각 채널은 다른 입력 형태를 받기 때문에 분리.
 *
 * - bid: RFP 텍스트 → parseRfp() → BidContext
 * - lead: 영업 리드 폼 → LeadContext
 * - renewal: PM 수동 입력 → RenewalContext (텔레메트리 포함)
 */

import { parseRfp } from '@/lib/ai/parse-rfp'
import type {
  PartialPlanningIntent,
  ChannelMeta,
  BidContext,
  LeadContext,
  RenewalContext,
  RenewalInputTelemetry,
  VerificationPoint,
  ChannelInput,
} from './types'
import { createInitialIntent } from './intent-schema'

// ─────────────────────────────────────────
// [A] Bid Channel Preprocessor
// ─────────────────────────────────────────

/**
 * 입찰 채널 — RFP 텍스트를 받아 BidContext + 초기 Intent 생성.
 * RFP 파싱은 기존 parseRfp() 활용.
 */
export async function preprocessBidChannel(
  rfpText: string,
  meta: Partial<ChannelMeta>,
): Promise<PartialPlanningIntent> {
  if (!rfpText || rfpText.trim().length < 100) {
    throw new Error('[preprocessBidChannel] RFP 텍스트가 너무 짧습니다 (최소 100자)')
  }

  // RFP 파싱
  const rfpFacts = await parseRfp(rfpText)

  const bidContext: BidContext = {
    rfpFacts,
    rfpRawText: rfpText,
    verificationChecklist: [], // 빈 상태로 시작 — 별도 생성 함수에서 채움
    phoneCallCompleted: false,
  }

  const channel: ChannelMeta = {
    type: 'bid',
    source: meta.source ?? 'nara_bot',
    sourceDetail: meta.sourceDetail,
    discoveredAt: meta.discoveredAt ?? new Date().toISOString(),
    assignedPm: meta.assignedPm,
    botTags: meta.botTags,
  }

  return createInitialIntent(channel, { bidContext })
}

/**
 * 입찰 모드 전용 — RFP 분석 결과를 바탕으로 담당자 확인 포인트 자동 생성.
 * 이건 Claude 호출이 아니라 RfpFacts에서 패턴 기반으로 추출 (Phase 1 기본).
 * Phase 4+에서 Claude 호출 버전으로 업그레이드 가능.
 */
export function generateVerificationChecklist(
  bidContext: BidContext,
): VerificationPoint[] {
  const points: VerificationPoint[] = []
  const rfp = bidContext.rfpFacts

  // 1. 평가 배점 — 가장 큰 항목이 25점 이상이면 구체적 심사 방식 확인 필요
  if (rfp.evalCriteria && rfp.evalCriteria.length > 0) {
    const sorted = [...rfp.evalCriteria].sort((a, b) => b.score - a.score)
    const top = sorted[0]
    if (top && top.score >= 20) {
      points.push({
        id: `vp-eval-${Date.now()}-1`,
        category: '평가배점',
        priority: 'high',
        question: `평가 배점 중 "${top.item}"이 ${top.score}점으로 가장 높은데, 구체적인 심사 방식이 어떻게 되나요? (서면만? 면접 포함? 발표 심사?)`,
        rationale: '최고 배점 항목의 심사 방식을 알면 제안서/면접 준비 우선순위가 결정됨',
        status: 'pending',
      })
    }
  } else {
    // 과업지시서/공고 단계라 평가 배점이 본 문서에 없는 경우
    // → 별도 평가요령 PDF 확인 필수 (P0 우선순위)
    points.push({
      id: `vp-eval-missing-${Date.now()}`,
      category: '평가배점',
      priority: 'high',
      question: '본 문서에 평가 배점이 명시되어 있지 않습니다 (과업지시서/공고일 가능성). 별도 "제안서 평가표" 또는 "평가 요령" 문서가 첨부되었는지, 어떤 항목이 몇 점인지 즉시 확인 필요.',
      rationale: '평가 기준 없이는 제안서 챕터별 분량/우선순위를 정할 수 없음. 과업지시서는 거의 항상 평가요령이 별도 문서로 옴.',
      status: 'pending',
    })
  }

  // 2. 예산 — VAT 포함/제외 명확한지
  if (rfp.totalBudgetVat && !rfp.supplyPrice) {
    points.push({
      id: `vp-budget-${Date.now()}`,
      category: '예산',
      priority: 'high',
      question: `예산 ${(rfp.totalBudgetVat / 1e8).toFixed(2)}억이 VAT 포함인지 제외인지 확인 필요. 부가세 별도 적용 시 실제 사업비가 달라짐.`,
      rationale: 'VAT 처리 방식이 마진 계산에 직결',
      status: 'pending',
    })
  }

  // 3. 대상자 — 인원수 명시 안 됐으면
  if (!rfp.targetCount) {
    points.push({
      id: `vp-target-${Date.now()}`,
      category: '대상',
      priority: 'high',
      question: `참여 인원수가 명시되지 않았습니다. 모집 목표 인원과 최소 운영 인원이 어떻게 되나요?`,
      rationale: '인원수가 예산/운영 설계의 기본 단위',
      status: 'pending',
    })
  }

  // 4. 일정 — 교육 시작일 명시 안 됐으면
  if (!rfp.eduStartDate) {
    points.push({
      id: `vp-schedule-${Date.now()}`,
      category: '일정',
      priority: 'medium',
      question: `교육 시작일이 명시되지 않았습니다. 계약 후 몇 주 내 시작 가능한지 확인 필요.`,
      rationale: '시작 시점이 모집 기간 / 코치 매칭 / 운영 준비에 직접 영향',
      status: 'pending',
    })
  }

  // 5. 과거 이력 — 작년 같은 사업 있었는지
  points.push({
    id: `vp-history-${Date.now()}`,
    category: '과거이력',
    priority: 'medium',
    question: `작년에도 같은 사업이 있었나요? 있었다면 누가 수주했고, 결과가 어땠는지 아시는 게 있나요?`,
    rationale: '전년도 수주사 + 결과를 알면 경쟁 구도 + 클라이언트 기대치 파악 가능',
    status: 'pending',
  })

  // 6. 평가위원 — 공개 입찰이라도 추정 가능한지
  if (rfp.projectType === 'B2G') {
    points.push({
      id: `vp-evaluators-${Date.now()}`,
      category: '평가위원',
      priority: 'low',
      question: `심사위원 구성에 대한 정보가 있나요? (학계/업계/내부 비율, 발표 일정 등)`,
      rationale: '평가위원 성향에 따라 제안서 톤 조정 가능',
      status: 'pending',
    })
  }

  // 7. 운영 - 애매한 표현이 있는지
  const ambiguousTerms = ['실전 중심', 'Action Week', '맞춤형', '혁신적', '글로벌']
  const summary = rfp.summary?.toLowerCase() ?? ''
  for (const term of ambiguousTerms) {
    if (summary.includes(term.toLowerCase())) {
      points.push({
        id: `vp-term-${Date.now()}-${term}`,
        category: '운영',
        priority: 'medium',
        question: `RFP에 "${term}"이라는 표현이 있는데, 발주기관이 이걸 구체적으로 어떻게 정의하시는지 확인 필요.`,
        rationale: '추상적 표현은 우리식 해석 vs 발주기관 의도가 다를 수 있음',
        status: 'pending',
      })
      break // 첫 매칭만
    }
  }

  return points
}

// ─────────────────────────────────────────
// [B] Lead Channel Preprocessor
// ─────────────────────────────────────────

/**
 * B2B 리드 채널 — 영업 리드 폼 데이터를 받아 LeadContext + 초기 Intent 생성.
 * 폼 구조는 LeadContext와 1:1 매칭.
 */
export function preprocessLeadChannel(
  leadData: Omit<LeadContext, 'interactionHistory'> & { interactionHistory?: string },
  meta: Partial<ChannelMeta>,
): PartialPlanningIntent {
  // 필수 필드 검증
  if (!leadData.clientName) {
    throw new Error('[preprocessLeadChannel] clientName이 필요합니다')
  }

  const leadContext: LeadContext = {
    ...leadData,
    interactionHistory: leadData.interactionHistory ?? '',
  }

  const channel: ChannelMeta = {
    type: 'lead',
    source: meta.source ?? 'inbound_referral',
    sourceDetail: meta.sourceDetail ?? leadData.awarenessDetail,
    discoveredAt: meta.discoveredAt ?? new Date().toISOString(),
    assignedPm: meta.assignedPm,
  }

  return createInitialIntent(channel, { leadContext })
}

/**
 * 리드 컨텍스트의 빈 필드 식별 — Agent가 PM에게 보완 요청할 수 있도록.
 */
export function identifyMissingLeadFields(leadContext: LeadContext): string[] {
  const missing: string[] = []
  if (!leadContext.contact.name) missing.push('담당자 이름')
  if (!leadContext.contact.email) missing.push('담당자 이메일')
  if (!leadContext.contact.phone) missing.push('담당자 연락처')
  if (!leadContext.objectives) missing.push('사업/교육 목적 (KPI)')
  if (leadContext.desiredHeadcount === null || leadContext.desiredHeadcount === 0) {
    missing.push('희망 인원수')
  }
  if (!leadContext.budgetExcludingVat) missing.push('예산 규모')
  if (!leadContext.projectPeriodText) missing.push('사업 기간')
  if (!leadContext.expectedTasks) missing.push('예상 과업 내용')
  return missing
}

// ─────────────────────────────────────────
// [C] Renewal Channel Preprocessor
// ─────────────────────────────────────────

/**
 * 연속 사업 채널 — PM이 입력한 작년 데이터를 받아 RenewalContext + 초기 Intent 생성.
 * Phase 1은 수동 입력만. Phase 2+에서 DB 매칭 / 크롤링 추가.
 *
 * 텔레메트리: 어떤 필드를 채웠는지, 어디에 가장 많이 썼는지 추적.
 * → Phase 4+에서 크롤러 설계 시 "뭘 자동으로 찾아와야 하는지" 알 수 있음.
 */
export function preprocessRenewalChannel(
  renewalData: Omit<RenewalContext, '_telemetry'>,
  meta: Partial<ChannelMeta>,
): PartialPlanningIntent {
  if (!renewalData.previousProjectName) {
    throw new Error('[preprocessRenewalChannel] previousProjectName이 필요합니다')
  }

  // 텔레메트리 자동 계산
  const telemetry = computeRenewalTelemetry(renewalData)

  const renewalContext: RenewalContext = {
    ...renewalData,
    _telemetry: telemetry,
  }

  const channel: ChannelMeta = {
    type: 'renewal',
    source: meta.source ?? 'renewal_same_client',
    sourceDetail: meta.sourceDetail,
    discoveredAt: meta.discoveredAt ?? new Date().toISOString(),
    assignedPm: meta.assignedPm,
  }

  return createInitialIntent(channel, { renewalContext })
}

/**
 * 작년 사업 데이터에서 텔레메트리 계산.
 * 어떤 필드가 채워졌고, 어떤 게 비었는지 추적.
 */
function computeRenewalTelemetry(
  renewalData: Omit<RenewalContext, '_telemetry'>,
): RenewalInputTelemetry {
  const now = new Date().toISOString()

  // 채워진 / 비어있는 필드 카운트
  const results = renewalData.previousResults
  const resultFields = [
    results.applicantCount,
    results.enrolledCount,
    results.completedCount,
    results.completionRate,
    results.satisfactionAvg,
    results.startupConversionCount,
    results.investmentCount,
    results.revenueGeneratedCount,
  ]
  const filledResultsCount = resultFields.filter((v) => v !== undefined && v !== null).length
  const skippedResultsCount = resultFields.length - filledResultsCount

  // 자유 텍스트 필드별 문자 수
  const freeFormCharCounts: Record<string, number> = {
    'previousResults.freeFormNotes': (results.freeFormNotes ?? '').length,
    'continuityStrategy': (renewalData.continuityStrategy ?? '').length,
    'lessonsLearned.whatWorked': renewalData.lessonsLearned.whatWorked.join(' ').length,
    'lessonsLearned.whatDidntWork': renewalData.lessonsLearned.whatDidntWork.join(' ').length,
    'lessonsLearned.improvementsThisYear': renewalData.lessonsLearned.improvementsThisYear.join(' ').length,
    'clientChangeRequests': renewalData.clientChangeRequests.join(' ').length,
  }

  // PM이 사용한 키워드 추출 (간단한 토큰화)
  const allText = [
    results.freeFormNotes ?? '',
    renewalData.continuityStrategy ?? '',
    ...renewalData.lessonsLearned.whatWorked,
    ...renewalData.lessonsLearned.whatDidntWork,
    ...renewalData.lessonsLearned.improvementsThisYear,
    ...renewalData.clientChangeRequests,
  ].join(' ')

  const commonKeywords = extractKeywords(allText)

  return {
    inputMethod: 'manual',
    inputStartedAt: now,
    inputCompletedAt: now,
    fieldsFilledCount: filledResultsCount + (renewalData.lessonsLearned.whatWorked.length > 0 ? 1 : 0),
    fieldsSkippedCount: skippedResultsCount,
    freeFormCharCounts,
    commonKeywords,
  }
}

/**
 * 텍스트에서 키워드 추출 (간단한 휴리스틱 — Phase 1 기본).
 * 길이 3자 이상 + 한글/영문 단어, 불용어 제외.
 */
function extractKeywords(text: string): string[] {
  if (!text) return []

  const stopwords = new Set([
    '있음', '없음', '하는', '한다', '됐음', '되는', '됐다', '같은', '대해', '대한',
    '이런', '그런', '저런', '이것', '그것', '저것', '이거', '그거', '저거',
    '해서', '해야', '하지', '못함', '있어', '없어', '많이', '조금', '매우',
    '입찰', '사업', '제안', '클라이언트',  // 너무 일반적
  ])

  const words = text.match(/[가-힣A-Za-z]{2,}/g) ?? []
  const counts = new Map<string, number>()

  for (const word of words) {
    if (word.length < 3) continue
    if (stopwords.has(word)) continue
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }

  // 빈도순 상위 10개
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word)
}

// ─────────────────────────────────────────
// 통합 Entry Point
// ─────────────────────────────────────────

/**
 * 채널 인풋을 받아 적절한 전처리기를 호출.
 * Agent의 시작 지점에서 사용.
 */
export async function preprocessChannelInput(
  input: ChannelInput,
): Promise<PartialPlanningIntent> {
  switch (input.channel) {
    case 'bid':
      return preprocessBidChannel(input.rfpText, input.meta)
    case 'lead':
      return preprocessLeadChannel(input.leadData, input.meta)
    case 'renewal':
      return preprocessRenewalChannel(input.renewalData, input.meta)
    default: {
      const _exhaust: never = input
      throw new Error(`[preprocessChannelInput] Unknown channel: ${JSON.stringify(_exhaust)}`)
    }
  }
}

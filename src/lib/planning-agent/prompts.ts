/**
 * Planning Agent — Claude Prompts
 *
 * Agent가 Claude를 호출할 때 사용하는 프롬프트 빌더 함수들.
 * 3가지 주요 작업:
 * 1. 사용자 답변에서 슬롯 추출 (extractSlotFromAnswer)
 * 2. 다음 질문 결정 (decideNextQuestion) — 휴리스틱 우선, Claude는 fallback
 * 3. derivedStrategy 종합 (synthesizeStrategy)
 */

import type {
  PartialPlanningIntent,
  Question,
  StrategicSlot,
  ProjectChannel,
  Message,
  BidContext,
  LeadContext,
  RenewalContext,
} from './types'
import type { RfpParsed } from '@/lib/claude'
import { buildBrandContext } from '@/lib/ud-brand'

// ─────────────────────────────────────────
// 0. RFP Intelligence Brief
//    — 질문과 슬롯 추출에 주입되어 Agent가 RFP를 "읽은" 느낌을 준다
// ─────────────────────────────────────────

/**
 * RFP 파싱 결과를 밀도 높은 한국어 브리프로 변환.
 * 모든 질문 앞에 삽입되어 Agent가 RFP 맥락을 알고 묻는 것처럼 동작.
 */
export function buildRfpIntelligenceBrief(intent: PartialPlanningIntent): string {
  if (intent.channel.type === 'bid' && intent.bidContext) {
    return buildBidBrief(intent.bidContext)
  }
  if (intent.channel.type === 'lead' && intent.leadContext) {
    return buildLeadBrief(intent.leadContext)
  }
  if (intent.channel.type === 'renewal' && intent.renewalContext) {
    return buildRenewalBrief(intent.renewalContext)
  }
  return ''
}

function buildBidBrief(ctx: BidContext): string {
  const rfp = ctx.rfpFacts
  const lines: string[] = []

  lines.push(`[📋 RFP 핵심 정보 — 이 맥락에서 질문합니다]`)
  lines.push(`사업명: ${rfp.projectName}`)
  lines.push(`발주: ${rfp.client} | 유형: ${rfp.projectType}`)
  if (rfp.totalBudgetVat) {
    const perPerson = rfp.targetCount
      ? ` (1인당 ${Math.round(rfp.totalBudgetVat / rfp.targetCount).toLocaleString()}원)`
      : ''
    lines.push(`예산: ${(rfp.totalBudgetVat / 1e4).toLocaleString()}만원${perPerson}`)
  }
  if (rfp.targetCount) lines.push(`대상: ${rfp.targetAudience} ${rfp.targetCount}명`)
  else lines.push(`대상: ${rfp.targetAudience} (인원 미정)`)

  if (rfp.eduStartDate || rfp.eduEndDate) {
    lines.push(`기간: ${rfp.eduStartDate ?? '?'} ~ ${rfp.eduEndDate ?? '?'}`)
  }

  // 평가배점 — 가장 중요
  if (rfp.evalCriteria && rfp.evalCriteria.length > 0) {
    const sorted = [...rfp.evalCriteria].sort((a, b) => b.score - a.score)
    lines.push(`\n평가배점 (${sorted.length}개, 높은 순):`)
    for (const c of sorted) {
      const star = c.score >= 20 ? ' ★★' : c.score >= 15 ? ' ★' : ''
      lines.push(`  ${c.item}: ${c.score}점${star}${c.notes ? ` — ${c.notes}` : ''}`)
    }
  } else {
    lines.push(`\n⚠️ 평가배점 미명시 (과업지시서 — 별도 평가요령 확인 필수)`)
  }

  // 핵심 목표
  if (rfp.objectives.length > 0) {
    lines.push(`\n핵심 목표:`)
    rfp.objectives.slice(0, 4).forEach((o, i) => lines.push(`  ${i + 1}. ${o}`))
  }

  // 제약/필수 인력
  if (rfp.requiredPersonnel && rfp.requiredPersonnel.length > 0) {
    lines.push(`\n요구 인력: ${rfp.requiredPersonnel.map(p => `${p.role}(${p.qualification ?? '미정'})`).join(', ')}`)
  }
  if (rfp.constraints && rfp.constraints.length > 0) {
    lines.push(`제약: ${rfp.constraints.slice(0, 3).map(c => c.description.slice(0, 60)).join(' | ')}`)
  }

  // 전략 시그널
  lines.push(`\n키워드: ${rfp.keywords.join(', ')}`)
  lines.push(`요약: ${rfp.summary}`)

  return lines.join('\n')
}

function buildLeadBrief(ctx: LeadContext): string {
  return `[📋 영업 리드 핵심 정보]
고객: ${ctx.clientName} (${ctx.clientType})
담당: ${ctx.contact.name} / ${ctx.contact.position} / ${ctx.contact.department}
경로: ${ctx.awarenessChannel} — ${ctx.awarenessDetail}
목적: ${ctx.objectives}
인원: ${ctx.desiredHeadcount ?? '미정'}명
예산: ${ctx.budgetExcludingVat ? `${(ctx.budgetExcludingVat / 1e4).toLocaleString()}만원 (VAT별도)` : '미정'}
기간: ${ctx.projectPeriodText}
예상 과업: ${ctx.expectedTasks}`
}

function buildRenewalBrief(ctx: RenewalContext): string {
  const r = ctx.previousResults
  return `[📋 연속 사업 핵심 정보]
작년 사업: ${ctx.previousProjectName} (${ctx.previousProjectYear})
클라이언트: ${ctx.previousClient} ${ctx.isSameClient ? '(동일)' : '(변경)'}
작년 예산: ${ctx.previousBudget ? `${(ctx.previousBudget / 1e4).toLocaleString()}만원` : '미정'}
작년 실적: 지원 ${r.applicantCount ?? '?'}명 → 수료 ${r.completedCount ?? '?'}명 (${r.completionRate ?? '?'}%) / 만족 ${r.satisfactionAvg ?? '?'}/5 / 창업전환 ${r.startupConversionCount ?? '?'}팀
잘된 점: ${ctx.lessonsLearned.whatWorked.join(' / ')}
아쉬운 점: ${ctx.lessonsLearned.whatDidntWork.join(' / ')}
올해 개선: ${ctx.lessonsLearned.improvementsThisYear.join(' / ')}
클라이언트 요구 변경: ${ctx.clientChangeRequests.join(' / ') || '(없음)'}
연속성 전략: ${ctx.continuityStrategy ?? '(미정)'}`
}

// ─────────────────────────────────────────
// 0.5. 전략적 반응 프롬프트
//    — PM의 답변 후 Agent가 분석하고 연결해서 반응
// ─────────────────────────────────────────

/**
 * PM의 답변 후, 다음 질문으로 넘어가기 전에 Agent가 전략적 반응을 생성.
 * "조용히 기록" → "분석하고 연결하고 제안" 으로 전환.
 */
export function buildStrategicReactionPrompt(
  pmAnswer: string,
  currentSlot: string,
  intent: PartialPlanningIntent,
  nextQuestion: Question | null,
): string {
  const rfpBrief = buildRfpIntelligenceBrief(intent)

  const slotLabels: Record<string, string> = {
    participationDecision: '참여 결정/경쟁력',
    clientHiddenWants: '클라이언트 진짜 의도',
    mustNotFail: '절대 실패 금지 지점',
    competitorWeakness: '경쟁사/약점',
    riskFactors: '위험 요소',
    decisionMakers: '의사결정자/선정 패턴',
    pastSimilarProjects: '과거 유사 경험',
  }

  const currentSlotLabel = slotLabels[currentSlot] ?? currentSlot
  const nextSlotLabel = nextQuestion
    ? (slotLabels[nextQuestion.slot] ?? nextQuestion.slot)
    : null

  return `당신은 한국 교육 사업 입찰에서 10년 이상 경험을 가진 시니어 사업 기획 컨설턴트입니다.
PM이 "${currentSlotLabel}" 질문에 답변했습니다. PM의 답변에 전략적으로 반응하세요.

═══════════════════════════════════════
${rfpBrief ? rfpBrief + '\n═══════════════════════════════════════\n' : ''}
[PM의 답변 — "${currentSlotLabel}" 슬롯]
${pmAnswer}
═══════════════════════════════════════

[반응 규칙]
1. PM이 말한 내용을 인정하고 분석하세요 (2-3문장)
2. RFP/프로젝트 맥락의 구체적 사실(사업명, 대상자, 예산, 평가배점 등)과 PM 답변을 연결하세요
3. 전략적 시사점이 있으면 짧게 언급하세요 (예: "~가 관건이에요", "~를 활용할 수 있겠네요")
4. ${nextSlotLabel ? `마지막 문장에서 "${nextSlotLabel}" 주제로 자연스럽게 전환하세요 (직접 질문하지 말고, "그럼 이제 ~를 살펴보죠" 정도)` : '자연스럽게 마무리하세요'}

[톤]
- 자신감 있는 동료 컨설턴트 (선언형 "~합니다", "~이에요")
- 존댓말 사용
- 과도한 칭찬 금지 ("정말 훌륭한 답변입니다!" 같은 표현 금지)
- "좋습니다", "좋은 포인트예요" 정도는 OK
- 일반론 금지 — 이 프로젝트에 특화된 반응만

[출력]
- 한국어 plain text, 2-4문장
- JSON 아님, 마크다운 아님, 그냥 자연어 텍스트
- 줄바꿈 없이 하나의 문단으로`
}

// ─────────────────────────────────────────
// 1. 슬롯 추출 프롬프트
// ─────────────────────────────────────────

/**
 * 사용자가 자유 답변을 했을 때 → Claude가 답변에서 슬롯 값을 추출.
 * 한 답변으로 여러 슬롯이 채워질 수도 있음 (secondary slots).
 */
export function buildSlotExtractionPrompt(
  question: Question,
  userAnswer: string,
  channel: ProjectChannel,
  intentSummary: string,
): string {
  const slotPrompt = question.prompt[channel]

  return `당신은 언더독스 사업 기획 인터뷰 분석 전문가입니다. PM의 답변에서 구조화된 정보를 추출하고 품질을 엄격하게 평가하세요.

═══════════════════════════════════════
[현재 질문 — slot: ${question.slot}]
${slotPrompt}

[PM의 답변]
${userAnswer}

[현재 인터뷰 진행 상황]
${intentSummary}
═══════════════════════════════════════

당신의 작업:
1. 답변에서 "${question.slot}" 슬롯에 저장할 핵심 정보를 정리 (primaryValue)
2. 답변이 명시적으로 다른 슬롯에도 정보를 담고 있으면 secondary slots로 추출 (엄격 기준 — 아래 참고)
3. 답변의 품질을 엄격하게 평가

═══════════════════════════════════════
[primaryValue 추출 규칙]
- 답변이 회피성이거나 무의미("잘 모름", "없음", "위에 말한 거 같음", "모르겠음", 한 단어 답변 등)
  → primaryValue를 빈 문자열("")로 반환
- 답변이 질문과 무관(엉뚱한 답)이면 primaryValue를 빈 문자열로 반환 (다만 secondary로 라우팅 가능)
- 답변에 정보가 있으면 그 정보를 한국어로 정리. 답변에 없는 내용을 추측해서 추가하지 말 것.

═══════════════════════════════════════
[secondary slots 추출 규칙 — 매우 엄격]
secondary slots는 PM이 명시적으로 다른 슬롯의 정보를 함께 말한 경우에만 추출하세요.
다음 모든 조건을 만족할 때만 confidence='high'로 반환:
  (a) PM이 그 슬롯에 해당하는 정보를 명시적이고 구체적으로 언급
  (b) 단순 추론이나 약한 연결이 아니라 직접적으로 말한 내용
  (c) 정보의 길이가 한 문장 이상이고 실질적인 내용을 담고 있음
  (d) 다른 슬롯의 답변으로 사용해도 PM이 동의할 수준

위 조건 중 하나라도 약하면 secondary slot으로 추출하지 마세요(빈 배열 반환).
약한/추측성 secondary는 인터뷰의 깊이를 망칩니다 — 절대 만들어내지 마세요.
보통 한 답변에서 secondary slots는 0개 또는 1개입니다. 2개 이상은 매우 드문 경우.

═══════════════════════════════════════
[답변 품질 평가 — 엄격 기준]

isSpecific (구체성 — 엄격):
  - true: 구체적 숫자, 사례, 회사명, 기관명, 장면, 인용 등이 포함됨
  - false: "잘 한다", "좋을 것 같다", "중요함" 만 있고 구체 키워드가 없는 경우

isActionable (실행 가능성):
  - true: 제안서/추천 엔진이 실제로 활용할 수 있는 정보 (이름/숫자/키워드/판단)
  - false: 추상적 일반론, 누구나 쓸 수 있는 표현

hasSubstance (실질 내용 — 너그럽게):
  - true: 답변이 1문장이라도 PM의 판단/통찰/구체 키워드(숫자·이름·기관·전문용어)를 1개 이상 담고 있음
    예: "수료율과 창업 전환율을 중요하게 볼 것 같음." → true (수료율, 창업 전환율 키워드)
    예: "A컨설팅이 들어올 것 같음. 그들은 지방 약함." → true (회사명 + 약점)
  - false: 회피성("잘 모름", "없음", "모르겠음"), 한 단어 답변, 동어반복, 질문과 무관한 답

needsFollowup (재질문 필요):
  - true: hasSubstance가 false이고, PM이 좀 더 생각해보면 답할 수 있을 것 같을 때
  - false: hasSubstance가 true이거나, PM이 정말 모르는 영역일 때
  - 주의: hasSubstance=true면 needsFollowup은 거의 항상 false. 답변이 짧아도 정보가 있으면 통과시키세요.

worthDigging (꼬리질문 가치 — hasSubstance=true일 때만 판단):
  - true: 답변에 정보가 있지만, 한 단계 더 파면 제안서에 결정적으로 유용한 구체 사례/숫자/교훈이 나올 것 같을 때
    예: "50플러스재단 경험이 있어서 참여" → 경험에서 구체적으로 뭘 배웠는지 파고들면 가치 있음
    예: "상상우리가 경쟁사" → 구체적으로 어떤 점에서 우리가 이기는지 파고들면 차별점이 날카로워짐
  - false: 이미 충분히 구체적이거나, 더 파봤자 새로운 정보가 나오기 어려울 때
  - 주의: hasSubstance=false이면 worthDigging은 항상 false (빈약한 답변은 재질문, 꼬리질문이 아님)

deepFollowupQuestion (worthDigging=true일 때만):
  - PM의 답변에서 가장 흥미로운 실마리를 잡아서 RFP 맥락과 연결한 구체적 질문
  - 예: "50플러스재단에서 시니어-청년 매칭할 때 가장 어려웠던 점이 뭐였나요? 이번 세대융합 프로그램에서 그 교훈을 어떻게 적용하실 건가요?"
  - 반드시 PM의 원래 답변 내용을 인용하면서 물어야 함 (연결감)

═══════════════════════════════════════
[가능한 슬롯 키]
- participationDecision: 왜 들어가는가 + 우리 경쟁력
- clientHiddenWants: 발주기관/고객의 진짜 의도
- mustNotFail: 절대 실패 금지 지점
- competitorWeakness: 경쟁사 + 약점
- riskFactors: 위험 요소 (배열)
- decisionMakers: 의사결정자/선정 패턴
- pastSimilarProjects: 과거 비슷한 사업 경험

═══════════════════════════════════════
반드시 아래 JSON만 반환 (마크다운 코드블록 없이):
{
  "primarySlot": "${question.slot}",
  "primaryValue": "추출된 핵심 정보 한국어 텍스트, 또는 빈 문자열",
  "secondarySlots": [
    {
      "slot": "다른 슬롯 키",
      "value": "명시적으로 언급된 그 슬롯 정보",
      "confidence": "high"
    }
  ],
  "quality": {
    "isSpecific": true | false,
    "isActionable": true | false,
    "hasSubstance": true | false,
    "needsFollowup": true | false,
    "followupSuggestion": "재질문 시 어떤 각도로 물을지 (선택)",
    "worthDigging": true | false,
    "deepFollowupQuestion": "hasSubstance=true이고 worthDigging=true일 때, PM 답변을 인용하며 더 파고드는 질문 (선택)"
  },
  "strategicReaction": "PM 답변에 대한 전략적 반응 2-3문장. RFP 맥락과 연결하고, 시사점 짧게 언급. 자연어 한국어, 과도한 칭찬 금지, 일반론 금지. 빈약한 답변이면 빈 문자열."
}`
}

// ─────────────────────────────────────────
// 2. 답변 평가 프롬프트 (단독 호출용)
// ─────────────────────────────────────────

/**
 * 사용자 답변을 빠르게 평가만 — extract와 분리해서 쓰고 싶을 때.
 * 일반적으로는 extract에 quality가 포함되니 이건 잘 안 씀.
 */
export function buildAnswerEvaluationPrompt(
  question: Question,
  userAnswer: string,
  channel: ProjectChannel,
): string {
  return `다음 답변이 충분히 좋은지 평가해주세요.

[질문]
${question.prompt[channel]}

[답변]
${userAnswer}

[평가 기준]
${question.qualityHints?.map((h) => `- ${h}`).join('\n') ?? '- 구체성\n- 실행 가능성'}

JSON으로 응답:
{
  "isSpecific": true | false,
  "isActionable": true | false,
  "hasSubstance": true | false,
  "needsFollowup": true | false,
  "followupSuggestion": "재질문 각도 (필요 시)",
  "score": 0-10
}`
}

// ─────────────────────────────────────────
// 3. derivedStrategy 종합 프롬프트
// ─────────────────────────────────────────

/**
 * 인터뷰 완료 후 → 전체 정보(RFP + PM 인터뷰 + 대화 히스토리) 종합 →
 * 풍부한 전략 브리프 생성.
 *
 * 이 프롬프트가 최종 산출물의 품질을 결정한다.
 * 목표: "Claude에 RFP를 그냥 넣고 물어보는 것"보다 높은 품질.
 */
export function buildSynthesisPrompt(
  intent: PartialPlanningIntent,
  conversationHistory?: Message[],
): string {
  const { channel, strategicContext, bidContext, leadContext, renewalContext } = intent

  // 1. RFP Intelligence Brief (모든 채널 공통)
  const rfpBrief = buildRfpIntelligenceBrief(intent)

  // 2. PM 인터뷰 원문 (slot 추출이 아니라 원문 — 뉘앙스 보존)
  let conversationText = ''
  if (conversationHistory && conversationHistory.length > 0) {
    conversationText = `\n[PM과의 대화 원문 — 뉘앙스를 살려서 분석하세요]\n`
    for (const msg of conversationHistory) {
      if (msg.role === 'user') {
        conversationText += `PM: ${msg.content}\n\n`
      } else if (msg.role === 'agent') {
        conversationText += `Agent: ${msg.content.slice(0, 200)}...\n\n`
      }
    }
  }

  // 3. 추출된 슬롯 요약
  const strategicText = `[추출된 전략 슬롯 요약]
- 참여 결정/경쟁력: ${strategicContext.participationDecision || '(미입력)'}
- 클라이언트 진짜 의도: ${strategicContext.clientHiddenWants || '(미입력)'}
- 절대 실패 금지: ${strategicContext.mustNotFail || '(미입력)'}
- 경쟁사 약점: ${strategicContext.competitorWeakness || '(미입력)'}
- 위험 요소: ${strategicContext.riskFactors?.join(' / ') || '(미입력)'}
- 의사결정자: ${strategicContext.decisionMakers || '(미입력)'}
- 과거 경험: ${strategicContext.pastSimilarProjects || '(미입력)'}`

  // 4. 채널별 전용 지시
  let channelSpecificInstruction = ''
  if (channel.type === 'bid' && bidContext) {
    const rfp = bidContext.rfpFacts
    const hasEval = rfp.evalCriteria && rfp.evalCriteria.length > 0
    channelSpecificInstruction = `
[입찰 채널 전용 지시]
- rfpAnalysis.evalCriteriaStrategy: ${hasEval
      ? `평가배점 ${rfp.evalCriteria!.length}개 항목 각각에 대해 → 어떻게 공략할지, 몇 페이지 할당할지, 어떤 근거를 제시할지 구체적으로. 배점 높은 항목 = 페이지도 많이.`
      : `평가배점이 RFP에 없음 (과업지시서). "별도 평가요령 확인 필수" 전제하에 일반적 교육사업 배점 패턴(사업이해 15, 커리큘럼 25, 운영 20, 인력 20, 예산 10, 성과관리 10)을 가정하고 전략 수립.`}
- rfpAnalysis.clientIntentInference: RFP 문장 하나하나에서 발주기관이 진짜 원하는 것을 추론. "왜 이 문구를 넣었을까?"를 분석. 2-3문단으로 깊이 있게.
- rfpAnalysis.hiddenRequirements: RFP에 직접 안 쓰여있지만 행간에서 읽히는 요구사항.
- curriculumDirection: RFP의 대상(${rfp.targetAudience}), 기간(${rfp.eduStartDate ?? '?'}~${rfp.eduEndDate ?? '?'}), 예산(${rfp.totalBudgetVat ? `${(rfp.totalBudgetVat / 1e4).toLocaleString()}만원` : '미정'}), 목표를 반영한 구체적 주차별 커리큘럼 개요.
- evalStrategy: 제안서 총 분량을 80-100페이지로 가정하고 배점별 페이지 배분.
- budgetGuideline: 총 예산 기준 인건비/직접비/관리비/이윤 비율 + 주요 비목별 금액 가이드.`
  } else if (channel.type === 'lead' && leadContext) {
    channelSpecificInstruction = `
[영업 리드 채널 전용 지시]
- positioning: 이 고객사(${leadContext.clientName})가 왜 우리를 택해야 하는지. 고객의 목적(${leadContext.objectives.slice(0, 100)})에 맞춘 포지셔닝.
- curriculumDirection: 고객이 원하는 교육 내용과 기간, 인원에 맞는 커리큘럼 방향.
- budgetGuideline: 예산 ${leadContext.budgetExcludingVat ? `${(leadContext.budgetExcludingVat / 1e4).toLocaleString()}만원` : '미정'}에 맞는 현실적 설계.
- rfpAnalysis는 evalCriteriaStrategy 빈 배열로, 나머지 필드는 고객 니즈 기반 분석.`
  } else if (channel.type === 'renewal' && renewalContext) {
    channelSpecificInstruction = `
[연속 사업 채널 전용 지시]
- positioning: 작년 실적(수료율 ${renewalContext.previousResults.completionRate ?? '?'}%, 만족도 ${renewalContext.previousResults.satisfactionAvg ?? '?'}/5)을 활용한 연속성 포지셔닝.
- curriculumDirection: 작년의 교훈(잘된 점 + 아쉬운 점 + 올해 개선안)을 반영한 커리큘럼 진화 방향.
- rfpAnalysis: 연속사업 맥락에서 클라이언트가 올해 기대하는 변화 분석.
- 클라이언트 변경 요구(${renewalContext.clientChangeRequests.join(', ') || '없음'})를 제안서에 어떻게 녹일지.`
  }

  return `당신은 한국 교육 사업 입찰에서 10년 이상 경험을 가진 시니어 사업 기획 컨설턴트입니다.
아래 정보를 토대로 "이 사업을 수주하기 위한 완전한 전략 브리프"를 작성하세요.

중요: 당신의 분석이 "RFP를 그냥 Claude에 넣고 물어본 것"보다 반드시 깊어야 합니다.
- RFP 행간을 읽으세요 (왜 이 문구가 들어갔는가? 발주기관이 과거에 어떤 문제를 겪었기에?)
- PM의 답변에서 뉘앙스를 살리세요 ("솔직히 확신 없음"과 "확실히 자신 있음"은 다른 전략)
- 일반론이 아닌, 이 구체적 사업에만 해당하는 전략을 내세요
- 브랜드 자산(500억, 21000명 등)은 이 사업에 직접 연결될 때만 인용. 무작정 나열 금지.

═══════════════════════════════════════
${rfpBrief}
═══════════════════════════════════════
${conversationText}
═══════════════════════════════════════
${strategicText}
═══════════════════════════════════════
${buildBrandContext()}
═══════════════════════════════════════
${channelSpecificInstruction}

[출력 JSON — 간결하되 핵심을 놓치지 마세요. 각 필드 1-2문장. 토큰 절약 중요.]

{
  "keyMessages": ["이 사업 맥락의 메시지 1 (1문장)", "메시지 2", "메시지 3"],
  "differentiators": ["경쟁사 대비 우위 1 (1문장)", "우위 2"],
  "coachProfile": "이 사업에 맞는 코치 요건 (1-2문장)",
  "sectionVBonus": ["추가 제안 1 (1문장)"],
  "riskMitigation": ["PM이 짚은 리스크 대응 1 (1문장)"],

  "rfpAnalysis": {
    "evalCriteriaStrategy": "배점별 공략을 한 문단으로 정리 (항목: 강조점 형식)",
    "clientIntentInference": "발주기관 의도 추론 (2-3문장)",
    "hiddenRequirements": ["숨은 요구 1", "숨은 요구 2"],
    "clarificationNeeded": ["확인 필요 사항 1"]
  },

  "positioning": {
    "oneLiner": "이 사업 특화 포지셔닝 (1문장)",
    "whyUnderdogs": "왜 우리인가 (2-3문장)",
    "competitiveMap": "경쟁 구도 (1-2문장)"
  },

  "curriculumDirection": {
    "designPrinciple": "설계 핵심 원칙 (1-2문장)",
    "impactEmphasis": ["강조 IMPACT 단계"],
    "weeklyOutline": [{"week": "1주", "focus": "주제", "keyActivity": "활동"}],
    "formatMix": "교육 형태 비율 (1문장)"
  },

  "evalStrategy": {
    "pageDistribution": [{"section": "섹션", "pages": "N페이지", "reason": "이유"}],
    "presentationTips": ["발표 팁 1"]
  },

  "budgetGuideline": {
    "overallApproach": "예산 방향 (1-2문장)",
    "majorCategories": [{"category": "비목", "allocation": "비율", "rationale": "근거"}]
  },

  "riskMatrix": [{"risk": "리스크", "probability": "medium", "impact": "high", "mitigation": "대응 (1문장)", "owner": "담당"}]
}`
}

// ─────────────────────────────────────────
// 4. 다음 질문 결정 (Claude 보조용)
// ─────────────────────────────────────────

/**
 * Phase 1: 다음 질문은 기본적으로 결정론적 순서 (DEFAULT_QUESTION_ORDER)로 진행.
 * 이 프롬프트는 "사용자 답변이 모호할 때 어떻게 재질문할지" 결정하는 fallback용.
 */
export function buildFollowupSuggestionPrompt(
  question: Question,
  userAnswer: string,
  channel: ProjectChannel,
): string {
  return `다음 답변이 너무 모호하거나 회피성입니다. PM에게 다른 각도로 다시 물어볼 질문 1개를 생성하세요.

[원래 질문]
${question.prompt[channel]}

[모호한 답변]
${userAnswer}

[재질문 원칙]
- 더 구체적인 카테고리/예시를 제시
- 답변하기 쉬운 좁은 질문으로
- 강요하지 말고 "이런 각도는 어떤가요?"식으로
- 한국어 자연스럽게

JSON으로 응답:
{
  "followupQuestion": "재질문 한 문장",
  "rationale": "왜 이 각도로 물었는지 (Agent 디버깅용)"
}`
}

// ─────────────────────────────────────────
// 5. 시스템 프롬프트 (Agent의 정체성)
// ─────────────────────────────────────────

export const AGENT_SYSTEM_PROMPT = `당신은 언더독스의 사업 기획 공동기획자(Co-planner)입니다.

당신의 역할:
- PM이 RFP/리드/연속사업 정보를 가지고 들어왔을 때, 깊이 있는 질문을 통해 PM의 암묵지를 끌어냅니다
- 단순히 정보를 수집하는 게 아니라, PM이 스스로 사고를 정리하도록 돕습니다
- 답변이 모호하면 다른 각도로 재질문합니다
- 답변이 충분히 구체적이면 다음 질문으로 넘어갑니다

당신의 톤:
- 자신감 있는 동료처럼 (선언형 "~합니다")
- 모호한 답변은 정중하게 푸시 ("좀 더 구체적으로 말씀해주실 수 있나요?")
- 강요하지 않음 — "잘 모름"도 허용
- 한국어 존댓말 ("~해주세요", "~인가요?")

당신이 절대 하지 말아야 할 것:
- 답변을 강요하기
- PM의 의견을 평가하기
- 일반론으로 대답하기
- 영어 남발하기 (꼭 필요한 전문용어만)`

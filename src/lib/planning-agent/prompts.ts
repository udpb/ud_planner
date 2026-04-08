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
} from './types'
import { buildBrandContext } from '@/lib/ud-brand'

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

  return `당신은 언더독스 사업 기획 인터뷰 분석 전문가입니다. PM의 답변에서 구조화된 정보를 추출하세요.

═══════════════════════════════════════
[현재 질문 — slot: ${question.slot}]
${slotPrompt}

[PM의 답변]
${userAnswer}

[현재 인터뷰 진행 상황]
${intentSummary}
═══════════════════════════════════════

당신의 작업:
1. 위 답변에서 핵심 정보를 추출하여 "${question.slot}" 슬롯에 저장할 값을 정리
2. 답변이 다른 슬롯에도 정보를 담고 있으면 secondary slots로 추출
3. 답변의 품질 평가 (구체성, 실행 가능성, 추가 질문 필요 여부)

[답변 품질 기준]
- isSpecific: 구체적 사례/숫자/이름 포함했는가? (vs "잘 한다", "좋을 것 같다" 같은 일반론)
- isActionable: 제안서/추천 엔진이 활용할 수 있는 정보인가?
- hasSubstance: 진짜 내용이 있는가? (vs 회피, "잘 모름", 단답)
- needsFollowup: 더 깊이 파야 할 부분이 있는가?

[가능한 슬롯 키]
- participationDecision: 왜 들어가는가 + 우리 경쟁력
- clientHiddenWants: 발주기관/고객의 진짜 의도
- mustNotFail: 절대 실패 금지 지점
- competitorWeakness: 경쟁사 + 약점
- riskFactors: 위험 요소 (배열)
- decisionMakers: 의사결정자/선정 패턴
- pastSimilarProjects: 과거 비슷한 사업 경험

반드시 아래 JSON만 반환 (마크다운 코드블록 없이):
{
  "primarySlot": "${question.slot}",
  "primaryValue": "추출된 핵심 정보를 한국어로 정리한 텍스트 (또는 빈 문자열 if 답변이 무의미)",
  "secondarySlots": [
    {
      "slot": "다른 슬롯 키",
      "value": "그 슬롯 관련 추출된 정보",
      "confidence": "low | medium | high"
    }
  ],
  "quality": {
    "isSpecific": true | false,
    "isActionable": true | false,
    "hasSubstance": true | false,
    "needsFollowup": true | false,
    "followupSuggestion": "재질문 시 어떤 각도로 물을지 (선택)"
  }
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
 * 인터뷰가 충분히 진행됐을 때 → strategicContext + 채널 컨텍스트 종합 →
 * derivedStrategy (key messages, differentiators, coach profile, section V bonus, risk mitigation) 생성.
 */
export function buildSynthesisPrompt(
  intent: PartialPlanningIntent,
): string {
  const { channel, strategicContext, bidContext, leadContext, renewalContext } = intent

  // 채널별 맥락 텍스트 빌드
  let contextText = ''
  if (channel.type === 'bid' && bidContext) {
    const rfp = bidContext.rfpFacts
    contextText = `[입찰 사업 정보]
사업명: ${rfp.projectName}
발주기관: ${rfp.client}
예산: ${rfp.totalBudgetVat ? `${(rfp.totalBudgetVat / 1e8).toFixed(2)}억` : '미정'}
대상: ${rfp.targetAudience} (${rfp.targetCount ?? '미정'}명)
목표: ${rfp.objectives.join(', ')}
평가 배점: ${rfp.evalCriteria?.map((e: any) => `${e.item}(${e.score}점)`).join(', ') ?? '미정'}
요약: ${rfp.summary}
${bidContext.callSummary ? `\n[담당자 통화 요약]\n${bidContext.callSummary}` : ''}`
  } else if (channel.type === 'lead' && leadContext) {
    contextText = `[B2B 리드 정보]
고객사: ${leadContext.clientName} (${leadContext.clientType})
담당자: ${leadContext.contact.name} (${leadContext.contact.position})
경로: ${leadContext.awarenessChannel} — ${leadContext.awarenessDetail}
사업 목적: ${leadContext.objectives}
인원: ${leadContext.desiredHeadcount ?? '미정'}명
예산: ${leadContext.budgetExcludingVat ? `${(leadContext.budgetExcludingVat / 1e6).toFixed(0)}백만원` : '미정'} (VAT 제외)
기간: ${leadContext.projectPeriodText}
예상 과업: ${leadContext.expectedTasks}
${leadContext.interactionHistory ? `\n[소통 히스토리]\n${leadContext.interactionHistory}` : ''}`
  } else if (channel.type === 'renewal' && renewalContext) {
    const r = renewalContext.previousResults
    contextText = `[연속 사업 정보]
작년 사업명: ${renewalContext.previousProjectName} (${renewalContext.previousProjectYear})
클라이언트: ${renewalContext.previousClient} ${renewalContext.isSameClient ? '(동일)' : '(변경)'}

[작년 정량 실적]
- 지원자: ${r.applicantCount ?? '?'}
- 수료율: ${r.completionRate ?? '?'}%
- 만족도: ${r.satisfactionAvg ?? '?'}/5
- 창업 전환: ${r.startupConversionCount ?? '?'}팀

[작년 잘 된 점]
${renewalContext.lessonsLearned.whatWorked.map((w) => `- ${w}`).join('\n')}

[작년 아쉬운 점]
${renewalContext.lessonsLearned.whatDidntWork.map((w) => `- ${w}`).join('\n')}

[올해 개선안]
${renewalContext.lessonsLearned.improvementsThisYear.map((w) => `- ${w}`).join('\n')}

[클라이언트 변경 요구]
${renewalContext.clientChangeRequests.map((c) => `- ${c}`).join('\n') || '(없음)'}`
  }

  // 전략 컨텍스트 텍스트
  const strategicText = `[PM 인터뷰 결과 — 전략적 맥락]
- 참여 결정/경쟁력: ${strategicContext.participationDecision || '(미입력)'}
- 클라이언트 진짜 의도: ${strategicContext.clientHiddenWants || '(미입력)'}
- 절대 실패 금지: ${strategicContext.mustNotFail || '(미입력)'}
- 경쟁사 약점: ${strategicContext.competitorWeakness || '(미입력)'}
- 위험 요소: ${strategicContext.riskFactors?.join(' / ') || '(미입력)'}
- 의사결정자: ${strategicContext.decisionMakers || '(미입력)'}
- 과거 경험: ${strategicContext.pastSimilarProjects || '(미입력)'}`

  return `당신은 언더독스의 시니어 사업 기획자입니다. 아래 사업 정보와 PM 인터뷰 결과를 종합하여 제안서 작성을 위한 전략을 도출하세요.

═══════════════════════════════════════
${buildBrandContext()}
═══════════════════════════════════════

${contextText}

═══════════════════════════════════════
${strategicText}
═══════════════════════════════════════

[당신의 작업]
위 정보를 종합하여 derivedStrategy를 생성하세요. 이건 제안서 작성의 청사진입니다.

1. **keyMessages** (3-5개): 제안서 전체를 관통할 핵심 메시지. 각 메시지는 한 문장.
   - 언더독스의 실적/자체 도구를 활용한 구체적 표현
   - "~합니다" 선언형 (~할 수 있습니다 ❌)
   - 정량 근거 포함
2. **differentiators** (3-4개): 경쟁사 대비 우리만의 차별점.
3. **coachProfile**: 이 사업에 가장 적합한 코치 프로필 (한 문장).
4. **sectionVBonus** (3-4개): RFP 범위 외 추가로 제안할 보너스 아이템.
   - 글로벌 연계, 임팩트 리포트, 후속 투자 연계, 알럼나이 네트워크 등
5. **riskMitigation** (2-4개): PM이 짚은 위험에 대한 구체적 대응 방안.

반드시 아래 JSON만 반환:
{
  "keyMessages": ["메시지1", ...],
  "differentiators": ["차별점1", ...],
  "coachProfile": "이상적 코치 한 문장",
  "sectionVBonus": ["보너스 제안1", ...],
  "riskMitigation": ["위험 대응1", ...]
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

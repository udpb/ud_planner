/**
 * Express 챗봇 프롬프트 빌더 (Phase L Wave L2, ADR-011)
 *
 * 모든 모델 무관 동일 프롬프트 (Gemini Primary / Claude fallback).
 * trailing comma 금지, 코드 펜스 금지, JSON 만 출력 강제.
 *
 * 관련 문서: docs/architecture/express-mode.md §4.2
 */

import {
  ALL_SLOTS,
  SLOT_LABELS,
  SECTION_LABELS,
  isSlotFilled,
  type ExpressDraft,
  type SectionKey,
} from './schema'
import type { ConversationState, Turn } from './conversation'
import type { RfpParsed } from '@/lib/claude'
import type { ProgramProfile } from '@/lib/program-profile'
import type { AssetMatch } from '@/lib/asset-registry'

// ─────────────────────────────────────────
// 1. 컨텍스트 포맷터 (작은 헬퍼들)
// ─────────────────────────────────────────

function listFilledSlotsText(draft: ExpressDraft): string {
  const filled = ALL_SLOTS.filter((s) => isSlotFilled(draft, s))
  if (filled.length === 0) return '아직 채워진 슬롯 없음'
  return filled.map((s) => `- ${s} (${SLOT_LABELS[s]})`).join('\n')
}

function formatRfpBrief(rfp: RfpParsed | undefined): string {
  if (!rfp) return '(아직 RFP 미파싱)'
  const lines: string[] = []
  if (rfp.projectName) lines.push(`제목: ${rfp.projectName}`)
  if (rfp.client) lines.push(`발주: ${rfp.client}`)
  if (rfp.totalBudgetVat) lines.push(`예산(VAT 포함): ${rfp.totalBudgetVat.toLocaleString()}원`)
  if (rfp.objectives && rfp.objectives.length > 0) {
    lines.push('목적:')
    for (const o of rfp.objectives.slice(0, 5)) lines.push(`  - ${o}`)
  }
  if (rfp.keywords && rfp.keywords.length > 0) {
    lines.push(`키워드: ${rfp.keywords.slice(0, 8).join(', ')}`)
  }
  if (rfp.evalCriteria && rfp.evalCriteria.length > 0) {
    lines.push('평가표:')
    for (const c of rfp.evalCriteria.slice(0, 6)) {
      lines.push(`  - ${c.item} (배점 ${c.score}점)`)
    }
  }
  return lines.join('\n')
}

function formatProfile(profile: ProgramProfile | undefined): string {
  if (!profile) return '(ProgramProfile 미설정)'
  const m = profile.methodology
  const parts: string[] = []
  const domains = profile.targetSegment?.businessDomain ?? []
  if (domains.length > 0) parts.push(`사업영역: ${domains.join(', ')}`)
  if (profile.targetStage) parts.push(`대상 단계: ${profile.targetStage}`)
  if (m?.primary) parts.push(`방법론: ${m.primary}`)
  if (profile.delivery?.mode) parts.push(`전달방식: ${profile.delivery.mode}`)
  return parts.join(' | ') || '(데이터 부족)'
}

function formatAssetMatches(matches: AssetMatch[] | undefined): string {
  if (!matches || matches.length === 0) return '(매칭된 자산 없음)'
  return matches
    .slice(0, 5)
    .map((m) => {
      const score = m.matchScore ?? 0
      const asset = m.asset
      const name = asset?.name ?? '(이름 없음)'
      const snip = asset?.narrativeSnippet?.slice(0, 100) ?? ''
      return `- ${name} (점수 ${score.toFixed(2)}) ${snip}`
    })
    .join('\n')
}

function formatRecentTurns(turns: Turn[], limit = 5): string {
  if (turns.length === 0) return '(첫 턴)'
  return turns
    .slice(-limit)
    .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
    .join('\n\n')
}

// ─────────────────────────────────────────
// 2. 메인 프롬프트
// ─────────────────────────────────────────

export interface BuildTurnPromptInput {
  state: ConversationState
  draft: ExpressDraft
  rfp?: RfpParsed
  profile?: ProgramProfile
  matchedAssets?: AssetMatch[]
  pmInput: string
  currentSlot: string | null
}

export function buildTurnPrompt(input: BuildTurnPromptInput): string {
  const slotLabel = input.currentSlot
    ? `${input.currentSlot} (${SLOT_LABELS[input.currentSlot as keyof typeof SLOT_LABELS] ?? '(미정)'})`
    : '(전체 검토 단계 — 슬롯 모두 채워짐)'

  const slotGuide = currentSlotGuide(input.currentSlot, input.matchedAssets)

  return `
당신은 언더독스의 AI 공동기획자입니다.
PM 과 함께 RFP 를 보고 30~45분 안에 "당선 가능한 1차본"을 만드는 챗봇입니다.

────────────────────────────────────────────
[북극성]
RFP → 30~45분 → 당선 가능한 기획 1차본 (7 섹션 초안).
SROI / 예산 / 코치 정밀화는 부차 — 1차본 완성이 우선.

[지금 채울 슬롯 — 이번 턴만!]
${slotLabel}

[슬롯 가이드]
${slotGuide}

[이미 채워진 슬롯]
${listFilledSlotsText(input.draft)}

────────────────────────────────────────────
[RFP 요약]
${formatRfpBrief(input.rfp)}

[ProgramProfile (11축)]
${formatProfile(input.profile)}

[매칭된 UD 자산 Top 5 — 적극 인용해 주세요]
${formatAssetMatches(input.matchedAssets)}

────────────────────────────────────────────
[최근 대화 (최대 5턴)]
${formatRecentTurns(input.state.turns, 5)}

[PM 의 이번 답]
${input.pmInput || '(첫 턴 — PM 입력 없음. 챗봇이 먼저 시작)'}

────────────────────────────────────────────
[당신의 일 — 이번 한 턴]

⚠️ **절대 금지 사항** ⚠️
1. **한 번에 1차본 7 섹션을 모두 출력하지 마세요.** 한 턴 = 한 슬롯.
2. nextQuestion 안에 마크다운 (### / [N장] / 번호 매기기) 으로 섹션 본문을 쓰지 마세요.
3. 섹션 본문은 반드시 **extractedSlots["sections.<n>"]** 안에만 넣으세요.
4. 한 턴에 sections.* 슬롯은 최대 1~2개만 채우세요. 나머지는 다음 턴.

이번 턴에 해야 할 일:
1. PM 의 이번 답에서 **"${input.currentSlot ?? '현재 슬롯'}"** 만 추출 → extractedSlots
2. 다른 슬롯도 답에 명확히 들어 있으면 같이 추출 (단, sections.* 는 최대 1~2개)
3. **다음 질문 1개** + **quickReplies 옵션 4~6개** 생성 — PM 이 클릭 한 번으로 답할 수 있는 객관식 보기 (PM 시간 절약)
4. 적절한 외부 카드 1개 첨부 (해당될 때만):
   - **외부 LLM 카드** (external-llm): 시장·통계·정책 자료가 필요하면 — 적극 활용. 매 3~5턴에 한 번.
   - **PM 직접 카드** (pm-direct): 발주처 의도·평가 위원·기관 우선순위 등 시스템이 모르는 영역 — 통화 체크리스트 제공
   - **자동 추출 카드** (auto-extract): 자산 매칭 등 자동 처리된 사항 알림

[제1원칙 4 렌즈 — 매 턴 환기]
PM 의 답이나 본인 질문이 다음 4 렌즈를 충족하는지 확인:
- **시장**: 사업이 다루는 시장이 평가위원에게 명확한가
- **통계**: 정량 수치 (KPI · 통계청 · 중기부 자료 등) 가 있는가
- **문제정의**: Before 가 절박·구체·평가위원이 공감할 수준인가
- **Before/After**: After 가 측정 가능한 변화인가

부족한 렌즈가 있으면 **외부 LLM 카드** 또는 **PM 직접 카드** 로 보완 권유.

[UD 자산 적극 인용 — 매우 중요]
- 매칭된 자산 Top 5 중 점수 높은 것을 **다음 질문 또는 sections.* 에 자연스럽게 녹이기**
  예: "Alumni Hub (10년 25,000명) 자산을 ② 추진 전략에 활용하면 어떻게 차별화될까요?"
- sections.* 채울 때 자산의 narrativeSnippet 을 그대로 인용 (수정 최소화)
- differentiators 슬롯에서는 acceptedByPm=false 인 자산 중 가장 점수 높은 것을 PM 에게 한 줄 인용 + "수락하시겠어요?" 형식의 quickReplies

[제안서 유의점 — sections.* 채울 때]
- 평가위원이 첫 5초에 핵심 메시지를 보게 — 두괄식
- 정량 수치·통계 없이 추상적 표현 X (예: "다양한", "최선을 다해" 같은 표현 금지)
- 언더독스 자산을 이름 그대로 (Alumni Hub, IMPACT 18 모듈, ACT Canvas 등) 인용
- RFP 평가표 가중치 높은 항목부터 비중 늘리기

[PM 답이 "[외부 LLM 답]" 또는 "[PM 직접 확인]" 으로 시작하면]
- 외부에서 받은 자료입니다. 다음을 자동 처리:
  1. extractedSlots["evidenceRefs"] 에 누적 추가 (배열):
     [{ "topic": "토픽", "source": "출처 (예: 통계청 2025)", "summary": "한 줄 요약", "fetchedVia": "external-llm" 또는 "pm-direct" }]
  2. 받은 자료 중 sections.* 에 인용할 만한 부분이 있으면 해당 섹션에 자연스럽게 녹이기
     - 시장 자료 / 산업 통계 → sections.1 (제안 배경)
     - 정책 자료 → sections.1 (배경)
     - 발주처 통화 결과 → sections.2 (추진 전략) 또는 sections.4 (운영 체계)
     - KPI / 임팩트 자료 → sections.6 (기대 성과)
  3. nextQuestion 에선 받은 자료를 짧게 인정 + 다음 슬롯으로 진행
  4. quickReplies 에 다음 슬롯 옵션 4개 제시

[외부 LLM 카드 / PM 직접 카드를 자주 띄우는 패턴]
- intent / beforeAfter 슬롯에서 시장·통계 자료 부족하면 → external-llm 카드
- 평가표 가중치 높은 영역에 정량 자료 부족하면 → external-llm 카드
- 발주처 의도·심사 위원 구성·기관 우선순위 모호하면 → pm-direct 카드 (통화 체크리스트 3~5개)
- 매 4턴 동안 카드 한 번도 안 띄웠으면 능동적으로 띄우기 (PM 시간 절약 + 자료 누적)

[톤·스타일]
- 한국어 존댓말, 친근하지만 전문적 (제안서 톤)
- 답변(nextQuestion) 길이: **2~4 문장** 권장 (한 줄 요약 + 가이드/맥락 + 옵션 안내)
- 섹션 본문(sections.*) 길이: **300~700자** (1차본은 디테일 X, 방향 + 차별화)

────────────────────────────────────────────
[출력 JSON 스키마] — 반드시 이 형식

{
  "extractedSlots": {
    "<slotKey>": <value>
  },
  "nextQuestion": "PM 에게 던질 질문 (2~4 문장, 마크다운 절대 금지, 섹션 본문 절대 금지)",
  "quickReplies": [
    "옵션 1 (PM 이 클릭 한 번으로 답할 수 있는 짧은 문장)",
    "옵션 2",
    "옵션 3",
    "옵션 4"
  ],
  "externalLookupNeeded": null | {
    "type": "pm-direct" | "external-llm" | "auto-extract",
    "topic": "토픽 한 줄",
    "generatedPrompt": "external-llm 일 때만 — 외부 LLM 에 던질 한국어 프롬프트",
    "checklistItems": ["pm-direct 일 때만 — 체크리스트 항목들"],
    "autoNote": "auto-extract 일 때만 — 자동 처리된 사항 한 줄"
  },
  "validationErrors": [
    { "slotKey": "...", "issue": "...", "remediation": "..." }
  ],
  "recommendedNextSlot": "intent | beforeAfter.before | beforeAfter.after | keyMessages.0 | keyMessages.1 | keyMessages.2 | differentiators | sections.1 | sections.2 | sections.3 | sections.4 | sections.6 | null"
}

JSON 만 출력. 설명·주석·마크다운 펜스 없이. trailing comma 금지.
`.trim()
}

// ─────────────────────────────────────────
// 슬롯별 가이드 — 채울 때 무엇을 봐야 하는지
// ─────────────────────────────────────────

function currentSlotGuide(currentSlot: string | null, matchedAssets?: AssetMatch[]): string {
  if (!currentSlot) return '(모두 채워짐 — 검토 / 보완 단계)'

  const topAsset = matchedAssets && matchedAssets.length > 0 ? matchedAssets[0] : null
  const assetHint = topAsset
    ? `\n- 매칭 자산 활용 힌트: "${topAsset.asset.name}" 의 narrativeSnippet 을 자연스럽게 인용`
    : ''

  switch (currentSlot) {
    case 'intent':
      return (
        '- "사업의 한 문장 정체성" 을 PM 과 합의\n' +
        '- 30자 내외, 평가위원이 5초에 이해하는 표현\n' +
        '- RFP 의 핵심 keyword 와 ProgramProfile 사업영역을 합쳐 후보 2~3개 제시 후 PM 에게 quickReplies 로 고르게 하기' +
        assetHint
      )
    case 'beforeAfter.before':
      return (
        '- 교육 전 "참가자가 처한 문제 상황" 을 1~2문장으로\n' +
        '- 정량 수치 또는 구체적 페인 포인트 (제1원칙 통계 / 문제정의 렌즈)\n' +
        '- RFP 의 targetAudience / objectives 에서 단서 찾기\n' +
        '- quickReplies 로 후보 3~4개 (예: "지역 청년 인구 유출 N%", "창업 시도 후 6개월 내 폐업 X%")'
      )
    case 'beforeAfter.after':
      return (
        '- 교육 후 "측정 가능한 변화" 를 1~2문장으로\n' +
        '- Before 와 명확히 구분되는 행동·역량·결과\n' +
        '- KPI 형태 권장 (수치 + 단위 + 기간)\n' +
        '- quickReplies 로 후보 3~4개'
      )
    case 'keyMessages.0':
    case 'keyMessages.1':
    case 'keyMessages.2': {
      const idx = Number(currentSlot.split('.')[1]) + 1
      return (
        `- 핵심 메시지 ${idx} 번 — 8~80자 짧은 슬로건\n` +
        '- 평가위원 머릿속에 박힐 "한 줄 카피"\n' +
        '- 3개 모두 다른 각도여야 함 (사업 본질 / 차별화 / 임팩트)\n' +
        '- quickReplies 로 후보 4~5개 다양한 톤'
      )
    }
    case 'differentiators':
      return (
        '- 매칭된 UD 자산 중 PM 이 채택할 3~5개를 결정\n' +
        '- 각 자산의 narrativeSnippet 을 1줄 인용 + "수락 / 제외 / 수정" quickReplies\n' +
        '- 점수 가장 높은 자산부터 한 번에 1~2개씩 PM 검토 받기' +
        assetHint
      )
    case 'sections.1':
      return (
        '- ① 제안 배경 및 목적 — 시장 진단 + 정책 맥락 + 발주처 미션\n' +
        '- 첫 단락: Before (현황·문제) → 둘째 단락: After (사업 목적)\n' +
        '- 통계 1개 이상 + UD 자산 1개 이상 인용\n' +
        '- 길이 400~600자\n' +
        '- nextQuestion 에는 절대 본문을 쓰지 말고 extractedSlots["sections.1"] 에 넣기'
      )
    case 'sections.2':
      return (
        '- ② 추진 전략 및 방법론 — 언더독스 차별화의 핵심 섹션\n' +
        '- IMPACT 18 모듈 / ACT Canvas / 매칭형 실행지원 등 자산을 적극 인용\n' +
        '- "왜 언더독스인가" 가 분명히 나와야 함\n' +
        '- 길이 500~700자\n' +
        '- extractedSlots["sections.2"] 안에만!'
      )
    case 'sections.3':
      return (
        '- ③ 교육 커리큘럼 — 회차별 큰 그림 (1차본 단계라 디테일 X)\n' +
        '- IMPACT 6단계 또는 발주처가 원하는 흐름과 매핑\n' +
        '- Action Week / 1:1 코칭 같은 차별화 요소 1~2개\n' +
        '- 길이 400~600자\n' +
        '- extractedSlots["sections.3"] 안에만!'
      )
    case 'sections.4':
      return (
        '- ④ 운영 체계 및 코치진 — PM·코치·운영팀 구조\n' +
        '- 언더독스 코치 풀 (도메인별 N명) 인용\n' +
        '- 운영 체계 (PMO·SLA·리스크 관리) 1줄씩\n' +
        '- 길이 300~500자\n' +
        '- extractedSlots["sections.4"] 안에만!'
      )
    case 'sections.6':
      return (
        '- ⑥ 기대 성과 및 임팩트 — KPI + SROI Forecast (1줄 추정)\n' +
        '- After 와 연결된 정량 KPI 3개\n' +
        '- "예상 SROI 1:N (벤치마크 기반)" 한 줄\n' +
        '- 평가표 임팩트 가중치 높으면 비중 늘리기\n' +
        '- 길이 400~600자\n' +
        '- extractedSlots["sections.6"] 안에만!'
      )
    default:
      return '(슬롯 가이드 미정의 — 슬롯 의도에 따라 자유롭게)'
  }
}

// ─────────────────────────────────────────
// 3. 첫 턴 (RFP 업로드 직후 자동) 프롬프트
// ─────────────────────────────────────────

export function buildFirstTurnPrompt(input: {
  rfp: RfpParsed
  profile?: ProgramProfile
  matchedAssets?: AssetMatch[]
}): string {
  return `
당신은 언더독스의 AI 공동기획자.
PM 이 방금 RFP 를 업로드했습니다. 이게 첫 턴입니다.

[RFP 요약]
${formatRfpBrief(input.rfp)}

[ProgramProfile]
${formatProfile(input.profile)}

[매칭된 UD 자산]
${formatAssetMatches(input.matchedAssets)}

────────────────────────────────────────────
[당신의 일 — 이번 첫 턴만]

⚠️ **절대 금지**: 1차본 7 섹션을 한 번에 쏟아내지 마세요. 한 턴 = 한 슬롯.

1. **환영 메시지** (1문장): RFP 핵심을 한 줄로 짚어주기
2. **첫 슬롯 = intent** 에 대해 PM 에게 묻기:
   - RFP 핵심 keyword 와 ProgramProfile 을 합쳐 "사업의 한 문장 정체성" 후보 **3~4개** 를 quickReplies 로 제시
   - 예: "지역 청년 창업 회복 탄력성 강화" / "도시재생 기반 청년 협동 창업 활성화" 등
3. RFP 에서 명백한 슬롯이 있으면 같이 추출:
   - intent 후보 중 한국 RFP 가 강하게 시사하는 게 있으면 extractedSlots["intent"] 미리 채움
4. **외부 LLM 카드 1개** (auto-extract) 첨부:
   - 자산 매칭 N건 알림 ("Alumni Hub, IMPACT 18 모듈 등 N개 자산이 매칭됐어요")
5. recommendedNextSlot = "intent"

[제1원칙 4 렌즈] — 첫 턴부터 환기
- 시장 / 통계 / 문제정의 / Before-After 4 렌즈가 1차본에 골고루 들어가야 함을 PM 에게 1줄로 안내

[출력 JSON 스키마]
{
  "extractedSlots": { "intent": "(있으면)", ... },
  "nextQuestion": "환영 메시지 (1문장) + 첫 질문 (2~3 문장). 마크다운 절대 금지, 섹션 본문 절대 금지.",
  "quickReplies": ["intent 후보 1", "후보 2", "후보 3", "후보 4"],
  "externalLookupNeeded": {
    "type": "auto-extract",
    "topic": "자산 매칭",
    "autoNote": "..."
  },
  "validationErrors": [],
  "recommendedNextSlot": "intent"
}

JSON 만 출력. 설명·마크다운 펜스 없이.
`.trim()
}

// ─────────────────────────────────────────
// 4. 1차본 일괄 생성 프롬프트 (종료 직전)
// ─────────────────────────────────────────

export function buildFinalDraftPrompt(input: {
  draft: ExpressDraft
  rfp?: RfpParsed
  profile?: ProgramProfile
  assetSnippets: { sectionKey: SectionKey; text: string }[]
}): string {
  const fixedSlots: string[] = []
  if (input.draft.intent) fixedSlots.push(`정체성: ${input.draft.intent}`)
  if (input.draft.beforeAfter?.before) fixedSlots.push(`Before: ${input.draft.beforeAfter.before}`)
  if (input.draft.beforeAfter?.after) fixedSlots.push(`After: ${input.draft.beforeAfter.after}`)
  if (input.draft.keyMessages) {
    input.draft.keyMessages.forEach((m, i) => fixedSlots.push(`키 메시지 ${i + 1}: ${m}`))
  }

  const assetSnippetsBySection: Record<string, string[]> = {}
  for (const a of input.assetSnippets) {
    if (!assetSnippetsBySection[a.sectionKey]) assetSnippetsBySection[a.sectionKey] = []
    assetSnippetsBySection[a.sectionKey].push(a.text)
  }

  const sectionGuide = (Object.keys(SECTION_LABELS) as SectionKey[])
    .map((k) => {
      const snips = assetSnippetsBySection[k] ?? []
      const snipText = snips.length > 0 ? `\n   인용 가능 자산: ${snips.map((s) => s.slice(0, 80)).join(' / ')}` : ''
      return `${k}. ${SECTION_LABELS[k]}${snipText}`
    })
    .join('\n')

  return `
당신은 언더독스의 AI 공동기획자.
PM 과 30~45분 대화로 핵심 슬롯을 다 채웠습니다.
이제 당선 가능한 7 섹션 1차본을 작성하세요.

────────────────────────────────────────────
[RFP 요약]
${formatRfpBrief(input.rfp)}

[ProgramProfile]
${formatProfile(input.profile)}

[고정된 핵심 슬롯]
${fixedSlots.join('\n')}

[자산 인용 가이드]
${sectionGuide}

────────────────────────────────────────────
[작성 규칙]
- 각 섹션 400~700자 (1차본은 디테일보다 방향+차별화)
- 평가위원이 첫 5초에 키 메시지를 보게 하기
- 자산은 "[자산: 이름] ..." 형식으로 인용
- 통계·수치는 RFP 와 ProgramProfile 에 있는 것만 (없으면 "추후 보강 [외부 LLM 카드]" 으로 표시)
- 한국어, 존댓말, 제안서 톤

[출력 JSON]
{
  "sections": {
    "1": "...",
    "2": "...",
    "3": "...",
    "4": "...",
    "5": "...",
    "6": "...",
    "7": "..."
  }
}

JSON 만 출력. 설명·마크다운 없이.
`.trim()
}

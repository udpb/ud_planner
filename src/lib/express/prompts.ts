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

  return `
당신은 언더독스의 AI 공동기획자입니다.
PM 과 함께 RFP 를 보고 30~45분 안에 "당선 가능한 1차본"을 만드는 챗봇입니다.

────────────────────────────────────────────
[북극성]
RFP → 30~45분 → 당선 가능한 기획 1차본 (7 섹션 초안).
SROI / 예산 / 코치 정밀화는 부차 — 1차본 완성이 우선.

[현재 채울 슬롯]
${slotLabel}

[이미 채워진 슬롯]
${listFilledSlotsText(input.draft)}

────────────────────────────────────────────
[RFP 요약]
${formatRfpBrief(input.rfp)}

[ProgramProfile (11축)]
${formatProfile(input.profile)}

[매칭된 UD 자산 Top 5]
${formatAssetMatches(input.matchedAssets)}

────────────────────────────────────────────
[최근 대화 (최대 5턴)]
${formatRecentTurns(input.state.turns, 5)}

[PM 의 이번 답]
${input.pmInput || '(첫 턴 — PM 입력 없음. 챗봇이 먼저 시작)'}

────────────────────────────────────────────
[당신의 일]

1. PM 의 답에서 "${input.currentSlot ?? '아무 슬롯'}" 을 우선으로 추출
   - 다른 슬롯도 답에 포함돼 있으면 동시에 추출 (Partial Extraction)
2. 추출 값이 zod 검증 통과 가능한지 판단 (intent 20자+, keyMessages 8자+ 등)
3. 다음 질문 1개 생성 (또는 외부 LLM 카드 제안)
4. 응답을 JSON 으로만 출력 — trailing comma 금지, 마크다운 펜스 금지

[외부 LLM 카드 트리거]
- 시장·통계·정책 자료가 필요하면 type='external-llm' + generatedPrompt 채움
- 발주처 의도·내부 정보 등 시스템이 모르는 영역이면 type='pm-direct' + checklistItems 채움
- 시스템이 자동 처리한 사항(예: RFP 파싱 직후 자산 매칭)이면 type='auto-extract' + autoNote 채움

[톤·스타일]
- 한국어 존댓말, 친근하지만 전문적
- "당선 가능한 1차본"이라는 북극성을 잊지 마세요
- 슬롯 하나가 막히면 외부 LLM 카드로 우회 (PM 시간 아끼기)

────────────────────────────────────────────
[출력 JSON 스키마]
{
  "extractedSlots": {
    "<slotKey>": <value>,
    ...
  },
  "nextQuestion": "다음 PM 에게 던질 질문 (없으면 \"\")",
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
  "recommendedNextSlot": "intent | beforeAfter.before | ... | null"
}

JSON 만 출력. 설명·주석·마크다운 없이.
`.trim()
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

[당신의 일 — 이번 턴만]
1. RFP 에서 직접 추출 가능한 슬롯들 (intent, keyMessages 후보, sections.1 일부) 을 채움
2. PM 에게 환영 메시지 + 다음 질문 (보통 intent 확정 또는 Before/After) 던짐
3. 매칭된 자산이 있으면 첫 번째 외부 LLM 카드(auto-extract)로 알림

[출력 JSON 스키마] — 위 buildTurnPrompt 와 동일

JSON 만 출력. 설명·마크다운 없이.
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

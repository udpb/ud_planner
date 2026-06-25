/**
 * ②기획의도 (Planning Intent) — 하이브리드 초안 + 대화 정제 + StrategicNotes 매핑
 *
 * 재설계 v1 §5 ② (program-workspace-redesign-v1.md) · BR-WS-3.
 *
 * 역할:
 *   - draftPlanningIntent(): RFP 핵심 + 프로파일 + 매칭 자산 → 4카드 **초안**(목표해석·
 *     작년대비·차별점·리스크) + 카드별 confidence. AI 가 모르는 작년/담당자 암묵지는 low.
 *     (Pro 티어 = 기본 invokeAi)
 *   - refineIntentField(): PM 답변을 해당 필드 값으로 정제 (Flash 티어 = 즉답).
 *   - toStrategicNotes()/fromStrategicNotes(): 화면 4카드 ↔ 기존 `StrategicNotes`
 *     (src/lib/ai/strategic-notes.ts) 양방향 매핑. **저장은 기존 필드로만** (스키마 변경 0).
 *
 * 불변(재설계 §3·§8):
 *   - AI 는 초안만 — 결정·변형은 PM. 강제값 0.
 *   - AI 호출은 `invokeAi` 단일 진입점만 (외부 LLM 0).
 *   - `StrategicNotes` 인터페이스는 import 만 (수정 0).
 *
 * 4카드 ↔ StrategicNotes 매핑 (BR-WS-3):
 *   | 화면 카드            | StrategicNotes 필드                         |
 *   | 목표 해석            | clientHiddenWants                          |
 *   | 작년 대비            | pastSimilarProjects                        |
 *   | 차별점 (우리 우위)   | competitorWeakness                         |
 *   | 리스크 (담당자 우려) | riskFactors[] (+ 핵심 1개 mustNotFail)     |
 *   | (선택) 메인 전략     | winStrategy                                |
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS, FLASH_MODEL } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'
import type { AssetMatch } from '@/lib/asset-registry-types'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'

// ─────────────────────────────────────────────────────────────────
// 타입 — 화면 4카드 초안
// ─────────────────────────────────────────────────────────────────

/** 카드별 AI 확신도. low = "?" 핀 → PM 대화로 채움. */
export type IntentConfidence = 'high' | 'low'

/** ②기획의도 4카드 필드 키 — route/컴포넌트 공유. */
export type IntentFieldKey =
  | 'goalInterpretation'
  | 'yearOverYear'
  | 'differentiation'
  | 'risk'
  | 'winStrategy'

/** 단일 카드 — 값 + AI 확신도. 값은 PM 이 직접 고쳐도 됨(§3 원칙2). */
export interface IntentCard {
  /** 카드 본문 (AI 초안 또는 PM 편집/대화 결과). 비어있을 수 있음(강제값 0). */
  value: string
  /** AI 확신도 — UI 상태(저장은 값만). */
  confidence: IntentConfidence
}

/**
 * ②기획의도 초안 — 4카드(+선택 전략). 전부 default(빈 값·low) 가능.
 * winStrategy 는 PM 자유 입력 카드 — 초안에서는 보통 비어있음(low).
 */
export interface PlanningIntentDraft {
  /** 목표 해석 — RFP 목표를 우리 관점으로 재해석. → clientHiddenWants */
  goalInterpretation: IntentCard
  /** 작년 대비 무엇이 달라야 — 작년 암묵지는 AI 가 모름 → 보통 low. → pastSimilarProjects */
  yearOverYear: IntentCard
  /** 차별점 — 우리 우위. → competitorWeakness */
  differentiation: IntentCard
  /** 리스크 — 담당자 우려. → riskFactors[] (+ 핵심 1개 mustNotFail) */
  risk: IntentCard
  /** (선택) 메인 솔루션·전략 — PM 자유 입력. → winStrategy */
  winStrategy: IntentCard
}

// ─────────────────────────────────────────────────────────────────
// StrategicNotes ↔ Draft 매핑 (저장은 기존 필드로만)
// ─────────────────────────────────────────────────────────────────

const EMPTY_CARD = (): IntentCard => ({ value: '', confidence: 'low' })

/** 빈 초안 — 시드 없을 때 fallback. 전부 default. */
export function emptyPlanningIntentDraft(): PlanningIntentDraft {
  return {
    goalInterpretation: EMPTY_CARD(),
    yearOverYear: EMPTY_CARD(),
    differentiation: EMPTY_CARD(),
    risk: EMPTY_CARD(),
    winStrategy: EMPTY_CARD(),
  }
}

/**
 * 저장된 `StrategicNotes` → 화면 초안 시드.
 * 저장된 값이 있으면 confidence='high'(PM 이 이미 확정한 값으로 간주), 없으면 low.
 * riskFactors[] 는 줄바꿈으로 합쳐 카드 1개로 표시 (mustNotFail 은 맨 앞에).
 */
export function fromStrategicNotes(
  notes: StrategicNotes | null | undefined,
): PlanningIntentDraft {
  if (!notes) return emptyPlanningIntentDraft()

  const card = (value: string | undefined): IntentCard =>
    value && value.trim()
      ? { value: value.trim(), confidence: 'high' }
      : EMPTY_CARD()

  // 리스크: mustNotFail(핵심) 을 맨 앞에 두고 riskFactors 를 줄바꿈으로 합침.
  const riskLines: string[] = []
  if (notes.mustNotFail?.trim()) riskLines.push(notes.mustNotFail.trim())
  if (Array.isArray(notes.riskFactors)) {
    for (const r of notes.riskFactors) {
      if (typeof r === 'string' && r.trim() && r.trim() !== notes.mustNotFail?.trim()) {
        riskLines.push(r.trim())
      }
    }
  }

  return {
    goalInterpretation: card(notes.clientHiddenWants),
    yearOverYear: card(notes.pastSimilarProjects),
    differentiation: card(notes.competitorWeakness),
    risk: riskLines.length
      ? { value: riskLines.join('\n'), confidence: 'high' }
      : EMPTY_CARD(),
    winStrategy: card(notes.winStrategy),
  }
}

/**
 * 화면 초안 → 저장용 `StrategicNotes` (PUT 에서 prisma.project.update 에 그대로 전달).
 * 빈 카드는 필드 생략(토큰 절약·formatStrategicNotes 가 빈 필드 skip 과 일치).
 *
 * ⚠️ **기존 `clientOfficialDoc` 등 다른 필드는 호출부에서 병합** — 이 함수는 4카드가
 *    매핑하는 6개 필드만 produce 한다. route 가 spread 로 보존.
 */
export function toStrategicNotes(draft: PlanningIntentDraft): StrategicNotes {
  const notes: StrategicNotes = {}

  const goal = draft.goalInterpretation.value.trim()
  if (goal) notes.clientHiddenWants = goal

  const yoy = draft.yearOverYear.value.trim()
  if (yoy) notes.pastSimilarProjects = yoy

  const diff = draft.differentiation.value.trim()
  if (diff) notes.competitorWeakness = diff

  const win = draft.winStrategy.value.trim()
  if (win) notes.winStrategy = win

  // 리스크: 줄바꿈 분리 → 첫 줄 = mustNotFail(핵심), 전체 = riskFactors[].
  const riskRaw = draft.risk.value.trim()
  if (riskRaw) {
    const lines = riskRaw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length) {
      notes.riskFactors = lines
      notes.mustNotFail = lines[0]
    }
  }

  return notes
}

// ─────────────────────────────────────────────────────────────────
// AI 초안 생성 (Pro 티어)
// ─────────────────────────────────────────────────────────────────

export interface DraftPlanningIntentInput {
  rfp: RfpParsed
  profile?: ProgramProfile | null
  assetMatches?: AssetMatch[]
}

/** AI 가 반환하는 raw shape (검증 전). */
interface RawDraftCard {
  value?: unknown
  confidence?: unknown
}
interface RawDraft {
  goalInterpretation?: RawDraftCard
  yearOverYear?: RawDraftCard
  differentiation?: RawDraftCard
  risk?: RawDraftCard
}

function coerceCard(raw: RawDraftCard | undefined, fallback: IntentConfidence): IntentCard {
  const value = typeof raw?.value === 'string' ? raw.value.trim() : ''
  const confidence: IntentConfidence = raw?.confidence === 'high' ? 'high' : fallback
  // 값이 비어있으면 무조건 low ("?" 핀 대상)
  return { value, confidence: value ? confidence : 'low' }
}

/** 매칭 자산 → 프롬프트용 짧은 목록 (상위 6개 이름·근거). */
function assetHint(matches: AssetMatch[] | undefined): string {
  if (!matches?.length) return '(매칭된 자산 없음)'
  return matches
    .slice(0, 6)
    .map((m) => `- ${m.asset.name} (${m.matchReasons[0] ?? '관련 자산'})`)
    .join('\n')
}

/** 프로파일 → 프롬프트용 짧은 요약 (있을 때만). */
function profileHint(p: ProgramProfile | null | undefined): string {
  if (!p) return ''
  const parts: string[] = []
  if (p.targetStage) parts.push(`대상단계=${p.targetStage}`)
  if (p.scale) parts.push(`규모=${p.scale}`)
  if (Array.isArray(p.formats) && p.formats.length) parts.push(`형태=${p.formats.join('·')}`)
  if (Array.isArray(p.primaryImpact) && p.primaryImpact.length) {
    parts.push(`핵심임팩트=${p.primaryImpact.join('·')}`)
  }
  return parts.length ? `\n[우리 프로그램 프로파일] ${parts.join(' / ')}` : ''
}

/**
 * RFP·프로파일·자산 → 4카드 초안 (Pro 티어).
 *
 * 핵심 지침(프롬프트):
 *   - 작년 운영·담당자 암묵지는 AI 가 모른다 → yearOverYear/risk 는 보통 confidence='low'
 *     (PM 이 대화로 채우도록). 근거 있는 추론만 high.
 *   - 강제·과장 금지. 모르면 비워도 된다(빈 value → low).
 */
export async function draftPlanningIntent(
  input: DraftPlanningIntentInput,
): Promise<PlanningIntentDraft> {
  const { rfp, profile, assetMatches } = input

  const objectives = Array.isArray(rfp.objectives) ? rfp.objectives.filter(Boolean) : []
  const evalCriteria = Array.isArray(rfp.evalCriteria)
    ? rfp.evalCriteria
        .filter((c) => c && c.item)
        .map((c) => `${c.item}(${c.score}점)`)
        .join(', ')
    : ''

  const prompt = `당신은 언더독스(교육·창업지원 전문)의 기획 PM 을 돕는 보조입니다.
아래 RFP 핵심과 우리 자산을 보고, 이 사업을 "왜 이렇게 가는가"의 **기획의도 초안** 4장을 만드세요.
당신은 **초안만** 깝니다 — 결정과 변형은 PM 이 합니다. 모르는 것은 비워도 됩니다(강요·과장 금지).

[RFP 핵심]
- 사업명: ${rfp.projectName ?? ''}
- 발주처: ${rfp.client ?? ''}
- 대상: ${rfp.targetAudience ?? ''}${rfp.targetCount ? ` (${rfp.targetCount}명)` : ''}
- 목표: ${objectives.length ? objectives.join(' / ') : '(명시 안 됨)'}
- 평가배점: ${evalCriteria || '(명시 안 됨)'}
- 요약: ${rfp.summary ?? ''}${profileHint(profile)}

[닮은 우리 자산]
${assetHint(assetMatches)}

다음 4장의 카드를 작성하세요. 각 카드는 1~3문장의 한국어 초안과 confidence("high" 또는 "low")를 가집니다.
- goalInterpretation(목표 해석): RFP 목표를 우리 관점으로 재해석. RFP 의 목표·맥락이 합리적으로 읽히면 "high" 로 두세요(대부분 high — 목표·맥락이 정말 모호해 해석 근거가 거의 없을 때만 "low"). PM 이 "AI 가 깔아준다"고 느끼도록 유용한 초안을 적극적으로 채우세요.
- yearOverYear(작년 대비): 작년 운영 대비 무엇이 달라져야 하나. **작년 운영·담당자 암묵지는 당신이 알 수 없으므로** confidence="low" 로 두세요(PM 이 대화로 확정). 단, value 는 빈칸으로 두지 말고 RFP·일반 맥락에 근거한 **유용한 잠정 가설**("이렇게 가정해봤어요" 수준)을 1~3문장으로 채우세요. 단서가 RFP 에 명시돼 있으면만 "high".
- differentiation(차별점): 우리(언더독스)의 우위·차별점. 매칭 자산이 있거나 언더독스의 일반 강점(코치풀·자산·방법론)으로 말할 수 있으면 "high".
- risk(리스크): 담당자가 우려할 핵심 리스크. **담당자 우려는 사람만 아는 영역**이므로 confidence="low" 로 두세요(PM 이 대화로 확정). 단, value 는 빈칸으로 두지 말고 RFP 의 제약·평가배점·일반 맥락에 근거한 **유용한 잠정 리스크 가설**을 1~3문장으로 채우세요. RFP 의 제약·평가배점에서 명백히 드러나면만 "high".

반드시 아래 JSON 형식만 반환하세요 (마크다운 코드블록 없이):
{
  "goalInterpretation": { "value": "초안 문장", "confidence": "high" | "low" },
  "yearOverYear": { "value": "초안 문장", "confidence": "low" },
  "differentiation": { "value": "초안 문장", "confidence": "high" | "low" },
  "risk": { "value": "초안 문장", "confidence": "low" }
}`

  const result = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.STANDARD,
    temperature: 0.5,
    label: 'planning-intent-draft',
  })

  const raw = safeParseJson<RawDraft>(result.raw, 'planning-intent-draft')

  return {
    goalInterpretation: coerceCard(raw.goalInterpretation, 'high'),
    // 작년/리스크는 AI 가 모르는 영역 → 기본 low (값 있어도 명시 high 아니면 low)
    yearOverYear: coerceCard(raw.yearOverYear, 'low'),
    differentiation: coerceCard(raw.differentiation, 'high'),
    risk: coerceCard(raw.risk, 'low'),
    // winStrategy 는 PM 자유 입력 — 초안에서는 빈 값.
    winStrategy: EMPTY_CARD(),
  }
}

// ─────────────────────────────────────────────────────────────────
// 대화 정제 (Flash 티어 = 즉답)
// ─────────────────────────────────────────────────────────────────

export interface RefineIntentFieldInput {
  field: IntentFieldKey
  /** PM 의 자연어 답변. */
  pmMessage: string
  /** 현재 초안(맥락). */
  currentDraft: PlanningIntentDraft
  rfp?: RfpParsed | null
}

const FIELD_LABEL: Record<IntentFieldKey, string> = {
  goalInterpretation: '목표 해석 (RFP 목표 재해석)',
  yearOverYear: '작년 대비 무엇이 달라야 하나',
  differentiation: '차별점 (우리 우위)',
  risk: '리스크 (담당자 우려)',
  winStrategy: '메인 솔루션·전략',
}

/** AI 정제 결과 raw shape. */
interface RawRefine {
  value?: unknown
}

/**
 * PM 답변을 해당 카드 값으로 정제 (Flash 티어 즉답).
 * 정제된 값은 PM 이 명시적으로 채운 것이므로 confidence='high' 로 올린다.
 * @returns 정제된 카드 값(문자열). 호출부가 해당 필드에 반영.
 */
export async function refineIntentField(
  input: RefineIntentFieldInput,
): Promise<string> {
  const { field, pmMessage, currentDraft, rfp } = input
  const current = currentDraft[field]?.value ?? ''

  const prompt = `당신은 언더독스 기획 PM 의 보조입니다.
"${FIELD_LABEL[field]}" 카드를 PM 의 답변에 맞춰 1~3문장의 한국어로 다듬으세요.
PM 의 의도를 살리되, 기획의도로 읽히도록 간결하게. 과장·새 사실 추가 금지.
${rfp?.projectName ? `\n[사업명] ${rfp.projectName}` : ''}
[현재 카드 초안] ${current || '(비어있음)'}
[PM 답변] ${pmMessage}

반드시 아래 JSON 만 반환 (마크다운 없이):
{ "value": "다듬은 카드 문장" }`

  const result = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.LIGHT,
    temperature: 0.4,
    model: FLASH_MODEL,
    label: 'planning-intent-refine',
  })

  const raw = safeParseJson<RawRefine>(result.raw, 'planning-intent-refine')
  const value = typeof raw.value === 'string' ? raw.value.trim() : ''
  // 정제 실패(빈 값) 시 PM 원문을 그대로 사용 — 강제값 0 원칙: PM 입력은 버리지 않음.
  return value || pmMessage.trim()
}

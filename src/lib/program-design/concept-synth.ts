/**
 * concept-synth — 컨셉 합성·대화 엔진 (ADR-031 Wave 1, 백엔드 전용)
 *
 * 프로그램 기획을 "컨셉-퍼스트"로 도출하는 백엔드 엔진. RFP + strategicNotes(기획의도)
 * + 자산(matchAssetsToRfp) + best-effort 당선패턴을 그라운딩으로 받아:
 *   1) `conceptStep`  — 단계별(angle → differentiation → message) 날 선 질문 + 선택 카드(Flash)
 *   2) `assembleConcept` — 누적 선택(picks) + 그라운딩 → ConceptShape 조립(Pro, engine.wintheme)
 *
 * 원칙 (ADR-031 불변 계약):
 *   - 카드 = PM 선택만 반영. 강제 변경 금지(엔진이 PM 선택을 덮어쓰지 않음).
 *   - 점수/합격/SROI 단정 금지. SROI 는 렌즈 — 높을수록 좋은 게 아님.
 *   - 근거(grounding)·좁혀온 경로(derivationPath) 투명.
 *   - 모든 AI = invokeAi 단일 진입 + safeParseJson. 빈/형식불량 → graceful 안전값(throw X).
 *   - 엔진은 fetch 안 함 — 그라운딩은 route 가 ctx 로 주입(엔진 = 순수 + AI 호출만).
 *
 * 영속은 라우트(/api/projects/[id]/concept PUT)가 strategicNotes.concept 으로 처리한다.
 */

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS, FLASH_MODEL, modelFor } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'

// ─────────────────────────────────────────────────────────────────
// 동결 계약 타입 (브리프 §계약)
// ─────────────────────────────────────────────────────────────────

/** 조립된 컨셉 — strategicNotes.concept 에 저장되는 형태 (ADR-031 데이터 모델). */
export interface ConceptShape {
  /** 한 줄 컨셉 (win-theme). */
  winTheme: string
  /** 핵심 메시지 — 정확히 3개. */
  keyMessages: string[]
  /** 차별점 (우리 우위 / 날 세운 각도). */
  differentiation: string
  /** 근거 — RFP·당선패턴·자산에서 끌어온 출처. */
  grounding: { kind: 'rfp' | 'winning' | 'asset'; label: string; ref?: string }[]
  /** 좁혀온 경로 — 선택 라벨들, 순서대로. */
  derivationPath: string[]
  /** 선택된 각도 (angle 단계 선택). */
  chosenAngle?: string
}

/** 한 단계에서 PM 에게 제시되는 선택 카드. value = 이 선택이 컨셉에 넣는 내용. */
export interface ConceptCard {
  label: string
  sub?: string
  value: string
}

/** PM 의 누적 선택 1건. */
export interface ConceptPick {
  stepKey: string
  label: string
  value: string
}

/** 한 단계의 대화 결과 — 질문 + 카드 + 마지막 단계 여부. */
export interface ConceptStepResult {
  stepKey: string
  question: string
  cards: ConceptCard[]
  done: boolean
}

/**
 * 그라운딩 컨텍스트 — route 가 조립해서 엔진에 주입한다.
 * 엔진은 이 안에서만 재료를 쓴다(직접 prisma/asset fetch 안 함).
 */
export interface ConceptGrounding {
  /** RFP 핵심 (사업명·발주처·목표·대상 등). 프롬프트 맥락용. */
  rfpSummary: string
  /** 채널(B2G/B2B/renewal) — 카드 편향·당선패턴 매칭 참고. */
  channel?: string
  /** 기획의도 포맷 텍스트 (formatStrategicNotes 결과). */
  intentText?: string
  /** 자산 그라운딩 — narrativeSnippet 등 (matchAssetsToRfp 결과를 route 가 평탄화). */
  assets: { label: string; snippet?: string }[]
  /** best-effort 당선패턴 — 채널 일치 doc 일부 (없으면 빈 배열). */
  winning: { label: string; ref?: string }[]
}

export interface ConceptCtx {
  grounding: ConceptGrounding
  /** PM 자유 입력 힌트 (있으면 카드 편향). */
  message?: string
}

// ─────────────────────────────────────────────────────────────────
// 단계 골격 (고정) — 카드 *내용* 만 AI 생성
//   angle(날 세울 각도) → differentiation(차별점) → message(발주처 우려에 답할 한 줄) → done
//   picks.length 로 다음 stepKey 결정 (0→angle, 1→differentiation, 2→message, 3+→done).
// ─────────────────────────────────────────────────────────────────

interface StepSpec {
  stepKey: string
  /** AI 가 질문을 못 낼 때의 안전 fallback 질문. */
  fallbackQuestion: string
  /** 이 단계의 의도 — 프롬프트에 주입. */
  intent: string
}

const STEP_SEQUENCE: StepSpec[] = [
  {
    stepKey: 'angle',
    fallbackQuestion: '이 사업에서 날을 세울 각도는 무엇일까요? 가장 뾰족한 한 가지를 골라주세요.',
    intent:
      '이 사업을 "남다르게" 읽어낼 각도(angle). RFP·발주처 진짜 의도·당선패턴에서 끌어온, 경쟁사가 놓칠 만한 관점.',
  },
  {
    stepKey: 'differentiation',
    fallbackQuestion: '고른 각도를 우리만의 차별점으로 어떻게 벼릴까요?',
    intent:
      '앞서 고른 각도를 언더독스만의 차별점으로 구체화. 자산(검증된 방법론·코치풀·플랫폼)과 당선 경험으로 뒷받침되는 우위.',
  },
  {
    stepKey: 'message',
    fallbackQuestion: '발주처의 핵심 우려에 답할 한 줄 메시지는 무엇일까요?',
    intent:
      '발주처가 가장 걱정하는 지점에 정면으로 답하는 한 줄 메시지. 앞 단계 선택을 발주처 언어로 번역.',
  },
]

/** picks 개수로 현재 단계 결정. 시퀀스를 넘으면 done. */
function stepSpecFor(pickCount: number): StepSpec | null {
  return STEP_SEQUENCE[pickCount] ?? null
}

// ─────────────────────────────────────────────────────────────────
// 프롬프트 공통 — 그라운딩 블록
// ─────────────────────────────────────────────────────────────────

function groundingBlock(g: ConceptGrounding): string {
  const lines: string[] = []
  lines.push(`[RFP 요약] ${g.rfpSummary || '(없음)'}`)
  if (g.channel) lines.push(`[채널] ${g.channel}`)
  if (g.intentText && g.intentText.trim()) lines.push(`[기획의도]\n${g.intentText.trim()}`)
  if (g.assets.length) {
    const a = g.assets
      .slice(0, 6)
      .map((x) => `- ${x.label}${x.snippet ? `: ${x.snippet}` : ''}`)
      .join('\n')
    lines.push(`[활용 가능 자산 — 정량 근거 우대]\n${a}`)
  }
  if (g.winning.length) {
    const w = g.winning
      .slice(0, 4)
      .map((x) => `- ${x.label}`)
      .join('\n')
    lines.push(`[참고 당선 사례 (채널 일치)]\n${w}`)
  }
  return lines.join('\n')
}

const RULES = `규칙:
- 점수·합격 여부·SROI 수치를 단정하지 마세요(SROI 는 렌즈일 뿐입니다).
- 과장·새 사실 날조 금지. 근거는 위 그라운딩에서만.
- 당선패턴·자산 등 정량 근거를 우대하세요.`

function picksBlock(picks: ConceptPick[]): string {
  if (!picks.length) return '[지금까지 선택] (없음 — 첫 단계)'
  return `[지금까지 선택 — 좁혀온 경로]\n${picks
    .map((p, i) => `${i + 1}. (${p.stepKey}) ${p.label}: ${p.value}`)
    .join('\n')}`
}

// ─────────────────────────────────────────────────────────────────
// conceptStep — 다음 질문 + 선택 카드 2~3개 (Flash)
// ─────────────────────────────────────────────────────────────────

interface RawStep {
  question?: unknown
  cards?: unknown
}

function coerceCards(raw: unknown): ConceptCard[] {
  if (!Array.isArray(raw)) return []
  const out: ConceptCard[] = []
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue
    const obj = c as Record<string, unknown>
    const label = typeof obj.label === 'string' ? obj.label.trim() : ''
    const value =
      typeof obj.value === 'string' ? obj.value.trim() : label // value 없으면 label 재사용
    if (!label && !value) continue
    const card: ConceptCard = { label: label || value, value: value || label }
    if (typeof obj.sub === 'string' && obj.sub.trim()) card.sub = obj.sub.trim()
    out.push(card)
    if (out.length >= 3) break
  }
  return out
}

/**
 * 다음 단계의 질문 + 선택 카드 2~3개를 생성한다. 단계는 picks.length 로 결정(고정 골격).
 * 시퀀스를 넘으면 `{ done:true, cards:[] }`. AI 실패/빈 출력 → fallback 질문 + 빈 카드(graceful).
 */
export async function conceptStep(
  ctx: ConceptCtx,
  picks: ConceptPick[],
): Promise<ConceptStepResult> {
  const safePicks = Array.isArray(picks) ? picks : []
  const spec = stepSpecFor(safePicks.length)

  // 시퀀스 종료 — 더 물을 단계 없음.
  if (!spec) {
    return { stepKey: 'done', question: '', cards: [], done: true }
  }

  const hint = ctx.message?.trim()
  const prompt = `당신은 언더독스(교육·창업지원 전문) 기획 PM 과 함께 "컨셉을 단계별로 벼리는" 대화 보조입니다.
지금 단계: **${spec.stepKey}** — ${spec.intent}

${groundingBlock(ctx.grounding)}

${picksBlock(safePicks)}
${hint ? `\n[PM 힌트] ${hint} (이 힌트 방향으로 카드를 편향하되 강제하지 마세요)` : ''}

이 단계에 맞는 **날 선 질문 1개** 와, PM 이 고를 **선택 카드 2~3개** 를 제안하세요.
- 각 카드의 value 는 이 선택이 컨셉에 그대로 들어갈 1~2문장의 완성된 한국어 내용입니다.
- label 은 카드를 한눈에 구분할 짧은 제목, sub 는 선택. 서로 다른 관점·각도를 갖게.
${RULES}

반드시 아래 JSON 만 반환 (마크다운 없이):
{ "question": "한 줄 질문", "cards": [ { "label": "짧은 제목", "sub": "보조 설명(선택)", "value": "컨셉에 들어갈 완성 내용" } ] }`

  try {
    const result = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.7,
      model: FLASH_MODEL,
      label: `concept-step-${spec.stepKey}`,
    })
    const raw = safeParseJson<RawStep>(result.raw, `concept-step-${spec.stepKey}`)
    const question =
      typeof raw.question === 'string' && raw.question.trim()
        ? raw.question.trim()
        : spec.fallbackQuestion
    const cards = coerceCards(raw.cards)
    return { stepKey: spec.stepKey, question, cards, done: false }
  } catch (err) {
    log.warn('ai', 'concept-step graceful fallback (AI/parse 실패)', {
      stepKey: spec.stepKey,
      error: String((err as { message?: string })?.message ?? err).slice(0, 200),
    })
    // graceful — 던지지 않고 fallback 질문 + 빈 카드(PM 자유 입력 가능).
    return { stepKey: spec.stepKey, question: spec.fallbackQuestion, cards: [], done: false }
  }
}

// ─────────────────────────────────────────────────────────────────
// assembleConcept — picks + 그라운딩 → ConceptShape (Pro, engine.wintheme)
// ─────────────────────────────────────────────────────────────────

interface RawConcept {
  winTheme?: unknown
  keyMessages?: unknown
  differentiation?: unknown
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** 정확히 3개의 keyMessages 보장 — 부족하면 picks/안전 문구로 채우고, 초과면 자른다. */
function normalizeKeyMessages(raw: unknown, picks: ConceptPick[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (s: string) => {
    const v = s.trim()
    if (!v || seen.has(v)) return
    seen.add(v)
    out.push(v)
  }
  if (Array.isArray(raw)) {
    for (const m of raw) {
      if (typeof m === 'string') push(m)
      if (out.length >= 3) break
    }
  }
  // 부족하면 picks 값으로 보강 (강제 변경 아님 — PM 선택 내용 재사용).
  if (out.length < 3) {
    for (const p of picks) {
      push(p.value)
      if (out.length >= 3) break
    }
  }
  // 여전히 부족하면 안전 placeholder (점수/단정 없는 중립 문구).
  while (out.length < 3) {
    push(`핵심 메시지 ${out.length + 1} — 추가 입력 필요`)
  }
  return out.slice(0, 3)
}

/** 그라운딩 + picks 로 grounding[] 구성 (투명 근거). */
function buildGrounding(g: ConceptGrounding): ConceptShape['grounding'] {
  const out: ConceptShape['grounding'] = []
  if (g.rfpSummary && g.rfpSummary.trim()) {
    out.push({ kind: 'rfp', label: g.rfpSummary.slice(0, 80) })
  }
  for (const w of g.winning.slice(0, 4)) {
    out.push({ kind: 'winning', label: w.label, ...(w.ref ? { ref: w.ref } : {}) })
  }
  for (const a of g.assets.slice(0, 6)) {
    out.push({ kind: 'asset', label: a.label })
  }
  return out
}

/**
 * 누적 선택(picks) + 그라운딩을 ConceptShape 로 조립한다 (Pro = engine.wintheme).
 * AI 가 winTheme·keyMessages·differentiation 의 *문구* 를 합성하고, grounding/derivationPath 는
 * 코드가 결정(투명·재현 가능). AI 실패/빈 출력 → picks 기반 graceful 조립(throw X).
 */
export async function assembleConcept(
  ctx: ConceptCtx,
  picks: ConceptPick[],
): Promise<ConceptShape> {
  const safePicks = Array.isArray(picks) ? picks : []
  const g = ctx.grounding
  const derivationPath = safePicks.map((p) => p.label).filter((l) => !!l && !!l.trim())
  const chosenAngle = safePicks.find((p) => p.stepKey === 'angle')?.value?.trim() || undefined
  const grounding = buildGrounding(g)
  const hint = ctx.message?.trim()

  const prompt = `당신은 언더독스(교육·창업지원 전문) 수주 기획 전문가입니다.
PM 이 대화로 좁혀온 선택을 **하나의 날 선 컨셉** 으로 조립하세요.

${groundingBlock(g)}

${picksBlock(safePicks)}
${hint ? `\n[PM 힌트] ${hint}` : ''}

위 선택과 근거를 종합해 컨셉을 합성하세요:
- winTheme: 이 사업을 관통하는 한 줄 컨셉 (날카롭게, 발주처가 "이거다" 할 한 문장).
- keyMessages: 정확히 **3개**. 각각 1~2문장의 완성된 핵심 메시지(커리큘럼·예산·제안서를 관통할 척추).
- differentiation: 언더독스만의 차별점(앞 선택·자산·당선 경험 근거).
${RULES}

반드시 아래 JSON 만 반환 (마크다운 없이):
{ "winTheme": "한 줄 컨셉", "keyMessages": ["메시지1", "메시지2", "메시지3"], "differentiation": "차별점" }`

  let aiRaw: RawConcept | null = null
  try {
    const result = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.5,
      model: modelFor('engine.wintheme'),
      label: 'concept-assemble',
    })
    aiRaw = safeParseJson<RawConcept>(result.raw, 'concept-assemble')
  } catch (err) {
    log.warn('ai', 'concept-assemble graceful fallback (AI/parse 실패)', {
      error: String((err as { message?: string })?.message ?? err).slice(0, 200),
    })
    aiRaw = null
  }

  // graceful 조립 — AI 가 비어도 picks 로 안전한 ConceptShape 구성(throw X).
  const fallbackTheme =
    chosenAngle ||
    safePicks[safePicks.length - 1]?.value ||
    '컨셉을 더 좁혀주세요 — 추가 입력 필요'

  const winTheme = asStr(aiRaw?.winTheme) || fallbackTheme
  const keyMessages = normalizeKeyMessages(aiRaw?.keyMessages, safePicks)
  const differentiation =
    asStr(aiRaw?.differentiation) ||
    safePicks.find((p) => p.stepKey === 'differentiation')?.value ||
    '차별점 — 추가 입력 필요'

  return {
    winTheme,
    keyMessages,
    differentiation,
    grounding,
    derivationPath,
    ...(chosenAngle ? { chosenAngle } : {}),
  }
}

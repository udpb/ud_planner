/**
 * author — 덱-우선 저작 파이프라인 (DECK-3, ADR-025 Phase 3)
 *
 * ⚠️ **env-gated**: 이 모듈은 `invokeAi`(LLM) 와 grounding(DB 유래)을 소비한다. import·typecheck·
 * lint 는 통과하지만 **실행 검증은 LLM/DB 가용 환경(메인 세션)이 직접** 한다(브리프 §5). 결정론적
 * 검증 경로(`scripts/_render-spec.ts`)는 이 파일을 호출하지 않는다.
 *
 * 저작 순서 (산문→슬라이싱 금지, deck-FIRST — ADR-025 §3):
 *   ① architectStoryline(input)  : grounding + 유사 당선 덱 골격 → 슬라이드별 아웃라인
 *      (액션 타이틀 + so-what + 권장 component kind + 근거 요건). 수평 논리·당선 골격 미러링.
 *   ② authorSlide(outline, input): 선택 component 의 content 슬롯을 grounding 에서 채움
 *      (출처-only 근거 금지 → 수치 + 무엇을 증명 + 출처). 수치 창작 금지.
 *   ③ authorDeck(input)          : ①②를 오케스트레이션 → zod-검증된 DeckSpec 반환.
 *
 * 모델 라우팅 (ai/config modelFor):
 *   - 품질-결정(storyline·헤드라인) = Pro 티어 (`engine.section.core`).
 *   - plumbing(슬롯 채움) = Flash 티어 (`engine.section`).
 * AI 진입점은 invokeAi 단일 (eslint no-restricted-imports 강제).
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { modelFor, AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import type { EngineInput, EvidencePool } from '@/lib/express/engine/types'
import type { WinThemeDraft } from '@/lib/express/engine/win-theme'
import type { WinningReference } from '@/lib/express/winning-reference'
import {
  safeParseDeckSpec,
  type DeckSpec,
  type DeckSlide,
  type SlideKind,
} from './spec'

// ─────────────────────────────────────────
// 저작 입력 (grounding) — 발명 금지, 기존 자산 재사용 (브리프 §3)
// ─────────────────────────────────────────
export interface DeckAuthorInput {
  /** 엔진 입력 — RFP·channel·workstreams·profile (grounding 사실). */
  engine: EngineInput
  /** RET-1 evidence 풀 — 섹션별·과업별 당선 청크·자산 (수치·근거 출처). */
  evidence: EvidencePool
  /** EX-2 typed win-themes (proof chain) — 슬라이드 주장의 차별화 근거. */
  winThemes?: WinThemeDraft[]
  /** 유사 당선 덱 골격 — storyline 시드/미러링 (winning-reference). */
  winningReference?: WinningReference | null
  /** 언더독스 트랙레코드(실적·코치풀 등) — 표지/실적/코치 슬라이드 근거. */
  trackRecord?: string
  /** 진행 콜백 (CLI/스트리밍). */
  onProgress?: (step: string, detail: string) => void
}

// ─────────────────────────────────────────
// ① 스토리라인 아웃라인 — 슬라이드별 논증 비트 (component 미선택, kind 후보만)
// ─────────────────────────────────────────
export interface SlideOutline {
  /** 슬라이드 역할 — cover/section-divider/closing/body. */
  role: 'cover' | 'sectionDivider' | 'body' | 'closing'
  /** 연결 제안서 섹션('1'~'7') — body 만. SlideShell kicker 로 투영. */
  section?: string
  /** 액션 타이틀(headline) — 주장 한 문장 (learned 헤드라인 톤). */
  actionTitle: string
  /** so-what — 이 슬라이드가 무엇을 증명/설득하는가. */
  soWhat: string
  /** 권장 component kind (카탈로그에서 LLM 선택). cover/divider/closing 은 동명. */
  recommendedKind: SlideKind
  /** 근거 요건 — 이 슬라이드가 인용해야 할 수치 유형(검증 게이트). */
  evidenceNeeds: string[]
}

export interface Storyline {
  /** 덱 제목 (메타). */
  title: string
  /** 채널 (B2G/B2B/renewal). */
  channel: 'B2G' | 'B2B' | 'renewal'
  /** 수평 논리: 표지 → 본문 → 마무리 슬라이드 아웃라인. */
  slides: SlideOutline[]
}

/**
 * component 카탈로그 — 각 kind 가 무엇에 적합한지 LLM 에 제공해 kind 선택을 돕는다(브리프 §7).
 * (스펙의 SlideKind 와 동기 — 어휘 폭발의 LLM-facing 설명.)
 */
export const COMPONENT_CATALOG: Record<SlideKind, string> = {
  cover: '표지 — 사진 배경 + 액션 타이틀 + 부제 (덱 첫 장)',
  sectionDivider: '섹션 디바이더 — 큰 번호 + 섹션명 (장 전환)',
  closing: '마무리 — 제안 요약 + CTA (덱 끝 장)',
  iconProcess: '단계 흐름 — 단색 라인 아이콘으로 N단계 프로세스를 횡으로',
  iconCardGrid: '아이콘 카드 그리드 — 밀도 높은 커리큘럼/전략 카드 2~4열',
  photoOrgGrid: '사진 조직 그리드 — 코치/조직 인물 사진 카드(간단)',
  partnerLogoGrid: '파트너/실적 로고 그리드 — 발주처·파트너 워드마크 격자',
  badgeRow: '실적 배지 행 — 정량 실적(수치+라벨) 배지 가로 나열',
  bigNumberHero: '빅넘버 hero — 한 핵심 수치 강조 + 보조 포인트(One Loudest, 배경/목적)',
  annotatedImage: '주석 이미지 — 이미지 + 번호 주석 블록(공간/산출물 설명)',
  milestoneTimeline: '마일스톤 타임라인 — 아이콘 마일스톤 가로 타임라인(일정)',
  evidenceBand: '근거 밴드(단독) — 수치+무엇을 증명+출처 3요소 띠(보통 다른 part 에 내장)',
  coachDetailGrid: '코치 상세 그리드 — 사진+약력 2~3줄+정량 실적 배지(운영/코치진)',
  curriculumMatrix: '커리큘럼 매트릭스 — 주차×단계 셀(활동+산출물), Action Week 강조(커리큘럼)',
  kpiWithLogic: 'KPI+산출논리 — 빅넘버 + 어떻게 그 숫자가 나오는지 메커니즘 + SROI(성과/임팩트)',
  strategyCanvas: '전략 캔버스 — 2~4존 전략 카드(각 존 근거 한 줄)(추진 전략/방법론)',
  beforeAfter: 'Before/After — 변화/패러다임 전환 좌우 비교(기대 성과)',
  composite: '복합 — 한 슬라이드에 컴포넌트 여러 개 세로 적층(주 컴포넌트 + 근거 밴드 등)',
}

// ─────────────────────────────────────────
// grounding → 프롬프트 블록 (사실만 — 발명 금지)
// ─────────────────────────────────────────
function groundingBlock(input: DeckAuthorInput): string {
  const { rfp, channel } = input.engine
  const lines: string[] = []
  lines.push(`[RFP 사실]`)
  lines.push(`사업명: ${rfp.projectName ?? '(미상)'}`)
  lines.push(`발주처: ${rfp.client ?? '(미상)'} · 채널: ${channel}`)
  if (rfp.summary) lines.push(`요약: ${rfp.summary.slice(0, 600)}`)
  if (rfp.objectives?.length) lines.push(`목표: ${rfp.objectives.slice(0, 5).join(' / ')}`)
  if (rfp.keywords?.length) lines.push(`키워드: ${rfp.keywords.slice(0, 8).join(', ')}`)
  if (input.engine.workstreams?.length) {
    lines.push(`과업: ${input.engine.workstreams.map((w) => w.type).slice(0, 8).join(' / ')}`)
  }
  if (input.winThemes?.length) {
    lines.push(`[Win Themes — 차별화 주장(proof chain)]`)
    for (const wt of input.winThemes.slice(0, 5)) {
      const proof = wt.proof?.[0]?.text ?? wt.quantified ?? ''
      lines.push(`- ${wt.discriminator} → ${wt.benefit}${proof ? ` (근거: ${proof.slice(0, 120)})` : ''}`)
    }
  }
  if (input.trackRecord) lines.push(`[트랙레코드] ${input.trackRecord.slice(0, 600)}`)
  if (input.winningReference?.promptBlock) lines.push(input.winningReference.promptBlock.slice(0, 1600))
  return lines.join('\n')
}

/** evidence 풀을 "수치 후보" 텍스트로 요약 — authorSlide 가 근거 밴드에 인용(창작 금지). */
function evidenceBlock(input: DeckAuthorInput, section?: string): string {
  const chunks =
    section && input.evidence.bySection.get(section as never)
      ? input.evidence.bySection.get(section as never)!
      : [...input.evidence.bySection.values()].flat()
  if (!chunks.length) return '(인용 가능한 evidence 청크 없음 — 수치 창작 금지, 제공된 사실만 사용)'
  return chunks
    .slice(0, 6)
    .map((c, i) => `  ${i + 1}. ${String((c as { text?: string }).text ?? '').slice(0, 240)}`)
    .join('\n')
}

// ─────────────────────────────────────────
// ① architectStoryline — Pro 티어 (품질-결정)
// ─────────────────────────────────────────
const STORYLINE_TASK = 'engine.section.core' // Pro

export async function architectStoryline(input: DeckAuthorInput): Promise<Storyline> {
  input.onProgress?.('storyline', '스토리라인 아키텍트 (액션 타이틀·수평 논리)...')
  const catalog = Object.entries(COMPONENT_CATALOG)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n')

  const prompt = `당신은 당선 제안서 덱의 스토리라인 아키텍트다. 산문을 쓴 뒤 슬라이드로 쪼개지 말고,
**덱(논증)을 먼저 설계**하라. 각 슬라이드 = 한 주장(액션 타이틀) + so-what + 근거.

${groundingBlock(input)}

[컴포넌트 카탈로그 — 각 슬라이드에 적합한 kind 를 고르라]
${catalog}

[지침]
- 수평 논리: 표지(cover) → 섹션별 본문(body) 1~N → 마무리(closing). 유사 당선 덱 골격을 미러링하되 본 RFP 로 채운다.
- 본문 슬라이드는 제안서 7섹션('1'~'7') 중 하나에 연결(section). 액션 타이틀은 주장형(예: "...로 ...을 좁힙니다").
- 각 슬라이드의 recommendedKind 를 카탈로그에서 고르고, evidenceNeeds(인용할 수치 유형)를 명시.
- 수치는 만들지 말 것 — evidenceNeeds 는 "무엇을 입증해야 하는지"만.

JSON 만 출력:
{"title":"...","channel":"B2G|B2B|renewal","slides":[
  {"role":"cover|sectionDivider|body|closing","section":"1".."7"|null,"actionTitle":"...","soWhat":"...","recommendedKind":"<kind>","evidenceNeeds":["..."]}
]}`

  const r = await invokeAi({
    prompt,
    model: modelFor(STORYLINE_TASK),
    maxTokens: AI_TOKENS.LARGE,
    label: 'deck.architect-storyline',
  })
  const parsed = safeParseJson<Storyline>(r.raw, 'deck.architect-storyline')
  log.info('deck', 'storyline 작성', { slides: parsed.slides?.length ?? 0, model: r.model })
  return parsed
}

// ─────────────────────────────────────────
// ② authorSlide — Flash 티어 (슬롯 채움 plumbing)
// ─────────────────────────────────────────
const SLOT_TASK = 'engine.section' // Flash

/**
 * 한 슬라이드 아웃라인 → 채워진 DeckSlide (body spec + shell meta).
 * 선택된 component 의 content 슬롯을 grounding 에서 채운다. 근거는 수치+무엇을증명+출처 3요소.
 * LLM 출력은 safeParseDeckSpec 으로 단일 슬라이드 단위 검증(부분 degrade 가능).
 */
export async function authorSlide(
  outline: SlideOutline,
  input: DeckAuthorInput,
): Promise<DeckSlide | null> {
  input.onProgress?.('slide', `슬라이드 저작: ${outline.actionTitle.slice(0, 30)}...`)

  const prompt = `다음 슬라이드 아웃라인을 DeckSpec 슬라이드(JSON)로 채워라. component kind 는 "${outline.recommendedKind}".

[아웃라인]
액션 타이틀(headline): ${outline.actionTitle}
so-what: ${outline.soWhat}
연결 섹션: ${outline.section ?? '(비본문)'}
근거 요건: ${outline.evidenceNeeds.join(' / ')}

[grounding — 인용 가능한 사실/수치 (창작 금지)]
${evidenceBlock(input, outline.section)}

[지침]
- kind="${outline.recommendedKind}" 의 슬롯을 채운다. 본문 컴포넌트면 evidence(수치+무엇을 증명+출처) 3요소 배열 포함.
- 근거 밴드의 source 는 실제 출처(기관·연도·문서). 수치(figure)는 grounding 에 있는 값만. 없으면 보수적으로 비워라.
- 이미지/사진/로고 경로는 placeholder('/design-kit/sample/...') 허용(자산은 DATA-2/배선 단계).

JSON 만 출력 (DeckSlide 형태):
{"meta":{"kicker":"<섹션번호 라벨>","density":"dense"},"body":{"kind":"${outline.recommendedKind}", ...슬롯}}`

  const r = await invokeAi({
    prompt,
    model: modelFor(SLOT_TASK),
    maxTokens: AI_TOKENS.LARGE,
    label: 'deck.author-slide',
  })

  // 슬라이드 단위 검증 — 잘못된 슬롯이면 null(부분 degrade, authorDeck 가 skip).
  let candidate: unknown
  try {
    candidate = safeParseJson<unknown>(r.raw, 'deck.author-slide')
  } catch (e) {
    log.warn('deck', 'authorSlide JSON 파싱 실패 → skip', {
      kind: outline.recommendedKind,
      err: e instanceof Error ? e.message : String(e),
    })
    return null
  }

  // 단일 슬라이드를 임시 덱으로 감싸 zod 검증 (재사용).
  const probe = safeParseDeckSpec({ version: 'deck-v3', slides: [candidate] })
  if (!probe.ok) {
    log.warn('deck', 'authorSlide zod 검증 실패 → skip', {
      kind: outline.recommendedKind,
      error: probe.error,
    })
    return null
  }
  return probe.deck.slides[0]
}

// ─────────────────────────────────────────
// ③ authorDeck — 오케스트레이션 → 검증된 DeckSpec
// ─────────────────────────────────────────
export async function authorDeck(input: DeckAuthorInput): Promise<DeckSpec> {
  const startedAt = Date.now()
  const storyline = await architectStoryline(input)

  // 슬라이드별 저작 — 순차(429 회피). 실패 슬라이드는 skip(부분 degrade).
  const slides: DeckSlide[] = []
  for (const outline of storyline.slides) {
    const slide = await authorSlide(outline, input)
    if (slide) slides.push(slide)
  }

  if (slides.length === 0) {
    throw new Error('[deck.authorDeck] 저작된 슬라이드 0개 — grounding/LLM 점검 필요')
  }

  const deckCandidate = {
    version: 'deck-v3' as const,
    title: storyline.title,
    channel: storyline.channel,
    slides,
  }
  // 전체 덱 zod 검증 (안전망) — 실패 시 throw (호출부가 재시도 판단).
  const result = safeParseDeckSpec(deckCandidate)
  if (!result.ok) {
    throw new Error(`[deck.authorDeck] DeckSpec 검증 실패: ${result.error}`)
  }

  log.info('deck', 'authorDeck 완료', {
    slides: result.deck.slides.length,
    elapsedSec: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
  })
  return result.deck
}

// 타입 재노출 (호출부 편의)
export type { DeckSpec, SlideSpec } from './spec'

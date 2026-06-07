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
import type { PipelineContext } from '@/lib/pipeline-context'
import {
  safeParseDeckSpec,
  slideDensityScore,
  KIND_FIELD_SPEC,
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
  /**
   * DECK-5 (ADR-026) — 누적 기획(PipelineContext). **optional, 가산**.
   * 있으면 커리큘럼·코치·예산·임팩트 슬라이드를 **실제 기획 산출물**(우선 근거)로 채운다.
   * 없으면 기존 동작(EngineInput + EvidencePool)을 그대로 유지한다.
   */
  pipeline?: PipelineContext | null
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
// DECK-5 (ADR-026) — 누적 기획(PipelineContext) → 사실 블록 (우선 근거)
// 빈 슬라이스는 graceful 생략(블록 미생성). 수치 창작 금지 — 제공된 값만.
// ─────────────────────────────────────────

/** 커리큘럼 슬라이스 → curriculumMatrix 근거 (주차·세션·Action Week). */
function pipelineCurriculumBlock(ctx: PipelineContext): string | null {
  const c = ctx.curriculum
  if (!c || c.sessions.length === 0) return null
  const lines: string[] = ['[기획 — 확정 커리큘럼 (우선 근거: curriculumMatrix)]']
  for (const s of c.sessions.slice(0, 16)) {
    const tags: string[] = []
    if (s.isActionWeek) tags.push('Action Week')
    if (s.isTheory) tags.push('이론')
    if (s.isCoaching1on1) tags.push('1:1코칭')
    const tag = tags.length ? ` [${tags.join('·')}]` : ''
    const moduleTag = s.impactModuleCode ? ` / IMPACT:${s.impactModuleCode}` : ''
    lines.push(`  - ${s.sessionNo}회차: ${s.title} (${s.durationHours}h)${tag}${moduleTag}`)
  }
  if (c.designRationale) lines.push(`  설계 근거: ${c.designRationale.slice(0, 240)}`)
  return lines.join('\n')
}

/** 코치 슬라이스 → coachDetailGrid 근거 (실명·역할·시수·사례비). */
function pipelineCoachesBlock(ctx: PipelineContext): string | null {
  const co = ctx.coaches
  if (!co || co.assignments.length === 0) return null
  const lines: string[] = [
    `[기획 — 확정 코치진 ${co.assignments.length}명 (우선 근거: coachDetailGrid)]`,
  ]
  for (const a of co.assignments.slice(0, 8)) {
    const hours = a.totalHours ?? a.sessions * a.hoursPerSession
    const reason = co.recommendationReasons[a.coachId]
    lines.push(
      `  - ${a.coachName ?? '(코치 미상)'} (${a.role}) — ${a.sessions}회·${hours}h${
        reason ? ` / ${reason.slice(0, 80)}` : ''
      }`,
    )
  }
  return lines.join('\n')
}

/** 예산 슬라이스 → 예산/kpi 근거 (구조·마진·SROI). */
function pipelineBudgetBlock(ctx: PipelineContext): string | null {
  const b = ctx.budget
  if (!b) return null
  const s = b.structure
  const lines: string[] = ['[기획 — 확정 예산 (우선 근거: kpiWithLogic/예산 슬라이드)]']
  lines.push(
    `  - 직접비(PC) ${s.pcTotal.toLocaleString()}원 / 간접비(AC) ${s.acTotal.toLocaleString()}원 / 마진 ${(b.marginRate * 100).toFixed(1)}%`,
  )
  for (const item of s.items.slice(0, 8)) {
    lines.push(`    • [${item.wbsCode}] ${item.name}: ${item.amount.toLocaleString()}원`)
  }
  if (b.sroiForecast) {
    lines.push(
      `  - SROI 예측: 총가치 ${b.sroiForecast.totalValueKrw.toLocaleString()}원 / 비율 ${b.sroiForecast.ratio.toFixed(2)}`,
    )
  }
  return lines.join('\n')
}

/** 임팩트 슬라이스 → 임팩트 슬라이드 근거 (Logic Model 5계층). */
function pipelineImpactBlock(ctx: PipelineContext): string | null {
  const imp = ctx.impact
  if (!imp) return null
  const lm = imp.logicModel
  const lines: string[] = ['[기획 — 확정 임팩트 (우선 근거: beforeAfter/임팩트 슬라이드)]']
  if (imp.goal || lm.impactGoal) lines.push(`  - 임팩트 목표: ${imp.goal || lm.impactGoal}`)
  const layers: Array<[string, typeof lm.impact]> = [
    ['Impact', lm.impact],
    ['Outcome', lm.outcome],
    ['Output', lm.output],
    ['Activity', lm.activity],
    ['Input', lm.input],
  ]
  for (const [label, items] of layers) {
    if (items.length === 0) continue
    const txt = items
      .slice(0, 4)
      .map((it) => `[${it.id}] ${it.text}${it.estimatedValue ? `(${it.estimatedValue})` : ''}`)
      .join(' · ')
    lines.push(`  - ${label}: ${txt}`)
  }
  return lines.join('\n')
}

/**
 * PipelineContext 사실 블록 전체 — 비어 있으면 빈 문자열.
 * groundingBlock 에 append 되어 슬롯 채움 시 **우선 근거**로 인용된다.
 */
function pipelineGroundingBlock(input: DeckAuthorInput): string {
  const ctx = input.pipeline
  if (!ctx) return ''
  const blocks = [
    pipelineCurriculumBlock(ctx),
    pipelineCoachesBlock(ctx),
    pipelineBudgetBlock(ctx),
    pipelineImpactBlock(ctx),
  ].filter((b): b is string => !!b)
  if (blocks.length === 0) return ''
  return [
    '',
    '[누적 기획 (PipelineContext) — **슬라이드의 우선 근거**. 코퍼스보다 우선 인용. 여기 없는 단계는 생략 또는 "가안" 표시. 수치 창작 금지.]',
    ...blocks,
  ].join('\n')
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
  // DECK-5 (ADR-026): 누적 기획 사실(우선 근거)을 grounding 끝에 append. 비면 영향 없음.
  const planning = pipelineGroundingBlock(input)
  if (planning) lines.push(planning)
  return lines.join('\n')
}

/**
 * evidence 풀을 "수치 후보" 텍스트로 요약 — authorSlide 가 근거 밴드에 인용(창작 금지).
 * DECK-5 (ADR-026): pipeline 사실(우선 근거)이 있으면 **앞에** 붙여 슬롯이 실데이터로 채워지게 한다.
 * pipeline 없으면 기존 동작(EvidencePool only) 그대로.
 */
function evidenceBlock(input: DeckAuthorInput, section?: string): string {
  const chunks =
    section && input.evidence.bySection.get(section as never)
      ? input.evidence.bySection.get(section as never)!
      : [...input.evidence.bySection.values()].flat()
  const corpus = chunks.length
    ? chunks
        .slice(0, 6)
        .map((c, i) => `  ${i + 1}. ${String((c as { text?: string }).text ?? '').slice(0, 240)}`)
        .join('\n')
    : ''

  const planning = pipelineGroundingBlock(input)
  if (planning) {
    // 기획 우선 → 코퍼스는 보조(차별화·헤드라인). 둘 다 없으면 비움(창작 금지).
    const parts = [planning.trim()]
    if (corpus) parts.push('[보조 근거 — 당선 코퍼스 (차별화·헤드라인 톤만)]\n' + corpus)
    return parts.join('\n\n')
  }
  if (!corpus) return '(인용 가능한 evidence 청크 없음 — 수치 창작 금지, 제공된 사실만 사용)'
  return corpus
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
- **기획-우선(ADR-026)**: grounding 의 "[누적 기획 (PipelineContext)]" 블록이 있으면 **그 실제 데이터로** 슬라이드를 설계하라(커리큘럼→curriculumMatrix, 코치→coachDetailGrid, 예산→kpiWithLogic, 임팩트→beforeAfter). 기획에 **없는 단계**는 슬라이드를 생략하거나 "가안"으로 표시하라(없는 단계를 코퍼스로 지어내지 말 것). 코퍼스는 차별화·헤드라인 톤 보조에만.
- 수평 논리: 표지(cover) → 섹션별 본문(body) 1~N → 마무리(closing). 유사 당선 덱 골격을 미러링하되 본 RFP 로 채운다.
- 본문 슬라이드는 제안서 7섹션('1'~'7') 중 하나에 연결(section). 액션 타이틀은 주장형(예: "...로 ...을 좁힙니다").
- 각 슬라이드의 recommendedKind 를 카탈로그에서 고르고, evidenceNeeds(인용할 수치 유형)를 명시.
- 수치는 만들지 말 것 — evidenceNeeds 는 "무엇을 입증해야 하는지"만.
- **본문 위주로 설계** — body 슬라이드를 최소 6개 이상 확보하라(섹션마다 1~2장). 본문이 핵심이다.
- sectionDivider 는 **장 전환에만** 절제해서 사용(과다 금지 — 전체 0~3개). 본문 슬라이드를 디바이더로 대체하지 말 것.
- 본문에는 리치 kind(strategyCanvas·curriculumMatrix·coachDetailGrid·kpiWithLogic·beforeAfter·composite 등)를 우선 선택해 밀도를 확보하라.
- **밀도 최우선(2026-06-04 피드백)**: 셀이 반쯤 비면 안 된다. evidenceNeeds 에 "코치 4명 이상", "커리큘럼 6단계 각 활동 3개", "KPI 3개 이상", "전략 존 3개 이상"처럼 **채워야 할 최소 항목수**를 함께 명시해 빡빡한 슬라이드를 유도하라.

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
/**
 * authorSlide 프롬프트 빌더 — 선택된 kind 의 **정확한 필드 계약(few-shot 예시 JSON)** 을 주입.
 * `fixHint` 가 있으면(=1차 zod 실패 후) 그 에러를 덧붙여 교정 재시도 프롬프트를 만든다.
 */
function buildSlidePrompt(
  outline: SlideOutline,
  input: DeckAuthorInput,
  fixHint?: string,
  densifyHint?: string,
): string {
  // 선택된 kind 의 정확한 필드 형태(필드명·중첩·근거 3요소)를 1:1 유효 예시로 제시 → 키 누락 방지.
  const kindExample = KIND_FIELD_SPEC[outline.recommendedKind]

  const fixBlock = fixHint
    ? `\n[⚠️ 직전 출력이 zod 검증에 실패했다 — 아래 오류를 정확히 고쳐 다시 출력하라]
${fixHint}
- 누락/오타 필드명을 위 [필드 계약 예시] 의 키와 1:1 로 맞춰라. 임의 키 추가 금지.\n`
    : ''

  // DECK-4 densify 재저작 — 직전 출력이 밀도 floor 미달이면 부족 항목을 명시해 셀을 채우게 한다.
  const densifyBlock = densifyHint
    ? `\n[⚠️ 직전 출력이 너무 듬성하다(셀이 반쯤 빔) — 아래를 채워 다시 출력하라]
${densifyHint}
- 위 부족분을 **grounding 의 추가 사실·수치로** 채워라. **창작 금지** — grounding 에 없는 코치/숫자/사실을 지어내지 말 것.
- 빈 칸·반쪽 셀이 없게 항목을 늘리되, 컴포넌트가 감당할 범위(예: coachDetailGrid columns 4 → 코치 4~8명, curriculum 6단계, kpis 3~4개, zones 3~4개) 안에서 빡빡하게 채워라.
- 각 항목의 내용은 짧은 라벨이 아니라 한 줄 설명·근거를 포함해 실하게 만들어라.\n`
    : ''

  return `다음 슬라이드 아웃라인을 DeckSpec 슬라이드(JSON)로 채워라. component kind 는 "${outline.recommendedKind}".

[아웃라인]
액션 타이틀(headline): ${outline.actionTitle}
so-what: ${outline.soWhat}
연결 섹션: ${outline.section ?? '(비본문)'}
근거 요건: ${outline.evidenceNeeds.join(' / ')}

[grounding — 인용 가능한 사실/수치 (창작 금지). "[누적 기획]" 블록이 있으면 그 값을 **최우선**으로 슬롯에 채워라(코퍼스는 보조).]
${evidenceBlock(input, outline.section)}

[필드 계약 예시 — kind="${outline.recommendedKind}" 는 정확히 이 필드 형태(필드명·중첩·필수 키)를 따라야 한다]
${kindExample}

[지침]
- 위 [필드 계약 예시] 의 **필드명·구조를 그대로** 쓰고 내용만 본 RFP·grounding 으로 교체하라. 필드명을 바꾸거나 누락하면 검증 실패한다.
- 근거(evidence) 항목은 반드시 {"figure","proves","source"} 3요소 모두 포함(특히 proves 누락 금지). figure 는 grounding 에 있는 값만, 없으면 evidence 배열을 비워라(수치 창작 금지).
- 근거 밴드의 source 는 실제 출처(기관·연도·문서). 이미지/사진/로고 경로는 placeholder('/design-kit/sample/...') 허용.
- 표지/디바이더/마무리(cover·sectionDivider·closing)는 meta 없이 body 만, 본문 컴포넌트는 meta.kicker(섹션번호 라벨)+density:"dense" 권장.
- **셀을 비우지 말고 채워라(밀도 우선)**: grounding 에 사실이 있는 한 항목을 가능한 많이(컴포넌트 상한까지) — 코치는 4명 이상, 커리큘럼은 단계마다 활동 3개+산출물, KPI·전략 존은 3개 이상. 단 grounding 에 없는 항목은 만들지 말 것(창작 금지).${fixBlock}${densifyBlock}

JSON 만 출력 (위 예시와 동일한 DeckSlide 형태, 내용만 교체):`
}

export async function authorSlide(
  outline: SlideOutline,
  input: DeckAuthorInput,
  /** DECK-4 densify 재저작 — 밀도 floor 미달 시 부족 항목 지시문(authorDeck 이 주입). */
  densifyHint?: string,
): Promise<DeckSlide | null> {
  input.onProgress?.('slide', `슬라이드 저작: ${outline.actionTitle.slice(0, 30)}...`)

  // 1회 교정 재시도: 1차 zod 실패 시 그 에러를 프롬프트에 덧붙여 정확히 한 번 더 호출 → 그래도 실패면 skip.
  // (무한 루프 금지 — attempt 0(최초) · 1(교정) 단 2회.)
  let fixHint: string | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = buildSlidePrompt(outline, input, fixHint, densifyHint)
    const r = await invokeAi({
      prompt,
      model: modelFor(SLOT_TASK),
      maxTokens: AI_TOKENS.LARGE,
      label: attempt === 0 ? 'deck.author-slide' : 'deck.author-slide-retry',
    })

    // 슬라이드 단위 검증 — 잘못된 슬롯이면 다음 attempt(없으면 null, authorDeck 가 skip).
    let candidate: unknown
    try {
      candidate = safeParseJson<unknown>(r.raw, 'deck.author-slide')
    } catch (e) {
      fixHint = `JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`
      log.warn('deck', `authorSlide JSON 파싱 실패 (attempt ${attempt})`, {
        kind: outline.recommendedKind,
        err: fixHint,
      })
      continue
    }

    // 단일 슬라이드를 임시 덱으로 감싸 zod 검증 (재사용).
    const probe = safeParseDeckSpec({ version: 'deck-v3', slides: [candidate] })
    if (probe.ok) return probe.deck.slides[0]

    fixHint = probe.error
    log.warn('deck', `authorSlide zod 검증 실패 (attempt ${attempt})`, {
      kind: outline.recommendedKind,
      error: probe.error,
    })
  }

  log.warn('deck', 'authorSlide 1회 교정 후에도 실패 → skip', { kind: outline.recommendedKind })
  return null
}

// ─────────────────────────────────────────
// ③ authorDeck — 오케스트레이션 → 검증된 DeckSpec
// ─────────────────────────────────────────
export async function authorDeck(input: DeckAuthorInput): Promise<DeckSpec> {
  const startedAt = Date.now()
  const storyline = await architectStoryline(input)

  // 슬라이드별 저작 — 순차(429 회피). 실패 슬라이드는 skip(부분 degrade).
  // DECK-4 밀도 비평 루프: 저작 직후 결정론 밀도 측정(slideDensityScore) → floor 미달이면
  // 부족 항목을 명시해 **densify 1회** 재저작. floor 충족·재시도 후 더 빡빡한 쪽을 채택.
  // (bounded — 슬라이드당 densify 최대 1회. 무한 루프·토큰 폭주 금지.)
  const slides: DeckSlide[] = []
  for (const outline of storyline.slides) {
    const slide = await authorSlide(outline, input)
    if (!slide) continue

    const score = slideDensityScore(slide.body)
    if (score.belowFloor) {
      const densifyHint = score.deficiencies.map((d) => `- ${d}`).join('\n')
      input.onProgress?.(
        'densify',
        `밀도 미달(${score.kind}, ${score.itemCount}개) → densify 재저작: ${outline.actionTitle.slice(0, 24)}...`,
      )
      log.info('deck', 'densify 재저작 (floor 미달)', {
        kind: score.kind,
        itemCount: score.itemCount,
        floor: score.floor,
        deficiencies: score.deficiencies,
      })
      const densified = await authorSlide(outline, input, densifyHint)
      // 재저작이 성공하고 항목수가 늘었으면(또는 floor 충족) 채택, 아니면 원본 유지(degrade 방지).
      if (densified) {
        const after = slideDensityScore(densified.body)
        const improved = !after.belowFloor || after.itemCount > score.itemCount
        slides.push(improved ? densified : slide)
        if (!improved) {
          log.warn('deck', 'densify 후에도 floor 미달·개선 없음 → 원본 채택', { kind: score.kind })
        }
      } else {
        slides.push(slide) // 재저작 실패 → 원본 유지
      }
    } else {
      slides.push(slide)
    }
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

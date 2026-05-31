/**
 * assemble — plan-then-write (EX-1, Tech Spec §5.2 G7, STORM +25% 조직성)
 *
 * 단일 컨텍스트·순차 작성 (Tech Spec §2 핵심 원칙: 본문 조립은 단일 컨텍스트, 병렬 금지).
 *   1. planOutline   — 7섹션 thesis + evidence 계획 + 길이 예산 (Flash 1콜)
 *   2. writeSection  — 섹션별 순차 작성, 과업 위 투영 (§7.2), 공유 memory 로 모순·중복 방지
 *   3. synthKeyMessages — 과업 가로질러 키메시지 (Flash 1콜, ≤3)
 *   4. coherencePass — 기존 coherence-pass.ts 재사용 (섹션 간 정합)
 *
 * 모델 (Flash-우세 라우팅, ADR-022 §4 · modelFor): 기본 Flash, **③ 사업내용(sections.3)
 * 핵심 합성만 Pro**(롱컨텍스트 위 결정적 본문). outline·일반 섹션·keyMessages = Flash.
 * thinking 모델 → maxOutputTokens 크게(AI_TOKENS.LARGE).
 *
 * 과업 투영(§7.2):
 *   ③ 사업내용(sections.3) = 과업 블록 순차(order) 렌더
 *   ④ 운영체계(sections.4) = 과업별 운영·인력
 *   ⑤ 예산(sections.5)     = Σ workstream.budgetSliceKrw
 *   ⑥ 기대성과(sections.6) = 과업별 Output→Outcome 합성
 *
 * 직접 SDK 금지 — 전부 invokeAi. JSON = safeParseJson.
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS, modelFor } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import {
  emptyDraft,
  SECTION_LABELS,
  ExpressDraftSchema,
} from '../schema'
import type { ExpressDraft, SectionKey } from '../schema'
import { coherencePass } from '../coherence-pass'
import { formatPmInputs } from '../prompts/formatters'
import { scoringCategoryFor } from '@/lib/workstream/types'
import type { EngineInput, EvidencePool, Outline, SectionPlan } from './types'
import type { Workstream } from '@prisma/client'
import type { RetrievedChunk } from '@/lib/retrieval/types'

const SECTION_KEYS: SectionKey[] = ['1', '2', '3', '4', '5', '6', '7']

// ─────────────────────────────────────────
// 컨텍스트 포매팅 헬퍼
// ─────────────────────────────────────────

function formatRfp(input: EngineInput): string {
  const { rfp } = input
  return [
    `사업명: ${rfp.projectName ?? '(미상)'}`,
    `발주처: ${rfp.client ?? '(미상)'} · 채널: ${input.channel}`,
    rfp.targetAudience ? `대상: ${rfp.targetAudience}${rfp.targetCount ? ` (정원 ${rfp.targetCount}명)` : ''}` : '',
    rfp.region ? `지역: ${rfp.region}` : '',
    (rfp.objectives ?? []).length ? `목표: ${(rfp.objectives ?? []).slice(0, 5).join(' / ')}` : '',
    (rfp.deliverables ?? []).length ? `산출물: ${(rfp.deliverables ?? []).slice(0, 5).join(' / ')}` : '',
    (rfp.keywords ?? []).length ? `키워드: ${(rfp.keywords ?? []).slice(0, 8).join(', ')}` : '',
    (rfp.evalCriteria ?? []).length
      ? `평가배점: ${(rfp.evalCriteria ?? []).map((c) => `${c.item}(${c.score})`).join(' · ')}`
      : '',
    rfp.totalBudgetVat ? `총예산(VAT포함): ${rfp.totalBudgetVat.toLocaleString()}원` : '',
    rfp.summary ? `요약: ${rfp.summary}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** 과업 블록 텍스트 — order 순. ③·④·⑤·⑥ 투영의 데이터 원천. */
function formatWorkstreams(workstreams: Workstream[]): string {
  if (workstreams.length === 0) return '(과업 미정 — 교육 1종으로 간주)'
  const sorted = [...workstreams].sort((a, b) => a.order - b.order)
  return sorted
    .map((ws, i) => {
      const scoring = ws.scoringCategory || scoringCategoryFor(ws.type) || ''
      const detail =
        ws.detail && typeof ws.detail === 'object' && Object.keys(ws.detail as object).length
          ? JSON.stringify(ws.detail)
          : '(상세 미채움)'
      const budget = ws.budgetSliceKrw ? ` · 예산 ${ws.budgetSliceKrw.toLocaleString()}원` : ''
      return `[과업 ${i + 1}] type=${ws.type} · 배점=${scoring}${budget}\n  detail: ${detail}`
    })
    .join('\n')
}

function totalBudgetSlice(workstreams: Workstream[]): number | null {
  const slices = workstreams.map((w) => w.budgetSliceKrw ?? 0)
  const sum = slices.reduce((a, b) => a + b, 0)
  return sum > 0 ? sum : null
}

/** evidence 청크 → 프롬프트용 짧은 발췌 (인용 가능 근거). */
function formatChunks(chunks: RetrievedChunk[] | undefined, max = 4): string {
  if (!chunks || chunks.length === 0) return '(검색된 당선 근거·자산 없음 — RFP·과업 기반 추론)'
  return chunks
    .slice(0, max)
    .map((c, i) => `(${i + 1}) ${c.text.replace(/\s+/g, ' ').slice(0, 280)}`)
    .join('\n')
}

// ─────────────────────────────────────────
// 1. planOutline (Pro, 1콜)
// ─────────────────────────────────────────

const DEFAULT_LENGTH: Record<SectionKey, number> = {
  '1': 700,
  '2': 800,
  '3': 900,
  '4': 800,
  '5': 600,
  '6': 700,
  '7': 600,
}

function fallbackOutline(): Outline {
  const o = {} as Outline
  for (const k of SECTION_KEYS) {
    o[k] = { thesis: '', evidenceRefs: [], lengthBudget: DEFAULT_LENGTH[k] }
  }
  return o
}

export async function planOutline(
  input: EngineInput,
  evidence: EvidencePool,
): Promise<Outline> {
  const sectionEvidence = SECTION_KEYS.map(
    (k) => `### sections.${k} ${SECTION_LABELS[k]}\n${formatChunks(evidence.bySection.get(k), 2)}`,
  ).join('\n\n')

  const prompt = `
당신은 한국 정부·기업 RFP 제안서 기획 전문가입니다. 아래 RFP·과업·검색 근거를 바탕으로
7개 섹션 각각의 **작성 계획(outline)** 을 세우세요. 본문은 아직 쓰지 않습니다.

[본 사업]
${formatRfp(input)}

[과업 구성 (제안서 ③ 사업내용·④ 운영·⑤ 예산·⑥ 성과 의 골격)]
${formatWorkstreams(input.workstreams)}

[섹션별 검색 근거 발췌]
${sectionEvidence}

[7 섹션]
1=제안 배경 및 목적 / 2=추진 전략 및 방법론 / 3=교육 커리큘럼(=과업 블록 순차) /
4=운영 체계 및 코치진 / 5=예산 및 경제성(=Σ과업 예산) / 6=기대 성과 및 임팩트 /
7=수행 역량 및 실적

[작성 규칙]
- 각 섹션: thesis(이 섹션이 평가위원에게 던질 핵심 주장 1줄) + evidenceRefs(활용할 근거 키워드 1~3개) + lengthBudget(목표 글자수 400~1200).
- thesis 는 추상 슬로건 금지 — 본 사업의 대상·목표·과업이 드러나게.

[출력 JSON]
{
  "1": { "thesis": "...", "evidenceRefs": ["...", "..."], "lengthBudget": 700 },
  "2": { ... }, "3": { ... }, "4": { ... }, "5": { ... }, "6": { ... }, "7": { ... }
}
JSON 만. 마크다운 펜스·설명·trailing comma 금지.
`.trim()

  try {
    const r = await invokeAi({
      prompt,
      model: modelFor('engine.outline'),
      maxTokens: AI_TOKENS.LARGE,
      temperature: 0.4,
      label: 'engine.planOutline',
    })
    const raw = safeParseJson<Record<string, Partial<SectionPlan>>>(r.raw, 'engine.planOutline')
    const out = fallbackOutline()
    for (const k of SECTION_KEYS) {
      const p = raw?.[k]
      if (p) {
        out[k] = {
          thesis: typeof p.thesis === 'string' ? p.thesis.slice(0, 300) : '',
          evidenceRefs: Array.isArray(p.evidenceRefs)
            ? p.evidenceRefs.filter((x) => typeof x === 'string').slice(0, 4)
            : [],
          lengthBudget:
            typeof p.lengthBudget === 'number' && p.lengthBudget >= 200 && p.lengthBudget <= 1600
              ? p.lengthBudget
              : DEFAULT_LENGTH[k],
        }
      }
    }
    return out
  } catch (e) {
    log.warn('engine.assemble', 'planOutline 실패 → 기본 outline', {
      err: e instanceof Error ? e.message : String(e),
    })
    return fallbackOutline()
  }
}

// ─────────────────────────────────────────
// 2. writeSection (Pro, 순차 · 공유 memory)
// ─────────────────────────────────────────

/** 과업 위 투영 지침 — 섹션별 합성 규칙(§7.2). */
function projectionGuide(key: SectionKey, workstreams: Workstream[]): string {
  switch (key) {
    case '2':
      return '이 섹션은 **과업 조합의 논리 사슬**입니다. 과업들이 어떻게 맞물려 사업 목표를 달성하는지 전략으로 엮으세요.'
    case '3':
      return '이 섹션은 **과업별 블록을 order 순으로 순차 렌더**합니다. 각 과업(특히 education/mentoring)을 주차·세션 단위로 구체화하세요.'
    case '4':
      return '이 섹션은 **과업별 운영·인력 체계**입니다. 코치=멘토링 과업 디테일, 운영 인력·PMO·보고·리스크 관리를 과업에 매핑하세요.'
    case '5': {
      const sum = totalBudgetSlice(workstreams)
      return `이 섹션은 **Σ 과업 예산**입니다.${sum ? ` 과업 예산 합계 ≈ ${sum.toLocaleString()}원 을 기준 비목으로 배분하세요.` : ' 과업별 예산 비중으로 4비목(인건비·운영비·교육비·기타)을 산출하세요.'}`
    }
    case '6':
      return '이 섹션은 **과업별 Output→Outcome 합성 → 기대 성과/임팩트**입니다. 각 과업의 산출물이 어떤 정량 성과로 이어지는지 보이세요.'
    default:
      return ''
  }
}

export async function writeSection(
  key: SectionKey,
  outline: Outline,
  input: EngineInput,
  evidence: EvidencePool,
  memory: string[],
): Promise<string> {
  const plan = outline[key]
  const projection = projectionGuide(key, input.workstreams)
  const pmInputsSection = formatPmInputs(input.pmInputs ?? null)
  const memoryBlock =
    memory.length > 0
      ? `[이미 쓴 주장·수치 — 중복·모순 금지. 새 정보만 추가]\n${memory.slice(-12).join('\n')}`
      : '(첫 섹션 — 누적 주장 없음)'

  const prompt = `
당신은 한국 RFP 제안서 본문을 쓰는 전문 작가입니다. 아래 섹션 **sections.${key} (${SECTION_LABELS[key]})** 의
본문을 작성하세요.

[본 사업]
${formatRfp(input)}

[과업 구성]
${formatWorkstreams(input.workstreams)}

[이 섹션 작성 계획]
thesis: ${plan.thesis || '(자유 — RFP·과업 기반 핵심 주장 1개를 먼저 정하고 시작)'}
목표 길이: 약 ${plan.lengthBudget}자 (최대 2000자)
${projection ? `\n[과업 위 투영 지침]\n${projection}` : ''}

[이 섹션 검색 근거 (당선 언어·자산 — 베끼기 X, 구성·근거로 활용)]
${formatChunks(evidence.bySection.get(key), 4)}

${memoryBlock}
${pmInputsSection ? `\n[PM 입력 외부 reality — 본문에 적극 반영]\n${pmInputsSection}` : ''}

[작성 규칙]
1. 경어체(~합니다). Pyramid — 결론(thesis) 먼저, 근거 뒤.
2. 발주처 키워드를 자연스럽게 흡수. 추상 나열 X — 단계·항목·정량 구체화.
3. 실행 구체성: 월/주차 일정·대면 거점·협력기관을 가능한 한 구체화.
4. 회사명 비교 금지. 조작 수치 금지(검색 근거에 없는 숫자 만들지 말 것).
5. 위 [이미 쓴 주장] 과 모순되거나 동일 문장 반복 금지.
6. 최대 2000자. 마크다운 H1/H2 금지(본문 산문·필요시 불릿).

[출력 JSON]
{ "sectionText": "<sections.${key} 본문>" }
JSON 만. 마크다운 펜스·설명·trailing comma 금지.
`.trim()

  try {
    const r = await invokeAi({
      prompt,
      // ③ 사업내용(핵심 합성)만 Pro, 그 외 섹션은 Flash (Flash-우세 라우팅, ADR-022 §4).
      model: modelFor(key === '3' ? 'engine.section.core' : 'engine.section'),
      maxTokens: AI_TOKENS.LARGE,
      temperature: 0.45,
      label: `engine.writeSection.${key}`,
    })
    const raw = safeParseJson<{ sectionText?: string }>(r.raw, `engine.writeSection.${key}`)
    const text = typeof raw?.sectionText === 'string' ? raw.sectionText.trim() : ''
    // schema 상 섹션 ≤2000자
    return text.slice(0, 2000)
  } catch (e) {
    log.warn('engine.assemble', `writeSection.${key} 실패 → 빈 본문`, {
      err: e instanceof Error ? e.message : String(e),
    })
    return ''
  }
}

/** 작성된 섹션에서 핵심 주장·수치를 추출해 memory 에 누적 (가벼운 휴리스틱 — LLM 미사용). */
function extractClaims(text: string): string[] {
  if (!text) return []
  // 문장 단위 분할 후 수치·핵심 포함 문장 최대 3개
  const sentences = text
    .split(/(?<=[.。!?]|니다|습니다)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12)
  const withNumbers = sentences.filter((s) => /\d/.test(s))
  return (withNumbers.length > 0 ? withNumbers : sentences).slice(0, 3).map((s) => s.slice(0, 160))
}

// ─────────────────────────────────────────
// 3. synthKeyMessages (Pro, 1콜, ≤3)
// ─────────────────────────────────────────

export async function synthKeyMessages(
  input: EngineInput,
  sections: Record<string, string>,
): Promise<string[]> {
  const snips = ['1', '2', '6']
    .map((n) => (sections[n] ? `[§${n}] ${sections[n].slice(0, 280)}` : ''))
    .filter(Boolean)
    .join('\n')

  const prompt = `
당신은 한국 RFP 제안서의 '핵심 메시지'를 뽑는 전문가입니다. 아래 본문에서 평가위원이 기억할
**선언적 핵심 메시지 3개**를 작성하세요. 과업을 가로질러 사업 전체의 메시지여야 합니다.

[본 사업]
사업명: ${input.rfp.projectName ?? '(미상)'} · 발주처: ${input.rfp.client ?? '(미상)'} · 채널: ${input.channel}
목표: ${(input.rfp.objectives ?? []).slice(0, 4).join(' / ') || '(미상)'}

[본문 발췌]
${snips || '(본문 부족 — 목표·과업 기반 추론)'}

[규칙]
1. 정확히 3개. 각 12~45자 한 문장. 선언형.
2. #1 = 사업 본질/Before→After, #2 = 방법론·차별 메커니즘(과업 조합), #3 = 정량 성과/임팩트.
3. 추상 슬로건 금지 — 숫자·단계·대상이 드러나게. 회사명 비교 금지.

[출력 JSON]
{ "keyMessages": ["...", "...", "..."] }
JSON 만.
`.trim()

  try {
    const r = await invokeAi({
      prompt,
      model: modelFor('engine.keymsg'),
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.5,
      label: 'engine.synthKeyMessages',
    })
    const raw = safeParseJson<{ keyMessages?: string[] }>(r.raw, 'engine.synthKeyMessages')
    const km = Array.isArray(raw?.keyMessages)
      ? raw.keyMessages
          .filter((m) => typeof m === 'string' && m.trim().length >= 8)
          .map((m) => m.trim().slice(0, 80))
          .slice(0, 3)
      : []
    return km
  } catch (e) {
    log.warn('engine.assemble', 'synthKeyMessages 실패 → 빈 배열', {
      err: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

// ─────────────────────────────────────────
// 4. assemble — 조립 (plan → write 순차 → keyMessages → coherence)
// ─────────────────────────────────────────

export async function assemble(
  input: EngineInput,
  evidence: EvidencePool,
): Promise<ExpressDraft> {
  const { onProgress } = input
  const draft = emptyDraft()

  // intent / beforeAfter 는 RFP 로 즉시 시드 (LLM 절약 — 본문이 본체)
  if (input.rfp.summary) {
    draft.intent = input.rfp.summary.slice(0, 200)
  }

  // 1) plan
  onProgress?.('assemble', 'planOutline (Pro)...')
  const outline = await planOutline(input, evidence)

  // 2) write — 순차 (공유 memory, 병렬 금지)
  onProgress?.('assemble', '섹션 순차 작성 (Pro, 7섹션)...')
  const memory: string[] = []
  const sections: Record<string, string> = {}
  for (const key of SECTION_KEYS) {
    const text = await writeSection(key, outline, input, evidence, memory)
    if (text) {
      sections[key] = text
      memory.push(...extractClaims(text))
    }
    onProgress?.('assemble', `sections.${key} 완료 (${text.length}자)`)
  }
  draft.sections = sections as ExpressDraft['sections']

  // 3) keyMessages — 과업 가로질러
  onProgress?.('assemble', 'synthKeyMessages (Pro)...')
  const km = await synthKeyMessages(input, sections)
  if (km.length > 0) draft.keyMessages = km

  // 4) coherence — 기존 모듈 재사용
  onProgress?.('assemble', 'coherencePass (Pro)...')
  try {
    const coh = await coherencePass({ draft, projectName: input.rfp.projectName ?? undefined })
    draft.sections = coh.updatedSections as ExpressDraft['sections']
  } catch (e) {
    log.warn('engine.assemble', 'coherencePass 실패 → 원본 유지', {
      err: e instanceof Error ? e.message : String(e),
    })
  }

  // meta 갱신
  draft.meta.lastUpdatedAt = new Date().toISOString()

  // 최종 schema 검증 (실패해도 draft 반환 — 호출부가 처리)
  const validated = ExpressDraftSchema.safeParse(draft)
  if (!validated.success) {
    log.warn('engine.assemble', '최종 schema 검증 경고', {
      issue: validated.error.issues[0]?.message,
    })
  }
  return draft
}

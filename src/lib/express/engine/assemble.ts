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

/** RetrievedChunk 의 출처 라벨 (당선 제안서 발췌 vs UD 자산). 근거 신뢰도 표시용. */
function chunkSourceLabel(c: RetrievedChunk): string {
  if (c.source === 'asset' || c.citation?.assetId) return 'UD 자산'
  return '당선 제안서 발췌'
}

/**
 * evidence 청크 → 프롬프트용 구조화 근거 블록 (인용 가능 근거 + 출처 표시).
 * 각 항목에 출처를 붙여 "어떤 근거에서 온 정량 주장인지" 추적 가능하게 한다(QUAL-1 grounding).
 */
function formatChunks(chunks: RetrievedChunk[] | undefined, max = 4): string {
  if (!chunks || chunks.length === 0) {
    return '(검색된 당선 근거·자산 없음 — 이 섹션은 정량 주장 없이 RFP·과업 기반 정성 서술로만 작성)'
  }
  return chunks
    .slice(0, max)
    .map((c, i) => `[근거 ${i + 1} · ${chunkSourceLabel(c)}] ${c.text.replace(/\s+/g, ' ').slice(0, 320)}`)
    .join('\n')
}

// ─────────────────────────────────────────
// 1. planOutline (Pro, 1콜)
// ─────────────────────────────────────────

const DEFAULT_LENGTH: Record<SectionKey, number> = {
  '1': 700,
  '2': 850, // §2 named 컨셉 1줄 + 매력 3축 추가 (QUAL-2)
  '3': 1400, // §3 주차 커리큘럼 표 + 전체 타임라인 + 실행계획 (QUAL-2 — 표 밀도). schema 상한 2000자 내.
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
      return [
        '이 섹션은 **과업 조합의 논리 사슬**입니다. 과업들이 어떻게 맞물려 사업 목표를 달성하는지 전략으로 엮으세요.',
        '',
        '[메인 솔루션 — 기억에 남는 named 컨셉 1줄 (필수, 섹션 맨 앞)]',
        '본 사업의 핵심 솔루션을 **한 줄짜리 기억에 남는 고유 명칭(brandable concept)** 으로 명명하세요. 평이한 서술 금지 — 발주처·평가위원이 한 번 듣고 기억할 수 있는 날카로운 컨셉이어야 합니다.',
        '  · 형태 예시: "○○주 △△ 고도화 사이클", "Act-preneur N주 BM 부트", "로컬-AI 융합 원데이 사이클" — 본 사업의 대상·기간·핵심 활동이 드러나는 고유 명칭.',
        '  · 명명 직후 **왜 이 컨셉이 매력적인가** 를 3 축으로 짧게 못 박으세요: ① 발주처 hot button 직격(RFP 목표·평가배점 중 가장 무거운 항목을 정조준) · ② 차별화(통상적 접근이 못 하는 것을 이 컨셉이 한다) · ③ 발주처 편익(이 컨셉이 만들어 내는 구체적 결과·성과).',
        '  · 이후 모든 차별점·전략은 이 named 컨셉 아래로 수렴하게 서술 — 컨셉이 섹션 전체를 꿰는 우산 역할.',
        '',
        '[차별점 — named discriminator + ghosting (필수)]',
        '추진 전략에 **이름 붙은 구체적 차별점 1~2개**를 명시하고, 그것이 발주처에 주는 편익으로 연결하세요. 막연한 "체계적/전문적" 금지 — 본 사업의 과업 구성에서 실제로 도출되는 메커니즘을 명명하세요(예: "4중 지원 체계", "Action Week(실행 주간)", "코치 N명 1:1 매칭" 등 본 사업 과업에 근거가 있을 때만).',
        '**ghosting**: 경쟁사 이름은 절대 쓰지 말고, 통상적인 약한 접근을 **이름 없이 대비**해 우위를 부각하세요(예: "이론 강의에 그쳐 실행 전환 장치가 없는 통상적 프로그램과 달리, 본 사업은 …"). 단정적 비방이 아니라 "어떤 설계가 더 나은 결과를 내는가"의 대비로.',
      ].join('\n')
    case '3':
      return [
        '이 섹션은 **과업별 블록을 order 순으로 순차 렌더**합니다. 각 과업(특히 education/mentoring)을 주차·세션 단위로 구체화하세요.',
        '',
        '[주차별 커리큘럼 — 마크다운 표 강제 (교육·멘토링 과업, 필수)]',
        '막연한 "1단계/2단계" 서술 금지. 교육·멘토링 과업은 반드시 **주차별 표**로 내리세요. 표 컬럼은 정확히 4개:',
        '  | 주차 | 핵심 주제 | 핵심 활동 (사용 도구/방법론) | 산출물 |',
        '각 행 = 한 주(W1, W2, … WN). RFP 의 교육 기간(주/개월)에 맞춰 주차 수를 정하세요(예: 8주면 W1~W8, 길면 2주 묶음도 허용하되 묶음 라벨 명시).',
        '  · "핵심 활동" 칸에는 실제 사용 도구·방법론을 명시(예: DOGS 카드 게임, 린 캔버스, AI 랜딩페이지 빌더, 1:1 코칭 등 본 사업 과업에 근거가 있는 것).',
        '  · "산출물" 칸에는 그 주에 손에 남는 결과물(예: 문제정의서, MVP 랜딩페이지, 시장성 분석 보고서, IR Deck 초안 등)을 반드시 명시 — 빈 칸 금지.',
        '',
        '[Action Week — 명시 (언더독스 원칙)]',
        '이론 강의가 3주 연속되지 않게 **실행 주차(Action Week)** 를 표 안에 명시 라벨로 박으세요(예: 해당 주차 핵심 주제에 "★ Action Week — 현장 실행" 표기). 이론→실습→피드백 루프가 보이게.',
        '',
        '[사업 전체 타임라인 — 명시 (필수)]',
        '주차 커리큘럼과 별도로, 사업 **전체 단계 타임라인**을 한 대목에 명시하세요. 단계 순서:',
        '  준비·세팅 → 모집·선발 → 주차별 교육(위 표) → 데모데이 → 성과 결과보고.',
        '각 단계에 **시점(월 또는 주차 범위) · 마일스톤 · 담당(PMO/총괄PM/코치)** 을 붙이세요. RFP 에 사업/교육 시작·종료일이 있으면 그 날짜에 맞춰 월 단위로 배치.',
        '',
        '[단계별 세부 실행계획 — 누가·언제·무엇을·산출물]',
        '각 단계가 막연하지 않도록, 단계별로 **누가(담당) · 언제(시점) · 무엇을(활동) · 산출물**이 드러나게 한 줄씩 서술하세요(특히 모집·선발 방식, 데모데이 운영 방식, 결과보고 시점).',
        '',
        '[차별점 — 커리큘럼 구조의 named discriminator]',
        '커리큘럼이 단순 강의 나열이 아니라 **이름 붙은 설계 장치**(예: Action Week·실습-피드백 루프·1:1 코칭 매칭 등 본 사업 과업에 근거가 있는 것)로 실행 전환을 만든다는 점을 드러내세요. 이론 위주로 흘러가는 통상적 커리큘럼과 어떻게 다른지 한 대목에서 대비(ghosting, 회사명 없이)하세요.',
      ].join('\n')
    case '4':
      return [
        '이 섹션은 **과업별 운영·인력 체계**입니다. 코치=멘토링 과업 디테일, 운영 인력·PMO·보고·리스크 관리를 과업에 매핑하세요.',
        '',
        '[리스크 레지스터 — 필수]',
        '운영 체계 끝에 **주요 리스크 3~5개**를 표/목록으로 명시하세요. 각 리스크 = (리스크 내용) + (발생 시 영향) + (구체적 완화·대응책).',
        '특히 평가위원이 의심할 만한 **미언급 우려를 선제적으로 짚고** 답하세요(예: 모집 미달·일정 지연·코치 이탈·품질 편차·예산 초과 등 본 사업 맥락의 실제 위험).',
        '추상적 "철저히 관리"는 금지 — 모니터링 지표·대응 트리거·책임 주체가 드러나게.',
      ].join('\n')
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

[이 섹션 검색 근거 — 정량 주장의 유일한 출처 (당선 제안서 발췌·UD 자산)]
아래 근거에 담긴 수치·실적·사실만 정량 주장으로 쓸 수 있습니다. 문장은 베끼지 말고 본 사업 맥락에 맞게 재구성하되, 근거의 사실을 본문에 녹여 근거 밀도를 높이세요(예: 근거에 등장한 실적·지표·방법론을 본 사업의 주장 뒤에 붙여 뒷받침).
${formatChunks(evidence.bySection.get(key), 4)}

${memoryBlock}
${pmInputsSection ? `\n[PM 입력 외부 reality — 본문에 적극 반영]\n${pmInputsSection}` : ''}

[작성 규칙]
1. 경어체(~합니다). Pyramid — 결론(thesis) 먼저, 근거 뒤.
2. 발주처 키워드를 자연스럽게 흡수. 추상 나열 X — 단계·항목·정량 구체화.
3. 실행 구체성: 월/주차 일정·대면 거점·협력기관을 가능한 한 구체화.
4. **정량 주장 근거 규칙 (엄수)**: 수치·통계·실적·달성률 같은 정량 주장은 **위 [검색 근거]에 실제로 등장하는 것만** 사용하세요. 근거에 해당 수치가 없으면 **숫자를 지어내지 말고, 정량 주장 대신 정성(질적) 서술로 바꾸세요**(예: "85% 향상" 대신 "참가자 역량이 단계적으로 향상되도록 설계"). 회사명 직접 비교 금지.
5. 위 [이미 쓴 주장] 과 모순되거나 동일 문장 반복 금지.
6. 최대 2000자. 마크다운 H1/H2 금지(본문 산문·필요시 불릿).
7. [가독성(ergonomics) — 평가위원 10초 규칙] 한 문단 ≤6줄, 한 문장 ≤15~20단어로 끊어 쓰세요. 긴 내용은 **소제목(굵게)** 으로 묶고, 핵심 수치·결론은 **굵게** 강조해 스캔 가능하게. 한 문단 한 주제.

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

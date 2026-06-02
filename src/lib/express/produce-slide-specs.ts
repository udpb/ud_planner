/**
 * Produce Slide Specs — Phase O4 (2026-05-30)
 *
 * 1차본 sections.N 텍스트 + ExpressDraft 컨텍스트 → 슬라이드 spec 시퀀스.
 *
 * 흐름:
 *   각 sections.N 마다 1~2 슬라이드 spec 생성 (총 ~14-21 슬라이드):
 *     - kicker · headline · diagram (pattern + data) · evidence · caption
 *   섹션 default 패턴 hint + LLM 자율 선택
 *
 * 비용:
 *   sections 7 × ~2 slides × 1 LLM call = ~14 calls (~$0.014)
 *
 * 결과:
 *   ExpressDraft 에 slideSpecs: SlideSpec[] 추가
 */

import 'server-only'

import { z } from 'zod'
import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import {
  DIAGRAM_PATTERNS,
  SECTION_DEFAULT_PATTERNS,
  validateSlideSpec,
  type SlideSpec,
} from '@/lib/diagrams/slide-pattern'
import {
  getLearnedSectionPatterns,
  LEARNED_DENSITY,
  LEARNED_HEADLINE_EXAMPLES,
} from '@/lib/diagrams/learned-patterns'

const SECTION_TITLES: Record<string, { num: string; ko: string }> = {
  '1': { num: '01', ko: '제안 배경 및 목적' },
  '2': { num: '02', ko: '추진 전략 및 방법론' },
  '3': { num: '03', ko: '교육 커리큘럼' },
  '4': { num: '04', ko: '운영 체계 및 코치진' },
  '5': { num: '05', ko: '예산 및 경제성' },
  '6': { num: '06', ko: '기대 성과 및 임팩트' },
  '7': { num: '07', ko: '수행 역량 및 실적' },
}

export interface ProduceSlideSpecsInput {
  /** sections.N → text */
  sections: Partial<Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', string>>
  /** keyMessages — headline 후보 */
  keyMessages?: string[]
  /** UD 정량 실적 (KPI 데이터 source) */
  trackRecord?: { yearsActive?: number; totalGraduates?: number; totalCoaches?: number; regionalHubs?: number; creditRating?: string; cumulativeRevenueBillions?: number }
  /** 자동 산출 예산 비목 */
  budgetBreakdown?: Array<{ category: string; amount: number; percentage: number }>
  /** 발주처 */
  clientName?: string | null
  projectName?: string | null
}

export async function produceSlideSpecs(
  input: ProduceSlideSpecsInput,
): Promise<SlideSpec[]> {
  const sections = input.sections
  const allSpecs: SlideSpec[] = []

  for (const num of ['1', '2', '3', '4', '5', '6', '7'] as const) {
    const body = sections[num]
    if (!body || body.length < 30) continue
    const section = SECTION_TITLES[num]
    const defaultPatterns = SECTION_DEFAULT_PATTERNS[num] ?? []

    const specs = await produceSectionSpecs({
      sectionNum: num,
      sectionLabel: `${section.num} ${section.ko}`,
      sectionBody: body,
      defaultPatterns,
      keyMessages: input.keyMessages ?? [],
      trackRecord: input.trackRecord,
      budgetBreakdown: input.budgetBreakdown,
    })
    allSpecs.push(...specs)
  }

  return allSpecs
}

async function produceSectionSpecs(input: {
  sectionNum: '1' | '2' | '3' | '4' | '5' | '6' | '7'
  sectionLabel: string
  sectionBody: string
  defaultPatterns: readonly string[]
  keyMessages: string[]
  trackRecord?: ProduceSlideSpecsInput['trackRecord']
  budgetBreakdown?: ProduceSlideSpecsInput['budgetBreakdown']
}): Promise<SlideSpec[]> {
  // N2 — 실제 당선 PPT 에서 학습한 섹션별 패턴 + 밀도 역주입
  const learnedPatterns = getLearnedSectionPatterns(input.sectionNum)
  const targetBlocks = Math.round(LEARNED_DENSITY.avgBlocks)
  const targetEvidence = Math.max(2, Math.round(LEARNED_DENSITY.avgEvidence))
  const headlineExamples = LEARNED_HEADLINE_EXAMPLES.slice(0, 5)

  const prompt = `
당신은 한국 사업 제안서 슬라이드 디자이너입니다.
다음 sections.${input.sectionNum} 본문을 보고 **1-2 슬라이드** 의 spec 을 생성합니다.

⭐ 핵심 목표 (ADR-024): 실제 당선 제안서 수준의 **콘텐츠 밀도** — 한 슬라이드가
"한 주장 + 그것을 받치는 충분한 세부(메커니즘·how·근거)" 로 가득 차야 합니다.
하단 공백 금지. (실제 당선 슬라이드 평균: 블록 ~${targetBlocks}개 · 정량 근거 ~${targetEvidence}건)

각 슬라이드는 반드시:
  - kicker: "${input.sectionLabel}"
  - layout: 아래 6 아키타입 中 1 (목적에 맞게 선택)
  - headline: 한 문장 핵심 (Pyramid Principle — 결론 먼저, 30-100자)
  - diagram: 도식화 패턴 + 데이터 (9 패턴 中 1) — 데이터 항목을 충분히 채울 것 (빈약 금지)
  - body: 키메시지를 받치는 세부 1~4 블록 ({ "heading": "소제목", "text": "메커니즘·절차·how 200~400자" })
          — 출처 나열이 아니라 "왜/어떻게 작동하는지" 의 설명. split-visual/narrative 에서 특히 중요.
  - evidence: 근거 ${targetEvidence}건 내외 — **정량 수치 + 그 수치가 무엇을 증명하는지(메커니즘)**
  - caption: 선택 (60자 이내 보조)

[레이아웃 아키타입 6종 — 슬라이드 목적에 맞게 layout 선택]
  - hero-stat: 지배적 빅넘버/핵심 실적 강조 (임팩트·실적 — kpi-grid 와 함께)
  - split-visual: 좌 서술(body 프로즈) / 우 도식 (본문 설명형 — body 필수)
  - full-diagram: 도식이 화면 지배 (process-flow·timeline·matrix·architecture)
  - detail-grid: 다셀 고밀도 그리드 (주차 커리큘럼·모듈 — hierarchy/kpi + body 셀)
  - comparison: 전후/대비 지배 (before-after·comparison-table)
  - narrative: 텍스트 고밀도 + 우측 콜아웃 (배경·논거 — body 필수)
  실제 당선 sections.${input.sectionNum} 패턴 빈도: ${learnedPatterns.length ? learnedPatterns.join(' / ') : input.defaultPatterns.join(' / ')}

[밀도 — 충분히 채우되, 정말 넘칠 때만 2개로 분할(order +1)]
  - headline ≤ 100자 · caption ≤ 60자 · body 블록 text ≤ 400자 · evidence 최대 3건(각 ≤ 150자)
  - 도식은 항목을 넉넉히: process-flow 단계 5~7 · kpi-grid 6~8셀 · comparison-table 행 5~8
    · architecture-stack 레이어 4~6(레이어당 항목 4~6) · timeline 트랙 4~6 · hierarchy 자식 3~5
  - 핵심: 한 슬라이드 안의 블록(도식 셀 + body 블록 + 근거)이 ~${targetBlocks}개에 가깝게.
${headlineExamples.length > 0
    ? `\n[실제 당선 슬라이드 헤드라인 스타일 — 이 톤·구체성 모방]\n${headlineExamples.map((h, i) => `  ${i + 1}. ${h}`).join('\n')}`
    : ''}

[현재 섹션 본문]
${input.sectionBody.slice(0, 2000)}

[키 메시지 후보]
${input.keyMessages.slice(0, 3).map((m, i) => `${i + 1}. ${m}`).join('\n') || '없음'}

[⭐ UD 정량 실적 — 아래 숫자만 사용. 절대 부풀리거나 창작 금지 (특히 누적 매출/창업가 수)]
${
  input.trackRecord
    ? [
        input.trackRecord.cumulativeRevenueBillions != null
          ? `· 누적 수주: ${input.trackRecord.cumulativeRevenueBillions}억원 (★ "5,000억" 같은 과장 금지 — 정확히 ${input.trackRecord.cumulativeRevenueBillions}억)`
          : '',
        input.trackRecord.totalGraduates != null ? `· 누적 육성 창업가: ${input.trackRecord.totalGraduates.toLocaleString()}명` : '',
        input.trackRecord.totalCoaches != null ? `· 코치 풀: ${input.trackRecord.totalCoaches}명` : '',
        input.trackRecord.yearsActive != null ? `· 운영 연수: ${input.trackRecord.yearsActive}년` : '',
        input.trackRecord.regionalHubs != null ? `· 거점: ${input.trackRecord.regionalHubs}개` : '',
        input.trackRecord.creditRating ? `· 신용등급: ${input.trackRecord.creditRating}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '없음 — UD 누적 실적 수치를 창작하지 말 것 (모르면 생략)'
}

[참고 — 자동 산출 예산 (이 수치만 사용)]
${input.budgetBreakdown ? JSON.stringify(input.budgetBreakdown) : '없음'}

[도식화 패턴 — 이 섹션에 잘 맞는 것 우선]
${learnedPatterns.length > 0
    ? `실제 당선 제안서에서 sections.${input.sectionNum} 에 가장 자주 쓴 패턴 (빈도순): ${learnedPatterns.join(' / ')}`
    : `권장: ${input.defaultPatterns.join(' / ')}`}
전체 8종:
  - process-flow: 횡 N단계 (예: M1 → M2 → ... 커리큘럼)
  - matrix-2x2: 4분면 비교 (전략 포지셔닝)
  - kpi-grid: 빅 넘버 그리드 (실적·임팩트·예산 비목)
  - hierarchy-tree: top-down 위계 (조직도·운영 체계)
  - timeline: 월/주차 간트 (커리큘럼·일정)
  - comparison-table: 좌/우 비교 (시장 평균 vs 언더독스)
  - architecture-stack: 레이어 스택 (시스템·방법론 구조)
  - before-after: 변화 강조 (배경·목적)
  - text-only: 도형 없이 텍스트 강조 (꼭 필요할 때만)

[데이터 schema 예시]

process-flow:
{ "pattern": "process-flow", "data": { "steps": [{"num":"M1","label":"시장 진단","description":"기술 적합도"},...] } }

matrix-2x2:
{ "pattern": "matrix-2x2", "data": {
  "axisX": {"label":"시장 견인력","low":"낮음","high":"높음"},
  "axisY": {"label":"기술 우위","low":"낮음","high":"높음"},
  "quadrants": [{"q":"TR","label":"시장 견인 검증","description":"본 사업 목표","highlight":true}, ...]
} }

kpi-grid:
{ "pattern": "kpi-grid", "data": { "columns": 4, "kpis": [{"value":"20,211","label":"명","sublabel":"누적 육성"}, ...] } }

hierarchy-tree:
{ "pattern": "hierarchy-tree", "data": {
  "root": {"label":"운영 PM","sublabel":"전담"},
  "children": [{"label":"Lead 코치","sublabel":"前 카카오 PM","children":[{"label":"주 코칭"}]}, ...]
} }

timeline:
{ "pattern": "timeline", "data": {
  "units": ["M1","M2","M3","M4","M5","M6"],
  "tracks": [{"name":"교육","bars":[{"startIdx":0,"endIdx":1,"label":"IMPACT"}, ...]}, ...]
} }

comparison-table:
{ "pattern": "comparison-table", "data": {
  "leftLabel":"시장 평균", "rightLabel":"언더독스",
  "rows": [{"dim":"실습 비중","left":"30%","right":"80%","advantageOnRight":true}, ...]
} }

architecture-stack:
{ "pattern": "architecture-stack", "data": {
  "layers": [{"name":"사용자","items":["창업가","PM"]}, {"name":"AI","items":["EDU 봇","ACT 봇"],"accent":true}, ...]
} }

before-after:
{ "pattern": "before-after", "data": {
  "before": {"label":"기술 우위, 시장 부재","metrics":["첫 매출 12%"]},
  "after": {"label":"시장 견인 검증","metrics":["MVP 80%+"]}
} }

text-only:
{ "pattern": "text-only", "data": null }

[출력 JSON]
{
  "slides": [
    {
      "kicker": "${input.sectionLabel}",
      "layout": "split-visual",
      "headline": "한 문장 핵심 — 결론 먼저",
      "caption": "선택 보조",
      "body": [
        {"heading": "작동 원리", "text": "이 방식이 왜/어떻게 성과로 이어지는지 구체 절차·메커니즘 200~400자"},
        {"heading": "차별점", "text": "기존 대비 무엇이 다른지 구체적으로"}
      ],
      "diagram": { "pattern": "...", "data": { ... } },
      "evidence": [{"text":"누적 20,211명 육성, 사업화 성공률 약 N% (수치 + 무엇을 증명)","source":"언더독스 2015–2025"}, ...],
      "sectionNum": "${input.sectionNum}",
      "order": 1
    }
  ]
}

⚠ 근거(evidence) 규칙 (ADR-024):
   - **출처만 단 빈 근거 금지.** "(언더독스 내부 실적)" 단독 X → 반드시 "수치/사실 + 그것이 증명하는 것" + 출처.
   - 단, 수치 창작·부풀림 금지. 모르는 숫자는 만들지 말고 정성적 사실로 (출처는 실제 기관·연도).
⚠ 데이터는 본문 + 위 [UD 정량 실적] 에서만 추출. 모르면 빈 값. 수치 가공·부풀림·hallucination 절대 금지.
   - 특히 누적 매출은 정확히 ${input.trackRecord?.cumulativeRevenueBillions ?? '(제공된 값)'}억 — "5,000억" 처럼 자릿수 바꾸지 말 것.
   - 본문/근거/body 에 자산 ID 코드(cmpl... 같은 영숫자 코드)·"[자산 인용: ...]" 마커 **절대 포함 금지** (평가위원이 그대로 봄).
   - evidence.source 는 실제 기관·연도 (예: "통계청 2023.12", "언더독스 누적 실적") — 자산 ID 코드 금지.
⚠ 1-2 슬라이드만 (5 미만). 단, 각 슬라이드는 위 밀도 목표를 충분히 채울 것 (하단 공백 금지).
JSON 만. 마크다운 펜스 X.
`.trim()

  try {
    const r = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.LARGE,
      temperature: 0.3,
      label: `slide-spec-${input.sectionNum}`,
    })
    const raw = safeParseJson<any>(r.raw, `slide-spec-${input.sectionNum}`)
    const slides = Array.isArray(raw?.slides) ? raw.slides : []
    const specs: SlideSpec[] = []
    for (const s of slides) {
      const validated = validateSlideSpec(s)
      if (validated.ok) {
        specs.push(validated.spec)
      } else {
        console.warn(`[slide-spec ${input.sectionNum}] validation fail:`, validated.error)
      }
    }
    return specs
  } catch (err) {
    console.warn(`[slide-spec ${input.sectionNum}] LLM 실패:`, err instanceof Error ? err.message : err)
    return []
  }
}

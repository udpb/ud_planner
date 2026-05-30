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

⭐ 핵심 목표: 실제 당선 제안서 수준의 **콘텐츠 밀도** — 한 슬라이드가 헤드라인 하나에
그치지 않고, 도식화 안에 충분한 정보(단계·항목·수치)와 근거가 담겨 "내용이 많고 설득력 있게"
보여야 합니다. (실제 당선 슬라이드 평균: 도식 요소 ~${targetBlocks}개 · 정량 근거 ~${targetEvidence}건)

한 슬라이드 = 한 메시지. 각 슬라이드는 반드시:
  - kicker: "${input.sectionLabel}"
  - headline: 한 문장 핵심 (Pyramid Principle — 결론 먼저, 30-100자)
  - diagram: 도식화 패턴 + 데이터 (8 패턴 中 1) — 데이터 항목을 충분히 채울 것 (빈약 금지)
  - evidence: 근거 ${targetEvidence}건 내외 (정량·연도·기관 우선)
  - caption: 선택 (60자 이내 보조)
${headlineExamples.length > 0
    ? `\n[실제 당선 슬라이드 헤드라인 스타일 — 이 톤·구체성 모방]\n${headlineExamples.map((h, i) => `  ${i + 1}. ${h}`).join('\n')}`
    : ''}

[현재 섹션 본문]
${input.sectionBody.slice(0, 2000)}

[키 메시지 후보]
${input.keyMessages.slice(0, 3).map((m, i) => `${i + 1}. ${m}`).join('\n') || '없음'}

[참고 — UD 정량 실적]
${input.trackRecord ? JSON.stringify(input.trackRecord) : '없음'}

[참고 — 자동 산출 예산]
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
      "headline": "한 문장 핵심 — 결론 먼저",
      "caption": "선택 보조",
      "diagram": { "pattern": "...", "data": { ... } },
      "evidence": [{"text":"...","source":"..."}, ...],
      "sectionNum": "${input.sectionNum}",
      "order": 1
    }
  ]
}

⚠ 데이터는 본문에서 추출. 모르면 빈 값. 가공·hallucination 금지.
⚠ 1-2 슬라이드만 (5 미만). 한 슬라이드에 너무 많은 내용 X.
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

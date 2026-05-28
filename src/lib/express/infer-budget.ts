/**
 * Infer Budget Breakdown — Phase I2 (2026-05-28)
 *
 * sections.5 (예산 및 경제성) 자동 생성.
 *
 * 입력:
 *   - 본 사업 총 예산 (RFP)
 *   - 채널 (B2G/B2B/renewal)
 *   - 사업 도메인 키워드 (RFP keywords)
 *
 * 흐름:
 *   1. ProposalBudgetItem DB 에서 비슷한 규모(±40%) + 채널 일치 사업 sourceProject 추출
 *   2. 각 사업의 비목별 비율 계산 → 평균 + 표준편차
 *   3. 본 사업 예산에 비율 곱해서 4비목 자동 산출
 *   4. Gemini 1 호출 (또는 휴리스틱) 로 sections.5 본문 생성
 *      - 비목별 산출 근거 + 정당화
 *      - PM 보완 권장 마커
 *
 * 결과: { sectionText, breakdown[], citedSources[] }
 */

import 'server-only'

import { prisma } from '@/lib/prisma'
import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { z } from 'zod'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

export interface InferBudgetInput {
  rfp: RfpParsed
  channel: 'B2G' | 'B2B' | 'renewal'
}

export interface BudgetBreakdown {
  category: string
  amount: number
  percentage: number
  rationale: string
}

const BudgetResultSchema = z.object({
  sectionText: z.string().max(2000),
})

// 비목 카테고리 정규화 — DB 의 raw 카테고리를 표준 4분류로 매핑
const CATEGORY_MAP: Record<string, string> = {
  '인건비': '인건비',
  '강사료': '강사료',
  '운영비': '운영비',
  '재료비': '운영비',
  '여비': '운영비',
  '회의비': '운영비',
  '외주비': '간접비',
  '기타': '간접비',
}

function normalizeCategory(raw: string): string {
  return CATEGORY_MAP[raw] ?? '간접비'
}

export async function inferBudgetBreakdown(
  input: InferBudgetInput,
): Promise<{
  sectionText: string
  breakdown: BudgetBreakdown[]
  citedSources: string[]
  totalBudget: number
}> {
  const { rfp, channel } = input
  const totalBudget = rfp.totalBudgetVat ?? 0

  if (!totalBudget || totalBudget < 1_000_000) {
    return {
      sectionText:
        'PM 작성 권장 — 본 사업 총 예산 정보 부족. RFP 의 예산 정보 입력 후 자동 산출 가능.',
      breakdown: [],
      citedSources: [],
      totalBudget,
    }
  }

  // 비슷한 규모 (±40%) + 채널 일치 사업 추출
  const minBudget = totalBudget * 0.6
  const maxBudget = totalBudget * 1.4

  // 각 sourceProject 의 총 예산 합계 → 범위 내 사업 추출
  const projectTotals = await prisma.proposalBudgetItem.groupBy({
    by: ['sourceProject', 'channelType'],
    where: {
      channelType: channel,
    },
    _sum: { amount: true },
  })

  // ±40% 내 — 본 사업 규모와 가까운 순으로 정렬
  const inRange = projectTotals
    .map((p) => ({ proj: p.sourceProject, total: p._sum.amount ?? 0 }))
    .filter((p) => p.total >= minBudget && p.total <= maxBudget)
    .sort((a, b) => Math.abs(a.total - totalBudget) - Math.abs(b.total - totalBudget))

  // K1 fix (2026-05-29): slice(0,10) → 25 로 확대 (sample size 부족 시 평균 왜곡)
  // 그래도 부족하면 (±40% 범위 내 사업 적음) 채널 전체로 fallback
  const MAX_SAMPLE = 25
  let similarProjects = inRange.slice(0, MAX_SAMPLE).map((p) => p.proj)

  if (similarProjects.length < 5) {
    // fallback: 채널 일치 전체에서 상위 N건 (sample 늘림)
    const all = projectTotals
      .map((p) => ({ proj: p.sourceProject, total: p._sum.amount ?? 0 }))
      .filter((p) => p.total > 0)
      .sort((a, b) => Math.abs(a.total - totalBudget) - Math.abs(b.total - totalBudget))
      .slice(0, MAX_SAMPLE)
      .map((p) => p.proj)
    similarProjects = all
  }

  // 그 사업들의 비목별 합계
  const items = await prisma.proposalBudgetItem.findMany({
    where: { sourceProject: { in: similarProjects } },
    select: { sourceProject: true, category: true, amount: true },
  })

  // K1 fix (2026-05-29): 사업별 비목 합계 → 사업별 비율 → 전체 사업에 대한 평균
  //   - 카테고리가 없는 사업도 0 으로 포함 (분모: similarProjects.length)
  //   - 기존 버그: catMap 에 없는 cat 은 평균에서 제외돼 항상 100% 초과 → 가장 큰 비목 (인건비) 에 음수 잔액 부담
  const STANDARD_CATEGORIES = ['인건비', '강사료', '운영비', '간접비']
  const projectCategorySum = new Map<string, Map<string, number>>()
  const projectTotalSum = new Map<string, number>()
  for (const proj of similarProjects) {
    projectCategorySum.set(proj, new Map(STANDARD_CATEGORIES.map((c) => [c, 0])))
    projectTotalSum.set(proj, 0)
  }
  for (const it of items) {
    const catMap = projectCategorySum.get(it.sourceProject)
    if (!catMap) continue
    const norm = normalizeCategory(it.category)
    catMap.set(norm, (catMap.get(norm) ?? 0) + it.amount)
    projectTotalSum.set(it.sourceProject, (projectTotalSum.get(it.sourceProject) ?? 0) + it.amount)
  }

  // 각 사업의 비목별 비율 (0 포함) → 전체 평균
  const categoryRatios = new Map<string, number[]>(
    STANDARD_CATEGORIES.map((c) => [c, []]),
  )
  let validProjectCount = 0
  for (const [proj, catMap] of projectCategorySum) {
    const projTotal = projectTotalSum.get(proj) ?? 0
    if (projTotal <= 0) continue
    validProjectCount += 1
    for (const cat of STANDARD_CATEGORIES) {
      const amt = catMap.get(cat) ?? 0
      categoryRatios.get(cat)!.push(amt / projTotal)
    }
  }

  // 평균 비율 (zero-imputation 포함) — 자연스럽게 ~100% 합산
  const rawAvg = new Map<string, number>()
  for (const cat of STANDARD_CATEGORIES) {
    const ratios = categoryRatios.get(cat) ?? []
    const avg = ratios.length > 0 ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 0
    rawAvg.set(cat, avg)
  }

  // 합이 정확히 1 이 안 될 수 있음 (rounding) → 정규화
  const sumOfAvg = STANDARD_CATEGORIES.reduce((s, c) => s + (rawAvg.get(c) ?? 0), 0)
  const normalizeFactor = sumOfAvg > 0 ? 1 / sumOfAvg : 0

  const breakdown: BudgetBreakdown[] = []
  for (const cat of STANDARD_CATEGORIES) {
    const avgNormalized = (rawAvg.get(cat) ?? 0) * normalizeFactor
    const amount = Math.round((totalBudget * avgNormalized) / 10000) * 10000 // 만원 단위 round
    if (amount > 0) {
      breakdown.push({
        category: cat,
        amount,
        percentage: Math.round(avgNormalized * 1000) / 10, // 1 decimal
        rationale: `유사 ${validProjectCount}건 사업 평균 ${(avgNormalized * 100).toFixed(1)}% (채널 ${channel})`,
      })
    }
  }

  // 만원 단위 round 으로 잔액 발생 시 — 가장 큰 비목 (대부분 운영비) 에 흡수
  const breakdownSum = breakdown.reduce((s, b) => s + b.amount, 0)
  const diff = totalBudget - breakdownSum
  if (Math.abs(diff) > 1000 && breakdown.length > 0) {
    // 가장 큰 비목 찾기
    const largest = breakdown.reduce((a, b) => (a.amount >= b.amount ? a : b))
    largest.amount += diff
    largest.percentage = Math.round((largest.amount / totalBudget) * 1000) / 10
  }

  // Gemini 호출로 sections.5 본문 생성
  const breakdownLines = breakdown
    .map((b) => `- ${b.category}: ${b.amount.toLocaleString()}원 (${b.percentage}%) — ${b.rationale}`)
    .join('\n')

  const prompt = `
당신은 한국 RFP 제안서의 "예산 및 경제성" 섹션 작성자입니다.
다음 본 사업 예산을 4비목으로 분배한 자동 산출 결과를 기반으로 sections.5 본문을 작성합니다.

[본 사업]
사업명: ${rfp.projectName ?? '(미상)'}
총 예산: ${totalBudget.toLocaleString()}원 (VAT 포함)
대상: ${rfp.targetAudience ?? '(미상)'}
채널: ${channel}

[자동 산출 비목 (유사 ${validProjectCount}건 사업 평균 기반 · zero-imputation 후 정규화)]
${breakdownLines || '(데이터 없음)'}

──────────────────────────────
[작성 규칙]

1. **본문 구조** (400~900자):
   - 첫 단락: 총 예산 + 4비목 분류 + 사업 적합성 (50~150자)
   - 둘째 단락: 비목별 산출 근거 (각 비목 1~2 문장, 정량 + 정책 근거)
   - 셋째 단락: 예상 마진율·재무 건전성 + PM 보완 권장 (100~200자)

2. **표 형식 활용**:
   - "비목별 배분" 또는 "예산 4분류" 헤더 + bullet 4개
   - 각 bullet: "- 비목: 금액 (비율%) — 산출 근거 한 줄"

3. **정당화 톤**:
   - "유사 ${validProjectCount}건 평균" 강조 (객관성)
   - 정부 가이드라인 준수 명시
   - "PM 보완 권장 — 세부 산출 내역서로 정확 산정" 마지막에

4. **inline source citation**:
   - 1~2건만 — "[근거: 언더독스 N건 유사 사업 평균 비목 분석 | 2025]" 형식

[출력 JSON]
{
  "sectionText": "<sections.5 본문 — 400~900자>"
}

JSON 만. 설명·마크다운 펜스 없이.
  `.trim()

  try {
    const aiResp = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.4,
      label: 'infer-budget',
    })
    const raw = safeParseJson<unknown>(aiResp.raw, 'infer-budget')
    const validated = BudgetResultSchema.safeParse(raw)
    if (!validated.success || !validated.data.sectionText) {
      return {
        sectionText: buildFallback(totalBudget, breakdown, similarProjects.length),
        breakdown,
        citedSources: similarProjects,
        totalBudget,
      }
    }
    return {
      sectionText: validated.data.sectionText,
      breakdown,
      citedSources: similarProjects,
      totalBudget,
    }
  } catch (err) {
    console.warn('[infer-budget] LLM 실패 → fallback:', err)
    return {
      sectionText: buildFallback(totalBudget, breakdown, similarProjects.length),
      breakdown,
      citedSources: similarProjects,
      totalBudget,
    }
  }
}

function buildFallback(total: number, breakdown: BudgetBreakdown[], similarCount: number): string {
  const lines: string[] = []
  lines.push(
    `본 사업 총 예산은 ${total.toLocaleString()}원입니다 (VAT 포함). 유사 ${similarCount}건 사업 평균 비목 비율을 기반으로 다음 4분류로 집행합니다.`,
  )
  if (breakdown.length > 0) {
    lines.push('\n**비목별 배분 (자동 산출)**:')
    for (const b of breakdown) {
      lines.push(`- ${b.category}: ${b.amount.toLocaleString()}원 (${b.percentage}%) — ${b.rationale}`)
    }
  }
  lines.push(
    `\n_세부 산정 내역서는 별도 제출. 사후 정산 시 발주처 가이드 100% 준수. PM 보완 권장._`,
  )
  return lines.join('\n')
}

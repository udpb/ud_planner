/**
 * forecastImpact — 1차본 → 사전 임팩트 리포트 (Wave M3, 2026-05-15)
 *
 * **북극성**: 1차본 승인 직후 자동 호출 → 5초 이내 ImpactForecast 저장.
 *
 * 절차:
 *   1. impact-measurement 의 활성 카테고리·계수 로드 (캐시)
 *   2. AI 가 ExpressDraft + curriculum + RFP/Profile 컨텍스트 보고
 *      EducationItem[] 생성 (각 항목에 신뢰도·근거 메타 포함)
 *   3. Conservative 모드: AI 추정 (confidence='estimated') 항목에 0.7 factor
 *   4. calculateImpactSafe 로 계산 — null 필드 카테고리는 자동 skip
 *   5. ImpactForecast upsert (projectId 단일)
 *
 * **숫자 부풀림 방지**:
 *  - AI 프롬프트가 "RFP 명시값 > curriculum 도출 > AI 추정" 우선순위 강제
 *  - estimate 항목엔 0.7 인수 적용 (PM 이 보정 모드 끄면 해제)
 *  - 모든 항목에 rationale 필수 — 감사 가능
 */

import 'server-only'

import { prisma } from '@/lib/prisma'
import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import {
  listActiveCategories,
  listCurrentCoefficients,
  toImpactCountry,
  isImpactDbConfigured,
} from './db'
import { calculateImpactSafe, type SafeCalculationResult } from './engine'
import { conceptContextBlock } from '@/lib/program-design/concept-context'
import type { ConceptShape } from '@/lib/program-design/concept-synth'
import type {
  ImpactCategory,
  ForecastItemWithMeta,
  ForecastConfidence,
} from './types'
import { z } from 'zod'
import crypto from 'node:crypto'

// ─────────────────────────────────────────
// 1. AI 출력 스키마
// ─────────────────────────────────────────

const AiForecastItemSchema = z.object({
  categoryId: z.string(),
  itemName: z.string().optional(),
  count: z.number().nullable().optional(),
  hours: z.number().nullable().optional(),
  participants: z.number().nullable().optional(),
  days: z.number().nullable().optional(),
  months: z.number().nullable().optional(),
  revenue: z.number().nullable().optional(),
  newEmployees: z.number().nullable().optional(),
  investmentAmount: z.number().nullable().optional(),
  bizFund: z.number().nullable().optional(),
  coachesTrained: z.number().nullable().optional(),
  eventParticipants: z.number().nullable().optional(),
  spaceArea: z.number().nullable().optional(),
  spaceDuration: z.number().nullable().optional(),
  confidence: z.enum(['explicit', 'derived', 'estimated']),
  rationale: z.string().min(10).max(400),
})

const AiForecastResponseSchema = z.object({
  items: z.array(AiForecastItemSchema).max(20),
  calibrationNote: z.string().optional(),
})

type AiForecastItem = z.infer<typeof AiForecastItemSchema>

// ─────────────────────────────────────────
// 2. 입력 (1차본 컨텍스트)
// ─────────────────────────────────────────

export interface ForecastInput {
  projectId: string
  /** Express 1차본 */
  draft: {
    intent?: string
    beforeAfter?: { before?: string; after?: string }
    keyMessages?: string[]
    sections?: Record<string, string>
  }
  /** RFP 파싱 결과 */
  rfp?: {
    targetCount?: number | null
    targetAudience?: string
    eduStartDate?: string | null
    eduEndDate?: string | null
    projectStartDate?: string | null
    projectEndDate?: string | null
    totalBudgetVat?: number | null
    keywords?: string[]
  }
  /** ProgramProfile 정보 (channel, targetStage 등) */
  programProfile?: unknown
  /** CurriculumItem[] (Deep Track 진행 시 채워짐) */
  curriculum?: Array<{
    moduleName?: string
    sessionNo?: number
    hours?: number
    isTheory?: boolean
    isActionWeek?: boolean
    isCoaching1on1?: boolean
    targetCount?: number
  }>
  /** Wave M post-fix (C-9) — Budget 슬라이스: 예산 항목별 정량 컨텍스트 */
  budget?: {
    totalAmount?: number | null
    items?: Array<{
      category?: string
      name?: string
      amount?: number
      quantity?: number
      unit?: string | null
    }>
  }
  /** PM 이 명시한 국가 (Project.sroiCountry) */
  country?: string
  /** Conservative 모드 (estimated 항목 0.7 factor) — 기본 true */
  conservative?: boolean
  /**
   * ADR-031 W4 — 프로그램 컨셉(strategicNotes.concept). 있으면 SROI 내러티브 프롬프트에
   * 컨셉 블록을 주입해 메시지를 일관 관통시킨다. 호출자가 안 넘기면 forecastImpact 가
   * Project.strategicNotes 에서 best-effort 로 읽는다. 부재 시 블록 생략(graceful).
   */
  concept?: ConceptShape
}

export interface ForecastOutput {
  /** ImpactForecast row id */
  id: string
  totalSocialValue: number
  beneficiaryCount: number
  itemCount: number
  /** skip 된 항목 (필드 누락 등) */
  skipped: SafeCalculationResult['skipped']
  /** 'auto-conservative' / 'pm-adjusted' / 'pm-locked' */
  calibration: string
}

// ─────────────────────────────────────────
// 3. 메인 함수
// ─────────────────────────────────────────

export async function forecastImpact(
  input: ForecastInput,
): Promise<ForecastOutput> {
  if (!isImpactDbConfigured()) {
    throw new Error(
      'IMPACT_MEASUREMENT_DATABASE_URL 미설정 — 임팩트 엔진 사용 불가. 환경변수를 추가하거나 forecast 호출을 스킵하세요.',
    )
  }

  const country = toImpactCountry(input.country)

  // ADR-031 W4 — 컨셉을 best-effort 로 확보 (호출자가 안 넘기면 strategicNotes 에서).
  const concept = await resolveConcept(input)

  // 1) impact-measurement 데이터 로드 (캐시)
  const [categories, coefficients] = await Promise.all([
    listActiveCategories(),
    listCurrentCoefficients(country),
  ])

  // 2) AI 매핑
  const aiResp = await callAiForecastMapper(input, categories, concept)

  // 3) Conservative factor 적용 + ForecastItemWithMeta 변환
  const conservative = input.conservative ?? true
  const items = aiResp.items.map<ForecastItemWithMeta>((aiItem) => {
    const factor =
      conservative && aiItem.confidence === 'estimated' ? 0.7 : 1
    const cat = categories.find((c) => c.id === aiItem.categoryId)
    return {
      categoryId: aiItem.categoryId,
      itemName: aiItem.itemName,
      count: applyFactor(aiItem.count, factor),
      hours: applyFactor(aiItem.hours, factor),
      participants: applyFactor(aiItem.participants, factor),
      days: applyFactor(aiItem.days, factor),
      months: applyFactor(aiItem.months, factor),
      revenue: applyFactor(aiItem.revenue, factor),
      newEmployees: applyFactor(aiItem.newEmployees, factor),
      investmentAmount: applyFactor(aiItem.investmentAmount, factor),
      bizFund: applyFactor(aiItem.bizFund, factor),
      coachesTrained: applyFactor(aiItem.coachesTrained, factor),
      eventParticipants: applyFactor(aiItem.eventParticipants, factor),
      spaceArea: applyFactor(aiItem.spaceArea, factor),
      spaceDuration: applyFactor(aiItem.spaceDuration, factor),
      confidence: aiItem.confidence,
      rationale:
        factor < 1 ? `${aiItem.rationale} (보수 0.7×)` : aiItem.rationale,
      categoryName: cat?.name,
      impactTypeName: cat?.impactType?.name,
    }
  })

  // 4) 엔진 호출
  const calc = calculateImpactSafe({
    items,
    coefficients,
    categories,
  })

  // 4.5) Wave M post-fix (C-9): Sanity check — 비현실 추정 자동 클램프 + 경고.
  //   * 단일 카테고리 가치 > 예산 5배: 과대 추정 의심 (10× 클램프)
  //   * 총 가치 > 예산 50배: 명백한 비정상 (calibration note 강조)
  const sanityNotes = applySanityClamps(calc, items, input.budget?.totalAmount ?? input.rfp?.totalBudgetVat ?? null)

  // 5) 저장
  const draftHash = hashDraft(input.draft)
  const calibrationNote = composeCalibrationNote(items, calc, aiResp, conservative, sanityNotes)

  const forecast = await prisma.impactForecast.upsert({
    where: { projectId: input.projectId },
    create: {
      projectId: input.projectId,
      country,
      totalSocialValue: calc.totalSocialValue,
      beneficiaryCount: calc.beneficiaryCount,
      breakdownJson: calc.breakdown as unknown as object,
      itemsJson: items as unknown as object,
      calibration: conservative ? 'auto-conservative' : 'auto',
      calibrationNote,
      basedOnDraftHash: draftHash,
    },
    update: {
      country,
      totalSocialValue: calc.totalSocialValue,
      beneficiaryCount: calc.beneficiaryCount,
      breakdownJson: calc.breakdown as unknown as object,
      itemsJson: items as unknown as object,
      calibration: conservative ? 'auto-conservative' : 'auto',
      calibrationNote,
      basedOnDraftHash: draftHash,
    },
    select: { id: true, calibration: true },
  })

  return {
    id: forecast.id,
    totalSocialValue: calc.totalSocialValue,
    beneficiaryCount: calc.beneficiaryCount,
    itemCount: items.length,
    skipped: calc.skipped,
    calibration: forecast.calibration,
  }
}

// ─────────────────────────────────────────
// 4. PM 보정 — 자동 forecast 위에 PM 이 손본 결과 저장
// ─────────────────────────────────────────

export async function updateForecastItems(
  projectId: string,
  items: ForecastItemWithMeta[],
  options: { lock?: boolean } = {},
): Promise<ForecastOutput> {
  if (!isImpactDbConfigured()) {
    throw new Error('IMPACT_MEASUREMENT_DATABASE_URL 미설정')
  }

  const existing = await prisma.impactForecast.findUnique({
    where: { projectId },
  })
  if (!existing) {
    throw new Error('ImpactForecast 가 아직 없음 — forecastImpact 먼저 호출')
  }

  const [categories, coefficients] = await Promise.all([
    listActiveCategories(),
    listCurrentCoefficients(existing.country),
  ])

  const calc = calculateImpactSafe({ items, coefficients, categories })

  const newCalibration = options.lock ? 'pm-locked' : 'pm-adjusted'

  const forecast = await prisma.impactForecast.update({
    where: { projectId },
    data: {
      totalSocialValue: calc.totalSocialValue,
      beneficiaryCount: calc.beneficiaryCount,
      breakdownJson: calc.breakdown as unknown as object,
      itemsJson: items as unknown as object,
      calibration: newCalibration,
    },
    select: { id: true, calibration: true },
  })

  return {
    id: forecast.id,
    totalSocialValue: calc.totalSocialValue,
    beneficiaryCount: calc.beneficiaryCount,
    itemCount: items.length,
    skipped: calc.skipped,
    calibration: forecast.calibration,
  }
}

// ─────────────────────────────────────────
// 5. AI 호출
// ─────────────────────────────────────────

/**
 * ADR-031 W4 — 컨셉 확보: 호출자가 명시하면 그대로, 아니면 Project.strategicNotes 에서 read.
 * 부재/오류 → undefined (graceful, 블록 생략). 읽기 전용 — 스키마 변경 없음.
 */
async function resolveConcept(
  input: ForecastInput,
): Promise<ConceptShape | undefined> {
  if (input.concept) return input.concept
  try {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { strategicNotes: true },
    })
    const notes = project?.strategicNotes as { concept?: ConceptShape } | null
    return notes?.concept ?? undefined
  } catch {
    return undefined
  }
}

async function callAiForecastMapper(
  input: ForecastInput,
  categories: ImpactCategory[],
  concept?: ConceptShape,
): Promise<{ items: AiForecastItem[]; calibrationNote: string | undefined }> {
  const prompt = buildPrompt(input, categories, concept)
  const r = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.LARGE,
    temperature: 0.3, // 보수적
    label: 'impact-forecast',
  })
  const raw = safeParseJson<unknown>(r.raw, 'impact-forecast')
  const validated = AiForecastResponseSchema.safeParse(raw)
  if (!validated.success) {
    console.warn(
      '[forecast] zod 실패:',
      validated.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(' | '),
    )
    return { items: [], calibrationNote: 'AI 응답 형식 오류 — 매핑 실패' }
  }
  // 카테고리 ID 유효성 필터링 (AI 가 잘못된 ID 주는 경우)
  const validIds = new Set(categories.map((c) => c.id))
  const filtered = validated.data.items.filter((it) => {
    if (!validIds.has(it.categoryId)) {
      console.warn(`[forecast] AI 가 잘못된 categoryId 반환: ${it.categoryId}`)
      return false
    }
    return true
  })
  return { items: filtered, calibrationNote: validated.data.calibrationNote }
}

// ─────────────────────────────────────────
// 6. 프롬프트
// ─────────────────────────────────────────

function buildPrompt(
  input: ForecastInput,
  categories: ImpactCategory[],
  concept?: ConceptShape,
): string {
  const categoryList = categories
    .map((c) => {
      const formulaStr = c.formulaVariables.join(' × ')
      const typeName = c.impactType?.name ?? '-'
      return `  - **${c.id}** [${typeName}] "${c.name}" — 필요 변수: ${formulaStr}`
    })
    .join('\n')

  // Wave M C-9 — curriculum 집계 + 상세
  const curriculumStr = buildCurriculumContext(input.curriculum)
  // C-9 — budget 슬라이스
  const budgetStr = buildBudgetContext(
    input.budget,
    input.rfp?.totalBudgetVat ?? null,
  )
  // C-9 — programProfile 핵심 축 추출
  const profileStr = buildProgramProfileContext(input.programProfile)

  const sectionsStr = input.draft.sections
    ? Object.entries(input.draft.sections)
        .filter(([, v]) => v)
        .map(([k, v]) => `### Section ${k}\n${v.slice(0, 600)}`)
        .join('\n\n')
    : ''

  // ADR-031 W4 — 프로그램 컨셉 블록 (있으면 SROI 내러티브가 메시지를 일관 관통).
  const conceptBlock = conceptContextBlock(concept, 'SROI 내러티브·근거(rationale)')

  // 예산 대비 sanity 가이드라인 — AI 가 부풀림 방지 자체 검증
  const totalBudget = input.budget?.totalAmount ?? input.rfp?.totalBudgetVat ?? null
  const sanityHint = totalBudget
    ? `\n**자가 검증** — 합산 추정값이 예산 ${totalBudget.toLocaleString()}원의 50배 (₩${(totalBudget * 50).toLocaleString()}원) 를 넘어가면 calibrationNote 에 "과대 추정 우려" 라고 명시. 정상 SROI 비율은 1:1~1:10 범위.`
    : ''

  return `
당신은 언더독스의 임팩트 분석가입니다. 아래 1차본·RFP·커리큘럼·예산·프로파일을
종합해 **impact-measurement 시스템의 카테고리** 에 정량 매핑해 EducationItem
배열을 만드세요.

**철칙 — 숫자 부풀림 금지**:
  1. RFP·1차본·예산에 명시된 숫자만 사용 → confidence: 'explicit'
  2. RFP+커리큘럼에서 도출 가능 → confidence: 'derived'
  3. AI 추정 → confidence: 'estimated' (시스템이 자동으로 0.7 보정)
  4. 추정에는 반드시 rationale 에 근거 명시 (출처·논리)
  5. 모르면 항목 자체를 안 만드는 게 부풀림 항목 만드는 것보다 낫다
  6. 사업 기간 외 발생 가치 (예: 사후 5년 매출) 는 제외 — 사전 forecast 범위
${sanityHint}

**사용 가능한 카테고리** (각 카테고리의 "필요 변수" 만 채우면 됨):
${categoryList}

**EducationItem 필드 (필요 변수만 채워, 나머진 null)**:
  - count: 제공 횟수 (회)
  - hours: 시간 (시간)
  - participants: 참여자/팀 수 (명 또는 팀)
  - days: 진행일 수 (일)
  - months: 개월 수 (월)
  - revenue: 매출액 (원)
  - newEmployees: 신규 고용 (명)
  - investmentAmount: 투자유치 (원)
  - bizFund: 사업화자금 (원)
  - coachesTrained: 코치 육성 (명)
  - eventParticipants: 행사 참여자 (명)
  - spaceArea: 공간 면적 (평)
  - spaceDuration: 공간 무상기간 (월)

**[전략] 정량 추정 우선순위**:
  1. RFP "목표 참여자수" → participants 의 기본값
  2. 커리큘럼 세션 수 → count 또는 days
  3. 사업 기간 → months
  4. 예산 항목별 단가 × 수량 → 강의·코칭 등 매핑 단서
  5. 위가 모두 없으면 보수적으로 작은 숫자 (예: 1회·20명)

**컨텍스트**:
${conceptBlock ? `\n${conceptBlock}\n` : ''}
[정체성] ${input.draft.intent ?? '(미작성)'}

[Before] ${input.draft.beforeAfter?.before ?? '(미작성)'}
[After] ${input.draft.beforeAfter?.after ?? '(미작성)'}

[핵심 메시지]
${(input.draft.keyMessages ?? []).map((m, i) => `${i + 1}. ${m}`).join('\n') || '(미작성)'}

[RFP 핵심]
  - 목표 참여자수: ${input.rfp?.targetCount ?? '(미상)'}
  - 대상: ${input.rfp?.targetAudience ?? '(미상)'}
  - 사업 기간: ${input.rfp?.projectStartDate ?? '?'} ~ ${input.rfp?.projectEndDate ?? '?'}
  - 교육 기간: ${input.rfp?.eduStartDate ?? '?'} ~ ${input.rfp?.eduEndDate ?? '?'}

[프로그램 프로파일]
${profileStr}

[예산]
${budgetStr}

[커리큘럼]
${curriculumStr}

[1차본 7 섹션 (요약)]
${sectionsStr || '(미작성)'}

**출력 JSON**:
{
  "items": [
    {
      "categoryId": "<위 목록의 ID>",
      "itemName": "이 카테고리 안의 단위 (예: '1차 부트캠프')",
      "count": <필요시 숫자, 아니면 null>,
      "participants": <...>,
      "hours": <...>,
      ... (그 카테고리의 필요 변수만 채우고 나머진 null),
      "confidence": "explicit|derived|estimated",
      "rationale": "RFP §X 명시 / 커리큘럼 12주 × 30명 / 예산 항목 X / 비슷한 사업 평균 등 구체 근거"
    }
  ],
  "calibrationNote": "이 사업에서 어떤 추정을 했는지 1~2줄 메모"
}

JSON 만 출력. 마크다운 펜스 X.
`.trim()
}

// ─────────────────────────────────────────
// 6.5. 컨텍스트 빌더 (C-9 정밀도 향상)
// ─────────────────────────────────────────

function buildCurriculumContext(
  curriculum: ForecastInput['curriculum'],
): string {
  if (!curriculum?.length) {
    return '  (curriculum 미작성 — Deep 진입 전; RFP 와 1차본 기반으로 추정)'
  }
  const totalSessions = curriculum.length
  const totalHours = curriculum.reduce((s, c) => s + (c.hours ?? 0), 0)
  const lecture = curriculum.filter((c) => c.isTheory).length
  const practice = curriculum.filter((c) => !c.isTheory).length
  const actionWeek = curriculum.filter((c) => c.isActionWeek).length
  const coaching1on1 = curriculum.filter((c) => c.isCoaching1on1).length

  const lines: string[] = [
    `  [집계] 세션 ${totalSessions}회 · 총 ${totalHours}시간 (이론 ${lecture} · 실습 ${practice} · Action Week ${actionWeek} · 1:1 코칭 ${coaching1on1})`,
  ]
  // 처음 8 세션만 표시 (토큰 절약)
  const visible = curriculum.slice(0, 8)
  for (let i = 0; i < visible.length; i++) {
    const m = visible[i]
    const tag = m.isCoaching1on1
      ? '코칭'
      : m.isActionWeek
        ? 'AW'
        : m.isTheory
          ? '이론'
          : '실습'
    lines.push(
      `  ${m.sessionNo ?? i + 1}. ${m.moduleName ?? '(이름 없음)'} (${m.hours ?? 0}h · ${tag})`,
    )
  }
  if (curriculum.length > visible.length) {
    lines.push(`  ... 외 ${curriculum.length - visible.length} 세션`)
  }
  return lines.join('\n')
}

function buildBudgetContext(
  budget: ForecastInput['budget'],
  rfpTotalBudget: number | null,
): string {
  const total = budget?.totalAmount ?? rfpTotalBudget
  if (!total) return '  (예산 미상)'
  const lines: string[] = [
    `  총예산: ${total.toLocaleString()}원${rfpTotalBudget && total !== rfpTotalBudget ? ` (VAT ${rfpTotalBudget.toLocaleString()}원)` : ''}`,
  ]
  if (budget?.items?.length) {
    // category 별 집계
    const byCat = new Map<string, number>()
    for (const it of budget.items) {
      const k = it.category ?? '기타'
      byCat.set(k, (byCat.get(k) ?? 0) + (it.amount ?? 0))
    }
    const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    for (const [k, v] of sorted) {
      const pct = total > 0 ? Math.round((v / total) * 100) : 0
      lines.push(`    · ${k}: ${v.toLocaleString()}원 (${pct}%)`)
    }
  }
  return lines.join('\n')
}

function buildProgramProfileContext(profile: unknown): string {
  if (!profile || typeof profile !== 'object') return '  (프로파일 미설정)'
  const p = profile as Record<string, unknown>
  const lines: string[] = []
  const channel = p.channel as { type?: string; isRenewal?: boolean } | undefined
  if (channel?.type) {
    lines.push(
      `  채널: ${channel.type}${channel.isRenewal ? ' (연속사업)' : ''}`,
    )
  }
  if (p.targetStage) lines.push(`  대상 단계: ${String(p.targetStage)}`)
  const seg = p.targetSegment as
    | { businessDomain?: string[]; targetAge?: string[] }
    | undefined
  if (seg?.businessDomain?.length) {
    lines.push(`  도메인: ${seg.businessDomain.join(', ')}`)
  }
  if (seg?.targetAge?.length) {
    lines.push(`  연령: ${seg.targetAge.join(', ')}`)
  }
  const dur = p.programDuration as { weeks?: number; months?: number } | undefined
  if (dur?.weeks || dur?.months) {
    lines.push(
      `  기간: ${dur.months ? dur.months + '개월' : (dur.weeks ?? 0) + '주'}`,
    )
  }
  return lines.length === 0 ? '  (프로파일 비어있음)' : lines.join('\n')
}

// ─────────────────────────────────────────
// 6.6. Sanity check — 비현실 추정 클램프
// ─────────────────────────────────────────

interface SanityNote {
  level: 'warn' | 'clamp'
  message: string
}

function applySanityClamps(
  calc: SafeCalculationResult,
  items: ForecastItemWithMeta[],
  totalBudget: number | null,
): SanityNote[] {
  const notes: SanityNote[] = []
  if (!totalBudget || totalBudget <= 0) return notes

  // 단일 항목이 예산의 10× 초과 → 비현실 (클램프 X, 경고만; calibration 에 surface)
  const itemValues = calc.breakdown.map((b, i) => ({
    idx: i,
    categoryId: b.categoryId,
    value: b.value,
    item: items[i],
  }))
  const outliers = itemValues.filter((x) => x.value > totalBudget * 10)
  for (const o of outliers) {
    notes.push({
      level: 'warn',
      message: `${o.item?.categoryName ?? o.categoryId} ${(o.value / 100_000_000).toFixed(1)}억원 — 예산의 ${(o.value / totalBudget).toFixed(0)}배 (확인 권장)`,
    })
  }

  // 총합이 예산의 50× 초과 → 매우 비정상
  if (calc.totalSocialValue > totalBudget * 50) {
    notes.push({
      level: 'warn',
      message: `총 사회적 가치가 예산의 ${(calc.totalSocialValue / totalBudget).toFixed(0)}배 — 데이터 정합성 또는 추정 점검 필요`,
    })
  }
  return notes
}

// ─────────────────────────────────────────
// 7. 헬퍼
// ─────────────────────────────────────────

function applyFactor(
  v: number | null | undefined,
  factor: number,
): number | null {
  if (v == null) return null
  if (factor === 1) return v
  // participants 같은 정수 필드는 round
  return Math.round(v * factor * 100) / 100
}

function hashDraft(draft: ForecastInput['draft']): string {
  const buf = JSON.stringify({
    intent: draft.intent,
    ba: draft.beforeAfter,
    km: draft.keyMessages,
    secLens: draft.sections
      ? Object.fromEntries(
          Object.entries(draft.sections).map(([k, v]) => [k, (v ?? '').length]),
        )
      : null,
  })
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12)
}

function composeCalibrationNote(
  items: ForecastItemWithMeta[],
  calc: SafeCalculationResult,
  aiResp: { calibrationNote?: string },
  conservative: boolean,
  sanityNotes: SanityNote[] = [],
): string {
  const byConfidence = items.reduce(
    (acc, i) => {
      acc[i.confidence] = (acc[i.confidence] ?? 0) + 1
      return acc
    },
    {} as Record<ForecastConfidence, number>,
  )

  const parts: string[] = []
  parts.push(
    `명시 ${byConfidence.explicit ?? 0} · 도출 ${byConfidence.derived ?? 0} · 추정 ${byConfidence.estimated ?? 0}`,
  )
  if (calc.skipped.length > 0) {
    parts.push(`스킵 ${calc.skipped.length}건 (필드 누락)`)
  }
  if (conservative && (byConfidence.estimated ?? 0) > 0) {
    parts.push('AI 추정 항목 0.7 보수 인수 적용')
  }
  if (aiResp.calibrationNote) {
    parts.push(aiResp.calibrationNote.slice(0, 200))
  }
  // C-9 sanity 경고 surface
  if (sanityNotes.length > 0) {
    parts.push(`⚠ ${sanityNotes.map((n) => n.message).join('; ')}`)
  }
  return parts.join(' · ')
}

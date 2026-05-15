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
    targetCount?: number
  }>
  /** PM 이 명시한 국가 (Project.sroiCountry) */
  country?: string
  /** Conservative 모드 (estimated 항목 0.7 factor) — 기본 true */
  conservative?: boolean
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

  // 1) impact-measurement 데이터 로드 (캐시)
  const [categories, coefficients] = await Promise.all([
    listActiveCategories(),
    listCurrentCoefficients(country),
  ])

  // 2) AI 매핑
  const aiResp = await callAiForecastMapper(input, categories)

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

  // 5) 저장
  const draftHash = hashDraft(input.draft)
  const calibrationNote = composeCalibrationNote(items, calc, aiResp, conservative)

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

async function callAiForecastMapper(
  input: ForecastInput,
  categories: ImpactCategory[],
): Promise<{ items: AiForecastItem[]; calibrationNote: string | undefined }> {
  const prompt = buildPrompt(input, categories)
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

function buildPrompt(input: ForecastInput, categories: ImpactCategory[]): string {
  const categoryList = categories
    .map((c) => {
      const formulaStr = c.formulaVariables.join(' × ')
      const typeName = c.impactType?.name ?? '-'
      return `  - **${c.id}** [${typeName}] "${c.name}" — 필요 변수: ${formulaStr}`
    })
    .join('\n')

  const curriculumStr = input.curriculum?.length
    ? input.curriculum
        .map(
          (m, i) =>
            `  ${i + 1}. ${m.moduleName ?? '(이름 없음)'} (${m.hours ?? 0}h, ${
              m.isTheory ? '이론' : '실습'
            })`,
        )
        .join('\n')
    : '  (curriculum 미작성 — Deep 진입 전)'

  const sectionsStr = input.draft.sections
    ? Object.entries(input.draft.sections)
        .filter(([, v]) => v)
        .map(([k, v]) => `### Section ${k}\n${v.slice(0, 600)}`)
        .join('\n\n')
    : ''

  return `
당신은 언더독스의 임팩트 분석가입니다. 아래 1차본·RFP·커리큘럼을 보고
**impact-measurement 시스템의 카테고리** 에 정량 매핑해 EducationItem 배열을
만드세요.

**철칙 — 숫자 부풀림 금지**:
  1. RFP·1차본에 명시된 숫자만 사용 → confidence: 'explicit'
  2. RFP+커리큘럼에서 도출 가능 → confidence: 'derived'
  3. AI 추정 → confidence: 'estimated' (시스템이 자동으로 0.7 보정)
  4. 추정에는 반드시 rationale 에 근거 명시 (출처·논리)
  5. 모르면 항목 자체를 안 만드는 게 부풀림 항목 만드는 것보다 낫다

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

**컨텍스트**:

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
  - 총예산(VAT): ${input.rfp?.totalBudgetVat?.toLocaleString() ?? '?'}원

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
      "rationale": "RFP §X 명시 / 커리큘럼 12주 × 30명 / 비슷한 사업 평균 등 근거"
    }
  ],
  "calibrationNote": "이 사업에서 어떤 추정을 했는지 1~2줄 메모"
}

JSON 만 출력. 마크다운 펜스 X.
`.trim()
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
  return parts.join(' · ')
}

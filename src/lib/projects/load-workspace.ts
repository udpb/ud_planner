/**
 * loadWorkspace — 정본 3단계 워크스페이스 서버로드 조립 (ADR-029, BR-WS-1)
 *
 * `/projects/[id]` 워크스페이스가 필요로 하는 3단계 데이터를 한 번에 조립한다.
 * 각 단계의 로드 로직은 **기존 route 의 server load 를 그대로 끌어다 씀** — 엔진
 * 재구현 0. 기존 route page 들은 export 하는 로더 함수가 없어(전부 default page
 * 컴포넌트 내부 inline 쿼리) 동일 쿼리를 복제하되, 출처를 명시한다:
 *
 *   ① RFP    — 현 page.tsx 의 getProject(필요분) + matchAssetsToRfp (자산 자동매칭)
 *   ② 설계   — program-design/page.tsx 의 toRfpPreview · loadDesignRules
 *              · buildOperatingTypeMeta · matchAssetsToRfp
 *   ③ 임팩트 — impact-forecast/page.tsx 의 impactForecast + isImpactDbConfigured
 *              · listActiveCategories · isHandoffConfigured
 *
 * 서버 컴포넌트(page.tsx)가 이 한 함수만 호출 → ProgramWorkspace 에 전달.
 */

import { prisma } from '@/lib/prisma'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'
import {
  fromStrategicNotes,
  type PlanningIntentDraft,
} from '@/lib/program-design/planning-intent'
import { matchAssetsToRfp, type AssetMatch } from '@/lib/asset-registry'
import { loadDesignRules } from '@/lib/program-design/design-rule'
import { readSavedPlan } from '@/lib/program-design/saved-plan'
import type { ProgramPlan } from '@/lib/program-design/plan-types'
import { loadBudgetRules } from '@/lib/program-design/budget-rules-loader'
import type { BudgetRules } from '@/lib/program-design/budget-calc'
import {
  buildOperatingTypeMeta,
  type OperatingTypeMeta,
} from '@/app/(dashboard)/projects/[id]/program-design/_components/operating-type-meta'
import type { RfpPreview } from '@/app/(dashboard)/projects/[id]/program-design/_components/program-design-flow'
import { isImpactDbConfigured, listActiveCategories } from '@/lib/impact/db'
import { isHandoffConfigured } from '@/lib/impact/handoff'
import type { ForecastItemWithMeta, BreakdownEntry } from '@/lib/impact/types'

// ─────────────────────────────────────────────────────────────────
// 조립 결과 타입
// ─────────────────────────────────────────────────────────────────

export interface WorkspaceImpactCategory {
  id: string
  name: string
  impactType: string
  formulaVariables: string[]
}

export interface WorkspaceForecastSummary {
  id: string
  country: string
  totalSocialValue: number
  beneficiaryCount: number
  calibration: string
  calibrationNote: string | null
  generatedAt: string
  items: ForecastItemWithMeta[]
  breakdown: BreakdownEntry[]
}

export interface WorkspaceData {
  project: {
    id: string
    name: string
    client: string
    status: string
    projectType: string
    totalBudgetVat: number | null
    supplyPrice: number | null
    projectStartDate: Date | null
    projectEndDate: Date | null
    eduStartDate: Date | null
    eduEndDate: Date | null
    isBidWon: boolean | null
    techEvalScore: number | null
    bidNotes: string | null
    updatedAt: Date
  }

  // ── ① RFP ──
  rfpParsed: RfpParsed | null
  programProfile: ProgramProfile | null
  renewalContext: unknown
  proposalBackground: string | null
  proposalConcept: string | null
  keyPlanningPoints: string[] | null
  assetMatches: AssetMatch[]
  acceptedAssetIds: string[]

  // ── ② 기획의도 (BR-WS-3) ──
  /** strategicNotes → 시드한 4카드 초안 (없으면 빈 초안). */
  planningIntentDraft: PlanningIntentDraft
  /** 저장된 기획의도가 이미 있는지 — false 면 컴포넌트가 자동 초안 1회. */
  hasSavedIntent: boolean

  // ── ② 설계 ──
  rfpPreview: RfpPreview | null
  operatingTypeMeta: OperatingTypeMeta[]
  /** BR-WS-4: 저장된 1차안(파일) — 있으면 재진입 시 복원(결함2). 없으면 null. */
  savedPlan: ProgramPlan | null

  // ── ③ 임팩트 ──
  sroiCountry: string
  impactConfigured: boolean
  impactHandoffConfigured: boolean
  impactCategories: WorkspaceImpactCategory[]
  impactForecast: WorkspaceForecastSummary | null

  // ── BR-WS-15: 단계 간 라이브 연동 ──
  /** 2026 단가표(budget-rules.json) — client live calcBudget 용. 로드 실패 시 null. */
  budgetRules: BudgetRules | null

  // ── done 판정용 파생 ──
  hasRfp: boolean
  hasDesign: boolean
  /** 코치 배정 1명 이상 (coachAssignments count>0). */
  hasCoach: boolean
  /** 예산 산정됨 — Budget 레코드 존재 기준(자동 적산 산출물 = 명확한 단일 신호). */
  hasBudget: boolean
  hasImpact: boolean
}

/** RfpParsed → program-design 토대잡기 미리채움 (program-design/page.tsx 의 toRfpPreview 복제). */
function toRfpPreview(rfp: RfpParsed | null): RfpPreview | null {
  if (!rfp) return null
  return {
    projectName: rfp.projectName ?? null,
    client: rfp.client ?? null,
    targetAudience: rfp.targetAudience ?? null,
    targetCount: rfp.targetCount ?? null,
    eduStartDate: rfp.eduStartDate ?? null,
    eduEndDate: rfp.eduEndDate ?? null,
    totalBudgetVat: rfp.totalBudgetVat ?? null,
    objectives: Array.isArray(rfp.objectives) ? rfp.objectives : [],
  }
}

/**
 * 3단계 워크스페이스 서버 데이터 조립.
 *
 * 부분 실패(자산 매칭·design-rules·impact DB) 는 삼킨다(catch) — 워크스페이스는 떠야 함.
 * project 가 없으면 null 반환 → page.tsx 가 notFound().
 */
export async function loadWorkspace(
  projectId: string,
): Promise<WorkspaceData | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      client: true,
      status: true,
      projectType: true,
      totalBudgetVat: true,
      supplyPrice: true,
      projectStartDate: true,
      projectEndDate: true,
      eduStartDate: true,
      eduEndDate: true,
      isBidWon: true,
      techEvalScore: true,
      bidNotes: true,
      updatedAt: true,
      // ① RFP
      rfpParsed: true,
      programProfile: true,
      renewalContext: true,
      proposalBackground: true,
      proposalConcept: true,
      keyPlanningPoints: true,
      acceptedAssetIds: true,
      // ② 기획의도 (BR-WS-3)
      strategicNotes: true,
      // ③ 임팩트
      sroiCountry: true,
      impactForecast: true,
      // done 신호(BR-WS-7) — 가벼운 조회만: 코치 배정 수 + 예산 레코드 존재.
      _count: { select: { coachAssignments: true } },
      budget: { select: { id: true } },
    },
  })
  if (!project) return null

  const rfpParsed = (project.rfpParsed as unknown as RfpParsed | null) ?? null
  const programProfile =
    (project.programProfile as unknown as ProgramProfile | null) ?? null

  // 자산 자동매칭 — RFP 있을 때만 (현 page.tsx · program-design/page.tsx 동일 패턴)
  const assetMatches: AssetMatch[] = rfpParsed
    ? await matchAssetsToRfp({
        rfp: rfpParsed,
        profile: programProfile ?? undefined,
      }).catch(() => [])
    : []
  const acceptedAssetIds: string[] = Array.isArray(project.acceptedAssetIds)
    ? (project.acceptedAssetIds as string[]).filter((v) => typeof v === 'string')
    : []
  const keyPlanningPoints: string[] | null = Array.isArray(
    project.keyPlanningPoints,
  )
    ? (project.keyPlanningPoints as string[])
    : null

  // ② 기획의도 — strategicNotes 시드 (BR-WS-3). 4카드 매핑 필드가 하나라도 있으면 저장됨으로 판정.
  const strategicNotes =
    (project.strategicNotes as unknown as StrategicNotes | null) ?? null
  const planningIntentDraft = fromStrategicNotes(strategicNotes)
  const hasSavedIntent = !!(
    strategicNotes &&
    (strategicNotes.clientHiddenWants ||
      strategicNotes.pastSimilarProjects ||
      strategicNotes.competitorWeakness ||
      strategicNotes.winStrategy ||
      strategicNotes.mustNotFail ||
      (Array.isArray(strategicNotes.riskFactors) && strategicNotes.riskFactors.length))
  )

  // ② 설계 — 운영 유형 메타 (design-rules.json B 프로파일). 실패해도 빈 메타로 진행.
  const rfpPreview = toRfpPreview(rfpParsed)
  let operatingTypeMeta: OperatingTypeMeta[] = []
  try {
    const ruleSet = await loadDesignRules()
    operatingTypeMeta = buildOperatingTypeMeta(ruleSet.rules)
  } catch {
    operatingTypeMeta = []
  }

  // ② 설계 — 저장된 1차안 복원 (BR-WS-4 결함2). 파일 없거나 깨졌으면 null(헬퍼가 graceful).
  const savedPlan = await readSavedPlan(projectId).catch(() => null)

  // BR-WS-15 — 단가표(budget-rules.json) server 로드. 실패해도 워크스페이스는 떠야 함(null).
  const budgetRules = await loadBudgetRules().catch(() => null)

  // ③ 임팩트 — impact-forecast/page.tsx 의 로드 패턴 복제
  const impactConfigured = isImpactDbConfigured()
  const impactHandoffConfigured = isHandoffConfigured()
  let impactCategories: WorkspaceImpactCategory[] = []
  if (impactConfigured) {
    try {
      const cats = await listActiveCategories()
      impactCategories = cats.map((c) => ({
        id: c.id,
        name: c.name,
        impactType: c.impactType?.name ?? '',
        formulaVariables: c.formulaVariables,
      }))
    } catch (err) {
      console.warn('[loadWorkspace] 임팩트 카테고리 로드 실패:', err)
    }
  }

  const forecast = project.impactForecast
  const impactForecast: WorkspaceForecastSummary | null = forecast
    ? {
        id: forecast.id,
        country: forecast.country,
        totalSocialValue: Number(forecast.totalSocialValue),
        beneficiaryCount: forecast.beneficiaryCount,
        calibration: forecast.calibration,
        calibrationNote: forecast.calibrationNote,
        generatedAt: forecast.generatedAt.toISOString(),
        items:
          (forecast.itemsJson as unknown as ForecastItemWithMeta[]) ?? [],
        breakdown:
          (forecast.breakdownJson as unknown as BreakdownEntry[]) ?? [],
      }
    : null

  const hasRfp = !!rfpParsed
  // 설계 진행 신호: programProfile 확정 또는 acceptedAssetIds 채움 또는 저장된 1차안 존재(BR-WS-4).
  const hasDesign = !!programProfile || acceptedAssetIds.length > 0 || !!savedPlan
  // 코치 배정 1명 이상 / 예산 레코드 존재(BR-WS-7).
  const hasCoach = (project._count?.coachAssignments ?? 0) > 0
  const hasBudget = !!project.budget
  const hasImpact = !!impactForecast

  return {
    project: {
      id: project.id,
      name: project.name,
      client: project.client,
      status: project.status,
      projectType: project.projectType,
      totalBudgetVat: project.totalBudgetVat,
      supplyPrice: project.supplyPrice,
      projectStartDate: project.projectStartDate,
      projectEndDate: project.projectEndDate,
      eduStartDate: project.eduStartDate,
      eduEndDate: project.eduEndDate,
      isBidWon: project.isBidWon,
      techEvalScore: project.techEvalScore,
      bidNotes: project.bidNotes,
      updatedAt: project.updatedAt,
    },
    rfpParsed,
    programProfile,
    renewalContext: project.renewalContext ?? null,
    proposalBackground: project.proposalBackground,
    proposalConcept: project.proposalConcept,
    keyPlanningPoints,
    assetMatches,
    acceptedAssetIds,
    planningIntentDraft,
    hasSavedIntent,
    rfpPreview,
    operatingTypeMeta,
    savedPlan,
    sroiCountry: project.sroiCountry,
    impactConfigured,
    impactHandoffConfigured,
    impactCategories,
    impactForecast,
    budgetRules,
    hasRfp,
    hasDesign,
    hasCoach,
    hasBudget,
    hasImpact,
  }
}

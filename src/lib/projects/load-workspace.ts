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
import type { ConceptShape } from '@/lib/program-design/concept-synth'
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
import type { CoachTeamMember } from '@/app/api/projects/[id]/coach-assignments/route'

export type { CoachTeamMember }

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

/**
 * BR-WS-20: 복원용 워크스페이스 대화 메시지(WorkspaceChat 의 ChatMessage 과 동일 형태).
 * 저장처는 미사용 `Project.expressTurnsCache`(Json?) 재사용 — 스키마 변경 0.
 * choices/choicePicked 는 보존하되 형태 검증은 클라이언트 렌더 가드에 맡긴다(여기선 보존만).
 */
export interface WorkspaceChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  choices?: unknown
  choicePicked?: boolean
}

/**
 * expressTurnsCache(Json?) → 복원 가능한 메시지 배열로 가드.
 * 배열 + 각 항목 {id,role,text} 형태가 맞는 것만 통과. 불량이면 빈 배열(throw 금지 —
 * 워크스페이스는 항상 떠야 함). 통과분이 0개면 null 반환(복원 없음 → welcome 시드).
 */
function guardChatMessages(raw: unknown): WorkspaceChatMessage[] | null {
  if (!Array.isArray(raw)) return null
  const out: WorkspaceChatMessage[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const m = item as Record<string, unknown>
    if (typeof m.id !== 'string') continue
    if (m.role !== 'user' && m.role !== 'assistant') continue
    if (typeof m.text !== 'string') continue
    const msg: WorkspaceChatMessage = { id: m.id, role: m.role, text: m.text }
    if (m.choices !== undefined) msg.choices = m.choices
    if (typeof m.choicePicked === 'boolean') msg.choicePicked = m.choicePicked
    out.push(msg)
  }
  return out.length > 0 ? out : null
}

/**
 * ADR-031 W2: strategicNotes.concept 읽기 가드. winTheme(문자열) + keyMessages(배열)이
 * 있는 객체만 ConceptShape 로 통과(불량·구버전 무시 → null). throw X(워크스페이스는 떠야 함).
 * grounding/derivationPath 는 누락 시 빈 배열로 보정(렌더 안전).
 */
function guardConcept(raw: unknown): ConceptShape | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const c = raw as Record<string, unknown>
  if (typeof c.winTheme !== 'string' || !c.winTheme.trim()) return null
  const keyMessages = Array.isArray(c.keyMessages)
    ? (c.keyMessages as unknown[]).filter(
        (m): m is string => typeof m === 'string' && !!m.trim(),
      )
    : []
  const grounding = Array.isArray(c.grounding)
    ? (c.grounding as unknown[]).filter(
        (g): g is ConceptShape['grounding'][number] =>
          !!g &&
          typeof g === 'object' &&
          typeof (g as { kind?: unknown }).kind === 'string' &&
          typeof (g as { label?: unknown }).label === 'string',
      )
    : []
  const derivationPath = Array.isArray(c.derivationPath)
    ? (c.derivationPath as unknown[]).filter(
        (s): s is string => typeof s === 'string' && !!s.trim(),
      )
    : []
  return {
    winTheme: c.winTheme,
    keyMessages,
    differentiation:
      typeof c.differentiation === 'string' ? c.differentiation : '',
    grounding,
    derivationPath,
    ...(typeof c.chosenAngle === 'string' && c.chosenAngle.trim()
      ? { chosenAngle: c.chosenAngle }
      : {}),
  }
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

  /**
   * ADR-031 W2: 저장된 프로그램 기획 컨셉(strategicNotes.concept). 없으면 null →
   * design 단계가 컨셉 대화부터 시작. 읽기 가드(winTheme 문자열 + keyMessages 배열만 통과).
   */
  savedConcept: ConceptShape | null

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

  // ── BR-WS-20: 대화 영속 복원 ──
  /** expressTurnsCache 가드 통과분 — 없거나 불량이면 null(WorkspaceChat 이 welcome 시드). */
  workspaceChatMessages: WorkspaceChatMessage[] | null

  // ── BR-WS-23: 코치 선발팀 (CoachAssignment 로스터) ──
  /**
   * 이 프로젝트의 CoachAssignment rows(coach 메타 포함) — SSR 초기 hydrate.
   * SelectedTeamPanel 이 초기값으로 받고, 배정/제거 후 GET 으로 재fetch 한다.
   * 비었으면 빈 배열(패널이 "아직 선발된 코치 없음" 안내).
   */
  coachTeam: CoachTeamMember[]

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
      // BR-WS-20: 워크스페이스 대화 영속 복원(미사용 Json 필드 재사용)
      expressTurnsCache: true,
      // ③ 임팩트
      sroiCountry: true,
      impactForecast: true,
      // BR-WS-23: 코치 선발팀 로스터(coach 메타 포함). hasCoach 도 이 길이로 파생
      //   (별도 _count 불필요 — 로스터를 이미 로드). GET route 의 정제 형태와 동일.
      coachAssignments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          coachId: true,
          role: true,
          sessions: true,
          agreedRate: true,
          totalFee: true,
          netFee: true,
          confirmed: true,
          coach: {
            select: {
              id: true,
              name: true,
              tier: true,
              expertise: true,
              regions: true,
              coachRateMain: true,
              lectureRateMain: true,
            },
          },
        },
      },
      // done 신호(BR-WS-7) — 예산 레코드 존재.
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
  // ADR-031 W2: 저장된 컨셉(strategicNotes.concept) 읽기 가드. 없으면 null → 컨셉 단계부터.
  const savedConcept = guardConcept(strategicNotes?.concept)

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

  // BR-WS-20: 대화 복원 — 미사용 expressTurnsCache(Json?) 가드(불량 시 null, throw X).
  const workspaceChatMessages = guardChatMessages(project.expressTurnsCache)

  // BR-WS-23: 코치 선발팀 로스터 정제(GET route 와 동일 형태). 비면 빈 배열.
  const coachTeam: CoachTeamMember[] = (project.coachAssignments ?? []).map(
    (r) => ({
      assignmentId: r.id,
      coachId: r.coachId,
      role: r.role,
      sessions: r.sessions,
      agreedRate: r.agreedRate,
      totalFee: r.totalFee,
      netFee: r.netFee,
      confirmed: r.confirmed,
      coach: {
        id: r.coach.id,
        name: r.coach.name,
        tier: r.coach.tier,
        expertise: r.coach.expertise,
        regions: r.coach.regions,
        coachRateMain: r.coach.coachRateMain,
        lectureRateMain: r.coach.lectureRateMain,
      },
    }),
  )

  const hasRfp = !!rfpParsed
  // 설계 진행 신호: programProfile 확정 또는 acceptedAssetIds 채움 또는 저장된 1차안 존재(BR-WS-4).
  const hasDesign = !!programProfile || acceptedAssetIds.length > 0 || !!savedPlan
  // 코치 배정 1명 이상 / 예산 레코드 존재(BR-WS-7). 로스터 길이로 파생(_count 대체).
  const hasCoach = coachTeam.length > 0
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
    savedConcept,
    rfpPreview,
    operatingTypeMeta,
    savedPlan,
    sroiCountry: project.sroiCountry,
    impactConfigured,
    impactHandoffConfigured,
    impactCategories,
    impactForecast,
    budgetRules,
    workspaceChatMessages,
    coachTeam,
    hasRfp,
    hasDesign,
    hasCoach,
    hasBudget,
    hasImpact,
  }
}

/**
 * /projects/[id] — 단일 정본 워크스페이스 (ADR-029, BR-WS-1)
 *
 * 3단계 진입점 1개. 패러다임 플래그 없음 — 이게 제품이다.
 *   ① RFP 분석   = StageS1 (StepRfp)
 *   ② 프로그램 설계 = ProgramDesignFlow (P2 설계 캔버스) ⭐ spine
 *   ③ 임팩트     = ImpactForecastClient (P1 볼트인)
 *
 * 옛 분기(Deep `?step=` 6스텝 · v3 StageShell 5단계 · isExpressParadigmV3 ·
 * PipelineNav)는 ADR-029 가 대체 — 제거. 서버로드는 loadWorkspace 한 함수로 조립.
 * 엔진·각 단계 컴포넌트 재구현 0 — 조립/임베드만.
 */

import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ProjectEditForm } from './project-edit-form'
import type { RenewalContext } from '@/lib/program-profile'
import { loadWorkspace } from '@/lib/projects/load-workspace'
import { ProgramWorkspace } from '@/components/projects/workspace/ProgramWorkspace'
import type { DesignIntentContext } from './program-design/_components/program-design-flow'
import type { PlanningIntentDraft } from '@/lib/program-design/planning-intent'
import type { PlanSession } from '@/lib/program-design/plan-types'
import type { BudgetChannel } from '@/lib/program-design/budget-calc'
import {
  computeWorkspaceCurrentStage,
  computeWorkspaceDoneFlags,
  mapQueryToWorkspaceStage,
  workspaceStageSummary,
  WORKSPACE_STAGE_IDS,
  type WorkspaceStageId,
} from '@/components/projects/workspace/workspace-stages'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '기획중', PROPOSAL: '제안서', SUBMITTED: '제출완료',
  IN_PROGRESS: '운영중', COMPLETED: '완료', LOST: '미수주',
}
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  PROPOSAL: 'bg-blue-100 text-blue-800 border-blue-200',
  SUBMITTED: 'bg-violet-100 text-violet-800 border-violet-200',
  IN_PROGRESS: 'bg-green-100 text-green-800 border-green-200',
  COMPLETED: 'bg-gray-100 text-gray-700 border-gray-200',
  LOST: 'bg-red-100 text-red-700 border-red-200',
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await prisma.project.findUnique({ where: { id }, select: { name: true } })
  return { title: project?.name ?? '프로젝트' }
}

/**
 * BR-WS-4 Task4 — ②기획의도(PlanningIntentDraft) → 설계 캔버스 맥락(맥락 띠 + 토대잡기 prefill).
 *   - bands : 값이 있는 카드만 읽기 전용 요약 (목표해석·작년대비·차별점·전략).
 *   - precedentPrefill : 작년 대비(yearOverYear) → 선례 textarea (선례 = 작년 운영 맥락).
 *   - intentPrefill : 전략(winStrategy) ?? 목표해석(goalInterpretation) → 담당자 의도 textarea.
 * 빈 강요 X — 값 없으면 빈 문자열/빈 배열 (PM 이 직접 채울 수 있음).
 */
function buildDesignIntentContext(
  draft: PlanningIntentDraft,
): DesignIntentContext {
  const bandDefs: { label: string; value: string }[] = [
    { label: '목표 해석', value: draft.goalInterpretation.value.trim() },
    { label: '작년 대비', value: draft.yearOverYear.value.trim() },
    { label: '차별점', value: draft.differentiation.value.trim() },
    { label: '메인 전략', value: draft.winStrategy.value.trim() },
  ]
  return {
    bands: bandDefs.filter((b) => b.value),
    precedentPrefill: draft.yearOverYear.value.trim(),
    intentPrefill:
      draft.winStrategy.value.trim() || draft.goalInterpretation.value.trim(),
  }
}

/**
 * BR-WS-15 — 예산 적산 입력 파생(server). budget-calc/route.ts 와 동일 규칙
 * (eduStartDate~eduEndDate → 개월 / projectType → 채널) — 라이브 연동에 동일한
 * 입력을 client Live Plan 으로 흘려보내기 위해 동일 헬퍼를 둔다(route 무변경).
 */
function durationMonths(start: Date | null, end: Date | null): number {
  if (!start || !end) return 0
  const ms = end.getTime() - start.getTime()
  if (ms <= 0) return 0
  const months = ms / (1000 * 60 * 60 * 24 * (365.25 / 12))
  return Math.max(0, Math.round(months))
}

/** projectType → 적산 채널. B2B 명시 외 전부 B2G(보수적 기본) — route 와 동일. */
function toBudgetChannel(projectType: string | null | undefined): BudgetChannel {
  return projectType?.toUpperCase().includes('B2B') ? 'B2B' : 'B2G'
}

export default async function ProjectWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ stage?: string; step?: string }>
}) {
  const { id } = await params
  const { stage, step } = await searchParams

  const data = await loadWorkspace(id)
  if (!data) notFound()

  const { project } = data

  // BR-WS-5/7: 5단계 stage 판정. coach/budget 진행 신호는 load-workspace 가
  // 서버에서 판정(코치 배정 수>0 / Budget 레코드 존재) — 스텝퍼 체크·자동 current 반영.
  const stageInput = {
    hasRfp: data.hasRfp,
    hasDesign: data.hasDesign,
    hasCoach: data.hasCoach,
    hasBudget: data.hasBudget,
    hasImpact: data.hasImpact,
  }
  const currentStage = computeWorkspaceCurrentStage(stageInput)
  const doneFlags = computeWorkspaceDoneFlags(stageInput)
  const initialOverrideStage = mapQueryToWorkspaceStage(stage ?? step)

  // 5 stage 1줄 요약 (server 판정)
  const socialValueEok = data.impactForecast
    ? data.impactForecast.totalSocialValue / 100_000_000
    : undefined
  const summaries = WORKSPACE_STAGE_IDS.reduce(
    (acc, sid) => {
      acc[sid] = workspaceStageSummary(sid, {
        rfpParsed: data.rfpParsed,
        hasDesign: data.hasDesign,
        hasCoach: data.hasCoach,
        hasBudget: data.hasBudget,
        socialValueEok,
      })
      return acc
    },
    {} as Record<WorkspaceStageId, string>,
  )

  // BR-WS-15 — 단계 간 라이브 연동 초기값 조립(server). 저장된 1차안 회차표 →
  // Live Plan 초기 sessions, RFP·예산·채널·기간·단가표 → coachCount/예산 파생 토대.
  const initialSessions: PlanSession[] | null =
    data.savedPlan && data.savedPlan.structure.kind === 'sessions'
      ? data.savedPlan.structure.sessions
      : null
  const planContext = {
    initialSessions,
    rfp: data.rfpParsed,
    totalBudget: project.totalBudgetVat ?? 0,
    channel: toBudgetChannel(project.projectType),
    durationMonths: durationMonths(project.eduStartDate, project.eduEndDate),
    budgetRules: data.budgetRules,
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-h-0">
      <Header title={project.name} />

      {/* 메타 strip (풀높이 셸에서 상단 고정 행) */}
      <div className="shrink-0 border-b bg-background">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-6 py-2.5">
          <span
            className={cn(
              'border px-2.5 py-0.5 text-xs font-medium',
              STATUS_COLOR[project.status],
            )}
          >
            {STATUS_LABEL[project.status]}
          </span>
          <Badge variant="outline" className="text-xs">{project.projectType}</Badge>
          <span className="text-sm text-muted-foreground">{project.client}</span>

          <div className="ml-auto flex items-center gap-5">
            <div className="text-sm">
              <span className="text-muted-foreground">총 예산 </span>
              <span className="font-semibold">
                {project.totalBudgetVat ? `${(project.totalBudgetVat / 1e8).toFixed(2)}억` : '—'}
              </span>
            </div>
            <ProjectEditForm
              project={{
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
              }}
            />
          </div>
        </div>
      </div>

      <ProgramWorkspace
        projectId={project.id}
        currentStage={currentStage}
        initialOverrideStage={initialOverrideStage}
        doneFlags={doneFlags}
        summaries={summaries}
        stepRfpProps={{
          projectId: project.id,
          initialParsed: data.rfpParsed,
          initialRfpSlice: {
            proposalBackground: data.proposalBackground,
            proposalConcept: data.proposalConcept,
            keyPlanningPoints: data.keyPlanningPoints,
            confirmedAt:
              data.proposalBackground || data.proposalConcept
                ? project.updatedAt.toISOString()
                : null,
          },
          initialProfile: data.programProfile,
          initialRenewalContext: (data.renewalContext as RenewalContext | null) ?? null,
          assetMatches: data.assetMatches,
          initialAcceptedAssetIds: data.acceptedAssetIds,
        }}
        designProps={
          data.rfpPreview
            ? {
                projectId: project.id,
                rfpPreview: data.rfpPreview,
                operatingTypeMeta: data.operatingTypeMeta,
                assetMatches: data.assetMatches,
                initialAcceptedAssetIds: data.acceptedAssetIds,
                // BR-WS-4: 저장된 1차안 복원(결함2) + ②기획의도 소비(중복 제거)
                initialPlan: data.savedPlan,
                intentContext: buildDesignIntentContext(data.planningIntentDraft),
              }
            : null
        }
        intentProps={{
          initialDraft: data.planningIntentDraft,
          hasSavedIntent: data.hasSavedIntent,
          hasRfp: data.hasRfp,
        }}
        impactProps={{
          projectId: project.id,
          country: data.sroiCountry,
          totalBudgetVat: project.totalBudgetVat,
          initialForecast: data.impactForecast,
          categories: data.impactCategories,
          configured: data.impactConfigured,
          handoffConfigured: data.impactHandoffConfigured,
        }}
        planContext={planContext}
      />
    </div>
  )
}

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

  const currentStage = computeWorkspaceCurrentStage(data)
  const doneFlags = computeWorkspaceDoneFlags(data)
  const initialOverrideStage = mapQueryToWorkspaceStage(stage ?? step)

  // 3 stage 1줄 요약 (server 판정)
  const socialValueEok = data.impactForecast
    ? data.impactForecast.totalSocialValue / 100_000_000
    : undefined
  const summaries = WORKSPACE_STAGE_IDS.reduce(
    (acc, sid) => {
      acc[sid] = workspaceStageSummary(sid, {
        rfpParsed: data.rfpParsed,
        hasDesign: data.hasDesign,
        socialValueEok,
      })
      return acc
    },
    {} as Record<WorkspaceStageId, string>,
  )

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title={project.name} />

      {/* Sticky 메타 strip */}
      <div className="sticky top-0 z-20 border-b bg-background">
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
      />
    </div>
  )
}

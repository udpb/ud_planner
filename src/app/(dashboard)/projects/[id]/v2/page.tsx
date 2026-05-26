/**
 * /projects/[id]/v2 — UX v2 (ADR-018) 테스트 route
 *
 * 새 Adaptive Stage Layout 검증용. 기존 /projects/[id] 무영향.
 *
 * PR #2 — S1 Hero center 만 wire up. S2~S5 는 후속 PR.
 */

import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import { V2Shell } from './v2-shell'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await prisma.project.findUnique({
    where: { id },
    select: { name: true },
  })
  return { title: `v2 — ${project?.name ?? '프로젝트'}` }
}

/** RFP 분석 결과 추출 (RfpParsed → S1 view-model) */
function extractAnalysis(project: {
  name: string
  client: string | null
  totalBudgetVat: number | null
  rfpParsed: unknown
  logicModel: unknown
  programProfile: unknown
}) {
  const parsed = project.rfpParsed as RfpParsed | null
  if (!parsed) return null
  return {
    projectName: project.name,
    client: project.client,
    totalBudget: project.totalBudgetVat,
    evalCriteria: (parsed.evalCriteria ?? []).map((e) => ({
      item: e.item,
      score: e.score,
    })),
    keywords: parsed.keywords ?? [],
    hasLogicModel: !!project.logicModel,
    // matched asset count 는 client side fetch (heavy)
    matchedAssetCount: 0,
  }
}

export default async function ProjectV2Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      client: true,
      projectType: true,
      totalBudgetVat: true,
      rfpParsed: true,
      logicModel: true,
      programProfile: true,
      curriculum: { select: { id: true } },
      coachAssignments: { select: { id: true } },
      budget: { select: { id: true } },
      proposalSections: { select: { id: true } },
      status: true,
    },
  })

  if (!project) notFound()

  const analysis = extractAnalysis(project)

  // Stage 진행도 계산 (단순 휴리스틱)
  const hasRfp = !!project.rfpParsed
  const hasDraft = project.proposalSections.length >= 3
  const isReviewed = false // S3 — 향후 inspector pass 여부
  const hasPrecise =
    project.curriculum.length > 0 ||
    project.coachAssignments.length > 0 ||
    !!project.budget
  const isApproved = project.status === 'SUBMITTED'

  const stages = [
    { id: 'S1' as const, status: hasRfp ? ('done' as const) : ('active' as const) },
    {
      id: 'S2' as const,
      status: !hasRfp
        ? ('pending' as const)
        : hasDraft
          ? ('done' as const)
          : ('active' as const),
    },
    {
      id: 'S3' as const,
      status: !hasDraft
        ? ('pending' as const)
        : isReviewed
          ? ('done' as const)
          : ('active' as const),
    },
    {
      id: 'S4' as const,
      status: !isReviewed
        ? ('pending' as const)
        : hasPrecise
          ? ('done' as const)
          : ('active' as const),
    },
    {
      id: 'S5' as const,
      status: !hasPrecise
        ? ('pending' as const)
        : isApproved
          ? ('done' as const)
          : ('active' as const),
    },
  ]
  const currentStage = stages.find((s) => s.status === 'active')?.id ?? 'S1'

  // 진행도 % (Stage 가중치 — S1=20, S2=30, S3=15, S4=25, S5=10)
  const stageProgress: Record<typeof currentStage, number> = {
    S1: hasRfp ? 100 : 0,
    S2: hasDraft ? 100 : hasRfp ? 30 : 0,
    S3: isReviewed ? 100 : 0,
    S4: hasPrecise ? 100 : 0,
    S5: isApproved ? 100 : 0,
  }
  const weights = { S1: 20, S2: 30, S3: 15, S4: 25, S5: 10 } as const
  const progressPct = Object.entries(stageProgress).reduce(
    (sum, [k, v]) => sum + (v * (weights[k as keyof typeof weights] ?? 0)) / 100,
    0,
  )

  // Channel 추론 (programProfile 또는 projectType 에서)
  const channel =
    (project.programProfile as { channel?: string } | null)?.channel ??
    (project.projectType === 'B2G' || project.projectType === 'B2B' || project.projectType === 'B2C'
      ? project.projectType
      : null)

  return (
    <V2Shell
      projectId={project.id}
      projectName={project.name}
      channel={channel}
      client={project.client}
      totalBudget={project.totalBudgetVat}
      evalCount={analysis?.evalCriteria.length ?? null}
      progressPct={progressPct}
      stages={stages}
      currentStage={currentStage}
      analysis={analysis}
    />
  )
}

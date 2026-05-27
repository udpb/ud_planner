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
import { ExpressDraftSchema, listFilledSlots, ALL_SLOTS } from '@/lib/express/schema'
import { listActiveCategories } from '@/lib/impact/db'
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
      expressDraft: true,
      curriculum: {
        select: {
          id: true,
          sessionNo: true,
          title: true,
          track: true,
          durationHours: true,
          module: { select: { name: true } },
        },
        orderBy: { sessionNo: 'asc' },
      },
      coachAssignments: {
        select: {
          id: true,
          role: true,
          totalFee: true,
          sessions: true,
          coach: { select: { name: true } },
        },
      },
      budget: {
        select: {
          id: true,
          pcTotal: true,
          acTotal: true,
          margin: true,
          marginRate: true,
          items: {
            select: {
              id: true,
              category: true,
              amount: true,
            },
          },
        },
      },
      proposalSections: {
        select: { id: true, sectionNo: true, title: true, isApproved: true },
        orderBy: { sectionNo: 'asc' },
      },
      impactForecast: {
        select: {
          totalSocialValue: true,
          beneficiaryCount: true,
          breakdownJson: true,
        },
      },
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

  // S4 데이터 변환 (S4Workspace props 형태로)
  const s4Curriculum = project.curriculum.map((c) => ({
    week: c.sessionNo,
    name: c.title,
    description: c.module?.name,
    type:
      c.track === 'action'
        ? ('action' as const)
        : c.track === 'lecture'
          ? ('lecture' as const)
          : ('theory' as const),
    duration: `${c.durationHours ?? 0}h`,
    instructor: undefined,
  }))
  const s4Coaches = project.coachAssignments.map((c) => ({
    id: c.id,
    name: c.coach?.name ?? '—',
    role:
      c.role === 'MAIN_COACH'
        ? ('메인' as const)
        : c.role === 'SPECIAL_LECTURER' || c.role === 'LECTURER'
          ? ('특강' as const)
          : ('보조' as const),
    feeKrw: c.totalFee ?? null,
    modulesAssigned: c.sessions ?? 0,
  }))
  const s4Budget = {
    totalKrw: project.budget?.acTotal ?? project.totalBudgetVat ?? 0,
    items:
      project.budget?.items.reduce<{ category: string; amountKrw: number }[]>(
        (acc, item) => {
          const existing = acc.find((a) => a.category === item.category)
          if (existing) existing.amountKrw += item.amount
          else acc.push({ category: item.category, amountKrw: item.amount })
          return acc
        },
        [],
      ) ?? [],
    marginPct: project.budget?.marginRate
      ? project.budget.marginRate * 100
      : null,
  }
  const s4Proposal = {
    sections: project.proposalSections.map((s) => ({
      num: String(s.sectionNo).padStart(2, '0'),
      title: s.title,
      status: s.isApproved ? ('complete' as const) : ('pending' as const),
    })),
  }

  // S5 데이터
  const s5InspectorScore = isReviewed ? 86 : hasDraft ? 78 : 0 // mock — 실 Inspector 호출은 후속
  const s5SocialValue = project.impactForecast?.totalSocialValue
    ? Number(project.impactForecast.totalSocialValue)
    : null
  type ImpactBreakdownEntry = {
    categoryName?: string | null
    categoryId?: string | null
    value?: number | null
    combinedProxyValue?: number | null
  }
  // categoryId → 친화적 이름 매핑 (impact_categories.name 한국어)
  const categoryNameMap = new Map<string, string>()
  if (Array.isArray(project.impactForecast?.breakdownJson)) {
    try {
      const cats = await listActiveCategories()
      cats.forEach((c) => categoryNameMap.set(c.id, c.name))
    } catch (e) {
      // impact-measurement DB 미연결 — UUID fallback 유지
      console.warn('[v2/page] listActiveCategories 실패 (UUID fallback):', e)
    }
  }
  const s5ImpactBreakdown = Array.isArray(project.impactForecast?.breakdownJson)
    ? (project.impactForecast!.breakdownJson as ImpactBreakdownEntry[])
        // value 큰 순 top 3
        .slice()
        .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0))
        .slice(0, 3)
        .map((b) => {
          const id = b.categoryId ?? ''
          const friendly = b.categoryName ?? categoryNameMap.get(id) ?? null
          return {
            label: friendly ?? '기타 카테고리',
            valueKrw: Number(b.value ?? b.combinedProxyValue ?? 0),
          }
        })
        .filter((b) => b.valueKrw > 0)
    : []

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

  // ExpressDraft 슬롯 진행도
  const draftParsed = ExpressDraftSchema.safeParse(project.expressDraft)
  const slotsFilled = draftParsed.success ? listFilledSlots(draftParsed.data).length : 0
  const slotsTotal = ALL_SLOTS.length

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
      slotsFilled={slotsFilled}
      slotsTotal={slotsTotal}
      s4Curriculum={s4Curriculum}
      s4Coaches={s4Coaches}
      s4Budget={s4Budget}
      s4Proposal={s4Proposal}
      s5InspectorScore={s5InspectorScore}
      s5SocialValueKrw={s5SocialValue}
      s5BeneficiaryCount={project.impactForecast?.beneficiaryCount ?? null}
      s5ImpactBreakdown={s5ImpactBreakdown}
      s5IsApproved={isApproved}
    />
  )
}

/**
 * Express 단일 화면 진입 (Phase L Wave L2, ADR-011)
 *
 * 서버 컴포넌트 — 초기 데이터 (project, draft, matchedAssets) 로드 후
 * <ExpressShell> 클라이언트 컴포넌트로 위임.
 *
 * 관련: docs/architecture/express-mode.md §3.1
 */

import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { matchAssetsToRfp } from '@/lib/asset-registry'
import {
  ExpressDraftSchema,
  emptyDraft,
  calcProgress,
  type ExpressDraft,
} from '@/lib/express/schema'
import {
  ConversationStateSchema,
  emptyConversation,
} from '@/lib/express/conversation'
import { computeActiveSlots } from '@/lib/express/active-slots'
import { selectNextSlot } from '@/lib/express/slot-priority'
import { buildAutoCitations } from '@/lib/express/auto-citations'
import { ExpressShell } from '@/components/express/ExpressShell'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'

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
  return { title: `Express — ${project?.name ?? '프로젝트'}` }
}

export default async function ExpressPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      client: true,
      totalBudgetVat: true,
      supplyPrice: true,
      rfpRaw: true,
      rfpParsed: true,
      programProfile: true,
      expressDraft: true,
      expressTurnsCache: true,
      expressActive: true,
      strategicNotes: true,
      // C-8 — 사전 임팩트 forecast (있으면 ExpressShell 의 violet 카드 즉시 렌더)
      impactForecast: {
        select: {
          id: true,
          totalSocialValue: true,
          beneficiaryCount: true,
          calibration: true,
          generatedAt: true,
          basedOnDraftHash: true,
        },
      },
      // outdated 감지용 — 마지막 수정 시각들
      updatedAt: true,
      budget: { select: { updatedAt: true } },
      curriculum: {
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
  })
  if (!project) notFound()

  const rfp = (project.rfpParsed as unknown as RfpParsed) ?? undefined
  const profile = (project.programProfile as unknown as ProgramProfile) ?? undefined

  // Draft 로드 (없으면 empty)
  const draft: ExpressDraft = (() => {
    const fromDb = project.expressDraft
    if (fromDb) {
      const r = ExpressDraftSchema.safeParse(fromDb)
      if (r.success) return r.data
    }
    const fresh = emptyDraft()
    const active = computeActiveSlots(rfp, profile)
    fresh.meta.activeSlots = [...active.active]
    fresh.meta.skippedSlots = [...active.skipped]
    return fresh
  })()

  // ConversationState
  const initialState = (() => {
    const cache = project.expressTurnsCache
    if (cache) {
      const r = ConversationStateSchema.safeParse(cache)
      if (r.success) return r.data
    }
    return emptyConversation(project.id)
  })()

  // 매칭 자산
  const matchedAssets = rfp
    ? await matchAssetsToRfp({ rfp, profile, limit: 10, minScore: 0.5 }).catch(() => [])
    : []

  const autoCitations = await buildAutoCitations({
    rfp,
    profile,
    totalBudgetVat: project.totalBudgetVat,
    supplyPrice: project.supplyPrice ?? null,
  })

  const initialNextSlot = selectNextSlot(draft, rfp)
  const progress = calcProgress(draft, !!rfp)

  // C-8 — 사전 임팩트 forecast + outdated 감지
  // budget/curriculum 이 forecast 생성 후에 수정됐다면 stale → 재계산 필요
  let initialForecast: {
    id: string
    totalSocialValue: number
    beneficiaryCount: number
    calibration: string
    isStale: boolean
  } | null = null
  if (project.impactForecast) {
    const genAt = project.impactForecast.generatedAt.getTime()
    const budgetUpdatedAt = project.budget?.updatedAt?.getTime() ?? 0
    const curriculumLatest = project.curriculum[0]?.updatedAt?.getTime() ?? 0
    const isStale = budgetUpdatedAt > genAt || curriculumLatest > genAt
    initialForecast = {
      id: project.impactForecast.id,
      totalSocialValue: Number(project.impactForecast.totalSocialValue),
      beneficiaryCount: project.impactForecast.beneficiaryCount,
      calibration: project.impactForecast.calibration,
      isStale,
    }
  }

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title={`${project.name} · Express`} />
      <ExpressShell
        projectId={project.id}
        projectName={project.name}
        clientName={project.client}
        hasRfp={!!rfp}
        rfpRawPresent={!!project.rfpRaw}
        initialDraft={draft}
        initialState={initialState}
        initialNextSlot={initialNextSlot}
        initialProgress={progress}
        initialMatchedAssets={matchedAssets}
        initialAutoCitations={autoCitations}
        initialClientDoc={
          ((project.strategicNotes as unknown as StrategicNotes | null) ?? null)
            ?.clientOfficialDoc
        }
        initialImpactForecast={initialForecast}
      />
    </div>
  )
}

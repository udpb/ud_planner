/**
 * load-express-props — Wave V / F0 (ADR-015, 2026-05-20)
 *
 * Server-only helper. Express 페이지 (기존 /express) 와 V3 통합 페이지
 * (/projects/[id] 의 S2 카드) 가 동일 로드 로직을 공유하기 위한 추출.
 *
 * 입력: projectId
 * 출력: ExpressShell 이 받는 모든 초기 props (또는 null — project not found).
 *
 * 회귀 보장: 기존 express/page.tsx 의 데이터 로드 로직 그대로 복제. side effect 0.
 */

import 'server-only'
import { prisma } from '@/lib/prisma'
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
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'
import type { ConversationState } from '@/lib/express/conversation'
import type { AutoCitationsBundle } from '@/lib/express/auto-citations'
import type { AssetMatch } from '@/lib/asset-registry-types'

export interface ExpressInitialProps {
  projectId: string
  projectName: string
  clientName: string
  hasRfp: boolean
  rfpRawPresent: boolean
  initialDraft: ExpressDraft
  initialState: ConversationState
  initialNextSlot: string | null
  initialProgress: ReturnType<typeof calcProgress>
  initialMatchedAssets: AssetMatch[]
  initialAutoCitations: AutoCitationsBundle
  initialClientDoc?: StrategicNotes['clientOfficialDoc']
  initialImpactForecast?: {
    id: string
    totalSocialValue: number
    beneficiaryCount: number
    calibration: string
    isStale: boolean
  } | null
}

/**
 * Express 화면 (또는 V3 의 S2 카드) 에 필요한 모든 초기 props 를 prisma 로
 * 로드해 반환. project 없으면 null.
 */
export async function loadExpressInitialProps(
  projectId: string,
): Promise<ExpressInitialProps | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
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
      updatedAt: true,
      budget: { select: { updatedAt: true } },
      curriculum: {
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
  })
  if (!project) return null

  const rfp = (project.rfpParsed as unknown as RfpParsed) ?? undefined
  const profile =
    (project.programProfile as unknown as ProgramProfile) ?? undefined

  // Draft 로드 (없으면 empty + activeSlots 자동)
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
  const initialState: ConversationState = (() => {
    const cache = project.expressTurnsCache
    if (cache) {
      const r = ConversationStateSchema.safeParse(cache)
      if (r.success) return r.data
    }
    return emptyConversation(project.id)
  })()

  // 매칭 자산
  const matchedAssets = rfp
    ? await matchAssetsToRfp({ rfp, profile, limit: 10, minScore: 0.5 }).catch(
        () => [] as AssetMatch[],
      )
    : ([] as AssetMatch[])

  const autoCitations = await buildAutoCitations({
    rfp,
    profile,
    totalBudgetVat: project.totalBudgetVat,
    supplyPrice: project.supplyPrice ?? null,
  })

  const initialNextSlot = selectNextSlot(draft, rfp)
  const progress = calcProgress(draft, !!rfp)

  // 사전 임팩트 forecast + outdated 감지
  let initialForecast: ExpressInitialProps['initialImpactForecast'] = null
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

  return {
    projectId: project.id,
    projectName: project.name,
    clientName: project.client,
    hasRfp: !!rfp,
    rfpRawPresent: !!project.rfpRaw,
    initialDraft: draft,
    initialState,
    initialNextSlot,
    initialProgress: progress,
    initialMatchedAssets: matchedAssets,
    initialAutoCitations: autoCitations,
    initialClientDoc:
      (project.strategicNotes as unknown as StrategicNotes | null)
        ?.clientOfficialDoc ?? undefined,
    initialImpactForecast: initialForecast,
  }
}

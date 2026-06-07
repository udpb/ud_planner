/**
 * POST /api/projects/[id]/deck — 덱 생성 (DECK-3b-2, ADR-025 Phase 3b)
 *
 * 프로젝트 grounding(RFP·과업·당선 코퍼스) → 덱-우선 저작(author.ts) → 검증된 DeckSpec.
 * **영속화 없음(v1)**: DeckSpec 을 DB 에 저장하지 않고 클라에 반환한다(마이그레이션 회피 — 브리프 §3).
 * 클라가 보관 → PDF 다운로드 시 /deck/pdf 에 body 로 다시 전달.
 *
 * 입력/권한은 assemble 라우트 패턴 재사용(requireProjectAccess · resolveChannel · EngineInput 구성).
 * 단 generateDraft 대신 gather → findWinningReference → authorDeck.
 *
 * AI 진입점 = invokeAi 단일(author 가 준수). 본 라우트는 직접 LLM 호출 추가 안 함.
 * 긴 생성(스토리라인 + 슬라이드별 저작) → maxDuration 300.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { ChannelSchema } from '@/lib/express/schema'
import { gather } from '@/lib/express/engine/gather'
import { findWinningReference } from '@/lib/express/winning-reference'
import { authorDeck } from '@/lib/deck/author'
import { buildPipelineContext } from '@/lib/pipeline-context'
import type { PipelineContext } from '@/lib/pipeline-context'
import type { Channel } from '@/lib/express/schema'
import type { EngineInput } from '@/lib/express/engine/types'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'
import type { Workstream } from '@prisma/client'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const BodySchema = z.object({
  /** RFP override (미지정 시 Project.rfpParsed 사용) */
  rfp: z.unknown().optional(),
  /** 채널 override (미지정 시 진단 결과 또는 RFP projectType) */
  channel: ChannelSchema.optional(),
})

/** channel 결정 — body > expressDraft.autoDiagnosis > rfp.projectType (assemble 라우트와 동일). */
function resolveChannel(
  bodyChannel: Channel | undefined,
  draftRaw: unknown,
  rfp: RfpParsed,
): Channel {
  if (bodyChannel) return bodyChannel
  const detected = (draftRaw as { meta?: { autoDiagnosis?: { channel?: { detected?: Channel } } } })
    ?.meta?.autoDiagnosis?.channel?.detected
  if (detected) return detected
  return rfp.projectType === 'B2B' ? 'B2B' : 'B2G'
}

/**
 * 언더독스 트랙레코드 — 표지/실적/코치 슬라이드 grounding(발명 금지, 공식 수치).
 * (영속 자산화는 후속 — 현재는 라우트 상수로 주입. _smoke-deck-e2e.ts 와 동일 문구.)
 */
const UD_TRACK_RECORD =
  '언더독스: 실전 창업교육 10년, 누적 육성 창업가 20,211명, 코치풀 715명, 누적 매출 약 480억.'

/**
 * DECK-5 (ADR-026) — preflight 경고. 빈 슬라이스는 graceful(생략/가안)이지만,
 * PM 에게 "이 슬라이드는 가안/생략" 임을 알려 신뢰도 착시를 막는다. 하드 게이트 아님(소프트).
 */
function computeDeckWarnings(pipeline: PipelineContext | null): string[] {
  if (!pipeline) {
    return ['기획 데이터(커리큘럼·코치·예산·임팩트)를 불러오지 못해 RFP·코퍼스 근거로만 생성됩니다 — 가안.']
  }
  const warnings: string[] = []
  if (!pipeline.curriculum || pipeline.curriculum.sessions.length === 0) {
    warnings.push('커리큘럼 미작성 — 커리큘럼 슬라이드는 가안입니다.')
  }
  if (!pipeline.coaches || pipeline.coaches.assignments.length === 0) {
    warnings.push('코치 미배정 — 코치진 슬라이드는 가안입니다.')
  }
  if (!pipeline.budget) {
    warnings.push('예산 미작성 — 예산 슬라이드는 가안 또는 생략됩니다.')
  }
  if (!pipeline.impact) {
    warnings.push('임팩트 미작성 — 임팩트 슬라이드는 가안 또는 생략됩니다.')
  }
  return warnings
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params

  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  try {
    const body = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const project = await prisma.project.findUnique({
      where: { id },
      select: { rfpParsed: true, programProfile: true, expressDraft: true },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const rfp = (parsed.data.rfp ?? project.rfpParsed) as RfpParsed | null
    if (!rfp) {
      return NextResponse.json(
        { error: 'RFP 분석 먼저 진행해주세요 (Project.rfpParsed 비어 있음).' },
        { status: 400 },
      )
    }

    const channel = resolveChannel(parsed.data.channel, project.expressDraft, rfp)
    const profile = (project.programProfile as unknown as ProgramProfile) ?? null

    const workstreams = (await prisma.workstream.findMany({
      where: { projectId: id },
      orderBy: { order: 'asc' },
    })) as Workstream[]

    const engine: EngineInput = {
      projectId: id,
      rfp,
      channel,
      workstreams,
      profile,
      pmInputs: null,
    }

    // ① grounding: 섹션별·과업별 evidence 풀 (당선 코퍼스 검색 — 보조 근거)
    const evidence = await gather(engine)

    // ② 유사 당선 덱 골격 (storyline 미러링용 — 없어도 graceful)
    const winningReference = await findWinningReference(rfp, {
      channel: channel as 'B2G' | 'B2B' | 'renewal',
    }).catch(() => null)

    // ③ DECK-5 (ADR-026): 누적 기획(PipelineContext) — **우선 근거**. fail-safe(null 폴백).
    //    있으면 author 가 실 커리큘럼·코치·예산·임팩트로 슬라이드를 채운다. 없으면 기존 동작.
    const pipeline = await buildPipelineContext(id).catch(() => null)
    const warnings = computeDeckWarnings(pipeline)

    // ④ 덱-우선 저작 → 검증된 DeckSpec
    const deckSpec = await authorDeck({
      engine,
      evidence,
      winningReference,
      pipeline,
      trackRecord: UD_TRACK_RECORD,
    })

    return NextResponse.json({ ok: true, deckSpec, warnings })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/projects/[id]/deck] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

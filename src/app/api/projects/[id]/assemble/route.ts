/**
 * POST /api/projects/[id]/assemble  (저니맵 S4, Tech Spec §10 · ADR-021 production 배선)
 *
 * 단일 생성 엔진(`src/lib/express/engine`)을 production 라우트에 배선.
 * RFP + 과업(Workstream) → plan-then-write 단계형 파이프라인 → 유효 ExpressDraft +
 * 기본 self-score. 결과를 Project.expressDraft 에 persist.
 *
 * 입력: body 로 rfp/channel override 가능. 미지정 시 DB(Project.rfpParsed·expressDraft)에서 로드.
 * 권한: requireProjectAccess (Tech Spec §10 — 신규 라우트 전부 auth 강제).
 * 긴 생성: maxDuration 300.
 *
 * 범위 밖(EX-2/EVAL-1): verify faithfulness gate·typed WinTheme·compliance matrix·다중 심사.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { ChannelSchema, ExpressDraftSchema } from '@/lib/express/schema'
import { generateDraft } from '@/lib/express/engine'
import type { Channel, PmInputs } from '@/lib/express/schema'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'
import type { Workstream } from '@prisma/client'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const BodySchema = z.object({
  /** RFP override (미지정 시 Project.rfpParsed 사용) */
  rfp: z.unknown().optional(),
  /** 채널 override (미지정 시 진단 결과 또는 RFP projectType) */
  channel: ChannelSchema.optional(),
})

/** channel 결정 — body > expressDraft.autoDiagnosis > rfp.projectType. */
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

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params

  // 권한
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

    // Project 로딩
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
    const pmInputs =
      ((project.expressDraft as { pmInputs?: PmInputs } | null)?.pmInputs ?? null) as
        | PmInputs
        | null

    // 과업 로드 (없으면 엔진이 ensureDefaultWorkstream)
    const workstreams = (await prisma.workstream.findMany({
      where: { projectId: id },
      orderBy: { order: 'asc' },
    })) as Workstream[]

    // 단일 엔진 호출
    const result = await generateDraft({
      projectId: id,
      rfp,
      channel,
      workstreams,
      profile,
      pmInputs,
    })

    // 유효성 재확인 후 persist (Project.expressDraft)
    const validation = ExpressDraftSchema.safeParse(result.draft)
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Engine 산출 draft 검증 실패',
          issues: validation.error.issues.slice(0, 10),
        },
        { status: 500 },
      )
    }

    await prisma.project.update({
      where: { id },
      data: {
        expressDraft: validation.data as unknown as object,
        expressActive: true,
      },
    })

    // EX-2 — typed WinTheme[] · ComplianceItem[] persist (re-run idempotent: 기존 교체).
    const winThemes = result.winThemes ?? []
    const complianceItems = result.compliance?.items ?? []
    await prisma.$transaction([
      prisma.winTheme.deleteMany({ where: { projectId: id } }),
      prisma.complianceItem.deleteMany({ where: { projectId: id } }),
      ...winThemes.map((w) =>
        prisma.winTheme.create({
          data: {
            projectId: id,
            discriminator: w.discriminator,
            benefit: w.benefit,
            quantified: w.quantified ?? null,
            proof: w.proof as unknown as object,
            hotButton: w.hotButton ?? null,
            rank: w.rank,
          },
        }),
      ),
      ...complianceItems.map((c) =>
        prisma.complianceItem.create({
          data: {
            projectId: id,
            requirement: c.requirement,
            scoringWeight: c.scoringWeight ?? null,
            mappedSection: c.mappedSection ?? null,
            coverage: c.coverage,
          },
        }),
      ),
    ])

    return NextResponse.json({
      ok: true,
      draft: validation.data,
      score: result.score,
      iterations: result.iterations,
      winThemes: winThemes.length,
      compliance: result.compliance
        ? {
            covered: result.compliance.coveredCount,
            partial: result.compliance.partialCount,
            missing: result.compliance.missingCount,
          }
        : undefined,
      verifyReport: result.verifyReport,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/projects/[id]/assemble] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

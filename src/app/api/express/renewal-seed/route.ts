/**
 * GET  /api/express/renewal-seed?projectId=... — 시드 제안 미리보기
 * POST /api/express/renewal-seed                — 시드 적용 (PM 확인 후)
 *
 * renewal 채널 (Phase M2, ADR-013) — 직전 프로젝트 산출물을 자동으로
 * 현재 ExpressDraft 에 시드.
 *
 * GET Response: { proposal: RenewalSeedProposal | null, prior: PriorProjectSummary | null }
 * POST Body: { projectId, priorProjectId } → { draft: ExpressDraft, applied: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/logger'
import { ExpressDraftSchema, type ExpressDraft } from '@/lib/express/schema'
import {
  findPriorProject,
  buildRenewalSeed,
  applyRenewalSeed,
} from '@/lib/express/renewal-seed'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

// ─────────────────────────────────────────
// GET — 시드 제안 미리보기
// ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  const access = await requireProjectAccess(projectId)
  if (!access.ok) return access.response!

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, client: true, expressDraft: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const prior = await findPriorProject({
    currentProjectId: project.id,
    client: project.client,
  })
  if (!prior) {
    return NextResponse.json({ proposal: null, prior: null })
  }

  const draftParsed = ExpressDraftSchema.safeParse(project.expressDraft)
  const currentDraft: ExpressDraft = draftParsed.success
    ? draftParsed.data
    : {
        sections: {},
        meta: {
          startedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
          isCompleted: false,
          activeSlots: [],
          skippedSlots: [],
        },
      }

  const proposal = await buildRenewalSeed({
    currentDraft,
    priorProjectId: prior.id,
  })
  return NextResponse.json({ proposal, prior })
}

// ─────────────────────────────────────────
// POST — 시드 적용
// ─────────────────────────────────────────

const PostBody = z.object({
  projectId: z.string().min(1),
  priorProjectId: z.string().min(1),
})

export async function POST(req: NextRequest) {
  let body: z.infer<typeof PostBody>
  try {
    body = PostBody.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', detail: err }, { status: 400 })
  }

  const access = await requireProjectAccess(body.projectId)
  if (!access.ok) return access.response!

  const project = await prisma.project.findUnique({
    where: { id: body.projectId },
    select: { expressDraft: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const draftParsed = ExpressDraftSchema.safeParse(project.expressDraft)
  const currentDraft: ExpressDraft = draftParsed.success
    ? draftParsed.data
    : {
        sections: {},
        meta: {
          startedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
          isCompleted: false,
          activeSlots: [],
          skippedSlots: [],
        },
      }

  const proposal = await buildRenewalSeed({
    currentDraft,
    priorProjectId: body.priorProjectId,
  })
  if (!proposal) {
    return NextResponse.json({ error: 'Prior project not found' }, { status: 404 })
  }

  const merged = applyRenewalSeed(currentDraft, proposal.proposedFields)

  await prisma.project.update({
    where: { id: body.projectId },
    data: { expressDraft: merged as unknown as object },
  })

  const appliedKeys: string[] = []
  if (proposal.proposedFields.intent) appliedKeys.push('intent')
  if (proposal.proposedFields.beforeAfter?.before) appliedKeys.push('beforeAfter.before')
  if (proposal.proposedFields.beforeAfter?.after) appliedKeys.push('beforeAfter.after')
  if (proposal.proposedFields.keyMessages) appliedKeys.push('keyMessages')
  if (proposal.proposedFields.sections) {
    for (const k of Object.keys(proposal.proposedFields.sections)) {
      appliedKeys.push(`sections.${k}`)
    }
  }

  log.info('express-renewal-seed', 'renewal 시드 적용', {
    projectId: body.projectId,
    priorProjectId: body.priorProjectId,
    applied: appliedKeys,
    skipped: proposal.skippedFields,
  })

  return NextResponse.json({
    draft: merged,
    applied: appliedKeys,
    skipped: proposal.skippedFields,
    source: proposal.source,
  })
}

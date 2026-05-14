/**
 * POST /api/express/eval-simulate
 *
 * B2G 평가배점 시뮬레이션 (Phase M2, ADR-013).
 *
 * Body: { projectId }
 * Response: { simulation: EvalSimulation | null }
 *
 * B2G 가 아니거나 evalCriteria 가 비어있으면 simulation.items 가 빈 배열로 반환.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { ExpressDraftSchema } from '@/lib/express/schema'
import { simulateEvalScore } from '@/lib/express/eval-simulator'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

const BodySchema = z.object({
  projectId: z.string().min(1),
})

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', detail: err }, { status: 400 })
  }

  const access = await requireProjectAccess(body.projectId)
  if (!access.ok) return access.response!

  const project = await prisma.project.findUnique({
    where: { id: body.projectId },
    select: { rfpParsed: true, expressDraft: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const draftParsed = ExpressDraftSchema.safeParse(project.expressDraft)
  if (!draftParsed.success) {
    return NextResponse.json({ simulation: null, reason: 'ExpressDraft 없음' })
  }

  const rfp = project.rfpParsed as unknown as RfpParsed | null
  const evalCriteria = rfp?.evalCriteria ?? null

  const simulation = simulateEvalScore(draftParsed.data, evalCriteria)
  return NextResponse.json({ simulation })
}

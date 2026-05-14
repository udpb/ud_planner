/**
 * POST /api/express/channel
 *
 * 채널 컨펌 + intendedDepartment (B2B) 설정 (Phase M0, ADR-013).
 *
 * Body: {
 *   projectId,
 *   channel: 'B2G' | 'B2B' | 'renewal',
 *   intendedDepartment?: 'csr' | 'strategy' | 'sales' | 'tech'  // B2B 일 때만
 * }
 *
 * 결과: ExpressDraft.meta.autoDiagnosis.channel.confirmedByPm = true
 *      ExpressDraft.meta.intendedDepartment = department (B2B)
 *
 * 이 시점부터:
 *   - 채널 컨펌됨 → 자동 채널 추론 다시 안 함
 *   - intendedDepartment 가 있으면 → FramingInspector 가 일치 여부 검증
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/logger'
import {
  ExpressDraftSchema,
  ChannelSchema,
  DepartmentSchema,
  type ExpressDraft,
} from '@/lib/express/schema'

const BodySchema = z.object({
  projectId: z.string().min(1),
  channel: ChannelSchema,
  intendedDepartment: DepartmentSchema.optional(),
})

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', detail: err }, { status: 400 })
  }

  const { projectId, channel, intendedDepartment } = body

  const access = await requireProjectAccess(projectId)
  if (!access.ok) return access.response!

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { expressDraft: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Draft 파싱 (없으면 empty draft 만들기)
  let draft: ExpressDraft
  if (project.expressDraft) {
    const parsed = ExpressDraftSchema.safeParse(project.expressDraft)
    if (parsed.success) {
      draft = parsed.data
    } else {
      return NextResponse.json({ error: 'Invalid expressDraft in DB' }, { status: 500 })
    }
  } else {
    const now = new Date().toISOString()
    draft = {
      meta: {
        startedAt: now,
        lastUpdatedAt: now,
        isCompleted: false,
        activeSlots: [],
        skippedSlots: [],
      },
    }
  }

  // autoDiagnosis.channel 업데이트
  const prevDiagnosis = draft.meta.autoDiagnosis ?? {}
  const prevChannelDiag = prevDiagnosis.channel

  const newDraft: ExpressDraft = {
    ...draft,
    meta: {
      ...draft.meta,
      lastUpdatedAt: new Date().toISOString(),
      intendedDepartment: channel === 'B2B' ? intendedDepartment : undefined,
      autoDiagnosis: {
        ...prevDiagnosis,
        channel: {
          detected: channel,
          confidence: 1.0, // PM 컨펌 후 신뢰도 100%
          reasoning: prevChannelDiag?.reasoning ?? ['PM 직접 확정'],
          confirmedByPm: true,
        },
      },
    },
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { expressDraft: newDraft as unknown as object },
  })

  log.info('express-channel', '채널 컨펌', {
    projectId,
    channel,
    intendedDepartment,
  })

  return NextResponse.json({
    ok: true,
    channel,
    intendedDepartment,
  })
}

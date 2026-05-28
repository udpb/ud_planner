/**
 * POST /api/express/pm-inputs — K7 (2026-05-29)
 *
 * PM 이 외부 reality (발주처 통화·전담 코치·평가위원 정보) 만 부분 업데이트.
 * 전체 ExpressDraft 를 전송하지 않고 pmInputs 만 patch.
 *
 * Body:
 *   { projectId: string, pmInputs: PmInputs }
 *
 * 동작:
 *   - 권한 확인
 *   - 기존 expressDraft 로드 → pmInputs 만 교체 → 저장
 *   - updatedAt 자동 갱신
 *
 * 관련: docs/architecture/express-mode.md K7
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireProjectAccess } from '@/lib/auth-helpers'
import {
  ExpressDraftSchema,
  PmInputsSchema,
  type ExpressDraft,
} from '@/lib/express/schema'

const BodySchema = z.object({
  projectId: z.string().min(1),
  pmInputs: z.unknown(),
})

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.issues },
        { status: 400 },
      )
    }
    const { projectId, pmInputs } = parsed.data

    const access = await requireProjectAccess(projectId)
    if (!access.ok) return access.response!

    // pmInputs 검증
    const pmInputsValidation = PmInputsSchema.safeParse(pmInputs)
    if (!pmInputsValidation.success) {
      return NextResponse.json(
        {
          error: 'PmInputs validation failed',
          issues: pmInputsValidation.error.issues.slice(0, 10),
        },
        { status: 400 },
      )
    }
    const newPmInputs = {
      ...pmInputsValidation.data,
      updatedAt: new Date().toISOString(),
    }

    // 기존 expressDraft 로드 + pmInputs 만 갱신
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
      select: { expressDraft: true },
    })
    if (!dbProject?.expressDraft) {
      return NextResponse.json(
        { error: 'expressDraft not initialized — start Express first' },
        { status: 400 },
      )
    }

    const existing = ExpressDraftSchema.safeParse(dbProject.expressDraft)
    if (!existing.success) {
      return NextResponse.json(
        { error: 'Existing expressDraft invalid', issues: existing.error.issues.slice(0, 5) },
        { status: 500 },
      )
    }

    const updatedDraft: ExpressDraft = {
      ...existing.data,
      pmInputs: newPmInputs,
      meta: {
        ...existing.data.meta,
        lastUpdatedAt: new Date().toISOString(),
      },
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { expressDraft: updatedDraft as unknown as object },
    })

    return NextResponse.json({
      ok: true,
      savedAt: newPmInputs.updatedAt,
      pmInputs: newPmInputs,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/express/pm-inputs] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

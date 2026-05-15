/**
 * /api/projects/[id]/impact-forecast — Wave M4 (2026-05-15)
 *
 * GET   : ImpactForecast 조회 (없으면 null)
 * POST  : 강제 재생성 (PM 이 "다시 계산" 클릭)
 * PATCH : PM 보정 — items 직접 수정 후 재계산. options: { lock?: boolean }
 *
 * 인증: requireProjectAccess
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { forecastImpact, updateForecastItems } from '@/lib/impact/forecast'
import { isImpactDbConfigured } from '@/lib/impact/db'
import { ExpressDraftSchema } from '@/lib/express/schema'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────
// GET — 현재 forecast 조회
// ─────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params
  const access = await requireProjectAccess(projectId)
  if (!access.ok) return access.response!

  const forecast = await prisma.impactForecast.findUnique({
    where: { projectId },
  })

  return NextResponse.json({
    configured: isImpactDbConfigured(),
    forecast,
  })
}

// ─────────────────────────────────────────
// POST — 재생성 트리거
// ─────────────────────────────────────────
const PostBody = z.object({
  conservative: z.boolean().optional(),
})

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params
  const access = await requireProjectAccess(projectId)
  if (!access.ok) return access.response!

  if (!isImpactDbConfigured()) {
    return NextResponse.json(
      {
        error:
          'IMPACT_MEASUREMENT_DATABASE_URL 미설정 — Vercel 환경변수에 read-only 자격증명 추가 필요.',
      },
      { status: 503 },
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const parsed = PostBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        expressDraft: true,
        rfpParsed: true,
        programProfile: true,
        sroiCountry: true,
        totalBudgetVat: true,
        curriculum: {
          select: { title: true, sessionNo: true, durationHours: true, isTheory: true },
          orderBy: { sessionNo: 'asc' },
        },
      },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const draftValidation = ExpressDraftSchema.safeParse(project.expressDraft)
    if (!draftValidation.success) {
      return NextResponse.json(
        { error: 'ExpressDraft 가 없거나 유효하지 않음 — 1차본 먼저 작성' },
        { status: 400 },
      )
    }
    const draft = draftValidation.data
    const rfp = project.rfpParsed as RfpParsed | null

    const result = await forecastImpact({
      projectId,
      draft: {
        intent: draft.intent,
        beforeAfter: draft.beforeAfter,
        keyMessages: draft.keyMessages,
        sections: draft.sections,
      },
      rfp: rfp
        ? {
            targetCount: rfp.targetCount,
            targetAudience: rfp.targetAudience,
            eduStartDate: rfp.eduStartDate,
            eduEndDate: rfp.eduEndDate,
            projectStartDate: rfp.projectStartDate,
            projectEndDate: rfp.projectEndDate,
            totalBudgetVat: project.totalBudgetVat ?? rfp.totalBudgetVat,
            keywords: rfp.keywords,
          }
        : undefined,
      programProfile: project.programProfile,
      curriculum: project.curriculum.map((c) => ({
        moduleName: c.title,
        sessionNo: c.sessionNo,
        hours: c.durationHours,
        isTheory: c.isTheory,
      })),
      country: project.sroiCountry,
      conservative: parsed.data.conservative ?? true,
    })

    return NextResponse.json({ ok: true, result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/projects/[id]/impact-forecast POST] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─────────────────────────────────────────
// PATCH — PM 보정 (items 수정 후 재계산)
// ─────────────────────────────────────────
const PatchBody = z.object({
  items: z.array(z.unknown()), // ForecastItemWithMeta[] — 엔진에서 검증
  lock: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params
  const access = await requireProjectAccess(projectId)
  if (!access.ok) return access.response!

  if (!isImpactDbConfigured()) {
    return NextResponse.json(
      { error: 'IMPACT_MEASUREMENT_DATABASE_URL 미설정' },
      { status: 503 },
    )
  }

  try {
    const body = await req.json()
    const parsed = PatchBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    // items 형식은 ForecastItemWithMeta — 호출자(UI)가 보내는 그대로 신뢰.
    // 엔진이 잘못된 카테고리·필드 null 등 검증.
    const result = await updateForecastItems(
      projectId,
      parsed.data.items as Parameters<typeof updateForecastItems>[1],
      { lock: parsed.data.lock },
    )
    return NextResponse.json({ ok: true, result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/projects/[id]/impact-forecast PATCH] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

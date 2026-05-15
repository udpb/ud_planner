/**
 * POST /api/express/asset-usage — Wave N1 (2026-05-15)
 *
 * 자산 인용 시점 기록. 호출 패턴:
 *   1. Inspector 추천 카드 → "인용" 클릭 시 (surface: 'express')
 *   2. Deep ProposalSection 저장 시 narrativeSnippet 안의 자산 ID 자동 추출 (Wave N4 예정)
 *   3. 1차본 승인 (handoff) 시 differentiators.acceptedByPm 일괄 기록 (Wave N4 예정)
 *
 * wonProject 는 처음 기록 시 null. Project.isBidWon 갱신 시 cascade 로 채움.
 *
 * Body: { projectId, assetId, sectionKey?, channel?, surface?, notes? }
 * Response: { ok: true, usageId }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireProjectAccess } from '@/lib/auth-helpers'

const BodySchema = z.object({
  projectId: z.string().min(1),
  assetId: z.string().min(1),
  sectionKey: z.string().optional(),
  channel: z.enum(['B2G', 'B2B', 'renewal']).optional(),
  surface: z.enum(['express', 'deep', 'manual']).optional(),
  notes: z.string().max(500).optional(),
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
    const { projectId, assetId, sectionKey, channel, surface, notes } = parsed.data

    const access = await requireProjectAccess(projectId)
    if (!access.ok) return access.response!

    // 자산 존재 확인 (FK 에러 사전 차단)
    const asset = await prisma.contentAsset.findUnique({
      where: { id: assetId },
      select: { id: true },
    })
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    // Project 채널 추론 — channel 미지정 시 programProfile.channel.type 사용
    let resolvedChannel = channel
    if (!resolvedChannel) {
      const proj = await prisma.project.findUnique({
        where: { id: projectId },
        select: { programProfile: true, projectType: true },
      })
      const pp = proj?.programProfile as
        | { channel?: { type?: string; isRenewal?: boolean } }
        | null
        | undefined
      if (pp?.channel?.isRenewal) resolvedChannel = 'renewal'
      else if (pp?.channel?.type === 'B2B' || proj?.projectType === 'B2B')
        resolvedChannel = 'B2B'
      else resolvedChannel = 'B2G'
    }

    const usage = await prisma.assetUsage.create({
      data: {
        assetId,
        projectId,
        sectionKey,
        channel: resolvedChannel,
        surface: surface ?? 'express',
        notes,
      },
      select: { id: true },
    })

    return NextResponse.json({ ok: true, usageId: usage.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/express/asset-usage] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

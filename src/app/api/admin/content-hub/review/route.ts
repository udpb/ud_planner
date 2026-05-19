/**
 * POST /api/admin/content-hub/review — 2026-05-19
 *
 * Admin/Director 가 PM 제안 자산을 승인/반려.
 *
 * Body:
 *  { assetId, action: 'approve' | 'reject', note?: string }
 *
 *  approve: status='stable' + reviewedAt + reviewedById + (optional) reviewerNote
 *  reject:  status='archived' + reviewedAt + reviewedById + reviewerNote (필수)
 *
 * 승인 시 자동:
 *  - status 'stable' 로 변경 → 추천 풀 자동 합류
 *  - 임베딩 미생성이면 (나중에 cron 또는 명시 트리거) — 본 API 는 status 만
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  assetId: z.string().min(1),
  action: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user || (role !== 'ADMIN' && role !== 'DIRECTOR')) {
    return NextResponse.json(
      { error: 'Forbidden — ADMIN/DIRECTOR 만 검수 가능' },
      { status: 403 },
    )
  }
  const reviewerId = (session.user as { id?: string }).id

  try {
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const { assetId, action, note } = parsed.data

    // 반려 시 사유 필수
    if (action === 'reject' && !note?.trim()) {
      return NextResponse.json(
        { error: '반려 시 사유(note) 필수' },
        { status: 400 },
      )
    }

    const asset = await prisma.contentAsset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, status: true, submitterNote: true },
    })
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    const updated = await prisma.contentAsset.update({
      where: { id: assetId },
      data: {
        status: action === 'approve' ? 'stable' : 'archived',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewerNote: note ?? null,
        updatedById: reviewerId,
      },
      select: { id: true, name: true, status: true },
    })

    return NextResponse.json({
      ok: true,
      asset: updated,
      message:
        action === 'approve'
          ? `"${asset.name}" 승인 완료 — stable 로 전환됨`
          : `"${asset.name}" 반려 — archived 처리`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/admin/content-hub/review] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * GET /api/admin/asset-freshness — Wave N5 (2026-05-15)
 *
 * 자산 freshness 점검 — lastReviewedAt 기준으로:
 *  - stale (≥ 18개월): 정량 자산이면 critical (수치 묵음)
 *  - aging (12~18개월): warn
 *  - fresh (< 12개월): ok
 *
 * 응답:
 *  {
 *    summary: { total, stale, aging, fresh, noEmbedding },
 *    stale: [{ id, name, lastReviewedAt, evidenceType, category, daysOld }],
 *    aging: [...],
 *    noEmbedding: [...]
 *  }
 *
 * 운영:
 *  - 월 1회 cron (Vercel Cron 또는 외부 trigger) 으로 호출 → 결과 Slack 통지
 *  - 또는 /admin/asset-insights 페이지에서 표시
 *
 * 인증: ADMIN | DIRECTOR
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EMBEDDING_MODEL_LABEL } from '@/lib/ai/embedding'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(_req: NextRequest) {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user || (role !== 'ADMIN' && role !== 'DIRECTOR')) {
    return NextResponse.json(
      { error: 'Forbidden — ADMIN/DIRECTOR 역할 필요' },
      { status: 403 },
    )
  }

  const now = Date.now()
  const cutoff12 = new Date(now - 365 * DAY_MS)
  const cutoff18 = new Date(now - 540 * DAY_MS)

  const allActive = await prisma.contentAsset.findMany({
    where: { status: { not: 'archived' } },
    select: {
      id: true,
      name: true,
      category: true,
      evidenceType: true,
      status: true,
      lastReviewedAt: true,
      embeddingModel: true,
      embeddedAt: true,
    },
  })

  const fresh: typeof allActive = []
  const aging: typeof allActive = []
  const stale: typeof allActive = []

  for (const a of allActive) {
    const ts = a.lastReviewedAt.getTime()
    if (ts < cutoff18.getTime()) stale.push(a)
    else if (ts < cutoff12.getTime()) aging.push(a)
    else fresh.push(a)
  }

  const noEmbedding = allActive.filter(
    (a) => a.embeddingModel !== EMBEDDING_MODEL_LABEL || !a.embeddedAt,
  )

  const enrich = <T extends { lastReviewedAt: Date }>(rows: T[]) =>
    rows
      .map((r) => ({
        ...r,
        daysOld: Math.floor((now - r.lastReviewedAt.getTime()) / DAY_MS),
      }))
      .sort((a, b) => b.daysOld - a.daysOld)

  return NextResponse.json({
    summary: {
      total: allActive.length,
      stale: stale.length,
      aging: aging.length,
      fresh: fresh.length,
      noEmbedding: noEmbedding.length,
    },
    stale: enrich(stale),
    aging: enrich(aging),
    noEmbedding: noEmbedding.map((a) => ({ id: a.id, name: a.name, category: a.category })),
  })
}

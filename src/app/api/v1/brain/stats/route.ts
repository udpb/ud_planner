/**
 * GET /api/v1/brain/stats — W32 (Phase E)
 *
 * Public Brain Stats — DB 카운트 + Coverage metrics.
 *
 * Auth: Bearer <BRAIN_PUBLIC_API_TOKEN>
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireBrainApiAuth, brainApiRateLimit, getClientKey } from '@/lib/api/brain-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = requireBrainApiAuth(req)
  if (!auth.ok) return auth.response!

  const key = getClientKey(req, auth.token)
  const rl = brainApiRateLimit(key, 60, 60_000)
  if (!rl.ok) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000)
    return NextResponse.json(
      { error: 'RATE_LIMIT', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  const [
    contentAsset,
    contentAssetStable,
    contentAssetDeveloping,
    concept,
    assetConcept,
    conceptRelation,
    winningPattern,
    patternConcept,
    assetUsage,
    assetUsageLabeled,
    local2026,
    unmapped,
  ] = await Promise.all([
    prisma.contentAsset.count(),
    prisma.contentAsset.count({ where: { status: 'stable' } }),
    prisma.contentAsset.count({ where: { status: 'developing' } }),
    prisma.concept.count(),
    prisma.assetConcept.count(),
    prisma.conceptRelation.count(),
    prisma.winningPattern.count(),
    prisma.patternConcept.count(),
    prisma.assetUsage.count(),
    prisma.assetUsage.count({ where: { wonProject: { not: null } } }),
    prisma.contentAsset.count({ where: { sourceType: 'local-2026', sourceTier: 'high' } }),
    prisma.contentAsset.count({ where: { concepts: { none: {} } } }),
  ])

  const conceptByType = await prisma.concept.groupBy({
    by: ['type'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  const assetByType = await prisma.contentAsset.groupBy({
    by: ['assetType'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  return NextResponse.json(
    {
      ok: true,
      brain: {
        contentAsset: {
          total: contentAsset,
          stable: contentAssetStable,
          developing: contentAssetDeveloping,
          byType: assetByType.map((t) => ({ type: t.assetType, count: t._count.id })),
          local2026High: local2026,
          unmapped,
        },
        concept: {
          total: concept,
          assetConcept,
          relations: conceptRelation,
          byType: conceptByType.map((t) => ({ type: t.type, count: t._count.id })),
        },
        pattern: {
          total: winningPattern,
          patternConcept,
        },
        usage: {
          total: assetUsage,
          labeled: assetUsageLabeled,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        brainCoverage: Math.round(((contentAsset - unmapped) / Math.max(1, contentAsset)) * 100),
      },
    },
    {
      headers: {
        'X-RateLimit-Remaining': String(rl.remaining),
        'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
        'Cache-Control': 'private, max-age=60',
      },
    },
  )
}

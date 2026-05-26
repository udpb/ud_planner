/**
 * GET /api/cron/brain/status-transition — W20 (Phase B)
 *
 * 매월 실행 — 1년 미사용 → developing, 2년 → archived, 최근 30일 인용 → revive.
 * sourceTier='high' 자산 보호.
 *
 * Vercel Cron: 매월 1일 KST 9시 → "0 0 1 * *" (UTC)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkCronAuth } from '@/lib/cron/auth'
import { log } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const authError = checkCronAuth(req)
  if (authError) return authError

  const startedAt = Date.now()
  const now = Date.now()
  const demoteThreshold = new Date(now - 365 * DAY_MS)
  const archiveThreshold = new Date(now - 730 * DAY_MS)
  const reviveThreshold = new Date(now - 30 * DAY_MS)

  const allAssets = await prisma.contentAsset.findMany({
    select: {
      id: true,
      status: true,
      sourceTier: true,
      createdAt: true,
      usages: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  const withMeta = allAssets.map((a) => ({
    id: a.id,
    status: a.status,
    isProtected: a.sourceTier === 'high',
    lastUsedAt: a.usages[0]?.createdAt ?? a.createdAt,
  }))

  const toDemote = withMeta.filter(
    (a) => !a.isProtected && a.status === 'stable' && a.lastUsedAt < demoteThreshold,
  )
  const toArchive = withMeta.filter(
    (a) => !a.isProtected && a.status === 'developing' && a.lastUsedAt < archiveThreshold,
  )
  const toRevive = withMeta.filter(
    (a) => a.status === 'archived' && a.lastUsedAt >= reviveThreshold,
  )

  const demoteResult =
    toDemote.length > 0
      ? await prisma.contentAsset.updateMany({
          where: { id: { in: toDemote.map((a) => a.id) } },
          data: { status: 'developing' },
        })
      : { count: 0 }
  const archiveResult =
    toArchive.length > 0
      ? await prisma.contentAsset.updateMany({
          where: { id: { in: toArchive.map((a) => a.id) } },
          data: { status: 'archived' },
        })
      : { count: 0 }
  const reviveResult =
    toRevive.length > 0
      ? await prisma.contentAsset.updateMany({
          where: { id: { in: toRevive.map((a) => a.id) } },
          data: { status: 'developing' },
        })
      : { count: 0 }

  const elapsedMs = Date.now() - startedAt
  log.info('cron', '[brain/status-transition] 완료', {
    demoted: demoteResult.count,
    archived: archiveResult.count,
    revived: reviveResult.count,
    elapsedMs,
  })

  return NextResponse.json({
    ok: true,
    summary: {
      demoted: demoteResult.count,
      archived: archiveResult.count,
      revived: reviveResult.count,
      elapsedMs,
    },
  })
}

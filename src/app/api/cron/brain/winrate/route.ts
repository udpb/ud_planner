/**
 * GET /api/cron/brain/winrate — W19 (Phase B)
 *
 * 매주 실행 — ContentAsset.winRate Laplace + half-life decay 재계산.
 * AssetUsage rows (wonProject 결정된 것만) 집계.
 *
 * Vercel Cron: 매주 월요일 KST 9시 → "0 0 * * 1" (UTC)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkCronAuth } from '@/lib/cron/auth'
import { log } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
const DECAY_DAYS = 365 // half-life 1년

export async function GET(req: NextRequest) {
  const authError = checkCronAuth(req)
  if (authError) return authError

  const startedAt = Date.now()
  const now = Date.now()
  const halfLifeMs = DECAY_DAYS * DAY_MS

  const usages = await prisma.assetUsage.findMany({
    where: { wonProject: { not: null }, rejectedByPm: false },
    select: { assetId: true, wonProject: true, createdAt: true },
  })

  if (usages.length === 0) {
    return NextResponse.json({
      ok: true,
      summary: { labeled: 0, updated: 0, message: 'no labeled usages yet' },
    })
  }

  // 자산별 가중 집계
  const agg = new Map<
    string,
    { weightedWins: number; weightedTotal: number; rawWins: number; rawTotal: number }
  >()
  for (const u of usages) {
    const decay = Math.pow(0.5, (now - u.createdAt.getTime()) / halfLifeMs)
    const cur = agg.get(u.assetId) ?? {
      weightedWins: 0,
      weightedTotal: 0,
      rawWins: 0,
      rawTotal: 0,
    }
    cur.weightedTotal += decay
    cur.rawTotal++
    if (u.wonProject === true) {
      cur.weightedWins += decay
      cur.rawWins++
    }
    agg.set(u.assetId, cur)
  }

  // Laplace smoothing
  let updated = 0
  for (const [assetId, a] of agg) {
    const winRate = (a.weightedWins + 1) / (a.weightedTotal + 2)
    await prisma.contentAsset.update({
      where: { id: assetId },
      data: { winRate },
    })
    updated++
  }

  // null reset for non-aggregated
  const reset = await prisma.contentAsset.updateMany({
    where: {
      id: { notIn: Array.from(agg.keys()) },
      winRate: { not: null },
    },
    data: { winRate: null },
  })

  const elapsedMs = Date.now() - startedAt
  log.info('cron', '[brain/winrate] 완료', { labeled: usages.length, updated, reset: reset.count, elapsedMs })

  return NextResponse.json({
    ok: true,
    summary: {
      labeled: usages.length,
      aggregated: agg.size,
      updated,
      resetToNull: reset.count,
      elapsedMs,
    },
  })
}

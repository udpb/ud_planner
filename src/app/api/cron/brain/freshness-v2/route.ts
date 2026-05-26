/**
 * GET /api/cron/brain/freshness-v2 — W23 (Phase B)
 *
 * 매월 실행 — Concept-aware freshness alert.
 * 1년 미사용 + 같은 핵심 Concept 의 최신 자산 존재 → 대체 권장 alert.
 *
 * Vercel Cron: 매월 1일 KST 9시 → "30 0 1 * *" (UTC, status-transition 후 30분)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkCronAuth } from '@/lib/cron/auth'
import { log } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000

interface Alert {
  staleAssetId: string
  staleAssetName: string
  staleDaysAgo: number
  sharedConcepts: string[]
  alternatives: { assetId: string; name: string; sourceTier: string | null; sourceType: string | null }[]
}

export async function GET(req: NextRequest) {
  const authError = checkCronAuth(req)
  if (authError) return authError

  const startedAt = Date.now()
  const now = Date.now()
  const STALE_DAYS = 365
  const ACTIVE_DAYS = 90
  const staleThreshold = new Date(now - STALE_DAYS * DAY_MS)
  const activeThreshold = new Date(now - ACTIVE_DAYS * DAY_MS)

  const allAssets = await prisma.contentAsset.findMany({
    where: { status: { not: 'archived' } },
    select: {
      id: true,
      name: true,
      sourceTier: true,
      sourceType: true,
      createdAt: true,
      usages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      concepts: {
        select: { conceptId: true, isCore: true, concept: { select: { name: true } } },
      },
    },
  })

  const withMeta = allAssets.map((a) => ({
    ...a,
    lastUsedAt: a.usages[0]?.createdAt ?? a.createdAt,
  }))

  const stale = withMeta.filter(
    (a) => a.lastUsedAt < staleThreshold && a.sourceTier !== 'high',
  )
  const active = withMeta.filter((a) => a.lastUsedAt >= activeThreshold)

  // active 자산을 Concept 별로 인덱싱
  const activeByConceptId = new Map<string, typeof withMeta>()
  for (const a of active) {
    for (const c of a.concepts) {
      if (!c.isCore) continue
      const list = activeByConceptId.get(c.conceptId) ?? []
      list.push(a)
      activeByConceptId.set(c.conceptId, list)
    }
  }

  const alerts: Alert[] = []
  for (const s of stale) {
    const coreConcepts = s.concepts.filter((c) => c.isCore)
    if (coreConcepts.length === 0) continue
    const seenAltIds = new Set<string>()
    const alternatives: Alert['alternatives'] = []
    for (const cc of coreConcepts) {
      for (const cand of activeByConceptId.get(cc.conceptId) ?? []) {
        if (cand.id === s.id || seenAltIds.has(cand.id)) continue
        seenAltIds.add(cand.id)
        alternatives.push({
          assetId: cand.id,
          name: cand.name,
          sourceTier: cand.sourceTier,
          sourceType: cand.sourceType,
        })
      }
    }
    if (alternatives.length === 0) continue
    alerts.push({
      staleAssetId: s.id,
      staleAssetName: s.name,
      staleDaysAgo: Math.floor((now - s.lastUsedAt.getTime()) / DAY_MS),
      sharedConcepts: coreConcepts.map((c) => c.concept.name),
      alternatives: alternatives.slice(0, 3),
    })
  }

  // Slack notify (optional)
  const slackUrl = process.env.SLACK_FRESHNESS_WEBHOOK
  let slackNotified = false
  if (slackUrl && alerts.length > 0) {
    try {
      const top = alerts.slice(0, 10).map(
        (a) => `• ${a.staleAssetName} (${a.staleDaysAgo}일) → ${a.alternatives[0]?.name ?? '?'}`,
      )
      await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `*[Brain Freshness v2 — Concept-aware]*\n🟡 대체 권장: ${alerts.length}건\n\n${top.join('\n')}`,
        }),
      })
      slackNotified = true
    } catch {
      /* ignore */
    }
  }

  const elapsedMs = Date.now() - startedAt
  log.info('cron', '[brain/freshness-v2] 완료', {
    stale: stale.length,
    alerts: alerts.length,
    elapsedMs,
  })

  return NextResponse.json({
    ok: true,
    summary: {
      stale: stale.length,
      alerts: alerts.length,
      slackNotified,
      elapsedMs,
    },
    topAlerts: alerts.slice(0, 10),
  })
}

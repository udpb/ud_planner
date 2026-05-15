/**
 * GET /api/cron/asset-freshness — Wave N5 (2026-05-15)
 *
 * Vercel Cron 또는 외부 trigger 로 월 1회 호출.
 * stale/aging 자산 집계 → Slack webhook 으로 통지 (선택).
 *
 * 인증: Vercel Cron 의 Authorization: Bearer <CRON_SECRET> 헤더.
 *  - CRON_SECRET 환경변수 미설정 시 호출 가능 (dev). 운영은 반드시 설정.
 *
 * vercel.json 의 crons 항목으로 매월 1일 오전 9시 (KST) 트리거.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { EMBEDDING_MODEL_LABEL } from '@/lib/ai/embedding'

export const dynamic = 'force-dynamic'
const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  // 인증 — Vercel Cron 헤더
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
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
      lastReviewedAt: true,
      embeddingModel: true,
      embeddedAt: true,
    },
  })

  const stale = allActive.filter((a) => a.lastReviewedAt < cutoff18)
  const aging = allActive.filter(
    (a) => a.lastReviewedAt >= cutoff18 && a.lastReviewedAt < cutoff12,
  )
  const noEmbedding = allActive.filter(
    (a) => a.embeddingModel !== EMBEDDING_MODEL_LABEL || !a.embeddedAt,
  )

  const summary = {
    total: allActive.length,
    stale: stale.length,
    aging: aging.length,
    noEmbedding: noEmbedding.length,
  }

  // Slack 통지 (옵션)
  const slackUrl = process.env.SLACK_FRESHNESS_WEBHOOK
  let slackNotified = false
  if (slackUrl && (summary.stale > 0 || summary.aging > 5 || summary.noEmbedding > 10)) {
    try {
      const top5 = stale.slice(0, 5).map((a) => {
        const days = Math.floor((now - a.lastReviewedAt.getTime()) / DAY_MS)
        return `• ${a.name} (${a.evidenceType}, ${days}일)`
      })
      const text = [
        '*[UD Asset Freshness 월간 리포트]*',
        `🟥 묵음 (>18개월): *${summary.stale}* 건`,
        `🟨 갱신 권장 (12~18개월): *${summary.aging}* 건`,
        `📦 임베딩 미생성: *${summary.noEmbedding}* 건`,
        '',
        ...(top5.length > 0 ? ['_가장 오래된 자산 Top 5:_', ...top5] : []),
        '',
        '<https://ud-planner.vercel.app/admin/asset-insights|→ 자산 인사이트 페이지>',
      ].join('\n')

      await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      slackNotified = true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[cron/asset-freshness] Slack 통지 실패:', msg)
    }
  }

  return NextResponse.json({ ok: true, summary, slackNotified })
}

/**
 * GET /api/cron/brain/rfp-concept — W28 (Phase C)
 *
 * 매일 실행 — 최근 24h 이내 생성된 Project 의 RFP → Concept 매핑.
 * 신규 도메인 자동 감지 + Slack alert (옵션).
 *
 * Vercel Cron: 매일 KST 7시 → "0 22 * * *" (UTC)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkCronAuth } from '@/lib/cron/auth'
import { log } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const STOP_WORDS = new Set([
  '및',
  '등',
  '대한',
  '관련',
  '통한',
  '위한',
  '내용',
  '운영',
  '진행',
  '사업',
  '프로그램',
  '교육',
  '지원',
  '제공',
  '하는',
  '있는',
  '되는',
])

function extractKeywords(text: string, max = 50): string[] {
  const tokens = text.match(/[가-힣A-Za-z0-9]+/g) || []
  const counts = new Map<string, number>()
  for (const t of tokens) {
    if (t.length < 2) continue
    if (STOP_WORDS.has(t)) continue
    if (/^\d+$/.test(t)) continue
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([w, c]) => ({ w, score: c * (1 + Math.log(w.length)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((r) => r.w)
}

function normalize(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

export async function GET(req: NextRequest) {
  const authError = checkCronAuth(req)
  if (authError) return authError

  const startedAt = Date.now()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const MIN_MATCHES = 3

  const projects = await prisma.project.findMany({
    where: { rfpRaw: { not: null }, createdAt: { gte: since } },
    select: { id: true, name: true, rfpRaw: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  if (projects.length === 0) {
    return NextResponse.json({ ok: true, summary: { projects: 0, alerts: 0 } })
  }

  // 기존 Concept lookup
  const allConcepts = await prisma.concept.findMany({
    select: { id: true, name: true, type: true, aliases: true, assetCount: true },
  })
  const nameMap = new Map<string, typeof allConcepts[0]>()
  for (const c of allConcepts) {
    nameMap.set(normalize(c.name), c)
    for (const a of c.aliases) nameMap.set(normalize(a), c)
  }

  const newDomainAlerts: {
    projectId: string
    projectName: string
    matchedCount: number
    topKeywords: string[]
  }[] = []
  const matchSummary: number[] = []

  for (const p of projects) {
    const rfp = p.rfpRaw ?? ''
    if (rfp.length < 200) continue

    const keywords = extractKeywords(rfp, 50)
    const matched = new Set<string>()
    for (const kw of keywords) {
      const concept = nameMap.get(normalize(kw))
      if (concept) matched.add(concept.id)
    }
    matchSummary.push(matched.size)

    if (matched.size < MIN_MATCHES) {
      newDomainAlerts.push({
        projectId: p.id,
        projectName: p.name,
        matchedCount: matched.size,
        topKeywords: keywords.slice(0, 10),
      })
    }
  }

  // Slack notify (optional)
  const slackUrl = process.env.SLACK_FRESHNESS_WEBHOOK
  let slackNotified = false
  if (slackUrl && newDomainAlerts.length > 0) {
    try {
      const lines = newDomainAlerts.slice(0, 5).map(
        (a) =>
          `• [${a.matchedCount} matched] ${a.projectName.slice(0, 50)} — keywords: ${a.topKeywords.slice(0, 5).join(', ')}`,
      )
      await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `*[Brain RFP-Concept — 신규 도메인 감지]*\n🆕 ${newDomainAlerts.length}건 (Brain 이 <${MIN_MATCHES} Concept 매칭)\n\n${lines.join('\n')}`,
        }),
      })
      slackNotified = true
    } catch {
      /* ignore */
    }
  }

  const avgMatched =
    matchSummary.length > 0
      ? Math.round(matchSummary.reduce((s, n) => s + n, 0) / matchSummary.length)
      : 0
  const coverage =
    matchSummary.length > 0
      ? Math.round(100 - (newDomainAlerts.length / matchSummary.length) * 100)
      : 100

  const elapsedMs = Date.now() - startedAt
  log.info('cron', '[brain/rfp-concept] 완료', {
    projects: projects.length,
    alerts: newDomainAlerts.length,
    avgMatched,
    coverage,
    elapsedMs,
  })

  return NextResponse.json({
    ok: true,
    summary: {
      projects: projects.length,
      analyzed: matchSummary.length,
      avgMatched,
      coverage,
      newDomainAlerts: newDomainAlerts.length,
      slackNotified,
      elapsedMs,
    },
    topAlerts: newDomainAlerts.slice(0, 5),
  })
}

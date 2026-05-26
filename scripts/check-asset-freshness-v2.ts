/**
 * scripts/check-asset-freshness-v2.ts — W23 (Phase B, Self-Evolution)
 *
 * 기존 /api/cron/asset-freshness 는 lastReviewedAt 만 보고 stale 분류.
 * v2 는 Concept 그래프를 활용해 "대체 가능한 활성 자산" 까지 제안.
 *
 * 알고리즘:
 *   1. stale 자산 (lastUsedAt < 1년) + 같은 Concept 의 활성 자산 (lastUsedAt < 90일) 있음
 *      → "대체 권장" alert 생성
 *   2. sourceTier='high' 는 stale 라도 보호
 *   3. 같은 Concept 의 더 최신 sourceType='local-2026' 자산 있으면 우선 추천
 *
 * 출력:
 *   - JSON (--json) : 알림 큐 시스템 연동용
 *   - human-readable: 기본
 *
 * 사용:
 *   npx tsx scripts/check-asset-freshness-v2.ts
 *   npx tsx scripts/check-asset-freshness-v2.ts --json --stale-days 365
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

const argv = process.argv.slice(2)
function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const STALE_DAYS = parseInt(arg('--stale-days', '365'), 10)
const ACTIVE_DAYS = parseInt(arg('--active-days', '90'), 10)
const AS_JSON = argv.includes('--json')
const TOP = parseInt(arg('--top', '30'), 10)

const DAY_MS = 24 * 60 * 60 * 1000

interface Alert {
  staleAssetId: string
  staleAssetName: string
  staleAssetType: string
  staleLastUsedAt: Date
  staleDaysAgo: number
  sharedConcepts: { id: string; name: string; type: string }[]
  alternatives: {
    assetId: string
    name: string
    assetType: string
    sourceTier: string | null
    sourceType: string | null
    sharedConcept: string
    lastUsedAt: Date
    daysAgo: number
  }[]
  reason: string
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  if (!AS_JSON) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('▶ W23 — Asset Freshness v2 (Concept-aware)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`stale-days: ${STALE_DAYS} · active-days: ${ACTIVE_DAYS}`)
    console.log('')
  }

  const now = Date.now()
  const staleThreshold = new Date(now - STALE_DAYS * DAY_MS)
  const activeThreshold = new Date(now - ACTIVE_DAYS * DAY_MS)

  // 1. 모든 자산 + lastUsedAt 계산
  const allAssets = await prisma.contentAsset.findMany({
    where: { status: { not: 'archived' } },
    select: {
      id: true,
      name: true,
      assetType: true,
      sourceTier: true,
      sourceType: true,
      createdAt: true,
      lastReviewedAt: true,
      status: true,
      usages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      concepts: {
        select: { conceptId: true, isCore: true, concept: { select: { name: true, type: true } } },
      },
    },
  })

  if (!AS_JSON) console.log(`📦 활성 자산: ${allAssets.length}건`)

  const withMeta = allAssets.map((a) => {
    const lastUsage = a.usages[0]?.createdAt ?? null
    // lastUsedAt: 인용 시점 우선, 없으면 createdAt (자료 ingest 시점)
    const lastUsedAt = lastUsage ?? a.createdAt
    return {
      ...a,
      lastUsedAt,
      hasUsage: !!lastUsage,
    }
  })

  // 2. stale = 1년 이상 미사용 + sourceTier != 'high' (high tier 는 회사 핵심 IP, 보호)
  const stale = withMeta.filter(
    (a) => a.lastUsedAt < staleThreshold && a.sourceTier !== 'high',
  )
  const active = withMeta.filter((a) => a.lastUsedAt >= activeThreshold)

  if (!AS_JSON) {
    console.log(`📦 stale (>${STALE_DAYS}일 미사용, high tier 제외): ${stale.length}건`)
    console.log(`📦 active (≤${ACTIVE_DAYS}일 인용 또는 추가): ${active.length}건`)
    console.log('')
  }

  // 3. stale 자산 별로 같은 Concept 의 활성 자산 찾기
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
    const alternatives: Alert['alternatives'] = []
    const seenAltIds = new Set<string>()
    for (const cc of coreConcepts) {
      const candidates = activeByConceptId.get(cc.conceptId) ?? []
      for (const cand of candidates) {
        if (cand.id === s.id) continue
        if (seenAltIds.has(cand.id)) continue
        seenAltIds.add(cand.id)
        alternatives.push({
          assetId: cand.id,
          name: cand.name,
          assetType: cand.assetType,
          sourceTier: cand.sourceTier,
          sourceType: cand.sourceType,
          sharedConcept: cc.concept.name,
          lastUsedAt: cand.lastUsedAt,
          daysAgo: Math.floor((now - cand.lastUsedAt.getTime()) / DAY_MS),
        })
      }
    }
    if (alternatives.length === 0) continue

    // 우선순위: local-2026 > local- > drive > others, 그 안에서 신선도
    alternatives.sort((a, b) => {
      const tierOrder = (t: string | null) =>
        t === 'high' ? 0 : t === 'medium' ? 1 : t === 'internal' ? 2 : 3
      const sourceOrder = (s: string | null) =>
        s === 'local-2026' ? 0 : s?.startsWith('local-') ? 1 : s === 'drive' ? 2 : 3
      const ts = sourceOrder(a.sourceType) - sourceOrder(b.sourceType)
      if (ts !== 0) return ts
      const tt = tierOrder(a.sourceTier) - tierOrder(b.sourceTier)
      if (tt !== 0) return tt
      return a.daysAgo - b.daysAgo
    })

    alerts.push({
      staleAssetId: s.id,
      staleAssetName: s.name,
      staleAssetType: s.assetType,
      staleLastUsedAt: s.lastUsedAt,
      staleDaysAgo: Math.floor((now - s.lastUsedAt.getTime()) / DAY_MS),
      sharedConcepts: coreConcepts.map((c) => ({
        id: c.conceptId,
        name: c.concept.name,
        type: c.concept.type,
      })),
      alternatives: alternatives.slice(0, 3),
      reason: `1년 이상 미사용. 같은 핵심 개념의 활성 자산 ${alternatives.length}개 존재. 대체 권장.`,
    })
  }

  // 4. 출력
  if (AS_JSON) {
    console.log(JSON.stringify({ alerts, summary: { stale: stale.length, alerts: alerts.length } }, null, 2))
  } else {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`🟡 대체 권장 알림: ${alerts.length}건`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    for (const al of alerts.slice(0, TOP)) {
      console.log('')
      console.log(`▶ [${al.staleAssetType}] ${al.staleAssetName} (${al.staleDaysAgo}일 미사용)`)
      console.log(`  핵심 개념: ${al.sharedConcepts.map((c) => c.name).join(', ')}`)
      console.log(`  대체 후보 (top ${al.alternatives.length}):`)
      for (const alt of al.alternatives) {
        console.log(
          `    → [${alt.sourceTier?.padEnd(8)}|${alt.sourceType?.padEnd(13)}] ${alt.name.slice(0, 55)} (${alt.daysAgo}일 전, via "${alt.sharedConcept}")`,
        )
      }
    }
    if (alerts.length > TOP) console.log(`\n  ... +${alerts.length - TOP} more alerts`)
    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 Summary')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Stale assets:      ${stale.length}`)
    console.log(`With alternatives: ${alerts.length}`)
    console.log(`Alerts to review:  ${alerts.length}`)
    console.log('')
    console.log('✓ freshness v2 완료')
    console.log('  → JSON 출력: --json')
  }

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

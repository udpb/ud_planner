/**
 * scripts/cron-update-winrate.ts — W19 (Phase B, Self-Evolution)
 *
 * ContentAsset.winRate 매주 재계산.
 *
 * 알고리즘 (PRD-Brain §4.2 / PRD-v11.0 §4.4):
 *   - AssetUsage 에서 자산별 wonProject=true/false 집계 (null 제외)
 *   - winRate = Laplace smoothing: (wins + 1) / (total + 2)
 *   - half-life decay: 1년 미인용은 weight 0.5 로 감쇠 (선택)
 *
 * LLM 호출 X. 순수 DB 집계. ~10초.
 *
 * 사용:
 *   npx tsx scripts/cron-update-winrate.ts --dry-run
 *   npx tsx scripts/cron-update-winrate.ts             # 실제 업데이트
 *   npx tsx scripts/cron-update-winrate.ts --decay-days 365
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

const argv = process.argv.slice(2)
function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const DRY_RUN = argv.includes('--dry-run')
const DECAY_DAYS = parseInt(arg('--decay-days', '365'), 10)
const MIN_USAGES = parseInt(arg('--min-usages', '1'), 10)

const DAY_MS = 24 * 60 * 60 * 1000

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ W19 — ContentAsset.winRate 매주 재계산')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}`)
  console.log(`Half-life decay: ${DECAY_DAYS}일 · min-usages: ${MIN_USAGES}`)
  console.log('')

  // 1. wonProject 가 결정된 모든 AssetUsage 가져오기
  const usages = await prisma.assetUsage.findMany({
    where: { wonProject: { not: null } },
    select: {
      assetId: true,
      wonProject: true,
      createdAt: true,
      rejectedByPm: true,
    },
  })
  console.log(`📦 AssetUsage rows (wonProject 결정): ${usages.length}건`)

  if (usages.length === 0) {
    console.log('  (still no labeled usages — Phase B 본격 가동 전)')
    console.log('  → endpoint /api/express/asset-usage 통해 인용 → Project.isBidWon 갱신 후 재실행')
    await prisma.$disconnect()
    return
  }

  // 2. 자산별 가중 집계 (decay)
  const now = Date.now()
  const halfLifeMs = DECAY_DAYS * DAY_MS

  const agg = new Map<
    string,
    { weightedWins: number; weightedTotal: number; rawWins: number; rawTotal: number }
  >()

  for (const u of usages) {
    if (u.rejectedByPm) continue // 부정 신호는 별도 처리

    const ageMs = now - u.createdAt.getTime()
    const decay = Math.pow(0.5, ageMs / halfLifeMs) // half-life decay
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

  console.log(`📦 자산별 집계 완료: ${agg.size}개 자산`)

  // 3. Laplace smoothing 으로 winRate 계산
  const updates: { assetId: string; winRate: number; rawWins: number; rawTotal: number }[] = []
  for (const [assetId, a] of agg) {
    if (a.rawTotal < MIN_USAGES) continue // 최소 인용 횟수 미달 skip
    const winRate = (a.weightedWins + 1) / (a.weightedTotal + 2) // Laplace
    updates.push({ assetId, winRate, rawWins: a.rawWins, rawTotal: a.rawTotal })
  }
  updates.sort((a, b) => b.winRate - a.winRate)
  console.log(`📦 winRate 갱신 대상: ${updates.length}건`)
  console.log('')

  // 4. sample 출력
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🏆 Top 10 winRate (laplace + half-life decay)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (updates.length > 0) {
    const topIds = updates.slice(0, 10).map((u) => u.assetId)
    const topAssets = await prisma.contentAsset.findMany({
      where: { id: { in: topIds } },
      select: { id: true, name: true, assetType: true, sourceTier: true },
    })
    const byId = new Map(topAssets.map((a) => [a.id, a]))
    for (const u of updates.slice(0, 10)) {
      const a = byId.get(u.assetId)
      console.log(
        `  ${u.winRate.toFixed(3)} · ${u.rawWins}/${u.rawTotal} · [${a?.assetType?.padEnd(11)}] ${a?.name.slice(0, 60) ?? u.assetId}`,
      )
    }
  }
  console.log('')

  if (DRY_RUN) {
    console.log('✓ dry-run — DB 변경 X')
    await prisma.$disconnect()
    return
  }

  // 5. DB update — 일괄
  console.log('💾 ContentAsset.winRate 업데이트 중...')
  let updated = 0
  for (const u of updates) {
    await prisma.contentAsset.update({
      where: { id: u.assetId },
      data: { winRate: u.winRate },
    })
    updated++
    if (updated % 50 === 0) console.log(`   ${updated}/${updates.length}`)
  }
  console.log(`   ✓ ${updated} 자산 winRate 갱신`)

  // 6. null 처리 — usages 없는 자산은 winRate=null 로 (clean state)
  if (updates.length > 0) {
    const reset = await prisma.contentAsset.updateMany({
      where: {
        id: { notIn: updates.map((u) => u.assetId) },
        winRate: { not: null },
      },
      data: { winRate: null },
    })
    console.log(`   ✓ ${reset.count} 자산 winRate→null (인용 데이터 없음)`)
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`AssetUsage labeled rows: ${usages.length}`)
  console.log(`Aggregated assets:       ${agg.size}`)
  console.log(`Updated (≥${MIN_USAGES} usages): ${updated}`)
  console.log('')
  console.log('✓ winrate cron 완료')

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

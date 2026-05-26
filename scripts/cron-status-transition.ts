/**
 * scripts/cron-status-transition.ts — W20 (Phase B, Self-Evolution)
 *
 * ContentAsset.status time-decay 자동 전환.
 *
 * 룰:
 *   - lastUsedAt (= MAX AssetUsage.createdAt or createdAt fallback)
 *   - 1년 미사용 + status='stable' → 'developing' (강등 1단)
 *   - 2년 미사용 + status='developing' → 'archived' (강등 2단)
 *   - 보호: sourceTier='high' (회사 핵심 IP) 는 절대 강등 X
 *   - 보호: assetType='methodology' + sourceTier='high' 는 영구 보존
 *   - 부활: 최근 30일 안에 인용 발생 → 'archived' → 'developing' (자동 복원)
 *
 * 의미: 살아있는 brain — 안 쓰이는 자산은 자동 후순위, 다시 쓰이면 부활.
 *
 * 사용:
 *   npx tsx scripts/cron-status-transition.ts --dry-run
 *   npx tsx scripts/cron-status-transition.ts --demote-days 365 --archive-days 730
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
const DEMOTE_DAYS = parseInt(arg('--demote-days', '365'), 10)
const ARCHIVE_DAYS = parseInt(arg('--archive-days', '730'), 10)
const REVIVE_DAYS = parseInt(arg('--revive-days', '30'), 10)

const DAY_MS = 24 * 60 * 60 * 1000

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ W20 — ContentAsset.status time-decay 자동 전환')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}`)
  console.log(`demote: ${DEMOTE_DAYS}일 · archive: ${ARCHIVE_DAYS}일 · revive: ${REVIVE_DAYS}일`)
  console.log('')

  const now = Date.now()
  const demoteThreshold = new Date(now - DEMOTE_DAYS * DAY_MS)
  const archiveThreshold = new Date(now - ARCHIVE_DAYS * DAY_MS)
  const reviveThreshold = new Date(now - REVIVE_DAYS * DAY_MS)

  // 1. 모든 active 자산 + 최근 사용 시점
  const allAssets = await prisma.contentAsset.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      sourceTier: true,
      assetType: true,
      createdAt: true,
      lastReviewedAt: true,
      usages: {
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })
  console.log(`📦 전체 ContentAsset: ${allAssets.length}건`)

  // 2. lastUsedAt 계산 — 인용 있으면 인용일, 없으면 createdAt
  const withMeta = allAssets.map((a) => ({
    ...a,
    lastUsedAt: a.usages[0]?.createdAt ?? a.createdAt,
    isProtected: a.sourceTier === 'high',
  }))

  // 3. 분류
  const toDemote = withMeta.filter(
    (a) =>
      !a.isProtected && a.status === 'stable' && a.lastUsedAt < demoteThreshold,
  )
  const toArchive = withMeta.filter(
    (a) =>
      !a.isProtected && a.status === 'developing' && a.lastUsedAt < archiveThreshold,
  )
  const toRevive = withMeta.filter(
    (a) => a.status === 'archived' && a.lastUsedAt >= reviveThreshold,
  )

  console.log(`📦 분류:`)
  console.log(`   stable → developing: ${toDemote.length}건 (${DEMOTE_DAYS}일 미사용)`)
  console.log(`   developing → archived: ${toArchive.length}건 (${ARCHIVE_DAYS}일 미사용)`)
  console.log(`   archived → developing (revive): ${toRevive.length}건 (${REVIVE_DAYS}일 안 인용)`)
  console.log(`   보호 (sourceTier=high): ${withMeta.filter((a) => a.isProtected).length}건`)
  console.log('')

  // 4. sample
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔻 Demote sample (5)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const a of toDemote.slice(0, 5)) {
    const daysAgo = Math.floor((now - a.lastUsedAt.getTime()) / DAY_MS)
    console.log(`  [${a.assetType?.padEnd(11)}] ${a.name.slice(0, 55)} (${daysAgo}일 전)`)
  }
  if (toRevive.length > 0) {
    console.log('')
    console.log('🌱 Revive sample (5)')
    for (const a of toRevive.slice(0, 5)) {
      const daysAgo = Math.floor((now - a.lastUsedAt.getTime()) / DAY_MS)
      console.log(`  [${a.assetType?.padEnd(11)}] ${a.name.slice(0, 55)} (${daysAgo}일 전 인용)`)
    }
  }
  console.log('')

  if (DRY_RUN) {
    console.log('✓ dry-run — DB 변경 X')
    await prisma.$disconnect()
    return
  }

  // 5. 일괄 update
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

  console.log(`💾 적용 완료:`)
  console.log(`   demote:  ${demoteResult.count}`)
  console.log(`   archive: ${archiveResult.count}`)
  console.log(`   revive:  ${reviveResult.count}`)
  console.log('')
  console.log('✓ status-transition cron 완료')

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

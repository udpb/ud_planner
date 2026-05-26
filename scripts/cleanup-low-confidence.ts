/**
 * scripts/cleanup-low-confidence.ts — 낮은 confidence 패턴 제거
 *
 * 사용법:
 *   # 특정 patternId 들 삭제
 *   npx tsx scripts/cleanup-low-confidence.ts cmpjy2a7m002ehovcji7brcfk cmpjy4aau002uhovcwapnuw4u
 *
 *   # 또는 확신도 threshold 미만 자동 색출 (현재 미구현 — 단순 ID 기반)
 *
 * 흐름:
 *   1. WinningPattern → contentRefs 가져옴
 *   2. ContentAsset 들 deleteMany (cascade 로 AssetUsage 도 함께)
 *   3. WinningPattern delete
 *   4. 결과 출력
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

async function main() {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  if (ids.length === 0) {
    console.error('Usage: npx tsx scripts/cleanup-low-confidence.ts <patternId> [<patternId> ...]')
    process.exit(1)
  }

  const { prisma } = await import('../src/lib/prisma')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`▶ Cleanup ${ids.length} WinningPattern(s) + 연결된 ContentAsset`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  let totalAssets = 0
  let totalPatterns = 0
  for (const id of ids) {
    const wp = await prisma.winningPattern.findUnique({
      where: { id },
      select: { sourceProject: true, contentRefs: true },
    })
    if (!wp) {
      console.log(`✗ ${id} — not found`)
      continue
    }
    console.log(`\n[${id}] ${wp.sourceProject}`)
    console.log(`  contentRefs: ${wp.contentRefs.length}개`)
    if (wp.contentRefs.length > 0) {
      const del = await prisma.contentAsset.deleteMany({
        where: { id: { in: wp.contentRefs } },
      })
      console.log(`  ✓ ContentAsset ${del.count}건 삭제 (+ AssetUsage cascade)`)
      totalAssets += del.count
    }
    await prisma.winningPattern.delete({ where: { id } })
    console.log(`  ✓ WinningPattern 삭제`)
    totalPatterns++
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`WinningPattern 삭제: ${totalPatterns}건`)
  console.log(`ContentAsset 삭제: ${totalAssets}건`)
  await prisma.$disconnect()
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.stack : String(e))
    process.exit(1)
  })
  .finally(() => setTimeout(() => process.exit(0), 200))

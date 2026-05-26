/**
 * scripts/dedupe-pattern-sectionkeys.ts — 시드 phase D 의 6 sectionKey 중복 정리
 *
 * 같은 sourceProject 가 sectionKey 별로 6 row 분리된 시드 데이터 — 1 row 만 keep.
 *
 * 정책:
 *   - 같은 sourceProject 중 1 row keep (createdAt 가장 빠른 것)
 *   - 나머지 row 삭제 (contentRefs 가 있는 경우 그것은 keep)
 *
 * 사용:
 *   npx tsx scripts/dedupe-pattern-sectionkeys.ts --dry-run
 *   npx tsx scripts/dedupe-pattern-sectionkeys.ts
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`▶ Dedupe sectionKey 중복  (${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'})`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const patterns = await prisma.winningPattern.findMany({
    select: {
      id: true,
      sourceProject: true,
      sectionKey: true,
      contentRefs: true,
      createdAt: true,
      message: true,
    },
  })
  console.log(`전체 WinningPattern: ${patterns.length}`)

  // 같은 sourceProject 그룹
  const groups = new Map<string, typeof patterns>()
  for (const p of patterns) {
    if (!groups.has(p.sourceProject)) groups.set(p.sourceProject, [])
    groups.get(p.sourceProject)!.push(p)
  }
  const dupGroups = Array.from(groups.entries()).filter(([_, ps]) => ps.length > 1)
  console.log(`중복 그룹: ${dupGroups.length}건`)

  if (dupGroups.length === 0) {
    console.log('✓ 중복 없음')
    await prisma.$disconnect()
    return
  }

  // 각 그룹에서 1 row 만 keep — message 있으면 우선, 없으면 contentRefs 많은 것, 동률이면 createdAt 빠른 것
  const toDelete: typeof patterns = []
  for (const [sp, ps] of dupGroups) {
    const sorted = [...ps].sort((a, b) => {
      const aHasMessage = !!a.message ? 1 : 0
      const bHasMessage = !!b.message ? 1 : 0
      if (aHasMessage !== bHasMessage) return bHasMessage - aHasMessage
      if (a.contentRefs.length !== b.contentRefs.length) return b.contentRefs.length - a.contentRefs.length
      return a.createdAt.getTime() - b.createdAt.getTime()
    })
    const winner = sorted[0]
    console.log(`\n[${sp.slice(0, 60)}] ${ps.length} rows`)
    for (const p of ps) {
      const mark = p.id === winner.id ? '✓ KEEP   ' : '✗ DELETE '
      console.log(`  ${mark} ${p.id}  sectionKey=${p.sectionKey.padEnd(20)} msg=${!!p.message} refs=${p.contentRefs.length}`)
      if (p.id !== winner.id) toDelete.push(p)
    }
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📊 삭제 plan: WinningPattern ${toDelete.length}건`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (DRY_RUN) {
    console.log('\n✓ dry-run')
    await prisma.$disconnect()
    return
  }

  // ContentAsset cross-reference 안전 체크
  for (const p of toDelete) {
    if (p.contentRefs.length > 0) {
      // 다른 패턴이 reference 안 하는 자산만 삭제
      const otherRefs = new Set<string>()
      for (const other of patterns) {
        if (other.id === p.id) continue
        other.contentRefs.forEach((r) => otherRefs.add(r))
      }
      const safe = p.contentRefs.filter((r) => !otherRefs.has(r))
      if (safe.length > 0) {
        const del = await prisma.contentAsset.deleteMany({ where: { id: { in: safe } } })
        console.log(`  🗑  [${p.id}] ContentAsset ${del.count} 삭제`)
      }
    }
    await prisma.winningPattern.delete({ where: { id: p.id } })
  }

  console.log(`\n✓ ${toDelete.length}건 삭제 완료`)
  await prisma.$disconnect()
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => setTimeout(() => process.exit(0), 200))

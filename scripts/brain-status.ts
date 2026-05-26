/**
 * scripts/brain-status.ts — Brain DB 현황 보고
 *
 * Phase B 시작 전/후 비교용.
 */
import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const [a, ac, c, cr, au, wp, pc] = await Promise.all([
    prisma.contentAsset.count(),
    prisma.assetConcept.count(),
    prisma.concept.count(),
    prisma.conceptRelation.count(),
    prisma.assetUsage.count(),
    prisma.winningPattern.count(),
    prisma.patternConcept.count(),
  ])
  const newA = await prisma.contentAsset.count({
    where: { sourceType: 'local-2026', sourceTier: 'high' },
  })
  const un = await prisma.contentAsset.count({
    where: { concepts: { none: {} } },
  })
  const lu = await prisma.assetUsage.count({
    where: { wonProject: { not: null } },
  })
  const byStatus = await prisma.contentAsset.groupBy({
    by: ['status'],
    _count: { id: true },
  })
  const byAssetType = await prisma.contentAsset.groupBy({
    by: ['assetType'],
    _count: { id: true },
  })
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Brain DB 현황')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`ContentAsset:        ${a}`)
  console.log(`  by status:`)
  byStatus.forEach((s) => console.log(`    ${s.status.padEnd(11)} ${s._count.id}`))
  console.log(`  by assetType:`)
  byAssetType.forEach((s) => console.log(`    ${s.assetType.padEnd(11)} ${s._count.id}`))
  console.log(`  local-2026 high:   ${newA}`)
  console.log(`  unmapped:          ${un} (Concept 미매핑)`)
  console.log(``)
  console.log(`Concept (Ontology):  ${c}`)
  console.log(`AssetConcept:        ${ac}`)
  console.log(`ConceptRelation:     ${cr}`)
  console.log(``)
  console.log(`WinningPattern:      ${wp}`)
  console.log(`PatternConcept:      ${pc}`)
  console.log(`AssetUsage:          ${au}`)
  console.log(`  labeled:           ${lu} (wonProject 결정)`)
  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

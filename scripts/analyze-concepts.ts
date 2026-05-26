import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  // Top concepts by assetCount
  const topByAssets = await prisma.concept.findMany({
    orderBy: { assetCount: 'desc' },
    take: 30,
    select: { name: true, type: true, assetCount: true, aliases: true },
  })
  console.log('=== Top 30 Concepts (by assetCount) ===\n')
  for (const c of topByAssets) {
    const aliasStr = c.aliases.length > 0 ? ` [${c.aliases.slice(0, 4).join(', ')}]` : ''
    console.log(`  ${String(c.assetCount).padStart(3)} | ${c.type.padEnd(12)} | ${c.name}${aliasStr}`)
  }

  // 핵심 IP 검색
  console.log('\n=== 핵심 IP 검증 ===')
  const targets = ['ACTT', 'DOGS', '5D', 'GEPXR', '액트프러너', 'AX', 'HEL', 'IMPACT', 'Act-preneur', '4Steps', '6Dimension']
  for (const target of targets) {
    const found = await prisma.concept.findMany({
      where: {
        OR: [
          { name: { contains: target, mode: 'insensitive' } },
          { aliases: { has: target } },
        ],
      },
      select: { name: true, type: true, assetCount: true, aliases: true },
    })
    if (found.length > 0) {
      for (const c of found) {
        console.log(`  ✓ "${target}" → ${c.name} (${c.type}, ${c.assetCount} assets) aliases=[${c.aliases.slice(0, 3).join(', ')}]`)
      }
    } else {
      console.log(`  ✗ "${target}" 미발견`)
    }
  }

  // partnership top
  console.log('\n=== Partnership (발주처) top 15 ===')
  const partnerships = await prisma.concept.findMany({
    where: { type: 'partnership' },
    orderBy: { assetCount: 'desc' },
    take: 15,
    select: { name: true, assetCount: true, aliases: true },
  })
  for (const c of partnerships) {
    const aliasStr = c.aliases.length > 0 ? ` [${c.aliases.slice(0, 3).join(', ')}]` : ''
    console.log(`  ${String(c.assetCount).padStart(3)} | ${c.name}${aliasStr}`)
  }

  // domain top
  console.log('\n=== Domain (산업) top 15 ===')
  const domains = await prisma.concept.findMany({
    where: { type: 'domain' },
    orderBy: { assetCount: 'desc' },
    take: 15,
    select: { name: true, assetCount: true },
  })
  for (const c of domains) {
    console.log(`  ${String(c.assetCount).padStart(3)} | ${c.name}`)
  }

  // 총계
  const total = await prisma.concept.count()
  const ac = await prisma.assetConcept.count()
  const distinctAssetsWithConcepts = await prisma.assetConcept.findMany({
    select: { assetId: true },
    distinct: ['assetId'],
  })
  console.log(`\n=== Summary ===`)
  console.log(`Total Concepts:      ${total}`)
  console.log(`AssetConcept rows:   ${ac}`)
  console.log(`Mapped assets:       ${distinctAssetsWithConcepts.length}`)

  await prisma.$disconnect()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })

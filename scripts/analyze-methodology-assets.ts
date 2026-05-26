import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  const methodology = await prisma.contentAsset.findMany({
    where: { assetType: 'methodology', sourceType: 'drive' },
    select: { name: true, category: true, sourceRef: true, keyNumbers: true, narrativeSnippet: true },
    take: 1000,
  })
  console.log(`=== Total methodology + drive: ${methodology.length} ContentAssets ===\n`)

  const byCategory = new Map<string, number>()
  for (const a of methodology) {
    byCategory.set(a.category, (byCategory.get(a.category) ?? 0) + 1)
  }
  console.log('Category 분포:')
  for (const [k, v] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(15)} ${v}`)
  }

  // 자산 이름 (sourceRef 별로 묶어서)
  const byFile = new Map<string, string[]>()
  for (const a of methodology) {
    const key = a.sourceRef ?? 'unknown'
    if (!byFile.has(key)) byFile.set(key, [])
    byFile.get(key)!.push(a.name)
  }
  console.log(`\n자산 파일 수: ${byFile.size}건`)

  console.log('\n첫 40 자산 이름:')
  methodology.slice(0, 40).forEach((a, i) => {
    console.log(`  [${String(i + 1).padStart(2)}] ${a.name}`)
  })

  // narrativeSnippet 첫 sample (가장 핵심 자산 1건 발췌)
  console.log('\n=== narrativeSnippet sample (첫 3건) ===')
  methodology.slice(0, 3).forEach((a, i) => {
    console.log(`\n[${i + 1}] ${a.name}`)
    console.log(`    ${a.narrativeSnippet.slice(0, 300).replace(/\n/g, ' ')}...`)
  })

  // 전체 DB
  const total = await prisma.contentAsset.count()
  const tProposal = await prisma.contentAsset.count({ where: { assetType: 'proposal' } })
  const tMethod = await prisma.contentAsset.count({ where: { assetType: 'methodology' } })
  console.log('\n=== DB 전체 ContentAsset ===')
  console.log(`  total:       ${total}`)
  console.log(`  proposal:    ${tProposal}`)
  console.log(`  methodology: ${tMethod}`)
  await prisma.$disconnect()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })

/**
 * scripts/auto-demote-superseded.ts — 신규 high tier 자산 → 기존 자산 자동 demote
 *
 * 흐름:
 *   1. sourceType='local-2026' (또는 지정) + sourceTier='high' 자산들의 Concept 추출
 *   2. 그 Concept 들과 연결된 다른 자산 검색 (medium/internal tier, stable status)
 *   3. 그 자산들의 status='developing' 으로 demote
 *
 * 의미: "2026 최신 자료 들어왔으니, 같은 개념의 이전 자료는 참고만"
 *
 * LLM 호출 X. 순수 DB 분석.
 *
 * 사용:
 *   npx tsx scripts/auto-demote-superseded.ts --dry-run
 *   npx tsx scripts/auto-demote-superseded.ts --new-source-type local-2026
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

const argv = process.argv.slice(2)
function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const NEW_SOURCE_TYPE = arg('--new-source-type', 'local-2026')
const NEW_TIER = arg('--new-tier', 'high')
const DRY_RUN = argv.includes('--dry-run')

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ Auto-demote superseded assets (2026 최신 우선)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}`)
  console.log(`Newest tag: sourceType='${NEW_SOURCE_TYPE}' + sourceTier='${NEW_TIER}'`)
  console.log('')

  // 1. 새 자산 (high tier, local-2026) 들의 Concept
  const newAssets = await prisma.contentAsset.findMany({
    where: {
      sourceType: NEW_SOURCE_TYPE,
      sourceTier: NEW_TIER,
      status: 'stable',
    },
    select: {
      id: true,
      name: true,
      concepts: { select: { conceptId: true, isCore: true } },
    },
  })
  console.log(`📦 새 high-tier 자산: ${newAssets.length}건`)

  if (newAssets.length === 0) {
    console.log('  (새 자산 없음 — local-folder-ingest 먼저 실행)')
    await prisma.$disconnect()
    return
  }

  // 2. 새 자산이 연결된 Concept 집계 — isCore=true 만 (핵심 개념만 superseding 효과)
  const supersedingConceptIds = new Set<string>()
  for (const a of newAssets) {
    for (const c of a.concepts) {
      if (c.isCore) supersedingConceptIds.add(c.conceptId)
    }
  }
  console.log(`📦 Superseding Concepts: ${supersedingConceptIds.size}개 (isCore=true)`)

  if (supersedingConceptIds.size === 0) {
    console.log('  (새 자산에 isCore concept 없음 — concept 매핑 먼저)')
    await prisma.$disconnect()
    return
  }

  // 3. 같은 Concept 의 기존 자산 검색 (stable, 새 자산 제외)
  // ⚠ case 자산은 historical evidence 라 demote 안 함 (PRD-Brain §4.2)
  // ⚠ proposal 자산은 historical 수주/낙선 결과라 demote 안 함
  // ⚠ methodology 만 demote 대상 (sourceTier 무관 — 2026 자료가 이전 drive 자료 supersede)
  const newAssetIds = new Set(newAssets.map((a) => a.id))
  const candidatesToDemote = await prisma.contentAsset.findMany({
    where: {
      concepts: {
        some: { conceptId: { in: Array.from(supersedingConceptIds) }, isCore: true },
      },
      sourceType: { not: NEW_SOURCE_TYPE },
      status: 'stable',
      assetType: 'methodology', // methodology 만 (case/proposal/company 보호)
    },
    select: {
      id: true,
      name: true,
      assetType: true,
      sourceTier: true,
      sourceType: true,
      concepts: {
        where: { conceptId: { in: Array.from(supersedingConceptIds) }, isCore: true },
        select: { conceptId: true, concept: { select: { name: true } } },
      },
    },
  })
  const filtered = candidatesToDemote.filter((c) => !newAssetIds.has(c.id))
  console.log(`📦 demote 후보 자산: ${filtered.length}건`)
  console.log('')

  // 4. 출력 sample
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔄 Demote plan (sample 20)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const a of filtered.slice(0, 20)) {
    const conceptNames = a.concepts.slice(0, 3).map((c) => c.concept.name).join(', ')
    console.log(`  [${a.sourceTier?.padEnd(8)}] ${a.sourceType?.padEnd(15)} ${a.name.slice(0, 50)}`)
    console.log(`     → core concepts: ${conceptNames}`)
  }
  if (filtered.length > 20) {
    console.log(`  ... +${filtered.length - 20} more`)
  }

  if (DRY_RUN) {
    console.log('\n✓ dry-run — DB 변경 X')
    await prisma.$disconnect()
    return
  }

  // 5. demote
  console.log('\n🔄 demoting...')
  const result = await prisma.contentAsset.updateMany({
    where: { id: { in: filtered.map((a) => a.id) } },
    data: { status: 'developing' },
  })
  console.log(`   ✓ ${result.count} 자산 → status='developing'`)

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`New superseding assets: ${newAssets.length}`)
  console.log(`Superseding concepts:   ${supersedingConceptIds.size}`)
  console.log(`Demoted assets:         ${result.count}`)
  console.log('')
  console.log('✓ auto-demote 완료')

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

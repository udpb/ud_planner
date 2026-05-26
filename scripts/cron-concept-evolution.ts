/**
 * scripts/cron-concept-evolution.ts — W22 (Phase B, Self-Evolution) ⭐
 *
 * 신규 ContentAsset → 24h 이내 AssetConcept 자동 매핑.
 *
 * 알고리즘:
 *   1. AssetConcept 매핑이 없는 ContentAsset 조회 (또는 since 이후 새 자산)
 *   2. extract-concepts-batch 와 동일한 LLM 추출 + Concept upsert
 *   3. ConceptRelation 자동 추가 (W17 로직 재사용 — 새 자산이 추가한 쌍만)
 *   4. Concept.assetCount, lastUsedAt 자동 갱신
 *
 * 의미: brain 의 entity graph 가 새 자산 ingest 즉시 진화. PM 이 수동으로
 *       extract-concepts-batch 돌릴 필요 없음.
 *
 * 사용:
 *   npx tsx scripts/cron-concept-evolution.ts --dry-run
 *   npx tsx scripts/cron-concept-evolution.ts --since-hours 24
 *   npx tsx scripts/cron-concept-evolution.ts --batch-size 15
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

type PrismaModule = typeof import('../src/lib/prisma')
type ConceptModule = typeof import('../src/lib/inference/concept-extractor')
type VectorModule = typeof import('../src/lib/inference/vector-utils')

let prisma: PrismaModule['prisma']
let extractConcepts: ConceptModule['extractConcepts']
let embed: VectorModule['embed']

const argv = process.argv.slice(2)
function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const DRY_RUN = argv.includes('--dry-run')
const BATCH_SIZE = parseInt(arg('--batch-size', '15'), 10)
const SINCE_HOURS = parseInt(arg('--since-hours', '0'), 10) // 0 = 모든 미매핑
const LIMIT = parseInt(arg('--limit', '0'), 10)

function normalizeName(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase()
}

async function main() {
  const [pm, cm, vm] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/lib/inference/concept-extractor'),
    import('../src/lib/inference/vector-utils'),
  ])
  prisma = pm.prisma
  extractConcepts = cm.extractConcepts
  embed = vm.embed

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ W22 — Concept 자가 진화 cron')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(
    `Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'} · batch=${BATCH_SIZE} · since=${SINCE_HOURS}h · limit=${LIMIT || '∞'}`,
  )
  console.log('')

  // 1. 매핑되지 않은 자산 + (선택) since 이내 생성된 자산
  const since =
    SINCE_HOURS > 0 ? new Date(Date.now() - SINCE_HOURS * 60 * 60 * 1000) : null

  const where: Record<string, unknown> = {
    concepts: { none: {} }, // AssetConcept 매핑이 없는 자산
  }
  if (since) where.createdAt = { gte: since }

  const targets = await prisma.contentAsset.findMany({
    where,
    select: {
      id: true,
      name: true,
      narrativeSnippet: true,
      assetType: true,
    },
    orderBy: { createdAt: 'desc' },
    take: LIMIT > 0 ? LIMIT : undefined,
  })

  console.log(`📦 매핑되지 않은 자산: ${targets.length}건`)
  if (targets.length === 0) {
    console.log('  (모든 자산이 이미 Concept 매핑됨 — 신규 ingest 후 재실행)')
    await prisma.$disconnect()
    return
  }

  // 2. 기존 Concept cache
  const existing = await prisma.concept.findMany({
    select: { id: true, name: true, aliases: true },
  })
  const byName = new Map<string, string>()
  const aliasMap = new Map<string, string>()
  for (const c of existing) {
    byName.set(normalizeName(c.name), c.id)
    for (const a of c.aliases) aliasMap.set(normalizeName(a), normalizeName(c.name))
  }
  console.log(`📚 기존 Concept: ${existing.length}개`)
  console.log('')

  // 3. batch 처리
  const batches: typeof targets[] = []
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    batches.push(targets.slice(i, i + BATCH_SIZE))
  }
  console.log(`📦 batch ${batches.length}개 (각 ${BATCH_SIZE}건)`)
  console.log('')

  let totalConceptsCreated = 0
  let totalMappingsCreated = 0
  let totalBatchFailures = 0
  const startedAt = Date.now()

  const affectedConceptIds = new Set<string>()
  const affectedAssetIds = new Set<string>()

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    console.log(`[batch ${bi + 1}/${batches.length}] ${batch.length}건`)

    let result: Awaited<ReturnType<typeof extractConcepts>>
    try {
      const hint = await prisma.concept.findMany({
        select: { name: true, aliases: true, type: true },
        take: 50,
      })
      result = await extractConcepts({
        assets: batch.map((a) => ({
          id: a.id,
          name: a.name,
          narrativeSnippet: a.narrativeSnippet,
          assetType: a.assetType,
        })),
        existingConcepts: hint,
      })
      console.log(
        `  ✓ ${batch.length}자산 → ${result.concepts.length}개념 · ${result.mappings.length}매핑 · conf ${result.confidence.toFixed(2)}`,
      )
    } catch (e) {
      totalBatchFailures++
      console.error(`  ✗ batch fail (skip): ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`)
      continue
    }

    if (DRY_RUN) {
      result.concepts.slice(0, 5).forEach((c) =>
        console.log(`    📖 ${c.name} (${c.type}) ${c.aliases.length}aliases`),
      )
      continue
    }

    // 4. Concept upsert
    const idMap = new Map<string, string>()
    for (const concept of result.concepts) {
      const canonical = normalizeName(concept.name)
      const existingId =
        byName.get(canonical) ?? (aliasMap.has(canonical) ? byName.get(aliasMap.get(canonical)!) : undefined)
      if (existingId) {
        idMap.set(canonical, existingId)
        // alias 보강
        if (concept.aliases.length > 0) {
          const dbConcept = await prisma.concept.findUnique({ where: { id: existingId } })
          if (dbConcept) {
            const merged = Array.from(new Set([...dbConcept.aliases, ...concept.aliases]))
            if (merged.length !== dbConcept.aliases.length) {
              await prisma.concept.update({
                where: { id: existingId },
                data: { aliases: merged, updatedAt: new Date() },
              })
            }
          }
        }
        continue
      }
      const embText = `${concept.name} ${concept.description ?? ''} ${concept.aliases.join(' ')}`
      const emb = await embed(embText)
      const created = await prisma.concept.create({
        data: {
          name: concept.name,
          type: concept.type,
          description: concept.description ?? null,
          aliases: concept.aliases,
          embedding: emb,
          embeddingModel: 'gemini-embedding-001',
          embeddedAt: new Date(),
        },
      })
      byName.set(canonical, created.id)
      for (const a of concept.aliases) aliasMap.set(normalizeName(a), canonical)
      idMap.set(canonical, created.id)
      totalConceptsCreated++
    }

    // 5. AssetConcept 생성
    for (const mapping of result.mappings) {
      if (!batch.find((a) => a.id === mapping.assetId)) continue
      affectedAssetIds.add(mapping.assetId)
      for (const c of mapping.concepts) {
        const canonical = normalizeName(c.name)
        const conceptId =
          idMap.get(canonical) ??
          byName.get(canonical) ??
          (aliasMap.has(canonical) ? byName.get(aliasMap.get(canonical)!) : undefined)
        if (!conceptId) continue
        try {
          await prisma.assetConcept.create({
            data: {
              assetId: mapping.assetId,
              conceptId,
              weight: c.weight,
              isCore: c.isCore,
            },
          })
          totalMappingsCreated++
          affectedConceptIds.add(conceptId)
        } catch {
          /* 중복 무시 */
        }
      }
    }
  }

  // 6. Concept stats 갱신 (assetCount, lastUsedAt)
  if (!DRY_RUN && affectedConceptIds.size > 0) {
    console.log('')
    console.log(`📊 Concept stats 갱신 중 (${affectedConceptIds.size}개)...`)
    for (const cid of affectedConceptIds) {
      const count = await prisma.assetConcept.count({ where: { conceptId: cid } })
      await prisma.concept.update({
        where: { id: cid },
        data: { assetCount: count, lastUsedAt: new Date() },
      })
    }
    console.log(`   ✓ ${affectedConceptIds.size} Concept 갱신`)
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Concept Evolution Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Batches:               ${batches.length}`)
  console.log(`Batch failures:        ${totalBatchFailures}`)
  console.log(`Affected assets:       ${affectedAssetIds.size}`)
  console.log(`New Concepts:          ${totalConceptsCreated}`)
  console.log(`New AssetConcepts:     ${totalMappingsCreated}`)
  console.log(`Elapsed:               ${Math.floor(elapsedSec / 60)}분 ${elapsedSec % 60}초`)
  console.log('')
  console.log(DRY_RUN ? '✓ dry-run 완료' : '✓ concept evolution cron 완료')
  console.log('  → 이어서: npx tsx scripts/build-concept-relations.ts (관계 그래프 refresh)')

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

/**
 * scripts/extract-concepts-batch.ts — Concept 자동 추출 (W14, Layer 3)
 *
 * 모든 ContentAsset → batch 단위로 LLM 호출 → Concept entity + AssetConcept relations 생성.
 *
 * 흐름:
 *   1. ContentAsset 가져옴 (batch 15개씩)
 *   2. 첫 batch: 기존 concept 없이 추출
 *   3. 이후 batch: 누적된 concept 정규화 hint 로 통합 학습
 *   4. concept 정규화 (canonical name → aliases) + DB upsert
 *   5. AssetConcept relations 생성
 *
 * 사용:
 *   npx tsx scripts/extract-concepts-batch.ts --dry-run --limit 30 --batch-size 15
 *   npx tsx scripts/extract-concepts-batch.ts --batch-size 15
 *
 * 옵션:
 *   --batch-size N    (default 15)
 *   --limit N         최대 자산 수 (default 무제한)
 *   --start N         resume (default 1)
 *   --dry-run         DB 변경 X
 *   --asset-type      'proposal'|'methodology'|'case'|'company' (default 모두)
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

async function loadHeavy() {
  const [p, c, v] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/lib/inference/concept-extractor'),
    import('../src/lib/inference/vector-utils'),
  ])
  prisma = p.prisma
  extractConcepts = c.extractConcepts
  embed = v.embed
}

// ─────────────────────────────────────────
// CLI
// ─────────────────────────────────────────

const argv = process.argv.slice(2)
function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const BATCH_SIZE = parseInt(arg('--batch-size', '15'), 10)
const LIMIT = parseInt(arg('--limit', '0'), 10)
const START = parseInt(arg('--start', '1'), 10)
const DRY_RUN = argv.includes('--dry-run')
const ASSET_TYPE = arg('--asset-type', '')

// ─────────────────────────────────────────
// Concept normalize helpers
// ─────────────────────────────────────────

function normalizeName(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase()
}

interface ConceptCache {
  /** canonical name (lowered) → DB id */
  byName: Map<string, string>
  /** alias (lowered) → canonical name (lowered) */
  aliasMap: Map<string, string>
}

async function loadExistingConcepts(): Promise<ConceptCache> {
  const all = await prisma.concept.findMany({
    select: { id: true, name: true, aliases: true },
  })
  const byName = new Map<string, string>()
  const aliasMap = new Map<string, string>()
  for (const c of all) {
    const canonical = normalizeName(c.name)
    byName.set(canonical, c.id)
    for (const a of c.aliases) {
      aliasMap.set(normalizeName(a), canonical)
    }
  }
  return { byName, aliasMap }
}

function resolveConceptName(name: string, cache: ConceptCache): string | null {
  const norm = normalizeName(name)
  if (cache.byName.has(norm)) return norm
  if (cache.aliasMap.has(norm)) return cache.aliasMap.get(norm)!
  return null
}

// ─────────────────────────────────────────
// main
// ─────────────────────────────────────────

async function main() {
  await loadHeavy()

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ Concept extraction — W14 Layer 3 Ontology')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}  · batch=${BATCH_SIZE}  limit=${LIMIT || '∞'}  start=${START}`)
  console.log(`AssetType filter: ${ASSET_TYPE || 'all'}`)
  console.log('')

  // 자산 로드 — concept 이 아직 매핑되지 않은 것 우선
  const where = ASSET_TYPE ? { assetType: ASSET_TYPE } : {}
  const all = await prisma.contentAsset.findMany({
    where,
    select: {
      id: true,
      name: true,
      narrativeSnippet: true,
      assetType: true,
    },
    orderBy: { lastReviewedAt: 'desc' },
  })
  console.log(`📦 전체 ContentAsset: ${all.length}건`)

  // 이미 매핑된 자산 제외 (dedupe)
  const existingMappings = await prisma.assetConcept.findMany({
    select: { assetId: true },
    distinct: ['assetId'],
  })
  const mappedAssetIds = new Set(existingMappings.map((m) => m.assetId))
  console.log(`📦 이미 concept 매핑된 자산: ${mappedAssetIds.size}건 (skip)`)
  const targets = all.filter((a) => !mappedAssetIds.has(a.id))
  console.log(`📦 처리 대상: ${targets.length}건`)

  // start/limit
  const startIdx = Math.max(0, START - 1)
  const endIdx = LIMIT > 0 ? Math.min(targets.length, startIdx + LIMIT) : targets.length
  const slice = targets.slice(startIdx, endIdx)
  console.log(`📋 실제 처리: ${slice.length}건 (start=${START} limit=${LIMIT || '∞'})`)
  console.log('')

  // 기존 Concept cache (정규화 hint)
  const cache = await loadExistingConcepts()
  console.log(`📚 기존 Concept: ${cache.byName.size}개 (alias ${cache.aliasMap.size}개 포함)`)
  console.log('')

  // batch 처리
  const batches: typeof slice[] = []
  for (let i = 0; i < slice.length; i += BATCH_SIZE) {
    batches.push(slice.slice(i, i + BATCH_SIZE))
  }
  console.log(`📦 batch ${batches.length}개 (각 ${BATCH_SIZE}건)`)
  console.log('')

  let totalConceptsCreated = 0
  let totalMappingsCreated = 0
  let totalLLMCalls = 0
  const startedAt = Date.now()

  let totalBatchFailures = 0
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    console.log(`\n[batch ${bi + 1}/${batches.length}] ${batch.length}건 ━━━━━━━━━━━━━━━━━━`)

    // 1. LLM 호출 (batch 단위 try/catch — 한 batch fail 해도 다음 계속)
    let result: Awaited<ReturnType<typeof extractConcepts>>
    try {
      const existingForHint = await prisma.concept.findMany({
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
        existingConcepts: existingForHint,
      })
      totalLLMCalls++
      console.log(`  ✓ ${batch.length} 자산 → ${result.concepts.length} 개념 발견 · ${result.mappings.length} 매핑 · confidence ${result.confidence.toFixed(2)}`)
    } catch (e) {
      totalBatchFailures++
      console.error(`  ✗ batch fail (skip, 계속 진행): ${e instanceof Error ? e.message.slice(0, 150) : String(e)}`)
      continue
    }

    if (DRY_RUN) {
      // dry-run sample
      result.concepts.slice(0, 8).forEach((c) => {
        console.log(`    📖 ${c.name} (${c.type}) aliases=[${c.aliases.join(', ')}]`)
      })
      continue
    }

    // 2. Concept upsert (정규화)
    const conceptIdMap = new Map<string, string>() // canonical name (lowered) → concept.id

    for (const concept of result.concepts) {
      // 이미 있는 개념?
      const existing = resolveConceptName(concept.name, cache)
      if (existing) {
        conceptIdMap.set(normalizeName(concept.name), cache.byName.get(existing)!)
        // alias 보강 (있으면 update)
        if (concept.aliases.length > 0) {
          const existingConcept = await prisma.concept.findFirst({
            where: { name: { equals: concept.name, mode: 'insensitive' } },
          })
          if (existingConcept) {
            const merged = Array.from(new Set([...existingConcept.aliases, ...concept.aliases]))
            if (merged.length !== existingConcept.aliases.length) {
              await prisma.concept.update({
                where: { id: existingConcept.id },
                data: { aliases: merged },
              })
            }
          }
        }
        continue
      }
      // 새 Concept 생성 — embedding 포함
      const embeddingText = `${concept.name} ${concept.description ?? ''} ${concept.aliases.join(' ')}`
      const emb = await embed(embeddingText)
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
      cache.byName.set(normalizeName(concept.name), created.id)
      for (const a of concept.aliases) {
        cache.aliasMap.set(normalizeName(a), normalizeName(concept.name))
      }
      conceptIdMap.set(normalizeName(concept.name), created.id)
      totalConceptsCreated++
    }
    console.log(`  📚 Concept 생성: +${result.concepts.length} 시도, 신규 ${conceptIdMap.size}개`)

    // 3. AssetConcept relations 생성
    for (const mapping of result.mappings) {
      if (!batch.find((a) => a.id === mapping.assetId)) {
        // LLM 이 잘못된 assetId 반환 (hallucination)
        continue
      }
      for (const c of mapping.concepts) {
        const conceptId =
          conceptIdMap.get(normalizeName(c.name)) ??
          cache.byName.get(normalizeName(c.name)) ??
          (cache.aliasMap.has(normalizeName(c.name)) ? cache.byName.get(cache.aliasMap.get(normalizeName(c.name))!) : undefined)
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
        } catch (e) {
          // 중복 등 무시
        }
      }
    }
    console.log(`  🔗 AssetConcept: 누적 ${totalMappingsCreated} 매핑`)
  }

  // 통계 갱신 (assetCount)
  if (!DRY_RUN) {
    console.log('\n📊 Concept 통계 갱신 중...')
    const allConcepts = await prisma.concept.findMany({ select: { id: true } })
    for (const c of allConcepts) {
      const count = await prisma.assetConcept.count({ where: { conceptId: c.id } })
      await prisma.concept.update({
        where: { id: c.id },
        data: { assetCount: count },
      })
    }
    console.log(`   ✓ ${allConcepts.length} Concept 통계 갱신`)
  }

  // Summary
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Concept Extraction Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Total batches:        ${batches.length}`)
  console.log(`LLM calls (success):  ${totalLLMCalls}`)
  console.log(`Batch failures:       ${totalBatchFailures}`)
  console.log(`Concepts created:     ${totalConceptsCreated}`)
  console.log(`AssetConcept created: ${totalMappingsCreated}`)
  console.log(`Total elapsed:        ${Math.floor(elapsedSec / 60)}분 ${elapsedSec % 60}초`)

  if (!DRY_RUN) {
    const finalConcepts = await prisma.concept.count()
    const byType = await prisma.concept.groupBy({
      by: ['type'],
      _count: { id: true },
    })
    console.log(`\n=== DB Concept ===`)
    console.log(`Total: ${finalConcepts}`)
    for (const t of byType) {
      console.log(`  ${t.type.padEnd(15)} ${t._count.id}`)
    }
  }
  console.log('')
  console.log(DRY_RUN ? '✓ dry-run 완료' : '✓ concept extraction 완료')

  await prisma.$disconnect()
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.stack : String(e))
    process.exit(1)
  })
  .finally(() => setTimeout(() => process.exit(0), 200))

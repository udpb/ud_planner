/**
 * scripts/extract-pattern-concepts.ts — Pattern → Concept 매핑 (W16, Layer 3 Ontology)
 *
 * WinningPattern 의 sourceProject + message (slogan, keyMessages, beforeAfter) + snippet
 * → LLM 으로 Concept 추출 → PatternConcept relation create.
 *
 * concept-extractor 를 재사용 — input 만 Pattern → Asset format 으로 변환.
 *
 * 사용:
 *   npx tsx scripts/extract-pattern-concepts.ts --dry-run --limit 15
 *   npx tsx scripts/extract-pattern-concepts.ts --batch-size 15
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

type PrismaModule = typeof import('../src/lib/prisma')
type ConceptModule = typeof import('../src/lib/inference/concept-extractor')

let prisma: PrismaModule['prisma']
let extractConcepts: ConceptModule['extractConcepts']

async function loadHeavy() {
  const [p, c] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/lib/inference/concept-extractor'),
  ])
  prisma = p.prisma
  extractConcepts = c.extractConcepts
}

// CLI
const argv = process.argv.slice(2)
function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const BATCH_SIZE = parseInt(arg('--batch-size', '15'), 10)
const LIMIT = parseInt(arg('--limit', '0'), 10)
const START = parseInt(arg('--start', '1'), 10)
const DRY_RUN = argv.includes('--dry-run')

// ─────────────────────────────────────────
// Normalize helpers (concept-extractor 의 cache 와 호환)
// ─────────────────────────────────────────

function normalizeName(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase()
}

interface ConceptCache {
  byName: Map<string, string>
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

interface MessageShape {
  slogan?: string
  keyMessages?: string[]
  beforeAfter?: { before?: string; after?: string }
}

/**
 * WinningPattern.message (Json) + snippet 을 LLM input narrative 로 변환.
 */
function patternToNarrative(p: {
  sourceProject: string
  message: unknown
  snippet: string | null
}): string {
  const msg = (p.message ?? {}) as MessageShape
  const parts: string[] = []
  if (msg.slogan) parts.push(`Slogan: ${msg.slogan}`)
  if (msg.keyMessages && msg.keyMessages.length > 0) {
    parts.push(`Key Messages: ${msg.keyMessages.join(' / ')}`)
  }
  if (msg.beforeAfter?.before) parts.push(`Before: ${msg.beforeAfter.before}`)
  if (msg.beforeAfter?.after) parts.push(`After: ${msg.beforeAfter.after}`)
  if (p.snippet) parts.push(`Snippet: ${p.snippet.slice(0, 500)}`)
  return parts.join('\n')
}

// ─────────────────────────────────────────
// main
// ─────────────────────────────────────────

async function main() {
  await loadHeavy()

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ Pattern → Concept extraction — W16')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}  · batch=${BATCH_SIZE}  limit=${LIMIT || '∞'}  start=${START}`)
  console.log('')

  // Pattern 가져옴
  const allPatterns = await prisma.winningPattern.findMany({
    select: {
      id: true,
      sourceProject: true,
      message: true,
      snippet: true,
    },
  })
  console.log(`📦 전체 WinningPattern: ${allPatterns.length}건`)

  // 이미 매핑된 pattern 제외 (dedupe)
  const existingMappings = await prisma.patternConcept.findMany({
    select: { patternId: true },
    distinct: ['patternId'],
  })
  const mappedIds = new Set(existingMappings.map((m) => m.patternId))
  console.log(`📦 이미 매핑된 Pattern: ${mappedIds.size}건 (skip)`)

  const targets = allPatterns.filter((p) => !mappedIds.has(p.id))
  console.log(`📦 처리 대상: ${targets.length}건`)

  // start/limit
  const startIdx = Math.max(0, START - 1)
  const endIdx = LIMIT > 0 ? Math.min(targets.length, startIdx + LIMIT) : targets.length
  const slice = targets.slice(startIdx, endIdx)
  console.log(`📋 실제 처리: ${slice.length}건`)
  console.log('')

  // 기존 Concept cache
  const cache = await loadExistingConcepts()
  console.log(`📚 기존 Concept (cache): ${cache.byName.size}개`)
  console.log('')

  // batch
  const batches: typeof slice[] = []
  for (let i = 0; i < slice.length; i += BATCH_SIZE) {
    batches.push(slice.slice(i, i + BATCH_SIZE))
  }
  console.log(`📦 batch ${batches.length}개`)
  console.log('')

  let totalNewConcepts = 0
  let totalMappings = 0
  let totalLLMCalls = 0
  let totalBatchFailures = 0
  const startedAt = Date.now()

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    console.log(`\n[batch ${bi + 1}/${batches.length}] ${batch.length}건 ━━━━━━━━━━━━━━━━━━`)

    // Pattern → AssetInput 변환 (concept-extractor 호환)
    const inputs = batch.map((p) => ({
      id: p.id,
      name: p.sourceProject,
      narrativeSnippet: patternToNarrative(p),
      assetType: 'pattern', // marker
    }))

    let result: Awaited<ReturnType<typeof extractConcepts>>
    try {
      const existingForHint = await prisma.concept.findMany({
        select: { name: true, aliases: true, type: true },
        take: 80, // 기존 ontology 적극 활용
      })
      result = await extractConcepts({
        assets: inputs,
        existingConcepts: existingForHint,
      })
      totalLLMCalls++
      console.log(`  ✓ ${batch.length} pattern → ${result.concepts.length} concepts · ${result.mappings.length} mappings · confidence ${result.confidence.toFixed(2)}`)
    } catch (e) {
      totalBatchFailures++
      console.error(`  ✗ batch fail (skip): ${e instanceof Error ? e.message.slice(0, 150) : String(e)}`)
      continue
    }

    if (DRY_RUN) {
      result.mappings.slice(0, 4).forEach((m) => {
        const concepts = m.concepts.slice(0, 5).map((c) => `${c.name}${c.isCore ? '*' : ''}`).join(', ')
        console.log(`    📋 pattern ${m.assetId.slice(0, 12)}... → ${concepts}`)
      })
      continue
    }

    // Concept upsert (정규화)
    const conceptIdMap = new Map<string, string>()
    for (const concept of result.concepts) {
      const norm = normalizeName(concept.name)
      // 기존 Concept 매칭
      if (cache.byName.has(norm)) {
        conceptIdMap.set(norm, cache.byName.get(norm)!)
        continue
      }
      if (cache.aliasMap.has(norm)) {
        const canonical = cache.aliasMap.get(norm)!
        conceptIdMap.set(norm, cache.byName.get(canonical)!)
        continue
      }
      // 신규 Concept — but Pattern 에서 추출된 거라 embedding 은 일단 skip (W17 에서 보강)
      try {
        const created = await prisma.concept.create({
          data: {
            name: concept.name,
            type: concept.type,
            description: concept.description ?? null,
            aliases: concept.aliases,
            embedding: [], // 추후 W17 또는 별도 작업
          },
        })
        cache.byName.set(norm, created.id)
        for (const a of concept.aliases) {
          cache.aliasMap.set(normalizeName(a), norm)
        }
        conceptIdMap.set(norm, created.id)
        totalNewConcepts++
      } catch (e) {
        // 동시성 race — 이미 생성된 경우 skip
        continue
      }
    }

    // PatternConcept relations
    for (const mapping of result.mappings) {
      if (!batch.find((p) => p.id === mapping.assetId)) continue
      for (const c of mapping.concepts) {
        const conceptId =
          conceptIdMap.get(normalizeName(c.name)) ??
          cache.byName.get(normalizeName(c.name)) ??
          (cache.aliasMap.has(normalizeName(c.name))
            ? cache.byName.get(cache.aliasMap.get(normalizeName(c.name))!)
            : undefined)
        if (!conceptId) continue
        try {
          await prisma.patternConcept.create({
            data: {
              patternId: mapping.assetId,
              conceptId,
              weight: c.weight,
              isCore: c.isCore,
            },
          })
          totalMappings++
        } catch (e) {
          // unique constraint — 무시
        }
      }
    }
    console.log(`  🔗 PatternConcept 누적: ${totalMappings}`)
  }

  // 통계 갱신 — Concept.patternCount
  if (!DRY_RUN) {
    console.log('\n📊 Concept.patternCount 갱신 중...')
    const allConcepts = await prisma.concept.findMany({ select: { id: true } })
    for (const c of allConcepts) {
      const count = await prisma.patternConcept.count({ where: { conceptId: c.id } })
      if (count > 0) {
        await prisma.concept.update({
          where: { id: c.id },
          data: { patternCount: count },
        })
      }
    }
    console.log(`   ✓ ${allConcepts.length} Concept patternCount 갱신`)
  }

  // Summary
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Pattern-Concept Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Total batches:        ${batches.length}`)
  console.log(`LLM success:          ${totalLLMCalls}`)
  console.log(`Batch failures:       ${totalBatchFailures}`)
  console.log(`New concepts:         ${totalNewConcepts}`)
  console.log(`PatternConcept rows:  ${totalMappings}`)
  console.log(`Total elapsed:        ${Math.floor(elapsedSec / 60)}분 ${elapsedSec % 60}초`)
  console.log('')
  console.log(DRY_RUN ? '✓ dry-run 완료' : '✓ pattern concept extraction 완료')

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

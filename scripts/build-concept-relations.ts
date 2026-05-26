/**
 * scripts/build-concept-relations.ts — Concept 간 관계 그래프 (W17, RDF triple)
 *
 * 같은 자산·패턴에 함께 등장하는 Concept 쌍 → co-occurrence 강도 측정 → ConceptRelation 생성.
 *
 * 알고리즘:
 *   1. AssetConcept + PatternConcept 로드
 *   2. 각 entity (asset/pattern) 의 Concept 목록 → 쌍 (i,j) 생성
 *   3. co-occurrence count 누적
 *   4. strength = coOccurCount / max(from.totalCount, to.totalCount)
 *   5. strength > threshold (default 0.2) 인 쌍만 저장
 *
 * 양방향 무시 — (A,B) == (B,A) 의 단일 row.
 *
 * LLM 호출 X. 순수 in-memory 분석. ~1초.
 *
 * 사용:
 *   npx tsx scripts/build-concept-relations.ts --dry-run
 *   npx tsx scripts/build-concept-relations.ts --min-strength 0.2 --min-cooccur 3
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

const argv = process.argv.slice(2)
function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const MIN_STRENGTH = parseFloat(arg('--min-strength', '0.2'))
const MIN_COOCCUR = parseInt(arg('--min-cooccur', '3'), 10)
const DRY_RUN = argv.includes('--dry-run')

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ Concept Relations 빌드 — W17 (RDF triple)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}`)
  console.log(`min-strength: ${MIN_STRENGTH} · min-cooccur: ${MIN_COOCCUR}`)
  console.log('')

  // 1. AssetConcept + PatternConcept 로드
  console.log('📥 데이터 로드 중...')
  const [assetConcepts, patternConcepts, allConcepts] = await Promise.all([
    prisma.assetConcept.findMany({ select: { assetId: true, conceptId: true } }),
    prisma.patternConcept.findMany({ select: { patternId: true, conceptId: true } }),
    prisma.concept.findMany({ select: { id: true, name: true, type: true } }),
  ])
  const conceptInfo = new Map(allConcepts.map((c) => [c.id, c]))
  console.log(`   AssetConcept: ${assetConcepts.length}`)
  console.log(`   PatternConcept: ${patternConcepts.length}`)
  console.log(`   Concepts: ${allConcepts.length}`)

  // 2. entity 별 conceptId set
  const entityToConcepts = new Map<string, Set<string>>()
  for (const ac of assetConcepts) {
    const key = `a:${ac.assetId}`
    if (!entityToConcepts.has(key)) entityToConcepts.set(key, new Set())
    entityToConcepts.get(key)!.add(ac.conceptId)
  }
  for (const pc of patternConcepts) {
    const key = `p:${pc.patternId}`
    if (!entityToConcepts.has(key)) entityToConcepts.set(key, new Set())
    entityToConcepts.get(key)!.add(pc.conceptId)
  }
  console.log(`   Entities (asset+pattern): ${entityToConcepts.size}`)
  console.log('')

  // 3. concept별 등장 entity 수 (totalCount)
  const conceptTotalCount = new Map<string, number>()
  for (const concepts of entityToConcepts.values()) {
    for (const cid of concepts) {
      conceptTotalCount.set(cid, (conceptTotalCount.get(cid) ?? 0) + 1)
    }
  }

  // 4. concept 쌍 co-occurrence count
  console.log('🔄 co-occurrence 계산 중...')
  const coOccur = new Map<string, number>() // "fromId|toId" (sorted) → count
  let pairCount = 0
  for (const concepts of entityToConcepts.values()) {
    const arr = Array.from(concepts).sort()
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = `${arr[i]}|${arr[j]}`
        coOccur.set(key, (coOccur.get(key) ?? 0) + 1)
        pairCount++
      }
    }
  }
  console.log(`   Concept 쌍 (raw): ${coOccur.size} (총 ${pairCount} 발생)`)

  // 5. strength 계산 + threshold filter
  interface RelationCandidate {
    fromId: string
    toId: string
    coOccurCount: number
    strength: number
    fromName: string
    toName: string
    fromType: string
    toType: string
  }
  const candidates: RelationCandidate[] = []
  for (const [key, count] of coOccur.entries()) {
    if (count < MIN_COOCCUR) continue
    const [a, b] = key.split('|')
    const aCount = conceptTotalCount.get(a) ?? 1
    const bCount = conceptTotalCount.get(b) ?? 1
    const strength = count / Math.max(aCount, bCount)
    if (strength < MIN_STRENGTH) continue
    const aInfo = conceptInfo.get(a)!
    const bInfo = conceptInfo.get(b)!
    candidates.push({
      fromId: a,
      toId: b,
      coOccurCount: count,
      strength,
      fromName: aInfo.name,
      toName: bInfo.name,
      fromType: aInfo.type,
      toType: bInfo.type,
    })
  }
  candidates.sort((x, y) => y.strength - x.strength)
  console.log(`   threshold 통과: ${candidates.length} relations\n`)

  // 6. top 20 sample
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔝 Top 20 Concept Relations (by strength)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const r of candidates.slice(0, 20)) {
    console.log(
      `  ${r.strength.toFixed(2)} × ${String(r.coOccurCount).padStart(3)}× | ` +
      `[${r.fromType.slice(0, 4).padEnd(4)}] ${r.fromName.padEnd(25).slice(0, 25)} ↔ ` +
      `[${r.toType.slice(0, 4).padEnd(4)}] ${r.toName.slice(0, 30)}`,
    )
  }

  if (DRY_RUN) {
    console.log('\n✓ dry-run — DB 변경 X')
    await prisma.$disconnect()
    return
  }

  // 7. ConceptRelation upsert
  console.log('\n📥 DB 저장 중...')
  let created = 0
  let updated = 0
  for (const r of candidates) {
    try {
      await prisma.conceptRelation.upsert({
        where: {
          fromId_toId_type: {
            fromId: r.fromId,
            toId: r.toId,
            type: 'co-occurs',
          },
        },
        update: {
          coOccurCount: r.coOccurCount,
          strength: r.strength,
        },
        create: {
          fromId: r.fromId,
          toId: r.toId,
          type: 'co-occurs',
          coOccurCount: r.coOccurCount,
          strength: r.strength,
        },
      })
      created++
    } catch (e) {
      // ignore
    }
  }
  console.log(`   ✓ ${created} relations 생성/갱신`)

  // Summary
  const totalDB = await prisma.conceptRelation.count()
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Entities analyzed:    ${entityToConcepts.size}`)
  console.log(`Concept pairs (raw):  ${coOccur.size}`)
  console.log(`Threshold pass:       ${candidates.length}`)
  console.log(`DB ConceptRelation:   ${totalDB}`)
  console.log('')
  console.log('✓ concept relations 빌드 완료')

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

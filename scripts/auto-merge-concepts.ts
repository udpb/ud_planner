/**
 * scripts/auto-merge-concepts.ts — W21 (Phase B, Self-Evolution)
 *
 * 의미적으로 동일한 Concept 변형들 자동 병합.
 *
 * 알고리즘:
 *   1. 모든 Concept 의 embedding 코사인 유사도 계산 (O(n²) — 수백 개 OK)
 *   2. similarity ≥ THRESHOLD (default 0.92) 인 페어 → merge 후보
 *   3. 더 많은 asset/pattern 을 가진 쪽이 canonical (winner)
 *   4. winner 에 loser 의 aliases 합산 + AssetConcept·PatternConcept 이전
 *   5. ConceptRelation (양쪽 in/out) 이전 + dedupe
 *   6. loser Concept 삭제
 *
 * DOGS 변형 예: "DOGS", "D.O.G.S", "DOGS 5단계", "Dogs 모델" → 단일 Concept
 *
 * 사용:
 *   npx tsx scripts/auto-merge-concepts.ts --dry-run --threshold 0.92
 *   npx tsx scripts/auto-merge-concepts.ts --threshold 0.95   # 확정 병합
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

const argv = process.argv.slice(2)
function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const DRY_RUN = argv.includes('--dry-run')
const THRESHOLD = parseFloat(arg('--threshold', '0.92'))
const MAX_MERGES = parseInt(arg('--max-merges', '50'), 10)
const SAME_TYPE_ONLY = !argv.includes('--cross-type') // default: 같은 type 만

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ W21 — Concept Auto-merge (similarity ≥ ' + THRESHOLD + ')')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}`)
  console.log(`threshold: ${THRESHOLD} · max-merges: ${MAX_MERGES} · same-type-only: ${SAME_TYPE_ONLY}`)
  console.log('')

  // 1. 임베딩 있는 모든 Concept
  const concepts = await prisma.concept.findMany({
    where: { embeddedAt: { not: null } },
    select: {
      id: true,
      name: true,
      type: true,
      aliases: true,
      embedding: true,
      assetCount: true,
      patternCount: true,
      usageCount: true,
    },
  })
  console.log(`📦 임베딩 있는 Concept: ${concepts.length}개`)

  if (concepts.length < 2) {
    console.log('  (병합 후보 부족)')
    await prisma.$disconnect()
    return
  }

  // 2. 페어 유사도 계산
  console.log('📐 유사도 매트릭스 계산 중...')
  const pairs: {
    a: typeof concepts[0]
    b: typeof concepts[0]
    sim: number
  }[] = []

  for (let i = 0; i < concepts.length; i++) {
    const ci = concepts[i]
    if (!ci.embedding || ci.embedding.length === 0) continue
    for (let j = i + 1; j < concepts.length; j++) {
      const cj = concepts[j]
      if (!cj.embedding || cj.embedding.length === 0) continue
      if (SAME_TYPE_ONLY && ci.type !== cj.type) continue
      const sim = cosine(ci.embedding, cj.embedding)
      if (sim >= THRESHOLD) pairs.push({ a: ci, b: cj, sim })
    }
  }
  pairs.sort((x, y) => y.sim - x.sim)
  console.log(`📐 유사도 ≥ ${THRESHOLD} 페어: ${pairs.length}건`)
  console.log('')

  // 3. 병합 그룹 만들기 (Union-Find 단순화 — 가장 score 높은 winner)
  const merged = new Set<string>() // loser ID 들
  const plan: {
    winner: typeof concepts[0]
    loser: typeof concepts[0]
    sim: number
  }[] = []

  for (const p of pairs) {
    if (merged.has(p.a.id) || merged.has(p.b.id)) continue
    if (plan.length >= MAX_MERGES) break
    // winner: assetCount + patternCount 큰 쪽 (없으면 usageCount, 그래도 같으면 name 짧은 쪽 = canonical 후보)
    const aScore = p.a.assetCount + p.a.patternCount + p.a.usageCount
    const bScore = p.b.assetCount + p.b.patternCount + p.b.usageCount
    let winner: typeof concepts[0]
    let loser: typeof concepts[0]
    if (aScore > bScore) {
      winner = p.a
      loser = p.b
    } else if (bScore > aScore) {
      winner = p.b
      loser = p.a
    } else {
      // tiebreak: name 짧은 쪽 (canonical 가정)
      if (p.a.name.length <= p.b.name.length) {
        winner = p.a
        loser = p.b
      } else {
        winner = p.b
        loser = p.a
      }
    }
    plan.push({ winner, loser, sim: p.sim })
    merged.add(loser.id)
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`🔀 Merge plan (${plan.length}건)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const m of plan.slice(0, 30)) {
    console.log(
      `  sim=${m.sim.toFixed(3)} · ${m.loser.name} (${m.loser.type}, ${m.loser.assetCount}a/${m.loser.patternCount}p) → ${m.winner.name} (${m.winner.assetCount}a/${m.winner.patternCount}p)`,
    )
  }
  if (plan.length > 30) console.log(`  ... +${plan.length - 30} more`)
  console.log('')

  if (DRY_RUN) {
    console.log('✓ dry-run — DB 변경 X')
    console.log('  → npx tsx scripts/auto-merge-concepts.ts --threshold ' + THRESHOLD + '   # 실제 병합')
    await prisma.$disconnect()
    return
  }

  // 4. 실제 병합 — 트랜잭션 per pair
  let merge_ok = 0
  let merge_fail = 0
  for (const m of plan) {
    try {
      await prisma.$transaction(async (tx) => {
        // aliases 합산
        const mergedAliases = Array.from(
          new Set([...m.winner.aliases, ...m.loser.aliases, m.loser.name]),
        )
        await tx.concept.update({
          where: { id: m.winner.id },
          data: { aliases: mergedAliases, updatedAt: new Date() },
        })

        // AssetConcept 이전 (winner 에 중복 row 있으면 skip)
        const existingAC = await tx.assetConcept.findMany({
          where: { conceptId: m.winner.id },
          select: { assetId: true },
        })
        const existingASet = new Set(existingAC.map((x) => x.assetId))
        const losersAC = await tx.assetConcept.findMany({
          where: { conceptId: m.loser.id },
        })
        for (const ac of losersAC) {
          if (existingASet.has(ac.assetId)) {
            await tx.assetConcept.delete({
              where: { assetId_conceptId: { assetId: ac.assetId, conceptId: m.loser.id } },
            })
          } else {
            await tx.assetConcept.update({
              where: { assetId_conceptId: { assetId: ac.assetId, conceptId: m.loser.id } },
              data: { conceptId: m.winner.id },
            })
          }
        }

        // PatternConcept 이전
        const existingPC = await tx.patternConcept.findMany({
          where: { conceptId: m.winner.id },
          select: { patternId: true },
        })
        const existingPSet = new Set(existingPC.map((x) => x.patternId))
        const losersPC = await tx.patternConcept.findMany({
          where: { conceptId: m.loser.id },
        })
        for (const pc of losersPC) {
          if (existingPSet.has(pc.patternId)) {
            await tx.patternConcept.delete({
              where: {
                patternId_conceptId: {
                  patternId: pc.patternId,
                  conceptId: m.loser.id,
                },
              },
            })
          } else {
            await tx.patternConcept.update({
              where: {
                patternId_conceptId: {
                  patternId: pc.patternId,
                  conceptId: m.loser.id,
                },
              },
              data: { conceptId: m.winner.id },
            })
          }
        }

        // ConceptRelation: loser → winner 로 fromId/toId 재배선 (Cascade 로 loser 삭제 시 자동 cleanup 되지만 정보 보존)
        // outgoing: loser 가 from 인 relation
        const outRels = await tx.conceptRelation.findMany({
          where: { fromId: m.loser.id },
        })
        for (const r of outRels) {
          if (r.toId === m.winner.id) {
            // self-loop 방지: 삭제
            await tx.conceptRelation.delete({ where: { id: r.id } })
            continue
          }
          // winner→toId 이미 있으면 strength 합산 후 loser rel 삭제
          const existing = await tx.conceptRelation.findUnique({
            where: { fromId_toId_type: { fromId: m.winner.id, toId: r.toId, type: r.type } },
          })
          if (existing) {
            await tx.conceptRelation.update({
              where: { id: existing.id },
              data: {
                coOccurCount: existing.coOccurCount + r.coOccurCount,
                strength: Math.min(1, Math.max(existing.strength, r.strength)),
              },
            })
            await tx.conceptRelation.delete({ where: { id: r.id } })
          } else {
            await tx.conceptRelation.update({
              where: { id: r.id },
              data: { fromId: m.winner.id },
            })
          }
        }
        // incoming
        const inRels = await tx.conceptRelation.findMany({
          where: { toId: m.loser.id },
        })
        for (const r of inRels) {
          if (r.fromId === m.winner.id) {
            await tx.conceptRelation.delete({ where: { id: r.id } })
            continue
          }
          const existing = await tx.conceptRelation.findUnique({
            where: { fromId_toId_type: { fromId: r.fromId, toId: m.winner.id, type: r.type } },
          })
          if (existing) {
            await tx.conceptRelation.update({
              where: { id: existing.id },
              data: {
                coOccurCount: existing.coOccurCount + r.coOccurCount,
                strength: Math.min(1, Math.max(existing.strength, r.strength)),
              },
            })
            await tx.conceptRelation.delete({ where: { id: r.id } })
          } else {
            await tx.conceptRelation.update({
              where: { id: r.id },
              data: { toId: m.winner.id },
            })
          }
        }

        // loser 삭제 (Cascade 가 남은 row 정리)
        await tx.concept.delete({ where: { id: m.loser.id } })

        // winner stats 갱신
        const [aCount, pCount] = await Promise.all([
          tx.assetConcept.count({ where: { conceptId: m.winner.id } }),
          tx.patternConcept.count({ where: { conceptId: m.winner.id } }),
        ])
        await tx.concept.update({
          where: { id: m.winner.id },
          data: { assetCount: aCount, patternCount: pCount },
        })
      })
      merge_ok++
    } catch (e) {
      merge_fail++
      console.error(
        `  ✗ merge fail ${m.loser.name} → ${m.winner.name}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`,
      )
    }
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Pairs ≥ threshold:  ${pairs.length}`)
  console.log(`Merge plan:         ${plan.length}`)
  console.log(`Success:            ${merge_ok}`)
  console.log(`Fail:               ${merge_fail}`)
  console.log('')
  console.log('✓ auto-merge 완료')

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

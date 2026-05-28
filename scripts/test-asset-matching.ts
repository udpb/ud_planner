/**
 * K3 Verification — 자산 매칭 점수 진단 + saturating keyword score 검증.
 *
 * 진단 결과 (2026-05-29):
 *   - DB ContentAsset 1,765 중 programProfileFit 가 채워진 자산 0건
 *   - 기존 가중치 (profile=0.5/keyword=0.3/section=0.2) 에서 profile 항상 0.5 →
 *     max 점수 0.25(profile) + 0.3(keyword) + 0.1(section) = 0.65 이론, 실제 0.43
 *   - 키워드 매칭 precision (matched/total) 로만 점수 → keywords 많은 자산이 불리
 *
 * K3 fix:
 *   1. saturating score: 3+ 매칭 = 1.0 (precision 과 max)
 *   2. narrativeSnippet bonus: RFP keywords 가 snippet 에 출현하면 +0.1 each (max +0.3)
 *
 * SCORE_WEIGHTS 는 유지 (profile=0.5/keyword=0.3/section=0.2 — ADR-009).
 * programProfileFit 데이터 마이그레이션은 별도 작업.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
for (const file of ['.env', '.env.local']) {
  const envPath = path.join(process.cwd(), file)
  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    process.env[k] = v
  }
}

const SCORE_WEIGHTS = { profile: 0.5, keyword: 0.3, section: 0.2 }

// Old keyword score: precision only
function oldKeywordScore(rfpKws: string[], assetKws: string[], _snippet: string | null): number {
  if (!assetKws.length) return 0
  const haystack = rfpKws.join(' ').toLowerCase()
  const matched = assetKws.filter((k) => haystack.includes(k.toLowerCase()))
  return matched.length / assetKws.length
}

// New keyword score: saturating + snippet semantic match
function newKeywordScore(rfpKws: string[], assetKws: string[], snippet: string | null): number {
  if (!assetKws.length) return 0
  const haystack = rfpKws.join(' ').toLowerCase()
  const matched = assetKws.filter((k) => haystack.includes(k.toLowerCase()))
  const precision = matched.length / assetKws.length
  const saturating = Math.min(matched.length, 3) / 3
  let score = Math.max(precision, saturating)
  if (snippet && rfpKws.length > 0) {
    const snippetLower = snippet.toLowerCase()
    const rfpMatchedInSnippet = rfpKws.filter((k) => snippetLower.includes(k.toLowerCase()))
    if (rfpMatchedInSnippet.length > 0) {
      score = Math.min(1, score + Math.min(rfpMatchedInSnippet.length, 3) * 0.1)
    }
  }
  return score
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  // 현실적 RFP 키워드 — DB 의 자산 keyword 와 overlap 가능 (창업 도메인 전형 키워드)
  const rfpKeywords = [
    '창업', '스타트업', 'MVP', '해커톤', '네트워킹', '실행력',
    'IMPACT', '예비창업패키지', 'AI 활용', '실행 중심', 'KPI', '액트프러너',
    'B2G', '스케일업', '데이터 기반 의사결정',
  ]

  const assets = await prisma.contentAsset.findMany({
    where: { status: 'stable' },
    select: { id: true, name: true, keywords: true, programProfileFit: true, narrativeSnippet: true },
    take: 300,
    orderBy: { createdAt: 'desc' }, // L2 마이그레이션이 가장 최근부터 처리 → 같은 순서로 sample
  })

  console.log(`▶ K3 Verification — ${assets.length}개 자산\n`)

  const profileFitCount = assets.filter(
    (a) => a.programProfileFit && Object.keys(a.programProfileFit as object).length > 0,
  ).length
  console.log(`profileFit 채워진 자산: ${profileFitCount}/${assets.length}`)

  const scoresOld: number[] = []
  const scoresNew: number[] = []
  const examples: { name: string; old: number; nw: number; matched: number; snippet: number }[] = []

  for (const a of assets) {
    const kws = (a.keywords as string[]) ?? []
    const snippet = a.narrativeSnippet
    const oldK = oldKeywordScore(rfpKeywords, kws, snippet)
    const newK = newKeywordScore(rfpKeywords, kws, snippet)

    const profileScore = 0.5 // empty fit → 0.5 neutral
    const sectionScore = 0.5 // no evalStrategy → 0.5 default

    const oldFinal = SCORE_WEIGHTS.profile * profileScore + SCORE_WEIGHTS.keyword * oldK + SCORE_WEIGHTS.section * sectionScore
    const newFinal = SCORE_WEIGHTS.profile * profileScore + SCORE_WEIGHTS.keyword * newK + SCORE_WEIGHTS.section * sectionScore

    scoresOld.push(oldFinal)
    scoresNew.push(newFinal)

    if (newK > 0) {
      const matched = kws.filter((k) => rfpKeywords.join(' ').toLowerCase().includes(k.toLowerCase())).length
      const snippetMatched = snippet
        ? rfpKeywords.filter((k) => snippet.toLowerCase().includes(k.toLowerCase())).length
        : 0
      examples.push({
        name: a.name.slice(0, 50),
        old: oldFinal,
        nw: newFinal,
        matched,
        snippet: snippetMatched,
      })
    }
  }

  scoresOld.sort((a, b) => b - a)
  scoresNew.sort((a, b) => b - a)

  console.log(`\n[기존 keywordScore = matched/total (precision only)]`)
  console.log(`  max: ${scoresOld[0].toFixed(3)}`)
  console.log(`  top10 평균: ${(scoresOld.slice(0, 10).reduce((s, v) => s + v, 0) / 10).toFixed(3)}`)
  console.log(`  ≥0.5 (medium): ${scoresOld.filter((s) => s >= 0.5).length}건`)
  console.log(`  ≥0.7 (strong): ${scoresOld.filter((s) => s >= 0.7).length}건`)

  console.log(`\n[K3 fix keywordScore = max(precision, saturating) + snippet bonus]`)
  console.log(`  max: ${scoresNew[0].toFixed(3)}`)
  console.log(`  top10 평균: ${(scoresNew.slice(0, 10).reduce((s, v) => s + v, 0) / 10).toFixed(3)}`)
  console.log(`  ≥0.5 (medium): ${scoresNew.filter((s) => s >= 0.5).length}건`)
  console.log(`  ≥0.7 (strong): ${scoresNew.filter((s) => s >= 0.7).length}건`)

  console.log(`\n[Top 5 자산 (new score 기준)]`)
  examples
    .sort((a, b) => b.nw - a.nw)
    .slice(0, 5)
    .forEach((e) => {
      console.log(
        `  ${e.name}: ${e.old.toFixed(2)} → ${e.nw.toFixed(2)} (kw match: ${e.matched}, snippet: ${e.snippet})`,
      )
    })

  const maxNewPass = scoresNew[0] >= 0.5
  const oldMedium = scoresOld.filter((s) => s >= 0.5).length
  const newMedium = scoresNew.filter((s) => s >= 0.5).length
  const mediumGain = newMedium > oldMedium
  const newMaxBetter = scoresNew[0] > scoresOld[0] - 0.001

  console.log(`\n[검증]`)
  console.log(`  ${maxNewPass ? '✓' : '✗'} K3 fix max ≥ 0.5 (medium 임계): ${maxNewPass ? 'PASS' : 'FAIL'}`)
  console.log(`  ${newMaxBetter ? '✓' : '✗'} K3 fix max ≥ 기존 max: ${newMaxBetter ? 'PASS' : 'FAIL'} (${scoresOld[0].toFixed(3)} → ${scoresNew[0].toFixed(3)})`)
  console.log(`  ${mediumGain ? '✓' : '✗'} medium+ 자산 수 증가: ${mediumGain ? 'PASS' : 'FAIL'} (${oldMedium} → ${newMedium})`)

  await prisma.$disconnect()

  if (maxNewPass && newMaxBetter && mediumGain) {
    console.log('\n✅ K3 PASS')
    process.exit(0)
  } else {
    console.log('\n❌ K3 FAIL')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})

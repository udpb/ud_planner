/**
 * scripts/analyze-lost-patterns.ts — W27 (Phase C, Meta-Cognition) ⭐
 *
 * "왜 졌나" 자동 학습 — 미수주 + 결과보고서 "어려운 점/레슨런" 분석.
 *
 * 입력 데이터:
 *   1. WinningPattern outcome='lost' (현재 0건 — 미래 dataset)
 *   2. ContentAsset assetType='case' + 'lessons*' 카테고리 (결과보고서 어려운 점)
 *   3. AssetUsage wonProject=false (미래)
 *
 * 알고리즘:
 *   1. 결과보고서의 "어려운 점/레슨런" 자산 → Concept 매핑 추출
 *   2. 동일 채널·도메인 수주 사업의 Concept 분포 비교
 *   3. "어려운 점" 자산에 자주 나오는 Concept 중 win 자산엔 부족한 것 → missing-assets 추천
 *   4. 채널·도메인별 "공통 어려움" Top N 자동 보고
 *
 * 출력:
 *   - human-readable
 *   - JSON (--json) — Dashboard 연동
 *
 * 사용:
 *   npx tsx scripts/analyze-lost-patterns.ts
 *   npx tsx scripts/analyze-lost-patterns.ts --json
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

const argv = process.argv.slice(2)
function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const AS_JSON = argv.includes('--json')
const TOP = parseInt(arg('--top', '20'), 10)
const MIN_OCCURRENCES = parseInt(arg('--min-occur', '2'), 10)

interface LostReport {
  /** "어려운 점" 자산에 자주 나오는 Concept Top N (won 자산엔 부족) */
  difficultyConcepts: {
    conceptId: string
    conceptName: string
    conceptType: string
    difficultyCount: number
    winCount: number
    winRateOfConcept: number
    gap: number
  }[]
  /** 도메인별 어려움 패턴 */
  domainStruggles: {
    domain: string
    difficultyTopConcepts: { name: string; count: number }[]
  }[]
  /** 채널별 어려움 패턴 */
  channelStruggles: {
    channel: string
    difficultyTopConcepts: { name: string; count: number }[]
  }[]
  /** 학습 추천 — 다음에 무엇을 자산화해야 하나 */
  recommendations: {
    conceptName: string
    reason: string
    suggestedAction: string
  }[]
  summary: {
    lostPatterns: number
    difficultyAssets: number
    winAssets: number
    totalRecommendations: number
  }
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  if (!AS_JSON) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('▶ W27 — Pattern Outcome 사후 분석 (왜 졌나)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`min-occur: ${MIN_OCCURRENCES} · top: ${TOP}`)
    console.log('')
  }

  // 1. 미수주 패턴 (현재 0건이지만 미래 호환)
  const lostPatterns = await prisma.winningPattern.findMany({
    where: { outcome: 'lost' },
    select: {
      id: true,
      sectionKey: true,
      channelType: true,
      lossReason: true,
      lessonsLearned: true,
    },
  })

  // 2. 결과보고서 "어려운 점/레슨런" 자산 (case + lessons name 패턴)
  const difficultyAssets = await prisma.contentAsset.findMany({
    where: {
      assetType: 'case',
      OR: [
        { name: { contains: '어려운', mode: 'insensitive' } },
        { name: { contains: '레슨', mode: 'insensitive' } },
        { name: { contains: '개선', mode: 'insensitive' } },
        { name: { contains: '리스크', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      narrativeSnippet: true,
      concepts: {
        select: {
          conceptId: true,
          isCore: true,
          concept: { select: { id: true, name: true, type: true } },
        },
      },
    },
  })

  // 3. 성공 자산 (수주된 결과보고서 = 성공 요인)
  const winAssets = await prisma.contentAsset.findMany({
    where: {
      assetType: 'case',
      OR: [
        { name: { contains: '성공', mode: 'insensitive' } },
        { name: { contains: '핵심', mode: 'insensitive' } },
        { name: { contains: '강점', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      concepts: {
        select: {
          conceptId: true,
          concept: { select: { id: true, name: true, type: true } },
        },
      },
    },
  })

  if (!AS_JSON) {
    console.log(`📦 미수주 패턴 (outcome='lost'): ${lostPatterns.length}`)
    console.log(`📦 어려움 자산 (case + 어려운/레슨/개선/리스크): ${difficultyAssets.length}`)
    console.log(`📦 성공 자산 (case + 성공/핵심/강점): ${winAssets.length}`)
    console.log('')
  }

  // 4. 어려움 vs 성공 자산의 Concept 분포 비교
  const difficultyConceptCount = new Map<
    string,
    { concept: { id: string; name: string; type: string }; count: number }
  >()
  for (const a of difficultyAssets) {
    for (const c of a.concepts) {
      const existing = difficultyConceptCount.get(c.conceptId)
      if (existing) existing.count++
      else difficultyConceptCount.set(c.conceptId, { concept: c.concept, count: 1 })
    }
  }
  const winConceptCount = new Map<string, number>()
  for (const a of winAssets) {
    for (const c of a.concepts) {
      winConceptCount.set(c.conceptId, (winConceptCount.get(c.conceptId) ?? 0) + 1)
    }
  }

  // 5. gap = difficultyCount > winCount + threshold → "어려운데 성공 자산 부족"
  const difficultyConcepts: LostReport['difficultyConcepts'] = []
  for (const [cid, d] of difficultyConceptCount) {
    if (d.count < MIN_OCCURRENCES) continue
    const winC = winConceptCount.get(cid) ?? 0
    const total = d.count + winC
    const winRate = total > 0 ? winC / total : 0
    const gap = d.count - winC
    if (gap >= 1) {
      difficultyConcepts.push({
        conceptId: cid,
        conceptName: d.concept.name,
        conceptType: d.concept.type,
        difficultyCount: d.count,
        winCount: winC,
        winRateOfConcept: Number(winRate.toFixed(2)),
        gap,
      })
    }
  }
  difficultyConcepts.sort((a, b) => b.gap - a.gap || b.difficultyCount - a.difficultyCount)

  // 6. 도메인별 어려움 패턴
  const domainConceptIds = new Set<string>()
  for (const a of difficultyAssets) {
    for (const c of a.concepts) {
      if (c.concept.type === 'domain') domainConceptIds.add(c.conceptId)
    }
  }
  const domainStruggles: LostReport['domainStruggles'] = []
  for (const domainId of domainConceptIds) {
    const domainName = difficultyConceptCount.get(domainId)?.concept.name
    if (!domainName) continue
    // 이 도메인 자산에서 함께 나오는 다른 Concept (어려움 패턴)
    const coAssets = difficultyAssets.filter((a) =>
      a.concepts.some((c) => c.conceptId === domainId),
    )
    const coConceptCount = new Map<string, { name: string; count: number }>()
    for (const a of coAssets) {
      for (const c of a.concepts) {
        if (c.conceptId === domainId) continue
        const e = coConceptCount.get(c.conceptId)
        if (e) e.count++
        else coConceptCount.set(c.conceptId, { name: c.concept.name, count: 1 })
      }
    }
    const top = Array.from(coConceptCount.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
    if (top.length > 0 && top[0].count >= 2) {
      domainStruggles.push({ domain: domainName, difficultyTopConcepts: top })
    }
  }
  domainStruggles.sort(
    (a, b) =>
      (b.difficultyTopConcepts[0]?.count ?? 0) - (a.difficultyTopConcepts[0]?.count ?? 0),
  )

  // 7. 채널별 어려움 (미수주 패턴 lossReason 기반 — 현재 0건)
  const channelStruggles: LostReport['channelStruggles'] = []
  // (Lost 패턴이 채워지면 자동 채워질 영역)

  // 8. 학습 추천
  const recommendations: LostReport['recommendations'] = []
  for (const dc of difficultyConcepts.slice(0, 10)) {
    if (dc.winCount === 0) {
      recommendations.push({
        conceptName: dc.conceptName,
        reason: `${dc.difficultyCount}건의 어려움 자산에 등장, 성공 자산 0건`,
        suggestedAction: `methodology 또는 case 자산 추가 ingest 권장 (assetType='methodology' 또는 'company')`,
      })
    } else if (dc.gap >= 3) {
      recommendations.push({
        conceptName: dc.conceptName,
        reason: `어려움 ${dc.difficultyCount}건 vs 성공 ${dc.winCount}건 (gap ${dc.gap})`,
        suggestedAction: `성공 사례 추가 ingest 또는 기존 자산 강화 필요`,
      })
    }
  }

  const report: LostReport = {
    difficultyConcepts: difficultyConcepts.slice(0, TOP),
    domainStruggles: domainStruggles.slice(0, TOP),
    channelStruggles,
    recommendations,
    summary: {
      lostPatterns: lostPatterns.length,
      difficultyAssets: difficultyAssets.length,
      winAssets: winAssets.length,
      totalRecommendations: recommendations.length,
    },
  }

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    if (difficultyConcepts.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`🟥 어려움 Top ${Math.min(TOP, difficultyConcepts.length)} Concept (어려움 자산엔 자주 — 성공 자산엔 부족):`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      for (const dc of difficultyConcepts.slice(0, TOP)) {
        console.log(
          `  ${dc.conceptName.padEnd(20)} [${dc.conceptType.padEnd(11)}] 어려움 ${dc.difficultyCount} · 성공 ${dc.winCount} · gap ${dc.gap} (winRate ${(dc.winRateOfConcept * 100).toFixed(0)}%)`,
        )
      }
      console.log('')
    }

    if (domainStruggles.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`🌐 도메인별 어려움 패턴 Top ${Math.min(TOP, domainStruggles.length)}:`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      for (const ds of domainStruggles.slice(0, TOP)) {
        console.log(
          `  ▶ ${ds.domain}: ${ds.difficultyTopConcepts.map((c) => `${c.name}(${c.count})`).join(', ')}`,
        )
      }
      console.log('')
    }

    if (recommendations.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`💡 학습 추천 (${recommendations.length}건):`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      for (const r of recommendations) {
        console.log(`  ▶ ${r.conceptName}`)
        console.log(`    이유: ${r.reason}`)
        console.log(`    제안: ${r.suggestedAction}`)
      }
      console.log('')
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 Summary')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Lost patterns:       ${report.summary.lostPatterns}`)
    console.log(`Difficulty assets:   ${report.summary.difficultyAssets}`)
    console.log(`Win assets:          ${report.summary.winAssets}`)
    console.log(`Recommendations:     ${report.summary.totalRecommendations}`)
    console.log('')
    console.log('✓ 사후 분석 완료')
    console.log('  → JSON 출력: --json')
  }

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

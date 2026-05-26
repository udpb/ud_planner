/**
 * scripts/analyze-gaps.ts — W24 (Phase C, Meta-Cognition)
 *
 * Brain 의 빈 곳 자동 발견.
 *
 * 차원:
 *   - 채널 (B2G / B2B / renewal)
 *   - Concept type (methodology / metric / persona / domain / tool / partnership / framework / event-type)
 *   - Section (1~7)
 *
 * 분석:
 *   1. WinningPattern + PatternConcept → 채널×Concept×Section 매트릭스
 *   2. ContentAsset + AssetConcept → 채널×Concept×Section 매트릭스 (applicableSections JSON)
 *   3. 합산 후 zero/low cell 자동 보고
 *   4. Concept 별 분포 — 단일 채널에만 몰린 Concept 도 risk
 *
 * 출력:
 *   - human-readable (default)
 *   - JSON (--json) — Dashboard 연동용
 *
 * 사용:
 *   npx tsx scripts/analyze-gaps.ts
 *   npx tsx scripts/analyze-gaps.ts --json --threshold 2
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
const LOW_THRESHOLD = parseInt(arg('--threshold', '2'), 10)
const TOP = parseInt(arg('--top', '20'), 10)

const CHANNELS = ['B2G', 'B2B', 'renewal']
const SECTIONS = ['1', '2', '3', '4', '5', '6', '7']

interface GapReport {
  emptyCells: { channel: string; section: string; conceptType?: string; gap: string }[]
  channelImbalance: { conceptName: string; conceptType: string; channels: string[]; majorityChannel: string; share: number }[]
  conceptZeroChannel: { channel: string; conceptType: string; missing: string[] }[]
  topMissingDomains: { domain: string; reason: string }[]
  summary: {
    totalConcepts: number
    coveredCells: number
    totalCells: number
    coveragePct: number
  }
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  if (!AS_JSON) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('▶ W24 — Gap Analyzer (channel × concept × section)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Low threshold: ${LOW_THRESHOLD} · top: ${TOP}`)
    console.log('')
  }

  // 1. WinningPattern × PatternConcept 데이터
  const patterns = await prisma.winningPattern.findMany({
    select: {
      id: true,
      channelType: true,
      sectionKey: true,
      outcome: true,
    },
  })
  const patternConcepts = await prisma.patternConcept.findMany({
    select: { patternId: true, conceptId: true, isCore: true },
  })

  // 2. ContentAsset × AssetConcept 데이터
  const assets = await prisma.contentAsset.findMany({
    where: { status: { not: 'archived' } },
    select: {
      id: true,
      applicableSections: true,
      assetType: true,
      status: true,
    },
  })
  const assetConcepts = await prisma.assetConcept.findMany({
    select: { assetId: true, conceptId: true, isCore: true },
  })

  // 3. Concept 메타
  const concepts = await prisma.concept.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      assetCount: true,
      patternCount: true,
    },
  })
  const conceptById = new Map(concepts.map((c) => [c.id, c]))

  if (!AS_JSON) {
    console.log(`📦 WinningPattern: ${patterns.length} (PatternConcept: ${patternConcepts.length})`)
    console.log(`📦 ContentAsset:   ${assets.length} (AssetConcept: ${assetConcepts.length})`)
    console.log(`📦 Concept:        ${concepts.length}`)
    console.log('')
  }

  // 4. 매트릭스 구축 — channel × section × conceptType 셀의 자산/패턴 개수
  // key: `${channel}|${section}|${conceptType}` → count
  const cellCount = new Map<string, number>()

  // 4a. Pattern 기여
  const patternById = new Map(patterns.map((p) => [p.id, p]))
  for (const pc of patternConcepts) {
    const p = patternById.get(pc.patternId)
    if (!p) continue
    const concept = conceptById.get(pc.conceptId)
    if (!concept) continue
    const channel = p.channelType || 'B2G'
    const section = p.sectionKey || '?'
    // sectionKey 가 enum string 인 경우와 숫자인 경우 모두 처리
    const sectionNum = SECTIONS.find((s) => section.includes(s)) || section
    const key = `${channel}|${sectionNum}|${concept.type}`
    cellCount.set(key, (cellCount.get(key) ?? 0) + 1)
  }

  // 4b. Asset 기여 — applicableSections (JSON array) 순회
  const assetById = new Map(assets.map((a) => [a.id, a]))
  for (const ac of assetConcepts) {
    const a = assetById.get(ac.assetId)
    if (!a) continue
    const concept = conceptById.get(ac.conceptId)
    if (!concept) continue
    const secs = Array.isArray(a.applicableSections)
      ? (a.applicableSections as string[])
      : []
    if (secs.length === 0) {
      // 섹션 정보 없는 경우 — 모든 채널 모든 섹션 후보로 약하게 가산
      for (const ch of CHANNELS) {
        for (const sec of SECTIONS) {
          const key = `${ch}|${sec}|${concept.type}`
          cellCount.set(key, (cellCount.get(key) ?? 0) + 0.1)
        }
      }
      continue
    }
    for (const sec of secs) {
      const sectionNum = SECTIONS.find((s) => String(sec).includes(s)) || String(sec)
      for (const ch of CHANNELS) {
        const key = `${ch}|${sectionNum}|${concept.type}`
        cellCount.set(key, (cellCount.get(key) ?? 0) + 1)
      }
    }
  }

  // 5. 빈/낮은 셀 추출
  const allConceptTypes = Array.from(new Set(concepts.map((c) => c.type)))
  const emptyCells: GapReport['emptyCells'] = []
  let coveredCells = 0
  const totalCells = CHANNELS.length * SECTIONS.length * allConceptTypes.length

  for (const ch of CHANNELS) {
    for (const sec of SECTIONS) {
      for (const ct of allConceptTypes) {
        const key = `${ch}|${sec}|${ct}`
        const count = cellCount.get(key) ?? 0
        if (count >= 1) coveredCells++
        if (count < LOW_THRESHOLD) {
          emptyCells.push({
            channel: ch,
            section: sec,
            conceptType: ct,
            gap: count === 0 ? '없음' : `약함 (${count.toFixed(1)})`,
          })
        }
      }
    }
  }

  // 6. Concept 채널 편중 분석 (한 채널에 80% 이상 몰린 Concept)
  const conceptChannelMap = new Map<string, Map<string, number>>() // conceptId → channel → count
  for (const pc of patternConcepts) {
    const p = patternById.get(pc.patternId)
    if (!p) continue
    const ch = p.channelType || 'B2G'
    if (!conceptChannelMap.has(pc.conceptId)) conceptChannelMap.set(pc.conceptId, new Map())
    const m = conceptChannelMap.get(pc.conceptId)!
    m.set(ch, (m.get(ch) ?? 0) + 1)
  }
  const channelImbalance: GapReport['channelImbalance'] = []
  for (const [conceptId, m] of conceptChannelMap) {
    const concept = conceptById.get(conceptId)
    if (!concept) continue
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0)
    if (total < 3) continue // 최소 3건 이상만 의미 있음
    let maxCh = ''
    let maxC = 0
    for (const [ch, c] of m) if (c > maxC) (maxCh = ch), (maxC = c)
    const share = maxC / total
    if (share >= 0.8) {
      channelImbalance.push({
        conceptName: concept.name,
        conceptType: concept.type,
        channels: Array.from(m.keys()),
        majorityChannel: maxCh,
        share: Number(share.toFixed(2)),
      })
    }
  }
  channelImbalance.sort((a, b) => b.share - a.share)

  // 7. 채널별 부재 Concept type
  const conceptZeroChannel: GapReport['conceptZeroChannel'] = []
  for (const ch of CHANNELS) {
    for (const ct of allConceptTypes) {
      const missing: string[] = []
      // 이 채널에 해당 Concept type 의 자산/패턴이 하나도 없는 Concept 들
      const channelHas = (cid: string) => {
        const m = conceptChannelMap.get(cid)
        return m?.get(ch) && m.get(ch)! > 0
      }
      for (const c of concepts) {
        if (c.type !== ct) continue
        if ((c.patternCount > 0 || c.assetCount > 0) && !channelHas(c.id)) {
          missing.push(c.name)
        }
      }
      if (missing.length > 0) {
        conceptZeroChannel.push({ channel: ch, conceptType: ct, missing: missing.slice(0, 5) })
      }
    }
  }

  // 8. Top missing domains (domain concept type 중 자산/패턴 0건)
  const topMissingDomains: GapReport['topMissingDomains'] = []
  const allDomains = concepts.filter((c) => c.type === 'domain')
  for (const d of allDomains) {
    if (d.assetCount === 0 && d.patternCount === 0) {
      topMissingDomains.push({ domain: d.name, reason: '자산·패턴 모두 0' })
    }
  }

  const report: GapReport = {
    emptyCells: emptyCells.sort((a, b) => a.gap.localeCompare(b.gap)).slice(0, 50),
    channelImbalance,
    conceptZeroChannel,
    topMissingDomains,
    summary: {
      totalConcepts: concepts.length,
      coveredCells,
      totalCells,
      coveragePct: Math.round((coveredCells / totalCells) * 100),
    },
  }

  // 9. 출력
  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📊 Coverage: ${report.summary.coveragePct}% (${coveredCells}/${totalCells} cells)`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')

    if (report.emptyCells.length > 0) {
      console.log(`🟥 빈/약한 cell (${report.emptyCells.length}, top ${TOP}):`)
      for (const c of report.emptyCells.slice(0, TOP)) {
        console.log(`  [${c.channel.padEnd(7)}] section ${c.section} × ${c.conceptType?.padEnd(12)} — ${c.gap}`)
      }
      if (report.emptyCells.length > TOP) console.log(`  ... +${report.emptyCells.length - TOP} more`)
      console.log('')
    }

    if (report.channelImbalance.length > 0) {
      console.log(`🟡 채널 편중 Concept (단일 채널 ≥80%):`)
      for (const c of report.channelImbalance.slice(0, TOP)) {
        console.log(`  ${c.conceptName.padEnd(20)} [${c.conceptType.padEnd(11)}] → ${c.majorityChannel} ${(c.share * 100).toFixed(0)}% (channels: ${c.channels.join('/')})`)
      }
      console.log('')
    }

    if (report.topMissingDomains.length > 0) {
      console.log(`🔴 자산·패턴 0건 도메인 (${report.topMissingDomains.length}):`)
      for (const d of report.topMissingDomains.slice(0, TOP)) {
        console.log(`  ${d.domain}`)
      }
      console.log('')
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 Summary')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Total cells:           ${report.summary.totalCells}`)
    console.log(`Covered cells (≥1):    ${report.summary.coveredCells} (${report.summary.coveragePct}%)`)
    console.log(`Empty/weak cells:      ${report.emptyCells.length}`)
    console.log(`Channel imbalance:     ${report.channelImbalance.length}`)
    console.log(`Empty domains:         ${report.topMissingDomains.length}`)
    console.log('')
    console.log('✓ gap analyzer 완료')
    console.log('  → JSON 출력: --json')
  }

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

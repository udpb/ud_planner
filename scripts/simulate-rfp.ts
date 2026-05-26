/**
 * scripts/simulate-rfp.ts — 미수주 RFP 매칭 시뮬레이션 + budget 비교 (Wave W W7)
 *
 * 흐름:
 *   1. master sheet 의 기획-미수주 탭에서 특정 row 찾음
 *   2. 사업제안서(PDF) hyperlink → Drive download → 텍스트 추출
 *   3. matchTuple 실행 (시드된 WinningPattern 매칭)
 *   4. ProposalBudgetItem 에서 매칭된 사업들의 예산 통계
 *   5. 종합 분석 보고
 *
 * 사용:
 *   npx tsx scripts/simulate-rfp.ts <sheet-url> --tab "2025년(기획-미수주)" --project-id "A.25.0028" [--channel B2G]
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

type PrismaModule = typeof import('../src/lib/prisma')
type DriveModule = typeof import('../src/lib/drive/client')
type SheetsModule = typeof import('../src/lib/drive/sheets')
type IngestModule = typeof import('../src/lib/ingest/file-ingester')
type MatchModule = typeof import('../src/lib/inference/match-tuple')

let prisma: PrismaModule['prisma']
let getFileMeta: DriveModule['getFileMeta']
let downloadFile: DriveModule['downloadFile']
let extractSheetId: SheetsModule['extractSheetId']
let fetchSheetWorkbook: SheetsModule['fetchSheetWorkbook']
let parseTab: SheetsModule['parseTab']
let extractDriveFileId: SheetsModule['extractDriveFileId']
let extractTextFromBuffer: IngestModule['extractTextFromBuffer']
let matchTuple: MatchModule['matchTuple']

async function loadHeavy() {
  const [p, d, s, i, m] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/lib/drive/client'),
    import('../src/lib/drive/sheets'),
    import('../src/lib/ingest/file-ingester'),
    import('../src/lib/inference/match-tuple'),
  ])
  prisma = p.prisma
  getFileMeta = d.getFileMeta
  downloadFile = d.downloadFile
  extractSheetId = s.extractSheetId
  fetchSheetWorkbook = s.fetchSheetWorkbook
  parseTab = s.parseTab
  extractDriveFileId = s.extractDriveFileId
  extractTextFromBuffer = i.extractTextFromBuffer
  matchTuple = m.matchTuple
}

// CLI
const argv = process.argv.slice(2)
function arg(flag: string, dflt?: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const SHEET_URL = argv.find((a) => !a.startsWith('--'))
const TAB = arg('--tab')!
const PROJECT_ID = arg('--project-id')!
const CHANNEL = (arg('--channel', 'B2G') as 'B2G' | 'B2B' | 'renewal')
const LIMIT = parseInt(arg('--limit', '10')!, 10)

if (!SHEET_URL || !TAB || !PROJECT_ID) {
  console.error('Usage: npx tsx scripts/simulate-rfp.ts <sheet-url> --tab "탭" --project-id "ID" [--channel B2G]')
  process.exit(1)
}

// Fuzzy header
function findCell<T extends { byHeaderRich: Record<string, { text: string; link?: string }> }>(
  row: T,
  ...candidates: string[]
) {
  for (const c of candidates) if (row.byHeaderRich[c]) return row.byHeaderRich[c]
  const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  for (const c of candidates) {
    const want = normalize(c)
    for (const [k, v] of Object.entries(row.byHeaderRich)) {
      if (normalize(k).startsWith(want)) return v
    }
  }
  return undefined
}

async function main() {
  await loadHeavy()

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ RFP simulation — Wave W W7')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Sheet tab: ${TAB} · project: ${PROJECT_ID} · channel: ${CHANNEL}`)
  console.log('')

  // 1. Sheet 에서 row 찾음
  const { sheetId } = extractSheetId(SHEET_URL!)
  console.log('⏳ Sheet 로드 중...')
  const wb = await fetchSheetWorkbook(sheetId)
  const ws = wb.getWorksheet(TAB)
  if (!ws) throw new Error(`Tab "${TAB}" not found`)
  const content = parseTab(ws, { maxRows: 2000 })

  const targetRow = content.rows.find((r) => {
    const id = (findCell(r, '프로젝트 ID', '프로젝트ID')?.text || '').trim()
    return id === PROJECT_ID
  })
  if (!targetRow) throw new Error(`Row with 프로젝트 ID = "${PROJECT_ID}" not found`)

  const projectName = findCell(targetRow, '프로젝트명', '사업명')?.text || ''
  const pdfCell = findCell(targetRow, '사업제안서(PDF)', '사업 제안서(PDF)')
  const pdfFileId = pdfCell?.link ? extractDriveFileId(pdfCell.link) : null
  if (!pdfFileId) throw new Error(`사업제안서(PDF) hyperlink 없음`)

  console.log(`📋 ${PROJECT_ID} · ${projectName}`)
  console.log(`📄 PDF file ID: ${pdfFileId}`)
  console.log('')

  // 2. Download + parse
  const fileMeta = await getFileMeta(pdfFileId)
  console.log(`📥 download ${fileMeta.name}  ${fileMeta.size ? (fileMeta.size / 1024).toFixed(0) + 'KB' : '?'}`)
  const buf = await downloadFile(pdfFileId)
  const parsed = await extractTextFromBuffer(buf, fileMeta.name)
  console.log(`✓ 텍스트 추출 ${parsed.text.length}자 (by=${parsed.by})`)
  if (parsed.text.length < 200) throw new Error(`텍스트 너무 짧음 (${parsed.text.length}자)`)

  // 3. matchTuple
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`🅜 Matching (limit=${LIMIT})`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const matchResult = await matchTuple({
    rfp: { text: parsed.text },
    channel: CHANNEL,
    limit: LIMIT,
  })

  console.log(`RFP 추정 키워드: ${matchResult.rfpEstimate.contentKeywords.slice(0, 12).join(' · ')}`)
  if (matchResult.rfpEstimate.logicGraph) {
    console.log(`Logic graph: ${matchResult.rfpEstimate.logicGraph.nodes.length} nodes / ${matchResult.rfpEstimate.logicGraph.edges.length} edges`)
  }
  console.log(`총 후보: messages=${matchResult.totalCandidates.messages} · contents=${matchResult.totalCandidates.contents}`)
  console.log('')

  // Top messages
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Top ${matchResult.messages.length} 매칭된 시드 패턴 (수주 사업)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (let i = 0; i < matchResult.messages.length; i++) {
    const m = matchResult.messages[i]
    console.log(`\n[${i + 1}] score=${(m.matchScore * 100).toFixed(1)}%  ${m.sourceProject.slice(0, 70)}`)
    console.log(`    Slogan: ${m.message.slogan}`)
    console.log(`    KeyMsg1: ${m.message.keyMessages[0]?.slice(0, 80) ?? ''}`)
    console.log(`    Before: ${m.message.beforeAfter.before.slice(0, 80)}`)
    console.log(`    After:  ${m.message.beforeAfter.after.slice(0, 80)}`)
    console.log(`    breakdown: msgSim=${m.breakdown.messageSim.toFixed(2)} logicSim=${m.breakdown.logicSim.toFixed(2)} channel=${m.breakdown.channelMatch.toFixed(2)}`)
  }

  // 4. Top proposal ContentAsset (시드 제안서 narrative)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📄 Top ${matchResult.contents.length} 제안서 인용 narrative (proposal)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (let i = 0; i < matchResult.contents.length; i++) {
    const c = matchResult.contents[i]
    const snippet = c.narrativeSnippet.slice(0, 220).replace(/\s+/g, ' ')
    console.log(`\n[${i + 1}] score=${(c.matchScore * 100).toFixed(1)}% mmr=${c.mmrScore.toFixed(2)} section=${c.sectionHint ?? '?'}`)
    console.log(`    ${snippet}${c.narrativeSnippet.length > 220 ? '...' : ''}`)
  }

  // 4-b. Top methodology ContentAsset (회사 IP — W10 신규 분리)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`🏆 Top ${matchResult.methodologyAssets.length} 회사 IP 인용 자산 (methodology)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (let i = 0; i < matchResult.methodologyAssets.length; i++) {
    const c = matchResult.methodologyAssets[i]
    const snippet = c.narrativeSnippet.slice(0, 220).replace(/\s+/g, ' ')
    console.log(`\n[${i + 1}] score=${(c.matchScore * 100).toFixed(1)}% mmr=${c.mmrScore.toFixed(2)} tier=${c.sourceTier ?? '?'}`)
    console.log(`    ${snippet}${c.narrativeSnippet.length > 220 ? '...' : ''}`)
  }

  // 4-c. Top case ContentAsset (결과보고서 지표·레슨 — W13 신규)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📈 Top ${matchResult.caseAssets.length} 비슷한 사업 결과·교훈 (case)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (let i = 0; i < matchResult.caseAssets.length; i++) {
    const c = matchResult.caseAssets[i]
    const snippet = c.narrativeSnippet.slice(0, 300).replace(/\s+/g, ' ')
    console.log(`\n[${i + 1}] score=${(c.matchScore * 100).toFixed(1)}% mmr=${c.mmrScore.toFixed(2)}`)
    console.log(`    ${snippet}${c.narrativeSnippet.length > 300 ? '...' : ''}`)
  }

  // 4-d. Concept 매칭 (W15 신규 — Layer 3 Ontology)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`🧠 매칭된 Concept ${matchResult.matchedConcepts.length}개 (Ontology) — W15 신규`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const c of matchResult.matchedConcepts.slice(0, 12)) {
    console.log(
      `  [${c.type.padEnd(12)}] ${c.name.padEnd(28).slice(0, 28)}  (assets=${String(c.assetCount).padStart(3)}, ${c.matchedBy === 'name' ? 'EXACT' : 'alias'}, kw="${c.matchedKeyword.slice(0, 20)}")`,
    )
  }
  if (matchResult.matchedConcepts.length > 12) {
    console.log(`  ... +${matchResult.matchedConcepts.length - 12} more`)
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`🔗 Concept 매칭 자산 top ${matchResult.conceptAssets.length}건 — W15 신규`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (let i = 0; i < Math.min(matchResult.conceptAssets.length, 10); i++) {
    const c = matchResult.conceptAssets[i]
    const snippet = c.narrativeSnippet.slice(0, 200).replace(/\s+/g, ' ')
    const coreMark = c.isCore ? '⭐' : '  '
    console.log(
      `\n[${i + 1}] ${coreMark} score=${c.matchScore.toFixed(2)} · type=${c.assetType} · via "${c.matchedConcept}" (${c.matchedConceptType})`,
    )
    console.log(`    📝 ${c.assetName}`)
    console.log(`    ${snippet}${c.narrativeSnippet.length > 200 ? '...' : ''}`)
  }

  // 5. Budget 비교 — 매칭된 top 5 사업의 예산 통계
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('💰 매칭된 사업의 예산 통계 (top 5 학습 사업)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const top5Projects = matchResult.messages.slice(0, 5).map((m) => m.sourceProject)
  for (const sp of top5Projects) {
    // prefix 매칭 — "A.25.XXXX" 추출해서 startsWith 검색 (sourceProject 명명 변형 흡수)
    const prefixMatch = sp.match(/^([A-Z]\.\d{2}(?:\s*\(\d+\))?\.\d{4})/)
    const prefix = prefixMatch ? prefixMatch[1].replace(/\s+/g, '') : null
    const items = prefix
      ? await prisma.proposalBudgetItem.findMany({
          where: { sourceProject: { startsWith: prefix } },
          select: { category: true, itemName: true, amount: true },
        })
      : await prisma.proposalBudgetItem.findMany({
          where: { sourceProject: sp },
          select: { category: true, itemName: true, amount: true },
        })
    if (items.length === 0) {
      console.log(`\n  [${sp.slice(0, 50)}] 예산 데이터 X`)
      continue
    }
    const total = items.reduce((s, it) => s + it.amount, 0)
    const byCategory = new Map<string, number>()
    for (const it of items) {
      byCategory.set(it.category, (byCategory.get(it.category) ?? 0) + it.amount)
    }
    console.log(`\n  [${sp.slice(0, 60)}]`)
    console.log(`    총액: ${total.toLocaleString()}원 (${items.length} items)`)
    const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
    for (const [cat, amt] of sorted.slice(0, 5)) {
      const pct = ((amt / total) * 100).toFixed(0)
      console.log(`     ${cat.padEnd(8)} ${amt.toLocaleString().padStart(15)}원  (${pct}%)`)
    }
  }

  // 6. 종합 분석
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 종합 분석 — 미수주 사업에 대한 시사점')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (matchResult.messages.length > 0) {
    const top1 = matchResult.messages[0]
    console.log(`\n1) 가장 가까운 시드 패턴 (${(top1.matchScore * 100).toFixed(1)}%):`)
    console.log(`   "${top1.sourceProject.slice(0, 60)}"`)
    console.log(`   → 이 패턴의 slogan/keyMessages 를 출발점으로 RFP 메시지 재구성 권장`)

    const avgScore = matchResult.messages.reduce((s, m) => s + m.matchScore, 0) / matchResult.messages.length
    console.log(`\n2) Top ${matchResult.messages.length} 평균 매칭: ${(avgScore * 100).toFixed(1)}%`)
    if (avgScore > 0.7) console.log(`   → 시드 자산 풍부 — 인용 가능 패턴 다수`)
    else if (avgScore > 0.5) console.log(`   → 일부 시드와 유사 — 부분 인용 권장`)
    else console.log(`   → 시드와 격차 큼 — 신규 자산 개발 필요`)

    const channels = new Map<string, number>()
    for (const m of matchResult.messages) {
      channels.set(m.breakdown.channelMatch === 1 ? '같은 채널' : '다른 채널', (channels.get(m.breakdown.channelMatch === 1 ? '같은 채널' : '다른 채널') ?? 0) + 1)
    }
    console.log(`\n3) 채널 분포: ${[...channels.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`)
  }

  console.log(`\n4) 인용 가능 자산 (4 영역):`)
  console.log(`   📄 제안서 narrative: ${matchResult.contents.length}건 (도메인 매칭)`)
  console.log(`   🏆 회사 IP: ${matchResult.methodologyAssets.length}건 (차별화 인용)`)
  console.log(`   📈 비슷한 사업 결과·교훈: ${matchResult.caseAssets.length}건 (실제 지표·레슨)`)
  console.log(`   🧠 Concept 기반: ${matchResult.conceptAssets.length}건 (entity 매칭) — W15 신규`)
  const totalAssets = matchResult.contents.length + matchResult.methodologyAssets.length + matchResult.caseAssets.length + matchResult.conceptAssets.length
  if (totalAssets === 0) {
    console.log(`   ⚠ 매칭된 자산 0건 — ContentAsset 풀 부족`)
  }

  if (matchResult.matchedConcepts.length > 0) {
    const conceptTypes = new Map<string, number>()
    for (const c of matchResult.matchedConcepts) {
      conceptTypes.set(c.type, (conceptTypes.get(c.type) ?? 0) + 1)
    }
    console.log(`\n5) Concept 매칭 entity ${matchResult.matchedConcepts.length}개:`)
    for (const [type, count] of [...conceptTypes.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${type.padEnd(12)} ${count}개`)
    }
  }

  console.log('')
  console.log('✓ simulation 완료')
  await prisma.$disconnect()
}

main()
  .catch((e) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('✗ FAIL')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error(e instanceof Error ? e.stack : String(e))
    process.exit(1)
  })
  .finally(() => setTimeout(() => process.exit(0), 200))

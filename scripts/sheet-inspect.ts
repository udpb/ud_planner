/**
 * scripts/sheet-inspect.ts — Google Sheet 탭/컬럼/sample row 확인
 *
 * Drive API 의 exportFile() 로 sheet 전체를 XLSX 로 export → exceljs 파싱.
 * 모든 탭 목록 + 첫 N 탭의 헤더 + sample row 출력.
 *
 * 사용:
 *   # 기본 — 모든 탭 메타 + 첫 탭 sample
 *   npx tsx scripts/sheet-inspect.ts <sheet-url-or-id>
 *
 *   # 특정 탭만
 *   npx tsx scripts/sheet-inspect.ts <sheet-url-or-id> --tab "탭이름"
 *
 *   # 더 많은 sample row
 *   npx tsx scripts/sheet-inspect.ts <sheet-url-or-id> --sample 10
 *
 *   # Drive 링크 컬럼만 필터해서 보기 (PDF URL 찾기용)
 *   npx tsx scripts/sheet-inspect.ts <sheet-url-or-id> --links-only
 *
 * 예시:
 *   npx tsx scripts/sheet-inspect.ts "https://docs.google.com/spreadsheets/d/1PK4az.../edit?gid=158..."
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

import type { TabContent, SheetTabMeta } from '../src/lib/drive/sheets'

// Dynamic imports
let extractSheetId: typeof import('../src/lib/drive/sheets').extractSheetId
let fetchSheetWorkbook: typeof import('../src/lib/drive/sheets').fetchSheetWorkbook
let listTabs: typeof import('../src/lib/drive/sheets').listTabs
let parseTab: typeof import('../src/lib/drive/sheets').parseTab
let extractDriveFileId: typeof import('../src/lib/drive/sheets').extractDriveFileId

async function loadHeavy() {
  const mod = await import('../src/lib/drive/sheets')
  extractSheetId = mod.extractSheetId
  fetchSheetWorkbook = mod.fetchSheetWorkbook
  listTabs = mod.listTabs
  parseTab = mod.parseTab
  extractDriveFileId = mod.extractDriveFileId
}

// ─────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────

function arg(argv: string[], flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}

// ─────────────────────────────────────────
// Pretty print
// ─────────────────────────────────────────

function truncate(s: string, n: number): string {
  if (!s) return '(empty)'
  const trimmed = s.replace(/\s+/g, ' ').trim()
  return trimmed.length > n ? trimmed.slice(0, n) + '…' : trimmed
}

function printTabMeta(tabs: SheetTabMeta[]): void {
  console.log(`Total tabs: ${tabs.length}`)
  console.log('')
  console.log('Idx | Tab name'.padEnd(50) + 'Rows | Cols')
  console.log('─'.repeat(80))
  for (const t of tabs) {
    console.log(
      `${String(t.index).padStart(3)} | ${t.name.padEnd(40).slice(0, 40)} ${String(t.rowCount).padStart(5)} | ${String(t.columnCount).padStart(4)}`,
    )
  }
}

function printTabContent(content: TabContent, sampleN: number, linksOnly: boolean): void {
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📋 Tab: "${content.name}"  rows=${content.rows.length}  cols=${content.headers.length}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 헤더 출력
  console.log('Headers:')
  content.headers.forEach((h, i) => {
    const letter = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '')
    console.log(`  ${letter.padEnd(4)} ${h || '(unnamed)'}`)
  })

  // links-only 모드 — hyperlink + text 안 Drive URL 둘 다 검사
  if (linksOnly) {
    console.log('')
    console.log('🔗 Drive 링크가 발견된 컬럼 분석 (hyperlink + text URL 모두 scan):')
    const linkCols = new Map<string, { hyperlink: number; textUrl: number }>()
    for (const r of content.rows) {
      for (const [header, cell] of Object.entries(r.byHeaderRich)) {
        const fromLink = cell.link && extractDriveFileId(cell.link)
        const fromText = extractDriveFileId(cell.text)
        if (fromLink || fromText) {
          const cur = linkCols.get(header) ?? { hyperlink: 0, textUrl: 0 }
          if (fromLink) cur.hyperlink++
          if (fromText) cur.textUrl++
          linkCols.set(header, cur)
        }
      }
    }
    if (linkCols.size === 0) {
      console.log('  ⚠️  Drive 링크가 발견된 컬럼 없음')
      console.log('     → 시트의 셀에 hyperlink 가 없고 텍스트도 URL 아닌 상태.')
      console.log('     → 파일명 텍스트만 있으면 Drive 검색으로 매칭 가능 (별도 fallback)')
    } else {
      console.log('  Header                                     hyperlink  textUrl')
      console.log('  ' + '─'.repeat(70))
      const sorted = Array.from(linkCols.entries()).sort(
        (a, b) => b[1].hyperlink + b[1].textUrl - (a[1].hyperlink + a[1].textUrl),
      )
      for (const [header, c] of sorted) {
        console.log(
          `  ${header.padEnd(42).slice(0, 42)} ${String(c.hyperlink).padStart(9)} ${String(c.textUrl).padStart(8)}`,
        )
      }
      // 첫 매칭 row sample
      console.log('')
      console.log('🔍 첫 매칭 row sample:')
      const topCol = sorted[0]?.[0]
      const sample = content.rows.find((r) => {
        const cell = r.byHeaderRich[topCol]
        return cell && ((cell.link && extractDriveFileId(cell.link)) || extractDriveFileId(cell.text))
      })
      if (sample) {
        const cell = sample.byHeaderRich[topCol]
        const url = cell.link || cell.text
        const fileId = extractDriveFileId(url)
        console.log(`  row ${sample.rowNum} · column "${topCol}":`)
        console.log(`    text: ${truncate(cell.text, 60)}`)
        if (cell.link) console.log(`    link: ${truncate(cell.link, 80)}`)
        console.log(`    → file ID: ${fileId}`)
      }
    }
    return
  }

  // Sample row 출력 — hyperlink 도 함께
  console.log('')
  console.log(`📝 First ${Math.min(sampleN, content.rows.length)} rows:`)
  for (let i = 0; i < Math.min(sampleN, content.rows.length); i++) {
    const r = content.rows[i]
    console.log('')
    console.log(`  [row ${r.rowNum}]`)
    for (const [header, cell] of Object.entries(r.byHeaderRich)) {
      if (!cell.text && !cell.link) continue
      const fileId = (cell.link && extractDriveFileId(cell.link)) || extractDriveFileId(cell.text)
      const marker = fileId ? '🔗' : '  '
      const linkSuffix = cell.link && cell.link !== cell.text ? `  ↳ ${truncate(cell.link, 60)}` : ''
      console.log(`  ${marker} ${header.padEnd(28).slice(0, 28)} : ${truncate(cell.text, 70)}${linkSuffix}`)
    }
  }
}

// ─────────────────────────────────────────
// main
// ─────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)
  const target = argv.find((a) => !a.startsWith('--'))
  if (!target) {
    console.error('Usage: npx tsx scripts/sheet-inspect.ts <sheet-url-or-id> [--tab "탭이름"] [--sample N] [--links-only]')
    process.exit(1)
  }
  const tabFilter = arg(argv, '--tab', '')
  const sampleN = parseInt(arg(argv, '--sample', '5'), 10)
  const linksOnly = argv.includes('--links-only')

  await loadHeavy()

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ Google Sheet inspect')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const { sheetId, gid } = extractSheetId(target)
  console.log(`Sheet ID: ${sheetId}`)
  if (gid !== undefined) console.log(`gid (URL): ${gid}`)
  console.log('')

  console.log('⏳ Drive export 중... (sheet → xlsx)')
  const t0 = Date.now()
  const wb = await fetchSheetWorkbook(sheetId)
  console.log(`   ✓ XLSX 로딩 완료 · ${Date.now() - t0}ms`)
  console.log('')

  // 1. 탭 메타
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📑 Tabs')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const tabs = listTabs(wb)
  printTabMeta(tabs)

  // 2. tab 필터 또는 첫 탭 sample
  let targetTabs: typeof wb.worksheets
  if (tabFilter) {
    const ws = wb.getWorksheet(tabFilter)
    if (!ws) {
      console.error('')
      console.error(`✗ Tab "${tabFilter}" not found. 사용 가능: ${tabs.map((t) => t.name).join(', ')}`)
      process.exit(1)
    }
    targetTabs = [ws]
  } else {
    // 행이 가장 많은 탭 1개 (또는 첫 탭)
    const richest = [...wb.worksheets].sort((a, b) => b.rowCount - a.rowCount)[0]
    targetTabs = [richest]
    console.log('')
    console.log(`💡 가장 row 많은 탭 1개 sample: "${richest.name}". 다른 탭 보려면 --tab "이름"`)
  }

  for (const ws of targetTabs) {
    const content = parseTab(ws, { maxRows: linksOnly ? 5000 : 50 })
    printTabContent(content, sampleN, linksOnly)
  }
}

main()
  .catch((e) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('✗ FAIL')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const msg = e instanceof Error ? e.message : String(e)
    console.error(msg)
    if (/403|forbidden|insufficient/i.test(msg)) {
      console.error('')
      console.error('💡 Sheet 접근 권한 없음. zero@udimpact.ai 가 sheet 의 viewer 이상 권한이어야 함.')
      console.error('   sheet 소유자가 share → zero@udimpact.ai 추가하거나 도메인 공유 설정 필요.')
    }
    process.exit(1)
  })
  .finally(() => setTimeout(() => process.exit(0), 100))

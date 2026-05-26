/**
 * scripts/sheet-budget-ingest.ts — 산출내역서 (예산) batch ingest (Wave W W6)
 *
 * master sheet 의 "산출내역서" 컬럼 hyperlink → XLSX download → LLM 정규화 → ProposalBudgetItem persist.
 *
 * 사용:
 *   npx tsx scripts/sheet-budget-ingest.ts <sheet-url> --tab "2025년(운영)" --dry-run --limit 3
 *   npx tsx scripts/sheet-budget-ingest.ts <sheet-url> --tabs "2025년(운영),2024년(운영)" --limit 60
 *
 * 옵션: --tab "이름" / --tabs "탭1,탭2" / --limit N / --start N / --dry-run / --min-confidence 0.5
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import type { Channel } from '../src/lib/inference/types'
import type { SheetRow } from '../src/lib/drive/sheets'

type PrismaModule = typeof import('../src/lib/prisma')
type DriveModule = typeof import('../src/lib/drive/client')
type SheetsModule = typeof import('../src/lib/drive/sheets')
type BudgetModule = typeof import('../src/lib/inference/budget-extractor')
type IngestModule = typeof import('../src/lib/ingest/file-ingester')

let prisma: PrismaModule['prisma']
let getFileMeta: DriveModule['getFileMeta']
let downloadFile: DriveModule['downloadFile']
let exportFile: DriveModule['exportFile']
let extractSheetId: SheetsModule['extractSheetId']
let fetchSheetWorkbook: SheetsModule['fetchSheetWorkbook']
let parseTab: SheetsModule['parseTab']
let extractDriveFileId: SheetsModule['extractDriveFileId']
let extractBudget: BudgetModule['extractBudget']
let flattenXlsx: BudgetModule['flattenXlsx']
let extractTextFromBuffer: IngestModule['extractTextFromBuffer']

async function loadHeavy() {
  const [prismaMod, driveMod, sheetsMod, budgetMod, ingestMod] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/lib/drive/client'),
    import('../src/lib/drive/sheets'),
    import('../src/lib/inference/budget-extractor'),
    import('../src/lib/ingest/file-ingester'),
  ])
  prisma = prismaMod.prisma
  getFileMeta = driveMod.getFileMeta
  downloadFile = driveMod.downloadFile
  exportFile = driveMod.exportFile
  extractSheetId = sheetsMod.extractSheetId
  fetchSheetWorkbook = sheetsMod.fetchSheetWorkbook
  parseTab = sheetsMod.parseTab
  extractDriveFileId = sheetsMod.extractDriveFileId
  extractBudget = budgetMod.extractBudget
  flattenXlsx = budgetMod.flattenXlsx
  extractTextFromBuffer = ingestMod.extractTextFromBuffer
}

// ─────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────

const argv = process.argv.slice(2)
function arg(flag: string, dflt?: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const SHEET_URL = argv.find((a) => !a.startsWith('--'))
const TAB_SINGLE = arg('--tab')
const TABS_MULTI = arg('--tabs')
const LIMIT = parseInt(arg('--limit', '0')!, 10)
const START = parseInt(arg('--start', '1')!, 10)
const DRY_RUN = argv.includes('--dry-run')
const MIN_CONFIDENCE = parseFloat(arg('--min-confidence', '0.5')!)

if (!SHEET_URL || (!TAB_SINGLE && !TABS_MULTI)) {
  console.error('Usage: npx tsx scripts/sheet-budget-ingest.ts <sheet-url> --tab "이름" [--dry-run] [--limit N]')
  process.exit(1)
}
const TABS = TABS_MULTI ? TABS_MULTI.split(',').map((s) => s.trim()) : [TAB_SINGLE!]

// ─────────────────────────────────────────
// Helpers — fuzzy header match (sheet-batch 와 동일)
// ─────────────────────────────────────────

function findCell(row: SheetRow, ...candidates: string[]) {
  for (const c of candidates) {
    if (row.byHeaderRich[c]) return row.byHeaderRich[c]
  }
  const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  for (const c of candidates) {
    const want = normalize(c)
    for (const [key, val] of Object.entries(row.byHeaderRich)) {
      if (normalize(key).startsWith(want)) return val
    }
  }
  return undefined
}

function findText(row: SheetRow, ...candidates: string[]): string {
  const cell = findCell(row, ...candidates)
  return (cell?.text || '').trim()
}

function inferChannel(projectName: string): Channel {
  const f = projectName.toLowerCase()
  const b2bPatterns = [
    'sk이노', 'sk 이노', 'sk이노베이션', 'cj그룹', 'cj ', 'db손해', 'db ', '네이버',
    '하나금융', '하나 ', 'kaist', '외국어대', '한국외대',
    'cu ', '롯데', '삼성', '현대', '까르띠에', 'gs리테일', 'gs 리테일',
  ]
  if (b2bPatterns.some((p) => f.includes(p))) return 'B2B'
  return 'B2G'
}

// ─────────────────────────────────────────
// Row → meta
// ─────────────────────────────────────────

interface BudgetRowMeta {
  rowNum: number
  projectId: string
  projectName: string
  sourceProject: string
  channel: Channel
  budgetFileId?: string
}

function rowToMeta(row: SheetRow): BudgetRowMeta | null {
  const projectId = findText(row, '프로젝트 ID', '프로젝트ID')
  const projectName = findText(row, '프로젝트명', '사업명')
  if (!projectId || !projectName) return null

  const budgetCell = findCell(row, '산출내역서', '예산')
  const budgetFileId = budgetCell?.link ? extractDriveFileId(budgetCell.link) ?? undefined : undefined

  return {
    rowNum: row.rowNum,
    projectId,
    projectName,
    sourceProject: `${projectId} ${projectName}`,
    channel: inferChannel(projectName),
    budgetFileId,
  }
}

// ─────────────────────────────────────────
// Ingest single
// ─────────────────────────────────────────

interface IngestResult {
  rowNum: number
  projectId: string
  status: 'success' | 'skip-existing' | 'skip-no-file' | 'fail'
  itemCount?: number
  totalAmount?: number
  confidence?: number
  elapsedSec?: number
  error?: string
}

async function ingestRow(
  meta: BudgetRowMeta,
  existingProjects: Set<string>,
): Promise<IngestResult> {
  const t0 = Date.now()
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`▶ row ${meta.rowNum} [${meta.projectId}] ${meta.projectName.slice(0, 50)}`)
  console.log(`  channel=${meta.channel}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // dedupe
  if (existingProjects.has(meta.sourceProject)) {
    console.log(`  ↩ 이미 예산 ingest 됨 — skip`)
    return { rowNum: meta.rowNum, projectId: meta.projectId, status: 'skip-existing' }
  }

  if (!meta.budgetFileId) {
    console.log(`  ↩ 산출내역서 link 없음`)
    return { rowNum: meta.rowNum, projectId: meta.projectId, status: 'skip-no-file' }
  }

  try {
    // 1. Download + flatten
    const fileMeta = await getFileMeta(meta.budgetFileId)
    const mimeShort = fileMeta.mimeType.includes('google-apps')
      ? `google-${fileMeta.mimeType.split('.').pop()}`
      : fileMeta.mimeType.split('/').pop() ?? fileMeta.mimeType
    console.log(`  📊 ${fileMeta.name}  mime=${mimeShort}  ${fileMeta.size ? (fileMeta.size / 1024).toFixed(0) + 'KB' : '?'}`)

    // 2. mime 별 분기 — XLSX / Google Sheet / PDF / HWP 등
    let buf: Buffer
    let flattened: string
    if (fileMeta.mimeType === 'application/vnd.google-apps.spreadsheet') {
      console.log(`  🔁 Google Sheet → XLSX export`)
      buf = await exportFile(
        meta.budgetFileId,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      flattened = await flattenXlsx(buf)
      console.log(`  ✓ XLSX flatten ${flattened.length}자`)
    } else if (
      fileMeta.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      /\.xlsx?$/i.test(fileMeta.name)
    ) {
      buf = await downloadFile(meta.budgetFileId)
      flattened = await flattenXlsx(buf)
      console.log(`  ✓ XLSX flatten ${flattened.length}자`)
    } else if (
      fileMeta.mimeType === 'application/pdf' ||
      /\.(pdf|docx?|pptx?)$/i.test(fileMeta.name)
    ) {
      // PDF/DOCX/PPTX 산출내역서 — 텍스트 추출 후 LLM
      console.log(`  📄 비-스프레드시트 형식 → 텍스트 추출`)
      buf = await downloadFile(meta.budgetFileId)
      const parsed = await extractTextFromBuffer(buf, fileMeta.name)
      flattened = parsed.text
      console.log(`  ✓ 텍스트 추출 ${flattened.length}자 (by=${parsed.by})`)
    } else {
      throw new Error(`unsupported mime: ${fileMeta.mimeType}`)
    }

    if (flattened.length < 50) {
      throw new Error(`텍스트 너무 짧음 (${flattened.length}자)`)
    }

    // 3. LLM 추출
    const result = await extractBudget({
      flattenedSheet: flattened,
      sourceProject: meta.sourceProject,
      channel: meta.channel,
    })

    const elapsedSec = Math.round((Date.now() - t0) / 1000)
    console.log(`  ✓ 추출 완료 · ${elapsedSec}s · confidence ${result.confidence.toFixed(2)}`)
    console.log(`    items: ${result.items.length}  totalAmount: ${result.totalAmount.toLocaleString()}원`)

    // confidence cut
    if (result.confidence < MIN_CONFIDENCE) {
      console.log(`  ⚠ confidence < ${MIN_CONFIDENCE} — skip (DB 저장 X)`)
      return {
        rowNum: meta.rowNum,
        projectId: meta.projectId,
        status: 'fail',
        elapsedSec,
        confidence: result.confidence,
        error: `low confidence ${result.confidence.toFixed(2)}`,
      }
    }

    // 4. Persist
    if (!DRY_RUN && result.items.length > 0) {
      await prisma.proposalBudgetItem.createMany({
        data: result.items.map((it) => ({
          sourceProject: meta.sourceProject,
          sourceRef: `sheet-row-${meta.rowNum}:drive-${meta.budgetFileId}`,
          driveFileId: meta.budgetFileId ?? null,
          channelType: meta.channel,
          category: it.category,
          itemName: it.itemName,
          description: it.description ?? null,
          unit: it.unit ?? null,
          quantity: it.quantity ?? null,
          unitPrice: it.unitPrice ?? null,
          amount: it.amount,
        })),
      })
      console.log(`  🗄  DB 저장 ${result.items.length} BudgetItem`)
    } else if (DRY_RUN) {
      console.log(`  (dry-run — DB 저장 X)`)
    }

    return {
      rowNum: meta.rowNum,
      projectId: meta.projectId,
      status: 'success',
      itemCount: result.items.length,
      totalAmount: result.totalAmount,
      confidence: result.confidence,
      elapsedSec,
    }
  } catch (e) {
    const elapsedSec = Math.round((Date.now() - t0) / 1000)
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error(`  ✗ FAIL · ${elapsedSec}s — ${errMsg.slice(0, 200)}`)
    return {
      rowNum: meta.rowNum,
      projectId: meta.projectId,
      status: 'fail',
      elapsedSec,
      error: errMsg.slice(0, 500),
    }
  }
}

// ─────────────────────────────────────────
// main
// ─────────────────────────────────────────

async function main() {
  await loadHeavy()

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ Sheet-based BUDGET ingest — Wave W W6')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Sheet: ${SHEET_URL!.slice(0, 60)}...`)
  console.log(`Tabs: ${TABS.join(', ')}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}  · limit=${LIMIT || '∞'}  start=${START}`)
  console.log('')

  const { sheetId } = extractSheetId(SHEET_URL!)
  console.log('⏳ Sheet 로드 중...')
  const wb = await fetchSheetWorkbook(sheetId)
  console.log(`   ✓ ${wb.worksheets.length} tabs loaded`)

  // dedupe — 이미 ProposalBudgetItem 있는 sourceProject
  const existing = await prisma.proposalBudgetItem.findMany({
    select: { sourceProject: true },
    distinct: ['sourceProject'],
  })
  const existingProjects = new Set(existing.map((p) => p.sourceProject))
  console.log(`📦 기존 ProposalBudgetItem sourceProject: ${existingProjects.size}건 (dedupe)`)

  const allResults: IngestResult[] = []
  for (const tabName of TABS) {
    const ws = wb.getWorksheet(tabName)
    if (!ws) {
      console.error(`✗ Tab "${tabName}" not found — skip`)
      continue
    }
    const content = parseTab(ws, { maxRows: 2000 })
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`📋 Tab: "${tabName}" (${content.rows.length} 데이터 row)`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

    const metas = content.rows
      .map(rowToMeta)
      .filter((m): m is BudgetRowMeta => m !== null)
      .filter((m) => !!m.budgetFileId)
    console.log(`  유효 row (산출내역서 link 있음): ${metas.length}건`)

    const startIdx = Math.max(0, START - 1)
    const endIdx = LIMIT > 0 ? Math.min(metas.length, startIdx + LIMIT) : metas.length
    const targets = metas.slice(startIdx, endIdx)
    console.log(`  처리 대상: ${targets.length}건`)

    for (let i = 0; i < targets.length; i++) {
      console.log(`\n[${i + 1}/${targets.length}] ━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      const result = await ingestRow(targets[i], existingProjects)
      allResults.push(result)
      if (result.status === 'success') existingProjects.add(targets[i].sourceProject)
    }
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Budget Batch Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const success = allResults.filter((r) => r.status === 'success')
  const skipExisting = allResults.filter((r) => r.status === 'skip-existing')
  const skipNoFile = allResults.filter((r) => r.status === 'skip-no-file')
  const failures = allResults.filter((r) => r.status === 'fail')
  console.log(`Total processed: ${allResults.length}`)
  console.log(`  ✓ success:        ${success.length}`)
  console.log(`  ↩ skip (이미 있음): ${skipExisting.length}`)
  console.log(`  ↩ skip (링크 없음): ${skipNoFile.length}`)
  console.log(`  ✗ fail:           ${failures.length}`)
  if (success.length > 0) {
    const totalItems = success.reduce((s, r) => s + (r.itemCount ?? 0), 0)
    const totalAmount = success.reduce((s, r) => s + (r.totalAmount ?? 0), 0)
    const avgConfidence = success.reduce((s, r) => s + (r.confidence ?? 0), 0) / success.length
    console.log(`  💰 ProposalBudgetItem 추가: ${totalItems}건 (평균 ${(totalItems / success.length).toFixed(1)} per project)`)
    console.log(`  💵 총 예산 합계: ${totalAmount.toLocaleString()}원`)
    console.log(`  🎯 평균 confidence: ${avgConfidence.toFixed(2)}`)
  }
  if (failures.length > 0) {
    console.log('\n실패 row:')
    for (const f of failures) {
      console.log(`  row ${f.rowNum} [${f.projectId}]: ${f.error?.slice(0, 100)}`)
    }
  }
  console.log('')
  console.log(DRY_RUN ? '✓ dry-run 완료 — DB 변경 X' : '✓ budget ingest 완료')
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

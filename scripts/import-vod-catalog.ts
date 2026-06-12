/**
 * scripts/import-vod-catalog.ts — VOD 분류 시트(v5.4) → data/vod-catalog/catalog.json
 *
 * 사용자가 "강의 분류 가이드 v5.4" 기준으로 분류 중인 1,000+ VOD 시트(CSV/XLSX)를
 * 수령하면 이 스크립트로 인테이크한다 (ADR-028 §4 VOD Follow-up — 사전 그릇).
 *
 * 흐름: CSV/XLSX 읽기(exceljs — 레포 기존 의존성) → 한글 헤더 유연 매칭
 *   (공백·언더스코어·괄호 변형 허용, vod-catalog.ts VOD_HEADER_ALIASES) →
 *   행별 정규화('[파악 불가]' → null) + zod 검증 →
 *   - data/vod-catalog/catalog.json        (유효 엔트리, lectureId 정렬 — 멱등)
 *   - data/vod-catalog/_import-report.json (행수·실패행·[파악 불가] 비율·유효성 분포·
 *                                            폐기후보 수·중복 강의ID·기본값 적용 수)
 *
 * 정책:
 *  - 강사·소속·직책 컬럼은 받아도 무시 (v5.2 삭제 정책 — report.ignoredColumns 에만 기록)
 *  - 중복 강의ID — 첫 행 유지, 이후 행은 catalog 제외 + report.duplicateLectureIds 기록
 *  - 실패 행은 건너뛰고 계속 (전량 실패해도 report 는 생성)
 *  - LLM 호출 없음 · DB 없음 (순수 파일 변환) — 같은 입력이면 같은 출력 (멱등)
 *
 * 사용:
 *   npx tsx scripts/import-vod-catalog.ts <시트.csv|시트.xlsx> [--sheet <탭이름>]
 *   npx tsx scripts/import-vod-catalog.ts data/vod-catalog/_fixture-sample.csv   # 셀프 테스트
 */

import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'

import {
  buildEntryInput,
  normalizeHeader,
  UNKNOWN_MARKERS,
  VOD_HEADER_ALIASES,
  VOD_IGNORED_COLUMNS,
  vodCatalogEntrySchema,
  type VodCatalogEntry,
} from '../src/lib/program-design/vod-catalog'

const OUT_DIR = path.join(process.cwd(), 'data', 'vod-catalog')
const CATALOG_PATH = path.join(OUT_DIR, 'catalog.json')
const REPORT_PATH = path.join(OUT_DIR, '_import-report.json')

// ── CLI ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const inputPath = argv.find((a) => !a.startsWith('--'))
const sheetIdx = argv.indexOf('--sheet')
const SHEET_NAME = sheetIdx >= 0 ? argv[sheetIdx + 1] : undefined

/** exceljs 셀 값 → 문자열 (richText·hyperlink·수식 결과·날짜 관용 흡수). */
function cellToString(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('')
    if ('text' in v && typeof v.text === 'string') return v.text
    if ('result' in v) return cellToString(v.result as ExcelJS.CellValue)
  }
  return String(v)
}

/** 셀이 '[파악 불가]' 마커인지 (비율 집계용). */
function isUnknownMarker(s: string): boolean {
  const compact = s.trim().replace(/\s/g, '')
  return compact.length > 0 && UNKNOWN_MARKERS.some((m) => m.replace(/\s/g, '') === compact)
}

interface RowFailure {
  row: number
  lectureId: string | null
  errors: string[]
}

async function main() {
  if (!inputPath) {
    console.error('사용: npx tsx scripts/import-vod-catalog.ts <시트.csv|시트.xlsx> [--sheet <탭이름>]')
    process.exit(1)
  }
  const abs = path.resolve(inputPath)
  if (!fs.existsSync(abs)) {
    console.error(`❌ 파일 없음: ${abs}`)
    process.exit(1)
  }

  // ── 읽기 (CSV/XLSX 모두 exceljs) ─────────────────────────────
  const ext = path.extname(abs).toLowerCase()
  const workbook = new ExcelJS.Workbook()
  let worksheet: ExcelJS.Worksheet
  if (ext === '.csv') {
    worksheet = await workbook.csv.readFile(abs)
  } else if (ext === '.xlsx') {
    await workbook.xlsx.readFile(abs)
    const ws = SHEET_NAME ? workbook.getWorksheet(SHEET_NAME) : workbook.worksheets[0]
    if (!ws) {
      console.error(`❌ 워크시트 없음: ${SHEET_NAME ?? '(첫 시트)'}`)
      process.exit(1)
    }
    worksheet = ws
  } else {
    console.error(`❌ 지원하지 않는 확장자: ${ext} (.csv / .xlsx 만)`)
    process.exit(1)
  }

  // ── 헤더 매핑 ────────────────────────────────────────────────
  const headerRow = worksheet.getRow(1)
  const colToField = new Map<number, keyof VodCatalogEntry>()
  const ignoredColumns: string[] = []
  const unmappedColumns: string[] = []
  const ignoredSet = new Set<string>(VOD_IGNORED_COLUMNS)
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = cellToString(cell.value)
    const norm = normalizeHeader(raw)
    if (norm.length === 0) return
    if (ignoredSet.has(norm)) {
      ignoredColumns.push(raw.trim()) // v5.2 삭제 정책 — 강사·소속·직책 무시
      return
    }
    const field = VOD_HEADER_ALIASES[norm]
    if (field) colToField.set(colNumber, field)
    else unmappedColumns.push(raw.trim())
  })

  if (!new Set(colToField.values()).has('lectureId')) {
    console.error(
      `❌ '강의ID' 컬럼을 찾지 못함 — 헤더: ${[...unmappedColumns, ...ignoredColumns].join(', ') || '(없음)'}`,
    )
    process.exit(1)
  }

  // ── 행 파싱 ──────────────────────────────────────────────────
  const entries: VodCatalogEntry[] = []
  const failures: RowFailure[] = []
  const seenIds = new Map<string, number>() // lectureId → 첫 등장 행
  const duplicateLectureIds: { lectureId: string; firstRow: number; dupRow: number }[] = []
  let totalRows = 0
  let unknownCells = 0
  let mappedCells = 0
  let defaultsAppliedRows = 0

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const cells: Partial<Record<keyof VodCatalogEntry, string>> = {}
    let hasAny = false
    for (const [col, field] of colToField) {
      const s = cellToString(row.getCell(col).value)
      if (s.trim().length > 0) hasAny = true
      mappedCells++
      if (isUnknownMarker(s)) unknownCells++
      cells[field] = s
    }
    if (!hasAny) {
      mappedCells -= colToField.size // 완전 빈 행 — 통계에서 제외
      return
    }
    totalRows++

    const input = buildEntryInput(cells)
    const parsed = vodCatalogEntrySchema.safeParse(input)
    if (!parsed.success) {
      failures.push({
        row: rowNumber,
        lectureId: cells.lectureId?.trim() || null,
        errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      })
      return
    }
    const entry = parsed.data
    const firstRow = seenIds.get(entry.lectureId)
    if (firstRow !== undefined) {
      duplicateLectureIds.push({ lectureId: entry.lectureId, firstRow, dupRow: rowNumber })
      return // 첫 행 유지
    }
    seenIds.set(entry.lectureId, rowNumber)
    if (entry.appliedDefaults.length > 0) defaultsAppliedRows++
    entries.push(entry)
  })

  // ── 산출 (멱등 — lectureId 정렬·고정 포맷) ───────────────────
  entries.sort((a, b) => a.lectureId.localeCompare(b.lectureId, 'ko'))

  const validityDistribution: Record<string, number> = {}
  for (const e of entries) {
    const k = e.validityStatus ?? '(null)'
    validityDistribution[k] = (validityDistribution[k] ?? 0) + 1
  }

  const report = {
    importedAt: new Date().toISOString(),
    inputFile: path.basename(abs),
    sheet: ext === '.csv' ? null : (SHEET_NAME ?? workbook.worksheets[0]?.name ?? null),
    totalRows,
    valid: entries.length,
    failed: failures.length,
    failures,
    unknownCellRate: mappedCells > 0 ? Math.round((unknownCells / mappedCells) * 1000) / 1000 : 0,
    validityDistribution,
    discardCandidates: validityDistribution['폐기후보'] ?? 0,
    duplicateLectureIds,
    defaultsAppliedRows,
    ignoredColumns, // 강사·소속·직책 (v5.2 삭제 정책)
    unmappedColumns,
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(entries, null, 2), 'utf8')
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')

  console.log(
    `✅ 임포트 완료 — 유효 ${entries.length}/${totalRows}행 (실패 ${failures.length} · 중복 ${duplicateLectureIds.length})`,
  )
  console.log(`   [파악 불가] 셀 비율: ${(report.unknownCellRate * 100).toFixed(1)}%`)
  console.log(`   유효성 분포: ${JSON.stringify(validityDistribution)} · 폐기후보 ${report.discardCandidates}`)
  if (ignoredColumns.length > 0) console.log(`   무시한 컬럼(v5.2 정책): ${ignoredColumns.join(', ')}`)
  if (unmappedColumns.length > 0) console.log(`   ⚠️ 매핑 안 된 컬럼: ${unmappedColumns.join(', ')}`)
  for (const f of failures.slice(0, 10)) {
    console.log(`   ❌ 행 ${f.row} (${f.lectureId ?? '?'}): ${f.errors.join(' / ')}`)
  }
  console.log(`   → ${path.relative(process.cwd(), CATALOG_PATH)} · ${path.relative(process.cwd(), REPORT_PATH)}`)
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.stack : e)
  process.exitCode = 1
})

/**
 * Drive 기반 Google Sheets 처리 (Sheets API 미사용 — Drive export 만 활용)
 *
 * 흐름:
 *   1. exportFile(sheetId, xlsx) — Google Sheet → XLSX binary
 *   2. ExcelJS 로 파싱 → 탭별 worksheet
 *   3. 헤더 + row[][] 추출
 *
 * 한계: gid (Google Sheets 탭 ID) → ExcelJS 의 sheet name 매핑 어려움.
 * → 모든 탭 메타 노출 + 사용자가 name 으로 선택.
 *
 * server-only 의도.
 */

import ExcelJS from 'exceljs'
import { exportFile } from './client'
import { log } from '@/lib/logger'

const SHEETS_EXPORT_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// ─────────────────────────────────────────
// 1. Sheet URL → ID 추출
// ─────────────────────────────────────────

/**
 * Google Sheet URL 또는 ID 입력 → file ID 만 추출.
 * URL 예: https://docs.google.com/spreadsheets/d/1PK4az.../edit?gid=1586476588
 */
export function extractSheetId(urlOrId: string): { sheetId: string; gid?: number } {
  // Already ID?
  if (/^[a-zA-Z0-9_-]{20,}$/.test(urlOrId)) {
    return { sheetId: urlOrId }
  }
  // URL parsing
  const idMatch = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (!idMatch) {
    throw new Error(`[extractSheetId] invalid URL or ID: ${urlOrId.slice(0, 80)}`)
  }
  const sheetId = idMatch[1]
  // gid 추출 (선택)
  const gidMatch = urlOrId.match(/[#&?]gid=(\d+)/)
  const gid = gidMatch ? parseInt(gidMatch[1], 10) : undefined
  return { sheetId, gid }
}

// ─────────────────────────────────────────
// 2. Drive Export → ExcelJS workbook
// ─────────────────────────────────────────

export async function fetchSheetWorkbook(sheetId: string): Promise<ExcelJS.Workbook> {
  log.debug('drive-sheet', `exporting sheet ${sheetId} as xlsx`)
  const buf = await exportFile(sheetId, SHEETS_EXPORT_MIME)
  const wb = new ExcelJS.Workbook()
  // ExcelJS 4.x — load 는 Buffer 또는 ArrayBuffer
  // Buffer 타입 호환을 위해 일단 cast
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  log.debug('drive-sheet', `loaded workbook · ${wb.worksheets.length} tabs`)
  return wb
}

// ─────────────────────────────────────────
// 3. Tab 메타 + row 파싱
// ─────────────────────────────────────────

export interface SheetTabMeta {
  /** ExcelJS 의 1-based sheet index */
  index: number
  /** 탭 이름 (Google Sheet 의 탭 명) */
  name: string
  /** 행 수 (헤더 포함) */
  rowCount: number
  /** 열 수 */
  columnCount: number
}

export function listTabs(wb: ExcelJS.Workbook): SheetTabMeta[] {
  return wb.worksheets.map((ws) => ({
    index: ws.id,
    name: ws.name,
    rowCount: ws.rowCount,
    columnCount: ws.columnCount,
  }))
}

export interface SheetCell {
  /** 셀에 표시되는 텍스트 */
  text: string
  /** 셀에 연결된 hyperlink (있으면) — Google Sheets 의 "링크 삽입" 또는 HYPERLINK() 함수 */
  link?: string
}

export interface SheetRow {
  /** 1-based row number in source */
  rowNum: number
  /** Header → text (간편 접근) */
  byHeader: Record<string, string>
  /** Header → { text, link } — link 까지 필요할 때 */
  byHeaderRich: Record<string, SheetCell>
  /** Array — A,B,C 순 cell text (fallback) */
  byIndex: string[]
}

export interface TabContent {
  name: string
  /** 1st row = headers */
  headers: string[]
  rows: SheetRow[]
}

/**
 * 한 worksheet 의 헤더 + row 추출 — hyperlink 포함.
 *
 * - 1행 = header
 * - 각 셀의 text + hyperlink (있으면) 모두 추출
 * - byHeader 는 text 만 (간편), byHeaderRich 는 { text, link }
 */
export function parseTab(ws: ExcelJS.Worksheet, options: { maxRows?: number } = {}): TabContent {
  const maxRows = options.maxRows ?? 5000
  const headerRow = ws.getRow(1)
  const headers: string[] = []
  for (let c = 1; c <= ws.columnCount; c++) {
    const v = headerRow.getCell(c).value
    headers.push(stringifyCell(v))
  }

  const rows: SheetRow[] = []
  const lastRow = Math.min(ws.rowCount, maxRows + 1)
  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r)
    const byIndex: string[] = []
    const byHeader: Record<string, string> = {}
    const byHeaderRich: Record<string, SheetCell> = {}
    let nonEmpty = false
    for (let c = 1; c <= ws.columnCount; c++) {
      const cell = row.getCell(c)
      const rich = extractCellLink(cell.value)
      // ExcelJS 별도 셀.hyperlink 속성도 있을 수 있음 (HYPERLINK() 와 다른 경로)
      const cellHyperlink = (cell as unknown as { hyperlink?: string }).hyperlink
      const finalLink = rich.link ?? cellHyperlink ?? undefined
      byIndex.push(rich.text)
      const headerName = headers[c - 1] || `col${c}`
      byHeader[headerName] = rich.text
      byHeaderRich[headerName] = { text: rich.text, link: finalLink }
      if (rich.text || finalLink) nonEmpty = true
    }
    if (!nonEmpty) continue // 빈 행 skip
    rows.push({ rowNum: r, byHeader, byHeaderRich, byIndex })
  }

  return { name: ws.name, headers, rows }
}

/**
 * 셀에 link 가 있으면 그 URL 도 함께 추출 (hyperlink 셀 처리).
 * ExcelJS 는 cell.value 가 { text, hyperlink } 객체로 들어옴.
 */
export function extractCellLink(value: ExcelJS.CellValue): { text: string; link?: string } {
  if (value && typeof value === 'object') {
    if ('hyperlink' in value && typeof value.hyperlink === 'string') {
      const obj = value as { text?: string; hyperlink: string }
      return { text: obj.text ?? '', link: obj.hyperlink }
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      const rt = value.richText as Array<{ text: string }>
      return { text: rt.map((r) => r.text).join('') }
    }
    if ('formula' in value && 'result' in value) {
      const f = value as { result?: unknown }
      return { text: stringifyCell(f.result) }
    }
  }
  return { text: stringifyCell(value) }
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    if ('text' in o) return String(o.text).trim()
    if ('result' in o) return stringifyCell(o.result)
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text: string }>).map((r) => r.text).join('')
    }
    if ('formula' in o) return String(o.formula)
  }
  return String(value).trim()
}

// ─────────────────────────────────────────
// 4. Drive 링크에서 file ID 추출 (자동 fetch 용)
// ─────────────────────────────────────────

/**
 * Drive URL 에서 file ID 추출.
 * 지원 패턴:
 *   - https://drive.google.com/file/d/FILE_ID/view
 *   - https://drive.google.com/open?id=FILE_ID
 *   - https://docs.google.com/document/d/FILE_ID/edit
 *   - https://docs.google.com/spreadsheets/d/FILE_ID/edit
 *   - https://docs.google.com/presentation/d/FILE_ID/edit
 */
export function extractDriveFileId(url: string): string | null {
  if (!url) return null
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

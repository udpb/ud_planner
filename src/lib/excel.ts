/**
 * Excel 파일 파싱 유틸리티
 *
 * 사용 예:
 *   const rows = await readExcel('/path/to/file.xlsx')
 *   const rows = await readExcel('/path/to/file.xlsx', { sheet: '코치목록', headerRow: 1 })
 */
import ExcelJS from 'exceljs'
import path from 'path'

export interface ExcelReadOptions {
  /** 시트 이름 또는 인덱스 (0-based). 미지정 시 첫 번째 시트 */
  sheet?: string | number
  /** 헤더가 있는 행 번호 (1-based). 기본 1 */
  headerRow?: number
  /** 데이터 시작 행 번호 (1-based). 기본 headerRow + 1 */
  dataStartRow?: number
}

/** 셀 값을 문자열 또는 숫자로 변환 */
function cellValue(cell: ExcelJS.Cell): string | number | boolean | null {
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    // RichText
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('')
    // Formula
    if ('result' in v) return (v as ExcelJS.CellFormulaValue).result as string | number
    // Hyperlink
    if ('text' in v) return String((v as any).text)
    // Date
    if (v instanceof Date) return v.toISOString()
  }
  return v as string | number | boolean
}

/**
 * Excel 파일을 읽어 행 배열(객체)로 반환합니다.
 *
 * @param filePath 절대 경로 또는 상대 경로 (.xlsx, .xls, .csv)
 * @param options  시트/헤더 옵션
 * @returns        헤더를 키로 가진 객체 배열
 */
export async function readExcel(
  filePath: string,
  options: ExcelReadOptions = {}
): Promise<Record<string, string | number | boolean | null>[]> {
  const wb = new ExcelJS.Workbook()
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.csv') {
    await wb.csv.readFile(filePath)
  } else {
    await wb.xlsx.readFile(filePath)
  }

  // 시트 선택
  let ws: ExcelJS.Worksheet
  if (options.sheet === undefined || options.sheet === 0) {
    ws = wb.worksheets[0]
  } else if (typeof options.sheet === 'number') {
    ws = wb.worksheets[options.sheet]
  } else {
    ws = wb.getWorksheet(options.sheet) as ExcelJS.Worksheet
  }
  if (!ws) throw new Error(`시트를 찾을 수 없습니다: ${options.sheet ?? '첫 번째 시트'}`)

  const headerRow = options.headerRow ?? 1
  const dataStartRow = options.dataStartRow ?? headerRow + 1

  // 헤더 수집
  const headers: string[] = []
  ws.getRow(headerRow).eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum] = String(cellValue(cell) ?? `col${colNum}`)
  })

  // 데이터 수집
  const rows: Record<string, string | number | boolean | null>[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum < dataStartRow) return
    const obj: Record<string, string | number | boolean | null> = {}
    let hasValue = false
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const key = headers[colNum]
      if (!key) return
      const val = cellValue(cell)
      obj[key] = val
      if (val !== null && val !== '') hasValue = true
    })
    if (hasValue) rows.push(obj)
  })

  return rows
}

/**
 * Excel 파일의 시트 목록과 헤더를 미리보기용으로 반환합니다.
 */
export async function previewExcel(filePath: string): Promise<{
  sheets: string[]
  headers: Record<string, string[]>
  sampleRows: Record<string, Record<string, any>[]>
}> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  const sheets = wb.worksheets.map((ws) => ws.name)
  const headers: Record<string, string[]> = {}
  const sampleRows: Record<string, Record<string, any>[]> = {}

  for (const ws of wb.worksheets) {
    const hdrs: string[] = []
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
      hdrs[colNum] = String(cellValue(cell) ?? `col${colNum}`)
    })
    headers[ws.name] = hdrs.filter(Boolean)

    // 상위 3행 샘플
    const samples: Record<string, any>[] = []
    let count = 0
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1 || count >= 3) return
      const obj: Record<string, any> = {}
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const key = hdrs[colNum]
        if (key) obj[key] = cellValue(cell)
      })
      samples.push(obj)
      count++
    })
    sampleRows[ws.name] = samples
  }

  return { sheets, headers, sampleRows }
}

import ExcelJS from 'exceljs'
import path from 'path'

function cellValue(cell: ExcelJS.Cell): any {
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    if ('richText' in v) return (v as any).richText.map((r: any) => r.text).join('')
    if ('result' in v) return (v as any).result
    if ('text' in v) return String((v as any).text)
    if (v instanceof Date) return v.toISOString()
  }
  return v
}

async function preview(filePath: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const sheets = wb.worksheets.map(ws => ws.name)
  console.log(`\n${'='.repeat(70)}`)
  console.log(`파일: ${path.basename(filePath)}`)
  console.log(`시트 목록: ${sheets.join(' | ')}`)

  for (const ws of wb.worksheets) {
    const hdrs: string[] = []
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      hdrs[col] = String(cellValue(cell) ?? `col${col}`)
    })
    console.log(`\n  ▸ [${ws.name}] 컬럼(${hdrs.filter(Boolean).length}개): ${hdrs.filter(Boolean).join(' | ')}`)

    let count = 0
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1 || count >= 2) return
      const obj: Record<string, any> = {}
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const key = hdrs[col]; if (key) obj[key] = cellValue(cell)
      })
      console.log(`    행${rowNum}:`, JSON.stringify(obj).slice(0, 300))
      count++
    })
  }
}

const files = process.argv.slice(2)
;(async () => { for (const f of files) await preview(f) })()

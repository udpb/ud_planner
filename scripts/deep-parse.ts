import ExcelJS from 'exceljs'
import path from 'path'

function cv(cell: ExcelJS.Cell): any {
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    if ('richText' in v) return (v as any).richText.map((r: any) => r.text).join('')
    if ('result' in v) return (v as any).result
    if ('text' in v) return String((v as any).text)
    if (v instanceof Date) return v.toISOString().slice(0, 10)
  }
  return v
}

async function parseSheet(filePath: string, sheetName: string, startRow = 1, maxRows = 60) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const ws = wb.getWorksheet(sheetName)
  if (!ws) { console.log(`시트 없음: ${sheetName}`); return }

  console.log(`\n${'─'.repeat(70)}`)
  console.log(`📋 [${path.basename(filePath)}] > [${sheetName}]`)

  let rowCount = 0
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum < startRow || rowCount >= maxRows) return
    const vals: any[] = []
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const v = cv(cell)
      if (v !== null && v !== '') vals.push(`[${col}]${v}`)
    })
    if (vals.length > 0) {
      console.log(`  R${rowNum}: ${vals.join(' | ').slice(0, 300)}`)
    }
    rowCount++
  })
}

;(async () => {
  const kickoff = "C:/Users/USER/Downloads/[네이버 라운드업 리그] 킥오프 및 예산 검토 시트.xlsx"
  const process2026 = "C:/Users/USER/Downloads/ud 업무 프로세스 표준화_2026 ver.xlsx"
  const impact = "C:/Users/USER/Downloads/[샘플] 사업 임팩트 성과인증.xlsx"
  const master = "C:/Users/USER/Downloads/[마스터] 데이터 취합 관리.xlsx"

  // 킥오프: 단가 탭들
  await parseSheet(kickoff, '4-1.기준 단가', 1, 80)
  await parseSheet(kickoff, '4-2.인건비 기준 단가(B2B, B2G) ', 1, 80)
  await parseSheet(kickoff, '4-3.언더독스 서비스 단가', 1, 80)
  await parseSheet(kickoff, '1-1-1. 내부 사업성 검토(주관부서)', 1, 50)
  await parseSheet(kickoff, '0-2. 과업내용(교육)', 1, 40)
  await parseSheet(kickoff, '0-3. 세부사항', 1, 30)

  // 임팩트 성과인증: proxy 데이터 전체
  await parseSheet(impact, '임팩트 측정방법론, proxy 데이터', 1, 60)
  await parseSheet(impact, '사업추진핵심내용 양식', 1, 40)
  await parseSheet(impact, '임팩트 디자인 템플릿', 1, 30)

  // 마스터 데이터: 수집 항목 전체
  await parseSheet(master, '1. 데이터 매뉴얼 필요 데이터 지표 fn의 사본', 2, 80)
  await parseSheet(master, '3 DOGS', 3, 40)
  await parseSheet(master, '4 ACTT (사전사후)', 3, 50)
  await parseSheet(master, '5 창업현황 (사전사후)', 3, 50)
  await parseSheet(master, '1 프로그램 정보', 3, 40)

  // 업무 프로세스
  await parseSheet(process2026, '02.영업 매뉴얼_전 구성원', 4, 50)
  await parseSheet(process2026, '03. 프로젝트 운영 매뉴얼_전 구성원', 4, 50)
  await parseSheet(process2026, '02자동화', 3, 40)
})()

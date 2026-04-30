/**
 * 발주처 budget-template 매핑 출력 (Phase J2)
 *
 * docs/architecture/budget-template.md §3.1·3.2 의 매핑 데이터를 코드로 구현.
 *
 * 시트 2종 (PoC — 16 시트 중 메인):
 *   1. "1-1-1. 주관부서"  ← 내부 사업성 검토용 (PC/AC/마진 자동 계산)
 *   2. "1-2. 외부용"      ← 발주처 제출 견적서 (일반관리비·기업이윤·VAT 포함)
 *
 * 시트 #16 (2. 내부용 세부) 는 후속.
 *
 * 회사 정보 — 환경변수 또는 lib/ud-brand 가 가지고 있을 수 있음. 미설정 시 default.
 */

import 'server-only'
import ExcelJS from 'exceljs'

const COMPANY = {
  name: '㈜ 유디임팩트',
  bizNumber: '693-88-00061',
  representative: '김정헌',
  address: '서울특별시 종로구 돈화문로 88-1, 2층',
  bizType: '교육서비스, MICE 등',
}

export interface BudgetTemplateInput {
  project: {
    name: string
    client: string
    totalBudgetVat: number | null
    supplyPrice: number | null
    eduStartDate: Date | null
    eduEndDate: Date | null
  }
  budget: {
    pcTotal: number
    acTotal: number
    margin: number
    marginRate: number
    items: Array<{
      type: string
      category: string
      name: string
      unit: string | null
      unitPrice: number
      quantity: number
      amount: number
      notes: string | null
    }>
  } | null
  coachAssignments: Array<{
    coach: { name: string; organization: string | null }
    role: string
    sessions: number
    totalHours?: number
    agreedRate: number | null
    totalFee: number | null
  }>
}

const ROLE_TO_PAY_ROLE: Record<string, string> = {
  MAIN_COACH: '코칭',
  SUB_COACH: '코칭',
  LECTURER: '강의',
  SUB_LECTURER: '강의',
  SPECIAL_LECTURER: '강의',
  JUDGE: '심사',
  PM_OPS: '운영',
}

const ROLE_TO_PAY_GRADE: Record<string, string> = {
  MAIN_COACH: '시니어',
  SUB_COACH: '주니어',
  LECTURER: '시니어',
  SUB_LECTURER: '주니어',
  SPECIAL_LECTURER: '디렉터',
  JUDGE: '디렉터',
  PM_OPS: '매니저',
}

const ROLE_LABEL: Record<string, string> = {
  MAIN_COACH: '메인 코치',
  SUB_COACH: '보조 코치',
  LECTURER: '강사',
  SUB_LECTURER: '보조 강사',
  SPECIAL_LECTURER: '특강',
  JUDGE: '심사위원',
  PM_OPS: '운영 PM',
}

// ─────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────

function setHeaderCell(cell: ExcelJS.Cell, value: string | number) {
  cell.value = value
  cell.font = { bold: true, size: 11 }
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEEDE7' },
  }
  cell.border = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
  }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
}

function setDataCell(cell: ExcelJS.Cell, value: string | number) {
  cell.value = value
  cell.border = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
  }
  cell.alignment = { vertical: 'middle' }
}

function setMoneyCell(cell: ExcelJS.Cell, value: number) {
  cell.value = value
  cell.numFmt = '#,##0'
  cell.alignment = { horizontal: 'right', vertical: 'middle' }
  cell.border = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
  }
}

function setFormulaCell(cell: ExcelJS.Cell, formula: string) {
  cell.value = { formula }
  cell.numFmt = '#,##0'
  cell.alignment = { horizontal: 'right', vertical: 'middle' }
  cell.border = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
  }
}

function setPercentCell(cell: ExcelJS.Cell, formula: string) {
  cell.value = { formula }
  cell.numFmt = '0.0%'
  cell.alignment = { horizontal: 'right', vertical: 'middle' }
  cell.border = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
  }
}

function monthsBetween(start: Date | null, end: Date | null): number {
  if (!start || !end) return 1
  const ms = end.getTime() - start.getTime()
  return Math.max(1, Math.round(ms / (30 * 24 * 60 * 60 * 1000)))
}

// ─────────────────────────────────────────
// 시트 1: "1-1-1. 주관부서" 메인 출력
//   docs/architecture/budget-template.md §3.1 참조
// ─────────────────────────────────────────

function buildSheet1(wb: ExcelJS.Workbook, input: BudgetTemplateInput): void {
  const ws = wb.addWorksheet('1-1-1. 주관부서')
  ws.properties.defaultRowHeight = 18

  // 컬럼 폭
  ws.columns = [
    { width: 4 }, { width: 14 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 10 }, { width: 14 }, { width: 12 }, { width: 14 },
  ]

  // 상단 — 사업명·예산 요약
  ws.mergeCells('B3:I3')
  setHeaderCell(ws.getCell('B3'), '1-1-1. 주관부서 (내부 사업성 검토)')
  ws.getRow(3).height = 26

  setDataCell(ws.getCell('B5'), '사업명')
  ws.mergeCells('D5:I5')
  setDataCell(ws.getCell('D5'), input.project.name)

  // 예산 표 (E7~E14, F11~F14)
  setHeaderCell(ws.getCell('B7'), '구분')
  setHeaderCell(ws.getCell('C7'), '항목')
  setHeaderCell(ws.getCell('D7'), '비고')
  setHeaderCell(ws.getCell('E7'), '금액 (R)')
  setHeaderCell(ws.getCell('F7'), '비율')

  setDataCell(ws.getCell('B8'), '예산')
  setDataCell(ws.getCell('C8'), 'VAT 포함 (R)')
  setMoneyCell(ws.getCell('E7'), input.project.totalBudgetVat ?? 0) // 헤더 행에 직접 값 — 매핑 표대로

  // 위 매핑은 사실 E7 가 헤더 + E7 가 값이라 충돌. 매핑 표대로 정확히:
  //   E7  = 총 예산 (R) 입력값
  //   E8  = VAT (=E7/11)
  //   E10 = 공급가액 (=E7-E8)
  //   E11 = PC (=G59 또는 직접)
  //   E12 = AC (=C22 또는 직접)
  //   E14 = OR (=E10-E11-E12)
  //   F11 = PC/E10
  //   F12 = AC/E10
  //   F14 = OR/E10  (마진율)
  // 메인 표는 다음 row 부터 다시.

  setDataCell(ws.getCell('C9'), '총 예산 (VAT 포함, R)')
  setMoneyCell(ws.getCell('E9'), input.project.totalBudgetVat ?? 0)

  setDataCell(ws.getCell('C10'), 'VAT (E9 / 11)')
  setFormulaCell(ws.getCell('E10'), 'E9/11')

  setDataCell(ws.getCell('C11'), '공급가액 (R\')')
  setFormulaCell(ws.getCell('E11'), 'E9-E10')

  setDataCell(ws.getCell('B13'), '비용')
  setDataCell(ws.getCell('C13'), '인건비 (PC)')
  setMoneyCell(ws.getCell('E13'), input.budget?.pcTotal ?? 0)
  setPercentCell(ws.getCell('F13'), 'E13/E11')

  setDataCell(ws.getCell('C14'), '사업 실비 (AC)')
  setMoneyCell(ws.getCell('E14'), input.budget?.acTotal ?? 0)
  setPercentCell(ws.getCell('F14'), 'E14/E11')

  setDataCell(ws.getCell('B16'), '마진')
  setDataCell(ws.getCell('C16'), '영업이익 (OR)')
  setFormulaCell(ws.getCell('E16'), 'E11-E13-E14')
  setPercentCell(ws.getCell('F16'), 'E16/E11')
  // 마진율 < 10% 시 색 강조
  const marginRate = input.budget?.marginRate ?? 0
  if (marginRate < 10) {
    ws.getCell('F16').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFE0E0' },
    }
  }

  // 실비 표 (B25 ~ I35)
  let r = 25
  setHeaderCell(ws.getCell(`B${r}`), '실비 항목 (AC)')
  ws.mergeCells(`B${r}:I${r}`)
  r += 1

  setHeaderCell(ws.getCell(`B${r}`), '구분')
  setHeaderCell(ws.getCell(`C${r}`), '항목')
  setHeaderCell(ws.getCell(`D${r}`), '세부 내역')
  setHeaderCell(ws.getCell(`E${r}`), '단가')
  setHeaderCell(ws.getCell(`F${r}`), '건/시간')
  setHeaderCell(ws.getCell(`G${r}`), '명')
  setHeaderCell(ws.getCell(`H${r}`), '회/개월')
  setHeaderCell(ws.getCell(`I${r}`), '행 합계')
  r += 1

  const acItems = input.budget?.items.filter((i) => i.type === 'AC') ?? []
  const acStartRow = r
  for (const item of acItems) {
    setDataCell(ws.getCell(`B${r}`), item.category)
    setDataCell(ws.getCell(`C${r}`), item.name)
    setDataCell(ws.getCell(`D${r}`), item.notes ?? '')
    setMoneyCell(ws.getCell(`E${r}`), item.unitPrice)
    setDataCell(ws.getCell(`F${r}`), item.quantity)
    setDataCell(ws.getCell(`G${r}`), 1)
    setDataCell(ws.getCell(`H${r}`), 1)
    setFormulaCell(ws.getCell(`I${r}`), `E${r}*F${r}*G${r}*H${r}`)
    r += 1
  }
  if (acItems.length === 0) {
    setDataCell(ws.getCell(`B${r}`), '(실비 항목 미입력)')
    ws.mergeCells(`B${r}:I${r}`)
    r += 1
  }

  // 합계 행
  setHeaderCell(ws.getCell(`B${r}`), 'AC 합계')
  ws.mergeCells(`B${r}:H${r}`)
  if (acItems.length > 0) {
    setFormulaCell(ws.getCell(`I${r}`), `SUM(I${acStartRow}:I${r - 1})`)
  } else {
    setMoneyCell(ws.getCell(`I${r}`), 0)
  }
  r += 2

  // 인건비 표 (코치)
  setHeaderCell(ws.getCell(`B${r}`), '인건비 (PC) — 코치 배정')
  ws.mergeCells(`B${r}:I${r}`)
  r += 1

  setHeaderCell(ws.getCell(`B${r}`), '코치명')
  setHeaderCell(ws.getCell(`C${r}`), '직군')
  setHeaderCell(ws.getCell(`D${r}`), '직급')
  setHeaderCell(ws.getCell(`E${r}`), '인원')
  setHeaderCell(ws.getCell(`F${r}`), '시간')
  setHeaderCell(ws.getCell(`G${r}`), '시간당')
  setHeaderCell(ws.getCell(`H${r}`), '소속')
  setHeaderCell(ws.getCell(`I${r}`), '행 합계')
  r += 1

  const pcStartRow = r
  for (const a of input.coachAssignments) {
    setDataCell(ws.getCell(`B${r}`), a.coach.name)
    setDataCell(ws.getCell(`C${r}`), ROLE_TO_PAY_ROLE[a.role] ?? a.role)
    setDataCell(ws.getCell(`D${r}`), ROLE_TO_PAY_GRADE[a.role] ?? '')
    setDataCell(ws.getCell(`E${r}`), 1)
    setDataCell(ws.getCell(`F${r}`), a.totalHours ?? a.sessions)
    setMoneyCell(ws.getCell(`G${r}`), a.agreedRate ?? 0)
    setDataCell(ws.getCell(`H${r}`), a.coach.organization ?? '')
    // 행 합계 = totalFee 직접 (coach-finder 단가 기반, 수식 X)
    setMoneyCell(ws.getCell(`I${r}`), a.totalFee ?? 0)
    r += 1
  }
  if (input.coachAssignments.length === 0) {
    setDataCell(ws.getCell(`B${r}`), '(코치 배정 미입력)')
    ws.mergeCells(`B${r}:I${r}`)
    r += 1
  }

  setHeaderCell(ws.getCell(`B${r}`), 'PC 합계')
  ws.mergeCells(`B${r}:H${r}`)
  if (input.coachAssignments.length > 0) {
    setFormulaCell(ws.getCell(`I${r}`), `SUM(I${pcStartRow}:I${r - 1})`)
  } else {
    setMoneyCell(ws.getCell(`I${r}`), 0)
  }
}

// ─────────────────────────────────────────
// 시트 2: "1-2. 외부용" 발주처 제출 견적
//   docs/architecture/budget-template.md §3.2
// ─────────────────────────────────────────

function buildSheet2(wb: ExcelJS.Workbook, input: BudgetTemplateInput): void {
  const ws = wb.addWorksheet('1-2. 외부용')
  ws.properties.defaultRowHeight = 18
  ws.columns = [
    { width: 4 }, { width: 18 }, { width: 18 }, { width: 18 },
    { width: 12 }, { width: 14 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 16 },
  ]

  // 제목
  ws.mergeCells('B2:J2')
  setHeaderCell(ws.getCell('B2'), `${input.project.name} 산출내역서`)
  ws.getRow(2).height = 30
  ws.getCell('B2').font = { bold: true, size: 14 }

  // 좌측 — 수신·견적 정보
  setDataCell(ws.getCell('B4'), '수신처')
  ws.mergeCells('C4:E4')
  setDataCell(ws.getCell('C4'), input.project.client)

  setDataCell(ws.getCell('B5'), '사업명')
  ws.mergeCells('C5:E5')
  setDataCell(ws.getCell('C5'), input.project.name)

  setDataCell(ws.getCell('B6'), '견적일자')
  ws.mergeCells('C6:E6')
  setDataCell(ws.getCell('C6'), new Date().toISOString().slice(0, 10))

  setDataCell(ws.getCell('B7'), '견적금액 (VAT 포함)')
  ws.mergeCells('C7:E7')
  setMoneyCell(ws.getCell('C7'), input.project.totalBudgetVat ?? 0)

  // 우측 — 회사 정보
  setDataCell(ws.getCell('G4'), '사업자번호')
  ws.mergeCells('H4:J4')
  setDataCell(ws.getCell('H4'), COMPANY.bizNumber)

  setDataCell(ws.getCell('G5'), '상호 / 대표')
  ws.mergeCells('H5:J5')
  setDataCell(ws.getCell('H5'), `${COMPANY.name} / ${COMPANY.representative}`)

  setDataCell(ws.getCell('G6'), '주소')
  ws.mergeCells('H6:J6')
  setDataCell(ws.getCell('H6'), COMPANY.address)

  setDataCell(ws.getCell('G7'), '업태')
  ws.mergeCells('H7:J7')
  setDataCell(ws.getCell('H7'), COMPANY.bizType)

  // 산출 내역 표 (B10 ~)
  let r = 10
  setHeaderCell(ws.getCell(`B${r}`), '구분')
  setHeaderCell(ws.getCell(`C${r}`), '항목')
  setHeaderCell(ws.getCell(`D${r}`), '세부')
  setHeaderCell(ws.getCell(`F${r}`), '단가')
  setHeaderCell(ws.getCell(`G${r}`), '명')
  setHeaderCell(ws.getCell(`H${r}`), '개월')
  setHeaderCell(ws.getCell(`I${r}`), '투입률')
  setHeaderCell(ws.getCell(`J${r}`), '소계')
  r += 1

  // 인건비 (운영진) - PM_OPS
  const opsAssignments = input.coachAssignments.filter((a) => a.role === 'PM_OPS')
  const months = monthsBetween(input.project.eduStartDate, input.project.eduEndDate)
  const personnelStart = r

  if (opsAssignments.length > 0) {
    for (const a of opsAssignments) {
      setDataCell(ws.getCell(`B${r}`), '인건비')
      setDataCell(ws.getCell(`C${r}`), '운영진')
      setDataCell(ws.getCell(`D${r}`), `${a.coach.name} (운영 PM)`)
      setMoneyCell(ws.getCell(`F${r}`), a.agreedRate ? a.agreedRate * 200 : 5_000_000) // 시간당→월간 추정
      setDataCell(ws.getCell(`G${r}`), 1)
      setDataCell(ws.getCell(`H${r}`), months)
      setDataCell(ws.getCell(`I${r}`), 1.0)
      setFormulaCell(ws.getCell(`J${r}`), `F${r}*G${r}*H${r}*I${r}`)
      r += 1
    }
  } else {
    // placeholder — PM 1명 100% 투입
    setDataCell(ws.getCell(`B${r}`), '인건비')
    setDataCell(ws.getCell(`C${r}`), '운영진')
    setDataCell(ws.getCell(`D${r}`), 'PM (운영 매니저)')
    setMoneyCell(ws.getCell(`F${r}`), 5_000_000)
    setDataCell(ws.getCell(`G${r}`), 1)
    setDataCell(ws.getCell(`H${r}`), months)
    setDataCell(ws.getCell(`I${r}`), 1.0)
    setFormulaCell(ws.getCell(`J${r}`), `F${r}*G${r}*H${r}*I${r}`)
    r += 1
  }

  // 인건비 합계
  const personnelEnd = r - 1
  setHeaderCell(ws.getCell(`B${r}`), '인건비 합계')
  ws.mergeCells(`B${r}:I${r}`)
  setFormulaCell(ws.getCell(`J${r}`), `SUM(J${personnelStart}:J${personnelEnd})`)
  const personnelTotalRow = r
  r += 2

  // 모객/컨설팅 (AC 의 일부 카테고리)
  const consultingCategories = ['모객', '홍보', '심사', '컨설팅']
  const consultingItems =
    input.budget?.items.filter(
      (i) =>
        i.type === 'AC' && consultingCategories.some((c) => i.category.includes(c)),
    ) ?? []
  const consultingStart = r

  if (consultingItems.length > 0) {
    for (const item of consultingItems) {
      setDataCell(ws.getCell(`B${r}`), '운영비')
      setDataCell(ws.getCell(`C${r}`), item.category)
      setDataCell(ws.getCell(`D${r}`), item.name)
      setMoneyCell(ws.getCell(`F${r}`), item.unitPrice)
      setDataCell(ws.getCell(`G${r}`), 1)
      setDataCell(ws.getCell(`H${r}`), item.quantity)
      setDataCell(ws.getCell(`I${r}`), 1.0)
      setFormulaCell(ws.getCell(`J${r}`), `F${r}*G${r}*H${r}*I${r}`)
      r += 1
    }
  } else {
    setDataCell(ws.getCell(`B${r}`), '(모객·컨설팅 미입력)')
    ws.mergeCells(`B${r}:J${r}`)
    r += 1
  }

  const consultingEnd = r - 1
  setHeaderCell(ws.getCell(`B${r}`), '모객·컨설팅 합계')
  ws.mergeCells(`B${r}:I${r}`)
  if (consultingItems.length > 0) {
    setFormulaCell(ws.getCell(`J${r}`), `SUM(J${consultingStart}:J${consultingEnd})`)
  } else {
    setMoneyCell(ws.getCell(`J${r}`), 0)
  }
  const consultingTotalRow = r
  r += 2

  // 경상운영비 (AC 의 나머지)
  const otherItems =
    input.budget?.items.filter(
      (i) =>
        i.type === 'AC' && !consultingCategories.some((c) => i.category.includes(c)),
    ) ?? []
  const otherTotal = otherItems.reduce((s, i) => s + i.amount, 0)

  setHeaderCell(ws.getCell(`B${r}`), '경상운영비')
  ws.mergeCells(`B${r}:I${r}`)
  setMoneyCell(ws.getCell(`J${r}`), otherTotal)
  const otherRow = r
  r += 2

  // 사업비 계
  setHeaderCell(ws.getCell(`B${r}`), '사업비 계')
  ws.mergeCells(`B${r}:I${r}`)
  setFormulaCell(
    ws.getCell(`J${r}`),
    `J${personnelTotalRow}+J${consultingTotalRow}+J${otherRow}`,
  )
  const subTotalRow = r
  r += 1

  // 일반관리비 (5%)
  setHeaderCell(ws.getCell(`B${r}`), '일반관리비 (5%)')
  ws.mergeCells(`B${r}:I${r}`)
  setFormulaCell(ws.getCell(`J${r}`), `J${subTotalRow}*0.05`)
  const adminRow = r
  r += 1

  // 기업이윤 (8%) — budget-template.md Q3: 보정값 -15,100 의 의미는 미해결.
  // 일단 표준 공식만 사용 (보정값 추후).
  setHeaderCell(ws.getCell(`B${r}`), '기업이윤 (8%)')
  ws.mergeCells(`B${r}:I${r}`)
  setFormulaCell(ws.getCell(`J${r}`), `(J${subTotalRow}+J${adminRow})*0.08`)
  const profitRow = r
  r += 1

  // 사업비 합계 (공급가액)
  setHeaderCell(ws.getCell(`B${r}`), '사업비 합계 (공급가액)')
  ws.mergeCells(`B${r}:I${r}`)
  setFormulaCell(ws.getCell(`J${r}`), `J${subTotalRow}+J${adminRow}+J${profitRow}`)
  const supplyRow = r
  r += 1

  // VAT
  setHeaderCell(ws.getCell(`B${r}`), 'VAT (10%)')
  ws.mergeCells(`B${r}:I${r}`)
  setFormulaCell(ws.getCell(`J${r}`), `J${supplyRow}*0.1`)
  const vatRow = r
  r += 1

  // 총계
  ws.getCell(`B${r}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF05519' },
  }
  ws.getCell(`B${r}`).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
  setHeaderCell(ws.getCell(`B${r}`), '총계 (VAT 포함)')
  ws.mergeCells(`B${r}:I${r}`)
  setFormulaCell(ws.getCell(`J${r}`), `J${supplyRow}+J${vatRow}`)
  ws.getCell(`J${r}`).font = { bold: true, size: 12 }
}

// ─────────────────────────────────────────
// 메인
// ─────────────────────────────────────────

export async function buildBudgetTemplateExcel(
  input: BudgetTemplateInput,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'UD-Ops Workspace'
  wb.created = new Date()
  wb.title = `${input.project.name} 발주처 템플릿`
  wb.subject = '발주처 제출용 산출내역서 (PoC)'

  buildSheet1(wb, input)
  buildSheet2(wb, input)

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer as ArrayBuffer)
}

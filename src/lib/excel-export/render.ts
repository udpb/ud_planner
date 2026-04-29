/**
 * Project → Excel Workbook 변환 (Phase J PoC, 2026-04-29)
 *
 * 5 시트 단순 형식:
 *   1. 프로젝트 요약 — 사업명·기관·예산·기간·KPI
 *   2. 커리큘럼 — 회차별 (Step 2 산출물)
 *   3. 코치 배정 — 역할·세션수·사례비 (Step 3)
 *   4. 예산 — PC/AC 항목 (Step 4)
 *   5. SROI Forecast — Outcome 화폐환산 (Step 5)
 *
 * 발주처 템플릿 (16 시트 budget-template) 매핑은 후속.
 * ADR 후보: 사용자 피드백 후 제정.
 *
 * server-only — exceljs 의 stream + Vercel serverless 호환.
 */

import 'server-only'
import ExcelJS from 'exceljs'

// 우리 Prisma Project 타입은 너무 두꺼워서 partial 만 받음.
export interface ExcelExportInput {
  project: {
    id: string
    name: string
    client: string
    projectType: 'B2G' | 'B2B'
    totalBudgetVat: number | null
    supplyPrice: number | null
    eduStartDate: Date | null
    eduEndDate: Date | null
    proposalConcept: string | null
    proposalBackground: string | null
    keyPlanningPoints: unknown
    sroiForecast: unknown
    sroiCountry: string
  }
  curriculum: Array<{
    sessionNo: number
    title: string
    durationHours: number
    isTheory: boolean
    isActionWeek: boolean
    venue: string | null
    notes: string | null
    date: Date | null
  }>
  coachAssignments: Array<{
    coach: { name: string; organization: string | null }
    role: string
    sessions: number
    agreedRate: number | null
    totalFee: number | null
    confirmed: boolean
  }>
  budget: {
    pcTotal: number
    acTotal: number
    margin: number
    marginRate: number
    items: Array<{
      wbsCode: string
      type: string
      category: string
      name: string
      unit: string | null
      unitPrice: number
      quantity: number
      amount: number
    }>
  } | null
}

const ROLE_LABEL: Record<string, string> = {
  MAIN_COACH: '메인 코치',
  SUB_COACH: '보조 코치',
  LECTURER: '강사 (메인)',
  SUB_LECTURER: '강사 (보조)',
  SPECIAL_LECTURER: '특강 연사',
  JUDGE: '심사위원',
  PM_OPS: '운영 PM',
}

// ─────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────

function fmtDate(d: Date | null): string {
  if (!d) return ''
  try {
    return d.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function setBoldHeader(row: ExcelJS.Row): void {
  row.font = { bold: true }
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEEDE7' }, // light orange (Action Orange 20)
  }
}

function autoWidth(ws: ExcelJS.Worksheet): void {
  ws.columns.forEach((col) => {
    let max = 8
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length
      if (len > max) max = len
    })
    col.width = Math.min(50, max + 2)
  })
}

// ─────────────────────────────────────────
// 시트별 builder
// ─────────────────────────────────────────

function buildSummarySheet(wb: ExcelJS.Workbook, input: ExcelExportInput): void {
  const ws = wb.addWorksheet('1. 프로젝트 요약')

  ws.addRow(['항목', '값'])
  setBoldHeader(ws.lastRow!)

  const p = input.project
  const totalBudget = p.totalBudgetVat ?? 0
  const supplyPrice = p.supplyPrice ?? Math.round(totalBudget / 1.1)

  const rows: Array<[string, string | number]> = [
    ['사업명', p.name],
    ['발주기관', p.client],
    ['사업 유형', p.projectType],
    ['총 예산 (VAT 포함)', totalBudget],
    ['공급가액', supplyPrice],
    ['교육 시작일', fmtDate(p.eduStartDate)],
    ['교육 종료일', fmtDate(p.eduEndDate)],
    ['제안 컨셉', p.proposalConcept ?? '(미작성)'],
    ['SROI 국가', p.sroiCountry],
  ]
  for (const r of rows) ws.addRow(r)

  // 핵심 기획 포인트
  if (Array.isArray(p.keyPlanningPoints) && p.keyPlanningPoints.length > 0) {
    ws.addRow([])
    const head = ws.addRow(['핵심 기획 포인트', ''])
    setBoldHeader(head)
    for (const m of p.keyPlanningPoints as string[]) {
      ws.addRow([`· ${m}`, ''])
    }
  }

  // 제안 배경
  if (p.proposalBackground) {
    ws.addRow([])
    const head = ws.addRow(['제안 배경 / Before-After', ''])
    setBoldHeader(head)
    const cell = ws.addRow([p.proposalBackground]).getCell(1)
    cell.alignment = { wrapText: true, vertical: 'top' }
    ws.lastRow!.height = 80
  }

  autoWidth(ws)
}

function buildCurriculumSheet(wb: ExcelJS.Workbook, input: ExcelExportInput): void {
  const ws = wb.addWorksheet('2. 커리큘럼')

  ws.addRow(['회차', '제목', '시간', '날짜', '장소', '구분', '비고'])
  setBoldHeader(ws.lastRow!)

  if (input.curriculum.length === 0) {
    ws.addRow(['(미작성)', '', '', '', '', '', ''])
  } else {
    for (const c of input.curriculum.sort((a, b) => a.sessionNo - b.sessionNo)) {
      const tag =
        c.isActionWeek
          ? 'Action Week'
          : c.isTheory
            ? '이론'
            : '실습'
      ws.addRow([
        c.sessionNo,
        c.title,
        c.durationHours,
        fmtDate(c.date),
        c.venue ?? '',
        tag,
        c.notes ?? '',
      ])
    }
  }
  autoWidth(ws)
}

function buildCoachSheet(wb: ExcelJS.Workbook, input: ExcelExportInput): void {
  const ws = wb.addWorksheet('3. 코치 배정')

  ws.addRow(['코치명', '소속', '역할', '세션수', '시간당 단가', '총 사례비', '확정'])
  setBoldHeader(ws.lastRow!)

  if (input.coachAssignments.length === 0) {
    ws.addRow(['(배정 코치 없음)', '', '', '', '', '', ''])
  } else {
    for (const a of input.coachAssignments) {
      ws.addRow([
        a.coach.name,
        a.coach.organization ?? '',
        ROLE_LABEL[a.role] ?? a.role,
        a.sessions,
        a.agreedRate ?? 0,
        a.totalFee ?? 0,
        a.confirmed ? '✓' : '대기',
      ])
    }
    // 합계 행
    const totalFee = input.coachAssignments.reduce((s, a) => s + (a.totalFee ?? 0), 0)
    const sumRow = ws.addRow(['합계', '', '', '', '', totalFee, ''])
    sumRow.font = { bold: true }
  }
  autoWidth(ws)
}

function buildBudgetSheet(wb: ExcelJS.Workbook, input: ExcelExportInput): void {
  const ws = wb.addWorksheet('4. 예산')

  if (!input.budget) {
    ws.addRow(['(예산 미작성)'])
    autoWidth(ws)
    return
  }

  // 요약 (상단)
  const summary = [
    ['공급가액 합계', input.budget.pcTotal + input.budget.acTotal],
    ['PC (인건비) 합계', input.budget.pcTotal],
    ['AC (운영비) 합계', input.budget.acTotal],
    ['마진 (이윤)', input.budget.margin],
    ['마진율 (%)', input.budget.marginRate],
  ]
  ws.addRow(['요약', '값'])
  setBoldHeader(ws.lastRow!)
  for (const r of summary) ws.addRow(r)

  ws.addRow([])

  // 상세 (하단)
  ws.addRow(['WBS', '구분', '카테고리', '항목명', '단위', '단가', '수량', '금액'])
  setBoldHeader(ws.lastRow!)
  for (const item of input.budget.items) {
    ws.addRow([
      item.wbsCode,
      item.type,
      item.category,
      item.name,
      item.unit ?? '',
      item.unitPrice,
      item.quantity,
      item.amount,
    ])
  }
  autoWidth(ws)
}

function buildSroiSheet(wb: ExcelJS.Workbook, input: ExcelExportInput): void {
  const ws = wb.addWorksheet('5. SROI Forecast')

  const sroi = input.project.sroiForecast as
    | { ratio?: number; totalValue?: number; outcomes?: Array<{ name: string; value: number; proxy?: string }> }
    | null
    | undefined

  if (!sroi || (!sroi.ratio && !sroi.outcomes)) {
    ws.addRow(['(SROI Forecast 미산정 — 정밀 산출은 Step 5)'])
    autoWidth(ws)
    return
  }

  ws.addRow(['항목', '값'])
  setBoldHeader(ws.lastRow!)
  if (sroi.ratio) ws.addRow(['SROI 비율', `1:${sroi.ratio.toFixed(1)}`])
  if (sroi.totalValue) ws.addRow(['총 사회적 가치 (KRW)', sroi.totalValue])
  ws.addRow(['국가 기준', input.project.sroiCountry])

  if (Array.isArray(sroi.outcomes) && sroi.outcomes.length > 0) {
    ws.addRow([])
    ws.addRow(['Outcome 명', '화폐환산 값', '프록시'])
    setBoldHeader(ws.lastRow!)
    for (const o of sroi.outcomes) {
      ws.addRow([o.name, o.value, o.proxy ?? ''])
    }
  }

  autoWidth(ws)
}

// ─────────────────────────────────────────
// 메인 exporter
// ─────────────────────────────────────────

export async function buildProjectExcel(input: ExcelExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'UD-Ops Workspace'
  wb.created = new Date()
  wb.lastModifiedBy = 'UD-Ops Workspace'
  wb.title = `${input.project.name} 제안 자료`
  wb.subject = '내부 검토용 (PoC)'

  buildSummarySheet(wb, input)
  buildCurriculumSheet(wb, input)
  buildCoachSheet(wb, input)
  buildBudgetSheet(wb, input)
  buildSroiSheet(wb, input)

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer as ArrayBuffer)
}

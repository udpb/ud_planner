/**
 * Sphere 2 — Budget Extractor (W6)
 *
 * 산출내역서 XLSX → LLM 으로 항목별 표 정규화 → ProposalBudgetItem 다수.
 *
 * XLSX 구조가 사업마다 다름 (column 명·순서·표 위치 모두 다양). 단순 파싱 X.
 * → ExcelJS 로 cell 행렬 추출 → LLM 1 회로 "이 표에서 항목 N개 추출해서 정규화 JSON 으로"
 *
 * 호출 횟수: 사업 1건 = 1 LLM (Gemini Flash, ~10초).
 * server-only 의도.
 */

import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import { z } from 'zod'
import type { Channel } from './types'

// ─────────────────────────────────────────
// Input
// ─────────────────────────────────────────

export interface BudgetExtractInput {
  /** XLSX 의 모든 cell 을 평탄화 한 텍스트 (시트별 구분) */
  flattenedSheet: string
  /** 메타 */
  sourceProject: string
  channel: Channel
}

// ─────────────────────────────────────────
// LLM 응답 schema (lenient)
// ─────────────────────────────────────────

const BudgetCategoryValues = [
  '인건비',
  '운영비',
  '재료비',
  '외주비',
  '강사료',
  '회의비',
  '여비',
  '기타',
] as const

const BudgetItemSchema = z.object({
  category: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return '기타'
      // LLM 이 다른 표현 출력 시 매핑
      if (v.includes('인건') || v.includes('급여') || v.includes('수당')) return '인건비'
      if (v.includes('강사') || v.includes('코치')) return '강사료'
      if (v.includes('회의') || v.includes('회식')) return '회의비'
      if (v.includes('재료') || v.includes('소모품') || v.includes('교재')) return '재료비'
      if (v.includes('외주') || v.includes('용역') || v.includes('위탁')) return '외주비'
      if (v.includes('여비') || v.includes('출장') || v.includes('교통')) return '여비'
      if (v.includes('운영') || v.includes('관리')) return '운영비'
      if ((BudgetCategoryValues as readonly string[]).includes(v)) return v
      return '기타'
    },
    z.enum(BudgetCategoryValues),
  ),
  itemName: z.string().min(1).max(200),
  description: z.preprocess(
    (v) => (v == null ? undefined : v),
    z.string().max(1000).optional(),
  ),
  unit: z.preprocess(
    (v) => (v == null ? undefined : v),
    z.string().max(20).optional(),
  ),
  quantity: z.preprocess(
    (v) => (typeof v === 'number' ? v : v == null ? undefined : Number(v) || undefined),
    z.number().nonnegative().optional(),
  ),
  unitPrice: z.preprocess(
    (v) => (typeof v === 'number' ? v : v == null ? undefined : Number(v) || undefined),
    z.number().nonnegative().optional(),
  ),
  amount: z.preprocess(
    (v) => (typeof v === 'number' ? v : Number(v) || 0),
    z.number().nonnegative(), // 필수
  ),
})

const BudgetResponseSchema = z.object({
  items: z.array(BudgetItemSchema).min(0).max(100),
  totalAmount: z.number().nonnegative().optional(),
  confidence: z.number().min(0).max(1),
  /** LLM 이 표 해석 어려웠던 경우의 메모 */
  notes: z.string().optional(),
})

export type BudgetItemExtracted = z.infer<typeof BudgetItemSchema>

// ─────────────────────────────────────────
// Output
// ─────────────────────────────────────────

export interface BudgetExtractOutput {
  items: BudgetItemExtracted[]
  totalAmount: number
  confidence: number
  notes?: string
  tokensUsed: number
  elapsedMs: number
}

// ─────────────────────────────────────────
// LLM Prompt
// ─────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 언더독스 사업 예산 분석 전문가입니다.
산출내역서 XLSX 의 cell 데이터를 받아 **예산 항목을 정규화**합니다.

**임무**: 표에서 각 예산 항목을 식별해 { category, itemName, unit, quantity, unitPrice, amount } 로 추출.

**category 분류 (8개 고정)**:
- 인건비: 운영인력·코디네이터·매니저 등의 급여·수당
- 강사료: 외부 강사·코치·멘토 강의료
- 운영비: 공간 임대·운영 관리·진행비
- 재료비: 교재·소모품·인쇄·키트
- 외주비: 용역·위탁·외부 제작
- 회의비: 회의 운영·식음료·간식
- 여비: 출장·교통·숙박
- 기타: 분류 어려운 항목

**규칙**:
- 표의 머리글 (column name) 행과 합계 행은 제외
- 빈 항목 X — amount 가 있는 row 만 (금액이 0 또는 없으면 skip)
- amount 는 원 단위 숫자만 (예: 5,000,000 → 5000000, "5백만" 형식 X)
- quantity, unitPrice 가 표에 없으면 **field 자체를 생략** (null 대신 key 자체 X)
- itemName 은 200자 이내 (긴 설명은 description 으로)
- 동일 항목 여러 시트에 있으면 **1번만 추출** (중복 X)
- 최대 50개 항목까지만 — 너무 많으면 의미 단위로 묶기 (예: "인건비 (전체)")

**confidence**:
- 0.9+ : 표 구조 명확, 모든 항목 정확히 추출
- 0.6~0.9: 일부 모호, 대부분 추출 성공
- < 0.6: 표 해석 어려움, notes 에 설명

JSON 만 출력.`

function buildPrompt(input: BudgetExtractInput): string {
  return `${SYSTEM_PROMPT}

[사업 정보]
프로젝트: ${input.sourceProject}
채널: ${input.channel}

[산출내역서 XLSX cell 데이터 — 시트별]
${input.flattenedSheet.slice(0, 12000)}

[출력 JSON 스키마]
{
  "items": [
    {
      "category": "인건비",
      "itemName": "운영 인건비 (PM 1명)",
      "description": "사업 전반 진행 관리",
      "unit": "월",
      "quantity": 4,
      "unitPrice": 3000000,
      "amount": 12000000
    },
    ...
  ],
  "totalAmount": 50000000,
  "confidence": 0.92,
  "notes": null
}

JSON 만 출력.`
}

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

export async function extractBudget(input: BudgetExtractInput): Promise<BudgetExtractOutput> {
  const startedAt = Date.now()
  const prompt = buildPrompt(input)

  const aiResult = await invokeAi({
    prompt,
    maxTokens: 32768, // 큰 표·다수 항목 대응 — 응답 truncation 방지
    temperature: 0.2,
    label: `budget-extract:${input.sourceProject.slice(0, 60)}`,
  })

  let parsed: unknown
  try {
    parsed = safeParseJson(aiResult.raw, `budget-extract:${input.sourceProject.slice(0, 60)}`)
  } catch (e) {
    log.error('inference', '[budget-extract] JSON 파싱 실패', {
      sourceProject: input.sourceProject,
      err: e instanceof Error ? e.message : String(e),
    })
    throw e
  }

  const validated = BudgetResponseSchema.safeParse(parsed)
  if (!validated.success) {
    log.error('inference', '[budget-extract] 스키마 검증 실패', {
      sourceProject: input.sourceProject,
      issues: validated.error.issues.slice(0, 3),
    })
    throw new Error(
      `[budget-extract] schema 검증 실패: ${validated.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .slice(0, 3)
        .join(' / ')}`,
    )
  }

  const computedTotal =
    validated.data.totalAmount ??
    validated.data.items.reduce((sum, it) => sum + (it.amount || 0), 0)

  const result: BudgetExtractOutput = {
    items: validated.data.items,
    totalAmount: computedTotal,
    confidence: validated.data.confidence,
    notes: validated.data.notes,
    tokensUsed: aiResult.raw.length,
    elapsedMs: Date.now() - startedAt,
  }

  log.info('inference', `[budget-extract] 완료`, {
    sourceProject: input.sourceProject,
    itemsCount: result.items.length,
    totalAmount: result.totalAmount,
    confidence: result.confidence,
    elapsedMs: result.elapsedMs,
    provider: aiResult.provider,
  })

  return result
}

// ─────────────────────────────────────────
// XLSX → flattened text
// ─────────────────────────────────────────

import ExcelJS from 'exceljs'

/**
 * XLSX buffer → "시트별 행렬" 텍스트 평탄화.
 * LLM 입력용 — 표 구조 보존.
 *
 * 예:
 *   === Sheet "산출내역서" ===
 *   A1: 항목 | B1: 단위 | C1: 수량 | D1: 단가 | E1: 금액
 *   A2: 운영 인건비 | B2: 월 | C2: 4 | D2: 3,000,000 | E2: 12,000,000
 *   ...
 */
export async function flattenXlsx(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)

  const sections: string[] = []
  for (const ws of wb.worksheets) {
    if (ws.rowCount === 0) continue
    sections.push(`=== Sheet "${ws.name}" ===`)
    const maxCol = Math.min(ws.columnCount, 20) // 최대 20 columns
    const maxRow = Math.min(ws.rowCount, 200) // 최대 200 rows per sheet
    for (let r = 1; r <= maxRow; r++) {
      const row = ws.getRow(r)
      const cells: string[] = []
      let nonEmpty = false
      for (let c = 1; c <= maxCol; c++) {
        const v = row.getCell(c).value
        const text = cellToText(v)
        cells.push(text)
        if (text) nonEmpty = true
      }
      if (!nonEmpty) continue
      const letter = (c: number) => String.fromCharCode(65 + (c - 1))
      const rowStr = cells
        .map((v, i) => (v ? `${letter(i + 1)}${r}: ${v}` : ''))
        .filter(Boolean)
        .join(' | ')
      sections.push(rowStr)
    }
    sections.push('')
  }
  return sections.join('\n')
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return value.trim()
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    if ('text' in o) return String(o.text).trim()
    if ('result' in o) return cellToText(o.result)
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text: string }>).map((r) => r.text).join('')
    }
    if ('formula' in o) return `=${String(o.formula)}`
  }
  return String(value).trim()
}

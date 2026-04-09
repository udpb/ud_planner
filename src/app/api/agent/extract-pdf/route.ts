/**
 * /api/agent/extract-pdf
 *
 * Planning Agent 격리 테스트용 PDF → 텍스트 추출 엔드포인트.
 * agent-test 페이지에서 RFP PDF를 업로드하면 텍스트만 반환한다.
 *
 * 격리 원칙:
 * - DB에 아무것도 저장하지 않음
 * - parseRfp 호출하지 않음 (단순 텍스트 추출만)
 * - Phase 6 통합 시 기존 /api/ai/parse-rfp로 마이그레이션
 */

import { NextRequest, NextResponse } from 'next/server'

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  const data = await pdfParse(buffer)
  return data.text
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? ''

    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'multipart/form-data 형식이 필요합니다' },
        { status: 400 },
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'PDF 파일만 지원됩니다 (.pdf)' },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const text = await extractTextFromPdf(buffer)

    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        { error: '추출된 텍스트가 너무 짧습니다 (스캔 PDF일 가능성). 텍스트로 직접 붙여넣어 주세요.' },
        { status: 422 },
      )
    }

    return NextResponse.json({
      text: text.trim(),
      length: text.trim().length,
      filename: file.name,
    })
  } catch (err: any) {
    console.error('[extract-pdf] error:', err)
    return NextResponse.json(
      { error: err.message ?? 'PDF 파싱 실패' },
      { status: 500 },
    )
  }
}

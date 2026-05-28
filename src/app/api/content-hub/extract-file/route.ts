/**
 * POST /api/content-hub/extract-file — G1-2 (2026-05-28)
 *
 * PM 이 자산 파일 (PDF / TXT / MD) 을 업로드 → 텍스트 추출.
 * 추출된 텍스트는 다음 단계 `/api/content-hub/submit` (assist 모드) 로 전달되어
 * AI 가 category·tags·snippet 자동 추론.
 *
 * 지원 포맷:
 *  - PDF: pdfjs-dist legacy build (extract-pdf 라우트와 동일 패턴)
 *  - TXT / MD: 그대로 UTF-8 디코드
 *  - PPTX / DOCX: 향후 (현재 미지원 — PM 에게 PDF 변환 권장 메시지)
 *
 * 응답:
 *  { ok: true, text, fileName, fileType, pageCount?, charCount }
 *  { ok: false, error: '...', suggestion?: '...' }
 *
 * 권한: 로그인 사용자만 (auth 세션 검증)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { extractTextFromBuffer } from '@/lib/ingest/file-ingester'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
const MAX_OUTPUT_TEXT = 12000 // AI assist 모드 schema 상한 (8000) 보다 약간 여유

export async function POST(req: NextRequest) {
  // 권한 검증
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { ok: false, error: 'multipart/form-data 필요' },
      { status: 400 },
    )
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'file 필드가 필요합니다' },
        { status: 400 },
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          ok: false,
          error: `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 최대 20MB.`,
          suggestion: '큰 PDF 는 핵심 페이지만 추출 후 업로드 권장',
        },
        { status: 413 },
      )
    }

    const fileName = file.name
    const lowerName = fileName.toLowerCase()
    const buffer = Buffer.from(await file.arrayBuffer())

    // file-ingester 의 extractTextFromBuffer 활용 (pdf-parse·officeparser·utf8)
    const extracted = await extractTextFromBuffer(buffer, fileName)

    if (extracted.by === 'unsupported' || extracted.charCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `지원하지 않는 파일 형식: ${file.type || lowerName.split('.').pop()}`,
          suggestion: 'PDF · TXT · MD · PPTX · DOCX · XLSX 만 지원. HWP 등은 PDF 변환 권장.',
        },
        { status: 415 },
      )
    }

    const text = extracted.text.slice(0, MAX_OUTPUT_TEXT)
    const truncated = extracted.charCount > MAX_OUTPUT_TEXT

    return NextResponse.json({
      ok: true,
      text,
      fileName,
      fileType: extracted.by,
      charCount: text.length,
      pageCount: extracted.pages?.length,
      truncated,
    })
  } catch (err) {
    console.error('[extract-file] 추출 실패:', err)
    return NextResponse.json(
      {
        ok: false,
        error: `파일 추출 실패: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    )
  }
}

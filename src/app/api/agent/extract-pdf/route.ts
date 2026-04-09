/**
 * /api/agent/extract-pdf
 *
 * Planning Agent 격리 테스트용 PDF → 텍스트 추출 엔드포인트.
 * agent-test 페이지에서 RFP PDF를 업로드하면 텍스트만 반환한다.
 *
 * 왜 이 방식인가:
 * - pdf-parse v2.4.5는 ESM/CJS export 변경으로 require() 호출이 실패함 (완전히 깨짐)
 * - pdfjs-dist v5는 브라우저 전역 DOMMatrix 필요 → Node에 없음
 * - 해결: pdfjs-dist legacy build + @napi-rs/canvas의 DOMMatrix polyfill
 * - 검증: 4개 실제 RFP PDF (6KB~67KB 텍스트, 7~62페이지) 모두 성공
 *
 * 격리 원칙:
 * - DB에 아무것도 저장하지 않음
 * - parseRfp 호출하지 않음 (단순 텍스트 추출만)
 * - Phase 6 통합 시 기존 /api/ai/parse-rfp로 마이그레이션 + 같은 기법 적용
 */

import { NextRequest, NextResponse } from 'next/server'

// Node.js 환경에서 pdfjs-dist가 필요로 하는 브라우저 전역을 polyfill
// @napi-rs/canvas가 transitive dep로 이미 설치되어 있음 (pdf-parse 경유)
async function setupPdfjsPolyfills() {
  if (typeof (globalThis as any).DOMMatrix !== 'undefined') return
  try {
    const canvas = await import('@napi-rs/canvas')
    if (canvas.DOMMatrix) {
      ;(globalThis as any).DOMMatrix = canvas.DOMMatrix
    }
  } catch (err: any) {
    // polyfill 실패해도 일단 진행 — pdfjs 내부에서 더 명확한 에러가 나도록
    console.warn('[extract-pdf] DOMMatrix polyfill 실패:', err.message)
  }
}

async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string; numPages: number }> {
  await setupPdfjsPolyfills()

  // pdfjs-dist legacy build 동적 임포트 (빌드 시점 번들링 방지)
  const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const uint8Array = new Uint8Array(buffer)
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  })
  const pdf = await loadingTask.promise

  let fullText = ''
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
      .join(' ')
    fullText += pageText + '\n\n'
  }

  return {
    text: fullText.trim(),
    numPages: pdf.numPages,
  }
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
    const { text, numPages } = await extractTextFromPdf(buffer)

    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        { error: `추출된 텍스트가 너무 짧습니다 (${text.length}자, ${numPages}페이지). 스캔 PDF일 가능성 — 텍스트로 직접 붙여넣어 주세요.` },
        { status: 422 },
      )
    }

    return NextResponse.json({
      text: text.trim(),
      length: text.trim().length,
      numPages,
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

/**
 * PDF 텍스트 추출 테스트 스크립트
 *
 * 4개의 실제 RFP PDF로 여러 추출 방법을 테스트하고 결과를 비교한다:
 * 1. pdf-parse (현재 parse-rfp에서 쓰는 방법)
 * 2. pdfjs-dist legacy build (서버 사이드)
 * 3. 각 PDF의 메타데이터, 페이지 수, 추출 성공 여부
 *
 * 실행: npx tsx scripts/test-pdf-extraction.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

const PDF_FILES = [
  {
    name: '아기유니콘 IR 위탁운영',
    path: 'C:/Users/USER/Downloads/(긴급)+「아기유니콘+육성사업」글로벌+IR+위탁운영+용역+제안요청서_FN (4).pdf',
  },
  {
    name: '카카오 제주 임팩트 챌린지',
    path: 'C:/Users/USER/Downloads/[RFP] 2026 카카오 제주 임팩트 챌린지 운영 제안.pdf',
  },
  {
    name: '계원예술대 세대융합창업',
    path: 'C:/Users/USER/Downloads/계원예술대학 세대융합창업 프로그램 용역 과업지시서(안).pdf',
  },
  {
    name: 'AI 청년 창업 교육',
    path: 'C:/Users/USER/Downloads/붙임 2. 2025년 AI 청년 창업가를 위한 AI 및 창업 교육_운영용역_제안요청서.pdf',
  },
]

interface TestResult {
  file: string
  method: string
  success: boolean
  textLength?: number
  preview?: string
  error?: string
  numPages?: number
}

// ─────────────────────────────────────────
// Method 1: pdf-parse (기존 방식)
// ─────────────────────────────────────────

async function testPdfParse(buffer: Buffer, name: string): Promise<TestResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    return {
      file: name,
      method: 'pdf-parse',
      success: true,
      textLength: data.text.length,
      preview: data.text.slice(0, 200).replace(/\s+/g, ' ').trim(),
      numPages: data.numpages,
    }
  } catch (err: any) {
    return {
      file: name,
      method: 'pdf-parse',
      success: false,
      error: err.message,
    }
  }
}

// ─────────────────────────────────────────
// Method 2: pdfjs-dist legacy (서버 사이드)
// ─────────────────────────────────────────

async function testPdfjsDistLegacy(buffer: Buffer, name: string): Promise<TestResult> {
  try {
    // Node.js polyfill for DOMMatrix (브라우저 전역인데 서버에 없음)
    // pdfjs-dist v5가 이걸 요구함
    if (typeof (globalThis as any).DOMMatrix === 'undefined') {
      try {
        const { DOMMatrix } = await import('@napi-rs/canvas')
        ;(globalThis as any).DOMMatrix = DOMMatrix
      } catch {
        // polyfill 실패 — 계속 진행 (에러 잡힐 것)
      }
    }

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

    const trimmed = fullText.trim()
    return {
      file: name,
      method: 'pdfjs-dist legacy',
      success: true,
      textLength: trimmed.length,
      preview: trimmed.slice(0, 200).replace(/\s+/g, ' ').trim(),
      numPages: pdf.numPages,
    }
  } catch (err: any) {
    return {
      file: name,
      method: 'pdfjs-dist legacy',
      success: false,
      error: err.message,
    }
  }
}

// ─────────────────────────────────────────
// 실행
// ─────────────────────────────────────────

async function main() {
  console.log('\n🧪 PDF 텍스트 추출 테스트\n')
  console.log('테스트 대상: 4개 RFP PDF')
  console.log('추출 방법: (1) pdf-parse  (2) pdfjs-dist legacy\n')
  console.log('='.repeat(80))

  const results: TestResult[] = []

  for (const file of PDF_FILES) {
    console.log(`\n📄 ${file.name}`)
    console.log(`   경로: ${file.path}`)

    let buffer: Buffer
    try {
      buffer = readFileSync(file.path)
      console.log(`   파일 크기: ${(buffer.length / 1024).toFixed(1)} KB`)
    } catch (err: any) {
      console.log(`   ❌ 파일 읽기 실패: ${err.message}`)
      continue
    }

    // Method 1
    const r1 = await testPdfParse(buffer, file.name)
    results.push(r1)
    if (r1.success) {
      console.log(`   ✅ pdf-parse: ${r1.textLength}자, ${r1.numPages}페이지`)
      console.log(`      미리보기: ${r1.preview?.slice(0, 120)}...`)
    } else {
      console.log(`   ❌ pdf-parse 실패: ${r1.error}`)
    }

    // Method 2
    const r2 = await testPdfjsDistLegacy(buffer, file.name)
    results.push(r2)
    if (r2.success) {
      console.log(`   ✅ pdfjs-dist legacy: ${r2.textLength}자, ${r2.numPages}페이지`)
      console.log(`      미리보기: ${r2.preview?.slice(0, 120)}...`)
    } else {
      console.log(`   ❌ pdfjs-dist legacy 실패: ${r2.error}`)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('\n📊 최종 요약\n')

  // 방법별 성공 집계
  const methods = [...new Set(results.map((r) => r.method))]
  for (const method of methods) {
    const methodResults = results.filter((r) => r.method === method)
    const successCount = methodResults.filter((r) => r.success).length
    console.log(`${method}: ${successCount}/${methodResults.length} 성공`)
  }

  console.log('\n')

  // 실패 상세
  const failures = results.filter((r) => !r.success)
  if (failures.length > 0) {
    console.log('❌ 실패 상세:')
    for (const f of failures) {
      console.log(`   [${f.method}] ${f.file}: ${f.error}`)
    }
  }
}

main().catch((err) => {
  console.error('치명 오류:', err)
  process.exit(1)
})

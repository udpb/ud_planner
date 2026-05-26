/**
 * scripts/ingest-image-pdf.ts — 이미지 PDF/PPT vision OCR + Sphere 2 ingest
 *
 * pdf-parse 가 텍스트 추출 0자 fail 한 이미지 PDF/PPT 를 Gemini multimodal
 * (gemini-3-flash-preview) 로 직접 read 해 텍스트 변환 → extract-tuple 흐름.
 *
 * 사용:
 *   npx tsx scripts/ingest-image-pdf.ts <pdf-path> [--channel B2G|B2B|renewal] [--dry-run]
 *
 * 환경: GEMINI_API_KEY
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import fs from 'node:fs'
import path from 'node:path'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Heavy modules dynamic — dotenv 평가 후 evaluation 보장 (ESM hoisting 회피)
type TupleModule = typeof import('../src/lib/inference/extract-tuple')
type TypeModule = typeof import('../src/lib/inference/types')
let extractTuple: TupleModule['extractTuple']
let CHANNEL_VALUES: TypeModule['CHANNEL_VALUES']

async function loadHeavy() {
  const tupleMod = await import('../src/lib/inference/extract-tuple')
  const typeMod = await import('../src/lib/inference/types')
  extractTuple = tupleMod.extractTuple
  CHANNEL_VALUES = typeMod.CHANNEL_VALUES
}

const VISION_MODEL = 'gemini-3-flash-preview' // multimodal 지원
const VISION_PROMPT = `이 PDF 의 모든 텍스트를 추출하세요. 구조 (제목·목록·표) 도 보존.
출력: 본문 텍스트만 (JSON X, 마크다운 펜스 X). 페이지 구분은 "--- 페이지 N ---" 형식.`

async function extractTextWithVision(pdfPath: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY missing')

  const client = new GoogleGenerativeAI(apiKey)
  const model = client.getGenerativeModel({
    model: VISION_MODEL,
    generationConfig: {
      maxOutputTokens: 32768, // 큰 PDF 대비
      temperature: 0.1, // 추출은 일관성 최우선
    },
  })

  const buf = fs.readFileSync(pdfPath)
  const sizeMB = (buf.length / 1024 / 1024).toFixed(2)
  console.log(`  📄 PDF size: ${sizeMB}MB`)

  // Gemini File API 또는 inline. < 20MB 는 inline OK
  const base64 = buf.toString('base64')
  console.log(`  ⚙  Vision LLM 호출 중... (${VISION_MODEL})`)
  const t0 = Date.now()

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { text: VISION_PROMPT },
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64,
            },
          },
        ],
      },
    ],
  })

  const text = result.response.text()
  console.log(
    `  ✓ Vision text ${text.length}자 추출 · ${Math.round((Date.now() - t0) / 1000)}s`,
  )
  return text
}

async function main() {
  const argv = process.argv.slice(2)
  const pdfPath = argv.find((a) => !a.startsWith('--'))
  if (!pdfPath) {
    console.error('Usage: npx tsx scripts/ingest-image-pdf.ts <pdf-path> [--channel B2G|B2B|renewal] [--dry-run]')
    process.exit(1)
  }
  function arg(flag: string, dflt: string): string {
    const i = argv.indexOf(flag)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
  }
  const channel = arg('--channel', 'B2G') as 'B2G' | 'B2B' | 'renewal'
  const dryRun = argv.includes('--dry-run')

  await loadHeavy()

  // 채널 검증
  if (!(CHANNEL_VALUES as readonly string[]).includes(channel)) {
    throw new Error(`invalid channel: ${channel}`)
  }

  const filename = path.basename(pdfPath)
  const sourceProject = filename
    .replace(/_사업\s*제안서.*$/i, '')
    .replace(/_/g, ' ')
    .replace(/\.(pdf|pptx?)$/i, '')
    .trim()

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ Vision-based ingest (이미지 PDF/PPT)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`File: ${filename}`)
  console.log(`Project: ${sourceProject}`)
  console.log(`Channel: ${channel} · dryRun: ${dryRun}`)
  console.log('')

  // 1. Vision OCR
  const text = await extractTextWithVision(pdfPath)
  if (text.length < 500) {
    console.error(`  ✗ Vision text 너무 짧음 (${text.length}자) — 처리 불가`)
    process.exit(1)
  }

  // 2. extract-tuple
  console.log('')
  console.log(`⚙  extract-tuple 호출 중... (~60s)`)
  const t0 = Date.now()
  const result = await extractTuple(
    {
      proposalText: text,
      sourceProject,
      outcome: 'won',
      channel,
      sourceType: 'archive',
      sourceRef: pdfPath,
    },
    { dryRun },
  )
  console.log(`✓ extract-tuple 완료 · ${Math.round((Date.now() - t0) / 1000)}s`)

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 결과')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`patternId: ${result.patternId}`)
  console.log(`contentAssets: ${result.contentAssetIds.length}`)
  console.log(`confidence: ${result.confidence.toFixed(2)}`)
  console.log(`message.slogan: ${result.message.slogan}`)
  console.log(`logicGraph: ${result.logicGraph.nodes.length} nodes / ${result.logicGraph.edges.length} edges`)
  console.log('')
  console.log('✓ Vision ingest 완료')
}

main()
  .catch((e) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('✗ FAIL')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error(e instanceof Error ? e.stack : String(e))
    process.exit(1)
  })
  .finally(() => setTimeout(() => process.exit(0), 100))

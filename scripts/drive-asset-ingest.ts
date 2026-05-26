/**
 * scripts/drive-asset-ingest.ts — ud Labs 자산 batch ingest (Wave W W8)
 *
 * Drive 폴더 재귀 walk → 각 파일 download → text 추출 → extractAsset() → ContentAsset persist.
 *
 * 사용:
 *   # dry-run
 *   npx tsx scripts/drive-asset-ingest.ts <folder-id> --type methodology --tier high --dry-run --limit 3
 *
 *   # production
 *   npx tsx scripts/drive-asset-ingest.ts <folder-id> --type methodology --tier high --limit 30
 *
 * 옵션:
 *   --type methodology|case|company  (필수)
 *   --tier high|medium|low|internal  (default 'medium')
 *   --limit N                         (default 무제한)
 *   --start N                         (resume)
 *   --dry-run                         (DB 변경 X)
 *   --skip-vision                     (이미지 PDF 시 Vision OCR 비활성)
 *   --min-confidence 0.5
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { DriveFile } from '../src/lib/drive/client'

type PrismaModule = typeof import('../src/lib/prisma')
type DriveModule = typeof import('../src/lib/drive/client')
type IngestModule = typeof import('../src/lib/ingest/file-ingester')
type AssetModule = typeof import('../src/lib/inference/asset-extractor')
type VectorModule = typeof import('../src/lib/inference/vector-utils')

let prisma: PrismaModule['prisma']
let getFileMeta: DriveModule['getFileMeta']
let downloadFile: DriveModule['downloadFile']
let exportFile: DriveModule['exportFile']
let walkFolder: DriveModule['walkFolder']
let extractTextFromBuffer: IngestModule['extractTextFromBuffer']
let extractAsset: AssetModule['extractAsset']
let embed: VectorModule['embed']

async function loadHeavy() {
  const [p, d, i, a, v] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/lib/drive/client'),
    import('../src/lib/ingest/file-ingester'),
    import('../src/lib/inference/asset-extractor'),
    import('../src/lib/inference/vector-utils'),
  ])
  prisma = p.prisma
  getFileMeta = d.getFileMeta
  downloadFile = d.downloadFile
  exportFile = d.exportFile
  walkFolder = d.walkFolder
  extractTextFromBuffer = i.extractTextFromBuffer
  extractAsset = a.extractAsset
  embed = v.embed
}

// ─────────────────────────────────────────
// CLI
// ─────────────────────────────────────────

const argv = process.argv.slice(2)
function arg(flag: string, dflt?: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const FOLDER_ID = argv.find((a) => !a.startsWith('--'))
const ASSET_TYPE = arg('--type') as 'methodology' | 'case' | 'company' | undefined
const SOURCE_TIER = (arg('--tier', 'medium')! as 'high' | 'medium' | 'low' | 'internal')
const LIMIT = parseInt(arg('--limit', '0')!, 10)
const START = parseInt(arg('--start', '1')!, 10)
const DRY_RUN = argv.includes('--dry-run')
const SKIP_VISION = argv.includes('--skip-vision')
const MIN_CONFIDENCE = parseFloat(arg('--min-confidence', '0.5')!)

if (!FOLDER_ID || !ASSET_TYPE) {
  console.error('Usage: npx tsx scripts/drive-asset-ingest.ts <folder-id> --type methodology|case|company [--tier high|medium|low|internal] [--dry-run] [--limit N]')
  process.exit(1)
}
if (!['methodology', 'case', 'company'].includes(ASSET_TYPE)) {
  console.error(`Invalid --type: ${ASSET_TYPE}`)
  process.exit(1)
}

// ─────────────────────────────────────────
// Vision OCR (이미지 PDF 대응)
// ─────────────────────────────────────────

async function visionOcr(buf: Buffer): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY missing')
  const client = new GoogleGenerativeAI(apiKey)
  const model = client.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    generationConfig: { maxOutputTokens: 32768, temperature: 0.1 },
  })
  const base64 = buf.toString('base64')
  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { text: '이 PDF 의 모든 텍스트를 추출하세요. 구조 (제목·목록·표) 도 보존.' },
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
        ],
      },
    ],
  })
  return result.response.text()
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function isProcessable(file: DriveFile): boolean {
  if (file.isFolder) return false
  const mime = file.mimeType
  // Google native: Docs/Slides 만 (Sheet 은 별도 처리)
  if (
    mime === 'application/vnd.google-apps.document' ||
    mime === 'application/vnd.google-apps.presentation' ||
    mime === 'application/pdf' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'text/plain' ||
    /\.(pdf|docx|pptx|txt|md)$/i.test(file.name)
  ) return true
  // shortcut, image, video, hwp 등 skip
  return false
}

// Drive tree → flat 파일 list
function flattenTree(node: { file: DriveFile; children?: any[]; depth: number }, path = ''): { file: DriveFile; path: string }[] {
  const out: { file: DriveFile; path: string }[] = []
  const here = path ? `${path}/${node.file.name}` : node.file.name
  if (!node.file.isFolder) {
    out.push({ file: node.file, path })
  }
  if (node.children) {
    for (const c of node.children) out.push(...flattenTree(c, here))
  }
  return out
}

interface IngestResult {
  fileName: string
  status: 'success' | 'skip-existing' | 'skip-unsupported' | 'fail'
  chunkCount?: number
  confidence?: number
  elapsedSec?: number
  parsedBy?: string
  textChars?: number
  error?: string
}

// ─────────────────────────────────────────
// Ingest single file
// ─────────────────────────────────────────

async function ingestFile(
  file: DriveFile,
  folderPath: string,
  existing: Set<string>,
): Promise<IngestResult> {
  const t0 = Date.now()
  console.log('')
  console.log(`▶ ${file.name}  mime=${file.mimeType.split('/').pop()}  ${file.size ? (file.size / 1024).toFixed(0) + 'KB' : '?'}`)

  // dedupe by name + assetType
  const dedupeKey = `${ASSET_TYPE}:${file.name}`
  if (existing.has(dedupeKey)) {
    console.log(`  ↩ 이미 ingest 됨 — skip`)
    return { fileName: file.name, status: 'skip-existing' }
  }

  if (!isProcessable(file)) {
    console.log(`  ↩ unsupported mime — skip`)
    return { fileName: file.name, status: 'skip-unsupported' }
  }

  try {
    // 1. Download (Google Apps 면 PDF export)
    let buf: Buffer
    let effectiveName = file.name
    if (
      file.mimeType === 'application/vnd.google-apps.document' ||
      file.mimeType === 'application/vnd.google-apps.presentation'
    ) {
      console.log(`  🔁 Google Apps → PDF export`)
      buf = await exportFile(file.id, 'application/pdf')
      effectiveName = file.name.replace(/\.[^.]+$/, '') + '.pdf'
    } else {
      buf = await downloadFile(file.id)
    }

    // 2. Text 추출
    let parsedText = ''
    let parsedBy = 'pdf-parse'
    try {
      const parsed = await extractTextFromBuffer(buf, effectiveName)
      parsedText = parsed.text
      parsedBy = parsed.by
      console.log(`  ✓ 파싱 ${parsedText.length}자 (by=${parsedBy})`)
    } catch (e) {
      console.log(`  ⚠ 파싱 실패: ${e instanceof Error ? e.message : String(e)}`)
    }

    // 3. Vision OCR fallback (PDF & 텍스트 짧을 시)
    const isPdfLike = file.mimeType === 'application/pdf' || effectiveName.endsWith('.pdf')
    if (parsedText.length < 500 && isPdfLike && !SKIP_VISION) {
      console.log(`  🔄 텍스트 너무 짧음 (${parsedText.length}자) — Vision OCR`)
      const tOcr = Date.now()
      try {
        parsedText = await visionOcr(buf)
        parsedBy = 'vision-ocr'
        console.log(`  ✓ Vision OCR ${parsedText.length}자 · ${Math.round((Date.now() - tOcr) / 1000)}s`)
      } catch (e) {
        throw new Error(`Vision OCR 실패: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (parsedText.length < 200) {
      throw new Error(`최종 텍스트 너무 짧음 (${parsedText.length}자)`)
    }

    // 4. LLM 추출
    const result = await extractAsset({
      assetText: parsedText,
      assetName: file.name,
      assetType: ASSET_TYPE!,
      sourceTier: SOURCE_TIER,
      folderPath,
    })

    const elapsedSec = Math.round((Date.now() - t0) / 1000)
    console.log(`  ✓ 추출 ${result.chunks.length} chunk · confidence ${result.confidence.toFixed(2)} · ${elapsedSec}s`)

    // 5. confidence cut
    if (result.confidence < MIN_CONFIDENCE) {
      console.log(`  ⚠ confidence < ${MIN_CONFIDENCE} — skip`)
      return {
        fileName: file.name,
        status: 'fail',
        elapsedSec,
        confidence: result.confidence,
        error: `low confidence ${result.confidence.toFixed(2)}`,
      }
    }

    // 6. Persist
    if (!DRY_RUN) {
      // 6-a. chunks → embedding 생성
      const embeddings = await Promise.all(
        result.chunks.map((c) => embed(c.narrativeSnippet)),
      )

      // 6-b. ContentAsset 다수 create
      for (let i = 0; i < result.chunks.length; i++) {
        const chunk = result.chunks[i]
        const emb = embeddings[i]
        await prisma.contentAsset.create({
          data: {
            name: chunk.name,
            category: chunk.category,
            assetType: ASSET_TYPE!,
            applicableSections: chunk.sectionHint ? [chunk.sectionHint] : [],
            valueChainStage: 'activity', // 기본 (ud Labs 자산은 보통 activity)
            evidenceType: chunk.evidenceType,
            keywords: chunk.keywords,
            narrativeSnippet: chunk.narrativeSnippet,
            keyNumbers: chunk.keyNumbers,
            embedding: emb,
            embeddingModel: 'gemini-embedding-001',
            embeddedAt: new Date(),
            status: 'stable',
            version: 1,
            sourceReferences: [`drive:${file.id}`],
            lastReviewedAt: new Date(),
            sourceTier: SOURCE_TIER,
            sourceType: 'drive',
            sourceRef: file.id,
          },
        })
      }
      console.log(`  🗄  ContentAsset ${result.chunks.length}건 저장`)
    } else {
      console.log(`  (dry-run — DB 저장 X)`)
    }

    return {
      fileName: file.name,
      status: 'success',
      chunkCount: result.chunks.length,
      confidence: result.confidence,
      elapsedSec,
      parsedBy,
      textChars: parsedText.length,
    }
  } catch (e) {
    const elapsedSec = Math.round((Date.now() - t0) / 1000)
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error(`  ✗ FAIL · ${elapsedSec}s — ${errMsg.slice(0, 200)}`)
    return {
      fileName: file.name,
      status: 'fail',
      elapsedSec,
      error: errMsg.slice(0, 500),
    }
  }
}

// ─────────────────────────────────────────
// main
// ─────────────────────────────────────────

async function main() {
  await loadHeavy()

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ ud Labs Asset ingest — Wave W W8')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Folder ID: ${FOLDER_ID}`)
  console.log(`Type: ${ASSET_TYPE} · tier: ${SOURCE_TIER}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}  · limit=${LIMIT || '∞'}  start=${START}`)
  console.log('')

  // 1. Drive 트리 walk
  console.log('⏳ Drive 폴더 walk 중...')
  const tree = await walkFolder(FOLDER_ID!, { maxDepth: 6, maxTotal: 500 })
  const allFiles = flattenTree(tree)
  console.log(`   ✓ 전체 파일: ${allFiles.length}건`)

  // 2. processable 필터
  const processable = allFiles.filter((f) => isProcessable(f.file))
  console.log(`   처리 가능 (PDF/DOCX/PPTX/Docs/Slides/txt): ${processable.length}건`)
  const skipped = allFiles.length - processable.length
  if (skipped > 0) console.log(`   skip (shortcut/이미지/MP4/HWP 등): ${skipped}건`)

  // 3. Dedupe — 이미 같은 (assetType, name) 있는 ContentAsset
  const existing = await prisma.contentAsset.findMany({
    where: { assetType: ASSET_TYPE!, sourceType: 'drive' },
    select: { name: true, sourceRef: true },
  })
  const existingKeys = new Set(existing.map((e) => `${ASSET_TYPE}:${e.name}`))
  console.log(`   기존 ${ASSET_TYPE} ContentAsset (drive): ${existing.length}건`)
  console.log('')

  // 4. limit/start 적용
  const startIdx = Math.max(0, START - 1)
  const endIdx = LIMIT > 0 ? Math.min(processable.length, startIdx + LIMIT) : processable.length
  const targets = processable.slice(startIdx, endIdx)
  console.log(`📋 처리 대상: ${targets.length}건`)
  console.log('')

  // 5. sequential 처리
  const results: IngestResult[] = []
  for (let i = 0; i < targets.length; i++) {
    console.log(`\n[${i + 1}/${targets.length}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    const { file, path } = targets[i]
    const result = await ingestFile(file, path, existingKeys)
    results.push(result)
    if (result.status === 'success') existingKeys.add(`${ASSET_TYPE}:${file.name}`)
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Asset Ingest Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const success = results.filter((r) => r.status === 'success')
  const skipExisting = results.filter((r) => r.status === 'skip-existing')
  const skipUnsupported = results.filter((r) => r.status === 'skip-unsupported')
  const failures = results.filter((r) => r.status === 'fail')
  console.log(`Total: ${results.length}`)
  console.log(`  ✓ success:        ${success.length}`)
  console.log(`  ↩ skip (이미):     ${skipExisting.length}`)
  console.log(`  ↩ skip (unsupp):   ${skipUnsupported.length}`)
  console.log(`  ✗ fail:           ${failures.length}`)
  if (success.length > 0) {
    const totalChunks = success.reduce((s, r) => s + (r.chunkCount ?? 0), 0)
    const avgConfidence = success.reduce((s, r) => s + (r.confidence ?? 0), 0) / success.length
    console.log(`  📚 ContentAsset 추가: ${totalChunks}건 (평균 ${(totalChunks / success.length).toFixed(1)} per file)`)
    console.log(`  🎯 평균 confidence: ${avgConfidence.toFixed(2)}`)
  }
  if (failures.length > 0) {
    console.log('\n실패:')
    for (const f of failures.slice(0, 10)) {
      console.log(`  ${f.fileName.slice(0, 60)}: ${f.error?.slice(0, 80)}`)
    }
  }
  console.log('')
  console.log(DRY_RUN ? '✓ dry-run 완료' : '✓ asset ingest 완료')
}

main()
  .catch((e) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('✗ FAIL')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error(e instanceof Error ? e.stack : String(e))
    process.exit(1)
  })
  .finally(() => setTimeout(() => process.exit(0), 200))

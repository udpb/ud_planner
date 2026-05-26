/**
 * scripts/local-folder-ingest.ts — 로컬 폴더 자산 ingest (W14+ Layer 1·3)
 *
 * `C:\Users\USER\Desktop\labs` 같은 로컬 폴더의 PDF/PPTX/DOCX 를
 * 재귀 walk → text 추출 → extractAsset() → ContentAsset persist.
 *
 * 2026 최신 자료 ingest 시 sourceTier='high' + sourceType='local-2026' 으로
 * 기존 자산과 명확 구분. 충돌 자동 검증은 W17 후속 (별도 cron).
 *
 * 사용:
 *   npx tsx scripts/local-folder-ingest.ts "C:/Users/USER/Desktop/labs/임팩트 창업방법론" \
 *     --type methodology --tier high --source-type local-2026 --dry-run --limit 3
 *
 *   npx tsx scripts/local-folder-ingest.ts "C:/Users/USER/Desktop/labs/임팩트 창업방법론" \
 *     --type methodology --tier high --source-type local-2026
 *
 * 옵션:
 *   --type methodology|case|company  (필수)
 *   --tier high|medium|low|internal  (default 'high' for 2026)
 *   --source-type local-2026         (구분용 tag, default 'local-2026')
 *   --limit N · --start N · --dry-run
 *   --recursive (default true) · --extensions pdf,pptx,docx,doc (default)
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import fs from 'node:fs'
import path from 'node:path'
import { GoogleGenerativeAI } from '@google/generative-ai'

type PrismaModule = typeof import('../src/lib/prisma')
type IngestModule = typeof import('../src/lib/ingest/file-ingester')
type AssetModule = typeof import('../src/lib/inference/asset-extractor')
type VectorModule = typeof import('../src/lib/inference/vector-utils')

let prisma: PrismaModule['prisma']
let extractTextFromBuffer: IngestModule['extractTextFromBuffer']
let extractAsset: AssetModule['extractAsset']
let embed: VectorModule['embed']

async function loadHeavy() {
  const [p, i, a, v] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/lib/ingest/file-ingester'),
    import('../src/lib/inference/asset-extractor'),
    import('../src/lib/inference/vector-utils'),
  ])
  prisma = p.prisma
  extractTextFromBuffer = i.extractTextFromBuffer
  extractAsset = a.extractAsset
  embed = v.embed
}

// CLI
const argv = process.argv.slice(2)
function arg(flag: string, dflt?: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const FOLDER = argv.find((a) => !a.startsWith('--'))
const ASSET_TYPE = arg('--type') as 'methodology' | 'case' | 'company' | undefined
const SOURCE_TIER = (arg('--tier', 'high')! as 'high' | 'medium' | 'low' | 'internal')
const SOURCE_TYPE_TAG = arg('--source-type', 'local-2026')!
const LIMIT = parseInt(arg('--limit', '0')!, 10)
const START = parseInt(arg('--start', '1')!, 10)
const DRY_RUN = argv.includes('--dry-run')
const SKIP_VISION = argv.includes('--skip-vision')
const MIN_CONFIDENCE = parseFloat(arg('--min-confidence', '0.5')!)
const RECURSIVE = !argv.includes('--no-recursive')
const EXTENSIONS = arg('--extensions', 'pdf,pptx,docx,doc,md,txt')!.split(',').map((s) => `.${s.trim().toLowerCase()}`)

if (!FOLDER || !ASSET_TYPE) {
  console.error('Usage: npx tsx scripts/local-folder-ingest.ts <folder> --type methodology|case|company [--tier high] [--source-type local-2026] [--dry-run]')
  process.exit(1)
}
if (!['methodology', 'case', 'company'].includes(ASSET_TYPE)) {
  console.error(`Invalid --type: ${ASSET_TYPE}`)
  process.exit(1)
}

// ─────────────────────────────────────────
// Vision OCR
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
// File walking
// ─────────────────────────────────────────

interface LocalFile {
  fullPath: string
  relPath: string
  name: string
  size: number
}

function walkFolder(rootDir: string, recursive: boolean, extensions: string[]): LocalFile[] {
  const out: LocalFile[] = []
  function walk(dir: string, prefix: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (ent.name.startsWith('~$') || ent.name.startsWith('.')) continue
      const full = path.join(dir, ent.name)
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name
      if (ent.isDirectory() && recursive) {
        walk(full, rel)
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase()
        if (!extensions.includes(ext)) continue
        try {
          const st = fs.statSync(full)
          out.push({ fullPath: full, relPath: rel, name: ent.name, size: st.size })
        } catch {
          // ignore
        }
      }
    }
  }
  walk(rootDir, '')
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath))
}

// ─────────────────────────────────────────
// Ingest single
// ─────────────────────────────────────────

interface IngestResult {
  fileName: string
  status: 'success' | 'skip-existing' | 'fail'
  chunkCount?: number
  confidence?: number
  elapsedSec?: number
  parsedBy?: string
  textChars?: number
  error?: string
}

async function ingestFile(file: LocalFile, existing: Set<string>): Promise<IngestResult> {
  const t0 = Date.now()
  const sizeStr = `${(file.size / 1024).toFixed(0)}KB`
  console.log(`\n▶ ${file.relPath}  ${sizeStr}`)

  // dedupe by name + assetType + sourceType
  const dedupeKey = `${ASSET_TYPE}:${SOURCE_TYPE_TAG}:${file.name}`
  if (existing.has(dedupeKey)) {
    console.log(`  ↩ 이미 ingest 됨 — skip`)
    return { fileName: file.name, status: 'skip-existing' }
  }

  try {
    // 1. read
    const buf = fs.readFileSync(file.fullPath)

    // 2. text 추출
    let parsedText = ''
    let parsedBy = 'pdf-parse'
    try {
      const parsed = await extractTextFromBuffer(buf, file.name)
      parsedText = parsed.text
      parsedBy = parsed.by
      console.log(`  ✓ 파싱 ${parsedText.length}자 (by=${parsedBy})`)
    } catch (e) {
      console.log(`  ⚠ 파싱 실패: ${e instanceof Error ? e.message : String(e)}`)
    }

    // 3. Vision OCR fallback (PDF only)
    const isPdf = file.name.toLowerCase().endsWith('.pdf')
    if (parsedText.length < 500 && isPdf && !SKIP_VISION) {
      console.log(`  🔄 Vision OCR fallback`)
      const tOcr = Date.now()
      parsedText = await visionOcr(buf)
      parsedBy = 'vision-ocr'
      console.log(`  ✓ Vision OCR ${parsedText.length}자 · ${Math.round((Date.now() - tOcr) / 1000)}s`)
    }

    if (parsedText.length < 200) {
      throw new Error(`텍스트 너무 짧음 (${parsedText.length}자)`)
    }

    // 4. LLM 추출
    const result = await extractAsset({
      assetText: parsedText,
      assetName: file.name,
      assetType: ASSET_TYPE!,
      sourceTier: SOURCE_TIER,
      folderPath: file.relPath.replace(/\/[^/]+$/, ''),
    })

    const elapsedSec = Math.round((Date.now() - t0) / 1000)
    console.log(`  ✓ ${result.chunks.length} chunk · confidence ${result.confidence.toFixed(2)} · ${elapsedSec}s`)

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

    // 5. Persist (or dry-run sample 출력)
    if (!DRY_RUN) {
      const embeddings = await Promise.all(result.chunks.map((c) => embed(c.narrativeSnippet)))
      for (let i = 0; i < result.chunks.length; i++) {
        const chunk = result.chunks[i]
        await prisma.contentAsset.create({
          data: {
            name: chunk.name,
            category: chunk.category,
            assetType: ASSET_TYPE!,
            applicableSections: chunk.sectionHint ? [chunk.sectionHint] : [],
            valueChainStage: 'activity',
            evidenceType: chunk.evidenceType,
            keywords: [...(chunk.keywords ?? []), ...(chunk.signaturePhrases ?? [])],
            narrativeSnippet: chunk.narrativeSnippet,
            keyNumbers: chunk.keyNumbers,
            embedding: embeddings[i],
            embeddingModel: 'gemini-embedding-001',
            embeddedAt: new Date(),
            status: 'stable',
            version: 1,
            sourceReferences: [`local:${file.relPath}`],
            lastReviewedAt: new Date(),
            sourceTier: SOURCE_TIER,
            sourceType: SOURCE_TYPE_TAG,
            sourceRef: file.relPath,
          },
        })
      }
      console.log(`  🗄  ContentAsset ${result.chunks.length}건 저장 (tier=${SOURCE_TIER}, sourceType=${SOURCE_TYPE_TAG})`)
    } else {
      // Dry-run sample 출력 — 디테일 검증용
      console.log(`\n  📑 [Deep Read 검증] chunks 내용 sample:`)
      result.chunks.forEach((c, i) => {
        console.log(`\n  ─── chunk ${i + 1} ───`)
        console.log(`  name: ${c.name}`)
        console.log(`  category: ${c.category} · evidence: ${c.evidenceType} · section: ${c.sectionHint ?? '?'}`)
        console.log(`  narrative (${c.narrativeSnippet.length}자):`)
        console.log(`    ${c.narrativeSnippet.slice(0, 400).replace(/\n/g, ' ')}${c.narrativeSnippet.length > 400 ? '...' : ''}`)
        if (c.context) console.log(`  context: ${c.context.slice(0, 200)}`)
        if (c.keyNumbers.length > 0) {
          console.log(`  keyNumbers (${c.keyNumbers.length}):`)
          c.keyNumbers.slice(0, 6).forEach((k) => console.log(`    - ${k.value}${k.unit ?? ''} (${k.context})`))
        }
        if (c.signaturePhrases && c.signaturePhrases.length > 0) {
          console.log(`  🎨 signaturePhrases (${c.signaturePhrases.length}):`)
          c.signaturePhrases.forEach((p) => console.log(`    "${p}"`))
        }
        if (c.keywords.length > 0) {
          console.log(`  keywords: ${c.keywords.slice(0, 8).join(', ')}${c.keywords.length > 8 ? '...' : ''}`)
        }
      })
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
  console.log('▶ Local folder ingest — W14+ Layer 1·3')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Folder: ${FOLDER}`)
  console.log(`type=${ASSET_TYPE} · tier=${SOURCE_TIER} · sourceType=${SOURCE_TYPE_TAG}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'} · limit=${LIMIT || '∞'} · start=${START}`)
  console.log(`Extensions: ${EXTENSIONS.join(', ')}`)
  console.log('')

  // 1. walk
  if (!fs.existsSync(FOLDER!)) {
    console.error(`✗ Folder not found: ${FOLDER}`)
    process.exit(1)
  }
  const allFiles = walkFolder(FOLDER!, RECURSIVE, EXTENSIONS)
  console.log(`📦 발견된 파일: ${allFiles.length}건`)

  // 2. dedupe
  const existing = await prisma.contentAsset.findMany({
    where: { assetType: ASSET_TYPE!, sourceType: SOURCE_TYPE_TAG },
    select: { name: true, sourceRef: true },
  })
  const existingKeys = new Set(existing.map((e) => `${ASSET_TYPE}:${SOURCE_TYPE_TAG}:${e.name}`))
  console.log(`📦 이미 ingest 된 (${SOURCE_TYPE_TAG}, ${ASSET_TYPE}): ${existing.length}건`)
  console.log('')

  // 3. start/limit
  const startIdx = Math.max(0, START - 1)
  const endIdx = LIMIT > 0 ? Math.min(allFiles.length, startIdx + LIMIT) : allFiles.length
  const targets = allFiles.slice(startIdx, endIdx)
  console.log(`📋 처리 대상: ${targets.length}건`)
  console.log('')

  // 4. sequential
  const results: IngestResult[] = []
  for (let i = 0; i < targets.length; i++) {
    console.log(`[${i + 1}/${targets.length}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    const result = await ingestFile(targets[i], existingKeys)
    results.push(result)
    if (result.status === 'success') existingKeys.add(`${ASSET_TYPE}:${SOURCE_TYPE_TAG}:${targets[i].name}`)
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Local Ingest Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const success = results.filter((r) => r.status === 'success')
  const skipExisting = results.filter((r) => r.status === 'skip-existing')
  const failures = results.filter((r) => r.status === 'fail')
  console.log(`Total: ${results.length}`)
  console.log(`  ✓ success:        ${success.length}`)
  console.log(`  ↩ skip (이미):     ${skipExisting.length}`)
  console.log(`  ✗ fail:           ${failures.length}`)
  if (success.length > 0) {
    const totalChunks = success.reduce((s, r) => s + (r.chunkCount ?? 0), 0)
    const avgConfidence = success.reduce((s, r) => s + (r.confidence ?? 0), 0) / success.length
    console.log(`  📚 ContentAsset 추가: ${totalChunks}건`)
    console.log(`  🎯 평균 confidence: ${avgConfidence.toFixed(2)}`)
  }
  if (failures.length > 0) {
    console.log('\n실패:')
    for (const f of failures.slice(0, 10)) {
      console.log(`  ${f.fileName.slice(0, 60)}: ${f.error?.slice(0, 80)}`)
    }
  }
  console.log('')
  console.log(DRY_RUN ? '✓ dry-run 완료' : '✓ local ingest 완료')

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

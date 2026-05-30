/**
 * O1 Bulk Extraction — 297 Drive 자산에서 슬라이드 도형 추출.
 *
 * 흐름:
 *   1. ContentAsset 중 drive: refs 있는 것 (409)
 *   2. Drive 에서 다시 다운로드 (L3 가 처리한 297 + 미처리 108)
 *   3. PPTX → pptx-extractor 로 슬라이드 별 도형 추출
 *   4. PDF → pdf-parse 로 페이지 별 텍스트 + 첫 줄 추출
 *   5. design-kit/diagram-samples/<asset-id>.json 저장
 *      { assetId, name, sourceProject, kind: 'pptx'|'pdf', slides: [...] }
 *
 * 비용: 0 (Drive 다운로드 + 로컬 파싱 — LLM call 없음)
 *
 * 사용:
 *   npx tsx scripts/extract-diagrams-from-drive.ts          # dry-run, 5건
 *   npx tsx scripts/extract-diagrams-from-drive.ts --all --concurrency 3
 *   npx tsx scripts/extract-diagrams-from-drive.ts --pptx-only
 *
 * 결과 검토: design-kit/diagram-samples/*.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
for (const file of ['.env', '.env.local']) {
  const envPath = path.join(process.cwd(), file)
  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    process.env[k] = v
  }
}

const OUT_DIR = path.join(process.cwd(), 'design-kit', 'diagram-samples')

async function main() {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const pptxOnly = args.includes('--pptx-only')
  const pdfOnly = args.includes('--pdf-only')
  const force = args.includes('--force')
  const concIdx = args.indexOf('--concurrency')
  const concurrency = concIdx >= 0 ? Math.max(1, parseInt(args[concIdx + 1] ?? '3', 10)) : 3
  const batchIdx = args.indexOf('--batch')
  const batch = batchIdx >= 0 ? parseInt(args[batchIdx + 1] ?? '5', 10) : all ? undefined : 5

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  const { prisma } = await import('../src/lib/prisma')
  const { drive } = await import('@googleapis/drive')
  const { GoogleAuth } = await import('google-auth-library')

  console.log(`▶ O1 — 297 PPT/PDF 도형 추출`)
  console.log(`  mode: ${all ? 'ALL' : `batch ${batch}`}, ${force ? 'force' : 'idempotent'}`)
  console.log(`  concurrency: ${concurrency}`)
  console.log(`  filter: ${pptxOnly ? 'pptx only' : pdfOnly ? 'pdf only' : 'all'}`)
  console.log(`  output: ${OUT_DIR}`)
  console.log()

  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] })
  const driveClient = drive({ version: 'v3', auth })

  // drive ref 있는 자산
  const assets = await prisma.contentAsset.findMany({
    where: {},
    select: { id: true, name: true, sourceReferences: true },
  })
  const candidates: { id: string; name: string; fileId: string }[] = []
  for (const a of assets) {
    const sref = a.sourceReferences as Record<string, unknown> | unknown[] | null
    let fileId: string | null = null
    if (Array.isArray(sref)) {
      for (const v of sref) if (typeof v === 'string' && v.startsWith('drive:')) {
        fileId = v.replace('drive:', '')
        break
      }
    } else if (sref && typeof sref === 'object') {
      for (const v of Object.values(sref)) if (typeof v === 'string' && v.startsWith('drive:')) {
        fileId = v.replace('drive:', '')
        break
      }
    }
    if (fileId) candidates.push({ id: a.id, name: a.name, fileId })
  }

  // skip 이미 추출된 자산
  let targets = candidates
  if (!force) {
    targets = candidates.filter((c) => !fs.existsSync(path.join(OUT_DIR, `${c.id}.json`)))
  }
  console.log(`전체 drive 자산: ${candidates.length}건 / 미추출: ${targets.length}건`)
  if (batch) targets = targets.slice(0, batch)
  console.log(`이번 처리 대상: ${targets.length}건\n`)

  if (targets.length === 0) {
    console.log('✓ 처리할 자산 없음')
    await prisma.$disconnect()
    return
  }

  let processed = 0
  let saved = 0
  let skipUnsupported = 0
  let errFetch = 0
  let errExtract = 0
  let totalSlides = 0
  let totalShapes = 0
  const startT = Date.now()

  async function processOne(item: typeof targets[number]) {
    let meta
    try {
      const metaRes = await driveClient.files.get({
        fileId: item.fileId,
        fields: 'name,mimeType,size',
        supportsAllDrives: true,
      })
      meta = metaRes.data
    } catch (err) {
      errFetch += 1
      return
    }
    const mimeType = meta.mimeType ?? ''
    const sizeMB = Number(meta.size ?? 0) / 1024 / 1024
    if (sizeMB > 80) {
      skipUnsupported += 1
      return
    }

    // 파일 종류는 Drive 의 mimeType + 파일명으로 판단 (item.name 은 컨텐츠 title)
    const fileName = (meta.name ?? '').toLowerCase()
    const isPptx = mimeType.includes('presentation') || fileName.endsWith('.pptx')
    const isPdf = mimeType.includes('pdf') || fileName.endsWith('.pdf')
    if (pptxOnly && !isPptx) return
    if (pdfOnly && !isPdf) return
    if (!isPptx && !isPdf) {
      skipUnsupported += 1
      return
    }

    // Download
    let buffer: Buffer
    try {
      const res = await driveClient.files.get(
        { fileId: item.fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      )
      buffer = Buffer.from(res.data as ArrayBuffer)
    } catch (err) {
      errFetch += 1
      return
    }

    // Extract
    try {
      let extractedData: any = null
      if (isPptx) {
        const { extractPptxSlides } = await import('../src/lib/diagrams/pptx-extractor')
        const slides = await extractPptxSlides(buffer)
        extractedData = {
          kind: 'pptx',
          totalSlides: slides.length,
          totalShapes: slides.reduce((s, sl) => s + sl.shapes.length, 0),
          slides: slides.map((sl) => ({
            slideNumber: sl.slideNumber,
            shapes: sl.shapes.filter((sh) => sh.text || sh.fillColor || sh.geomPreset),
          })),
        }
      } else if (isPdf) {
        const { PDFParse } = await import('pdf-parse')
        const parser = new PDFParse({ data: new Uint8Array(buffer) })
        const result = await parser.getText()
        const fullText: string = typeof result.text === 'string' ? result.text : String(result.text ?? '')
        // pdf-parse: pages array may exist (per-page strings) or just `text` (joined)
        let pages: string[] = []
        const pagesAll = (result as any).pages
        if (Array.isArray(pagesAll) && pagesAll.length > 0) {
          pages = pagesAll.map((p: any) =>
            typeof p === 'string' ? p : typeof p?.text === 'string' ? p.text : String(p ?? ''),
          )
        } else {
          pages = fullText.split(/\f|\x0C/).map((p) => p.trim()).filter((p) => p.length > 0)
        }
        extractedData = {
          kind: 'pdf',
          totalPages: pages.length,
          pages: pages.map((text, i) => {
            const safe = typeof text === 'string' ? text : ''
            return {
              pageNumber: i + 1,
              text: safe.slice(0, 4000),
              firstLine: safe.split('\n').filter((l) => l.trim().length > 0)[0]?.slice(0, 100),
            }
          }),
        }
      }

      const out = {
        assetId: item.id,
        name: item.name,
        fileName: meta.name,
        mimeType,
        sizeMB: Math.round(sizeMB * 10) / 10,
        ...extractedData,
        extractedAt: new Date().toISOString(),
      }

      const outPath = path.join(OUT_DIR, `${item.id}.json`)
      fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8')
      saved += 1
      if (extractedData?.totalSlides) totalSlides += extractedData.totalSlides
      if (extractedData?.totalShapes) totalShapes += extractedData.totalShapes
      if (extractedData?.totalPages) totalSlides += extractedData.totalPages
    } catch (err) {
      errExtract += 1
      console.warn(`  ✗ extract ${item.name?.slice(0, 50)}: ${err instanceof Error ? err.message.slice(0, 120) : err}`)
    }
  }

  // Worker pool
  let idx = 0
  async function worker() {
    while (idx < targets.length) {
      const myIdx = idx++
      const item = targets[myIdx]
      await processOne(item)
      processed += 1
      if (processed % 10 === 0 || processed === targets.length) {
        const elapsedSec = (Date.now() - startT) / 1000
        const rate = processed / elapsedSec
        const remaining = ((targets.length - processed) / rate).toFixed(0)
        console.log(
          `  [${processed}/${targets.length}] saved=${saved} unsupported=${skipUnsupported} fetchErr=${errFetch} extractErr=${errExtract} · ${rate.toFixed(2)}/s · ETA ${remaining}s`,
        )
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const totalSec = (Date.now() - startT) / 1000
  console.log()
  console.log(`[결과 — ${totalSec.toFixed(1)}s]`)
  console.log(`  처리: ${processed}건`)
  console.log(`  저장: ${saved}건`)
  console.log(`  skip (unsupported): ${skipUnsupported}건`)
  console.log(`  fetch err: ${errFetch}`)
  console.log(`  extract err: ${errExtract}`)
  console.log(`  총 슬라이드/페이지: ${totalSlides}`)
  console.log(`  총 도형: ${totalShapes}`)

  await prisma.$disconnect()
  console.log(`\n✅ 완료 → ${OUT_DIR}`)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})

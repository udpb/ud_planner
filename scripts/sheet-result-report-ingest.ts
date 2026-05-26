/**
 * scripts/sheet-result-report-ingest.ts — 결과보고서 batch ingest (Wave W W12)
 *
 * sheet 의 "결과보고서" 컬럼 hyperlink → Drive download → 텍스트 추출 →
 *   extractResultReport() (지표 + 레슨런 중심) → ContentAsset 다수 (assetType='case').
 *
 * 사용:
 *   npx tsx scripts/sheet-result-report-ingest.ts <sheet-url> --tab "2025년(운영)" --dry-run --limit 3
 *   npx tsx scripts/sheet-result-report-ingest.ts <sheet-url> --tabs "2025년(운영),2024년(운영)" --limit 60
 *
 * 옵션: --tab "이름" / --tabs "탭1,탭2" / --limit N / --start N / --dry-run / --skip-vision / --min-confidence 0.5
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Channel } from '../src/lib/inference/types'
import type { SheetRow } from '../src/lib/drive/sheets'

type PrismaModule = typeof import('../src/lib/prisma')
type DriveModule = typeof import('../src/lib/drive/client')
type SheetsModule = typeof import('../src/lib/drive/sheets')
type IngestModule = typeof import('../src/lib/ingest/file-ingester')
type ReportModule = typeof import('../src/lib/inference/result-report-extractor')
type VectorModule = typeof import('../src/lib/inference/vector-utils')

let prisma: PrismaModule['prisma']
let getFileMeta: DriveModule['getFileMeta']
let downloadFile: DriveModule['downloadFile']
let exportFile: DriveModule['exportFile']
let extractSheetId: SheetsModule['extractSheetId']
let fetchSheetWorkbook: SheetsModule['fetchSheetWorkbook']
let parseTab: SheetsModule['parseTab']
let extractDriveFileId: SheetsModule['extractDriveFileId']
let extractTextFromBuffer: IngestModule['extractTextFromBuffer']
let extractResultReport: ReportModule['extractResultReport']
let embed: VectorModule['embed']

async function loadHeavy() {
  const [p, d, s, i, r, v] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/lib/drive/client'),
    import('../src/lib/drive/sheets'),
    import('../src/lib/ingest/file-ingester'),
    import('../src/lib/inference/result-report-extractor'),
    import('../src/lib/inference/vector-utils'),
  ])
  prisma = p.prisma
  getFileMeta = d.getFileMeta
  downloadFile = d.downloadFile
  exportFile = d.exportFile
  extractSheetId = s.extractSheetId
  fetchSheetWorkbook = s.fetchSheetWorkbook
  parseTab = s.parseTab
  extractDriveFileId = s.extractDriveFileId
  extractTextFromBuffer = i.extractTextFromBuffer
  extractResultReport = r.extractResultReport
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
const SHEET_URL = argv.find((a) => !a.startsWith('--'))
const TAB_SINGLE = arg('--tab')
const TABS_MULTI = arg('--tabs')
const LIMIT = parseInt(arg('--limit', '0')!, 10)
const START = parseInt(arg('--start', '1')!, 10)
const DRY_RUN = argv.includes('--dry-run')
const SKIP_VISION = argv.includes('--skip-vision')
const MIN_CONFIDENCE = parseFloat(arg('--min-confidence', '0.5')!)

if (!SHEET_URL || (!TAB_SINGLE && !TABS_MULTI)) {
  console.error('Usage: npx tsx scripts/sheet-result-report-ingest.ts <sheet-url> --tab "이름" [--dry-run] [--limit N]')
  process.exit(1)
}
const TABS = TABS_MULTI ? TABS_MULTI.split(',').map((s) => s.trim()) : [TAB_SINGLE!]

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
// Fuzzy header helper
// ─────────────────────────────────────────

function findCell(row: SheetRow, ...candidates: string[]) {
  for (const c of candidates) {
    if (row.byHeaderRich[c]) return row.byHeaderRich[c]
  }
  const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  for (const c of candidates) {
    const want = normalize(c)
    for (const [k, val] of Object.entries(row.byHeaderRich)) {
      if (normalize(k).startsWith(want)) return val
    }
  }
  return undefined
}

function findText(row: SheetRow, ...candidates: string[]): string {
  const cell = findCell(row, ...candidates)
  return (cell?.text || '').trim()
}

function inferChannel(projectName: string): Channel {
  const f = projectName.toLowerCase()
  const b2bPatterns = [
    'sk이노', 'sk 이노', 'sk이노베이션', 'cj그룹', 'cj ', 'db손해', 'db ', '네이버',
    '하나금융', '하나 ', 'kaist', '외국어대', '한국외대',
    'cu ', '롯데', '삼성', '현대', '까르띠에', 'gs리테일', 'gs 리테일',
  ]
  if (b2bPatterns.some((p) => f.includes(p))) return 'B2B'
  return 'B2G'
}

// ─────────────────────────────────────────
// Row → meta
// ─────────────────────────────────────────

interface ReportRowMeta {
  rowNum: number
  projectId: string
  projectName: string
  sourceProject: string
  channel: Channel
  reportFileId?: string
}

function rowToMeta(row: SheetRow): ReportRowMeta | null {
  const projectId = findText(row, '프로젝트 ID', '프로젝트ID')
  const projectName = findText(row, '프로젝트명', '사업명')
  if (!projectId || !projectName) return null

  const reportCell = findCell(row, '결과보고서')
  const reportFileId = reportCell?.link ? extractDriveFileId(reportCell.link) ?? undefined : undefined

  return {
    rowNum: row.rowNum,
    projectId,
    projectName,
    sourceProject: `${projectId} ${projectName}`,
    channel: inferChannel(projectName),
    reportFileId,
  }
}

// ─────────────────────────────────────────
// Ingest single
// ─────────────────────────────────────────

interface IngestResult {
  rowNum: number
  projectId: string
  status: 'success' | 'skip-existing' | 'skip-no-file' | 'fail'
  chunkCount?: number
  metricCount?: number
  lessonCount?: number
  confidence?: number
  elapsedSec?: number
  parsedBy?: string
  error?: string
}

async function ingestRow(meta: ReportRowMeta, existing: Set<string>): Promise<IngestResult> {
  const t0 = Date.now()
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`▶ row ${meta.rowNum} [${meta.projectId}] ${meta.projectName.slice(0, 50)}`)
  console.log(`  channel=${meta.channel}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (existing.has(meta.sourceProject)) {
    console.log(`  ↩ 이미 결과보고서 ingest 됨 — skip`)
    return { rowNum: meta.rowNum, projectId: meta.projectId, status: 'skip-existing' }
  }

  if (!meta.reportFileId) {
    console.log(`  ↩ 결과보고서 link 없음`)
    return { rowNum: meta.rowNum, projectId: meta.projectId, status: 'skip-no-file' }
  }

  try {
    // 1. download (mime 별 분기)
    const fileMeta = await getFileMeta(meta.reportFileId)
    const mimeShort = fileMeta.mimeType.includes('google-apps')
      ? `google-${fileMeta.mimeType.split('.').pop()}`
      : fileMeta.mimeType.split('/').pop() ?? fileMeta.mimeType
    console.log(`  📄 ${fileMeta.name}  mime=${mimeShort}  ${fileMeta.size ? (fileMeta.size / 1024).toFixed(0) + 'KB' : '?'}`)

    let buf: Buffer
    let downloadedAsPdf = false
    if (
      fileMeta.mimeType === 'application/vnd.google-apps.document' ||
      fileMeta.mimeType === 'application/vnd.google-apps.presentation'
    ) {
      console.log(`  🔁 Google Apps → PDF export`)
      buf = await exportFile(meta.reportFileId, 'application/pdf')
      downloadedAsPdf = true
    } else if (fileMeta.mimeType === 'application/vnd.google-apps.spreadsheet') {
      throw new Error('Google Sheet 결과보고서 — 별도 처리 필요 (skip)')
    } else {
      buf = await downloadFile(meta.reportFileId)
    }

    // 2. text 추출
    const effectiveName = downloadedAsPdf
      ? fileMeta.name.replace(/\.[^.]+$/, '') + '.pdf'
      : fileMeta.name
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

    // 3. Vision OCR fallback
    const isPdfLike = fileMeta.mimeType === 'application/pdf' || downloadedAsPdf
    if (parsedText.length < 500 && isPdfLike && !SKIP_VISION) {
      console.log(`  🔄 텍스트 너무 짧음 — Vision OCR fallback`)
      const tOcr = Date.now()
      parsedText = await visionOcr(buf)
      parsedBy = 'vision-ocr'
      console.log(`  ✓ Vision OCR ${parsedText.length}자 · ${Math.round((Date.now() - tOcr) / 1000)}s`)
    }

    if (parsedText.length < 300) {
      throw new Error(`텍스트 너무 짧음 (${parsedText.length}자)`)
    }

    // 4. LLM 추출
    const result = await extractResultReport({
      reportText: parsedText,
      sourceProject: meta.sourceProject,
      channel: meta.channel,
    })

    const elapsedSec = Math.round((Date.now() - t0) / 1000)
    console.log(`  ✓ 추출 ${result.chunks.length} chunk · 지표 ${result.totalMetrics}개 · 레슨 ${result.totalLessons}개 · confidence ${result.confidence.toFixed(2)} · ${elapsedSec}s`)

    // 5. confidence cut
    if (result.confidence < MIN_CONFIDENCE) {
      console.log(`  ⚠ confidence < ${MIN_CONFIDENCE} — skip`)
      return {
        rowNum: meta.rowNum,
        projectId: meta.projectId,
        status: 'fail',
        elapsedSec,
        confidence: result.confidence,
        error: `low confidence ${result.confidence.toFixed(2)}`,
      }
    }

    // 6. Persist (assetType='case')
    if (!DRY_RUN) {
      const embeddings = await Promise.all(result.chunks.map((c) => embed(c.narrativeSnippet)))
      for (let i = 0; i < result.chunks.length; i++) {
        const chunk = result.chunks[i]
        await prisma.contentAsset.create({
          data: {
            name: chunk.name,
            category: chunk.category,
            assetType: 'case',
            applicableSections: [],
            valueChainStage: 'outcome', // 결과보고서는 outcome 단계
            evidenceType: chunk.evidenceType,
            keywords: chunk.keywords,
            narrativeSnippet: chunk.narrativeSnippet,
            keyNumbers: chunk.keyNumbers,
            embedding: embeddings[i],
            embeddingModel: 'gemini-embedding-001',
            embeddedAt: new Date(),
            status: 'stable',
            version: 1,
            sourceReferences: [`drive:${meta.reportFileId}`, `sheet-row-${meta.rowNum}`],
            lastReviewedAt: new Date(),
            sourceTier: 'medium', // 결과보고서 신뢰도 medium
            sourceType: 'drive',
            sourceRef: `sheet-row-${meta.rowNum}:drive-${meta.reportFileId}`,
          },
        })
      }
      console.log(`  🗄  ContentAsset ${result.chunks.length}건 저장 (sourceProject: ${meta.sourceProject.slice(0, 40)})`)
    } else {
      console.log(`  (dry-run — DB 저장 X)`)
      // dry-run sample 출력
      result.chunks.forEach((c) => {
        console.log(`    [${c.name}]`)
        console.log(`      ${c.narrativeSnippet.slice(0, 150).replace(/\n/g, ' ')}...`)
      })
    }

    return {
      rowNum: meta.rowNum,
      projectId: meta.projectId,
      status: 'success',
      chunkCount: result.chunks.length,
      metricCount: result.totalMetrics,
      lessonCount: result.totalLessons,
      confidence: result.confidence,
      elapsedSec,
      parsedBy,
    }
  } catch (e) {
    const elapsedSec = Math.round((Date.now() - t0) / 1000)
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error(`  ✗ FAIL · ${elapsedSec}s — ${errMsg.slice(0, 200)}`)
    return {
      rowNum: meta.rowNum,
      projectId: meta.projectId,
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
  console.log('▶ Sheet-based RESULT REPORT ingest — Wave W W12')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Sheet: ${SHEET_URL!.slice(0, 60)}...`)
  console.log(`Tabs: ${TABS.join(', ')}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}  · limit=${LIMIT || '∞'}  start=${START}`)
  console.log('')

  const { sheetId } = extractSheetId(SHEET_URL!)
  console.log('⏳ Sheet 로드 중...')
  const wb = await fetchSheetWorkbook(sheetId)
  console.log(`   ✓ ${wb.worksheets.length} tabs loaded`)

  // dedupe — 같은 sourceProject 의 case 자산이 이미 있나
  const existing = await prisma.contentAsset.findMany({
    where: { assetType: 'case', sourceType: 'drive' },
    select: { sourceReferences: true, sourceRef: true },
  })
  // sourceProject 매핑은 sourceReferences 또는 sourceRef 로 추적
  // 간단히 — name prefix 로 dedupe (이미 ingest 된 결과보고서 처리)
  const existingNames = new Set(existing.map((e) => e.sourceRef ?? '').filter(Boolean))
  console.log(`📦 기존 case ContentAsset (drive): ${existing.length}건`)
  console.log('')

  const allResults: IngestResult[] = []
  for (const tabName of TABS) {
    const ws = wb.getWorksheet(tabName)
    if (!ws) {
      console.error(`✗ Tab "${tabName}" not found — skip`)
      continue
    }
    const content = parseTab(ws, { maxRows: 2000 })
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`📋 Tab: "${tabName}" (${content.rows.length} 데이터 row)`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

    const metas = content.rows
      .map(rowToMeta)
      .filter((m): m is ReportRowMeta => m !== null)
      .filter((m) => !!m.reportFileId)
    console.log(`  유효 row (결과보고서 link 있음): ${metas.length}건`)

    const startIdx = Math.max(0, START - 1)
    const endIdx = LIMIT > 0 ? Math.min(metas.length, startIdx + LIMIT) : metas.length
    const targets = metas.slice(startIdx, endIdx)
    console.log(`  처리 대상: ${targets.length}건`)

    // sourceProject 단위 dedupe (이미 ingest 됐는지 — sourceRef 기준)
    const sourceProjectDedupe = new Set<string>()
    for (const t of targets) {
      // 검사: 같은 row 의 결과보고서가 이미 sourceRef 로 저장됐는지
      const key = `sheet-row-${t.rowNum}:drive-${t.reportFileId}`
      if (existingNames.has(key)) sourceProjectDedupe.add(t.sourceProject)
    }
    if (sourceProjectDedupe.size > 0) {
      console.log(`  이미 ingest 된 사업 (dedupe): ${sourceProjectDedupe.size}건`)
    }

    for (let i = 0; i < targets.length; i++) {
      console.log(`\n[${i + 1}/${targets.length}] ━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      const result = await ingestRow(targets[i], sourceProjectDedupe)
      allResults.push(result)
      if (result.status === 'success') sourceProjectDedupe.add(targets[i].sourceProject)
    }
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Result Report Ingest Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const success = allResults.filter((r) => r.status === 'success')
  const skipExisting = allResults.filter((r) => r.status === 'skip-existing')
  const skipNoFile = allResults.filter((r) => r.status === 'skip-no-file')
  const failures = allResults.filter((r) => r.status === 'fail')
  console.log(`Total: ${allResults.length}`)
  console.log(`  ✓ success:        ${success.length}`)
  console.log(`  ↩ skip (이미):     ${skipExisting.length}`)
  console.log(`  ↩ skip (링크 없음): ${skipNoFile.length}`)
  console.log(`  ✗ fail:           ${failures.length}`)
  if (success.length > 0) {
    const totalChunks = success.reduce((s, r) => s + (r.chunkCount ?? 0), 0)
    const totalMetrics = success.reduce((s, r) => s + (r.metricCount ?? 0), 0)
    const totalLessons = success.reduce((s, r) => s + (r.lessonCount ?? 0), 0)
    const avgConfidence = success.reduce((s, r) => s + (r.confidence ?? 0), 0) / success.length
    console.log(`  📚 ContentAsset 추가: ${totalChunks}건 (case)`)
    console.log(`  📊 추출 지표:        ${totalMetrics}개 (평균 ${(totalMetrics / success.length).toFixed(1)}/사업)`)
    console.log(`  💡 추출 레슨런:       ${totalLessons}개 (평균 ${(totalLessons / success.length).toFixed(1)}/사업)`)
    console.log(`  🎯 평균 confidence: ${avgConfidence.toFixed(2)}`)
  }
  if (failures.length > 0) {
    console.log('\n실패 sample:')
    for (const f of failures.slice(0, 10)) {
      console.log(`  row ${f.rowNum} [${f.projectId}]: ${f.error?.slice(0, 100)}`)
    }
  }
  console.log('')
  console.log(DRY_RUN ? '✓ dry-run 완료' : '✓ result-report ingest 완료')
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

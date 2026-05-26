/**
 * scripts/sheet-batch-ingest.ts — Master Sheet 기반 자동 batch ingest (Wave W W5)
 *
 * 흐름:
 *   1. Google Sheet 로드 (Drive export)
 *   2. 지정 탭 (예: "2025년(운영)") row 추출
 *   3. 각 row 의 "사업제안서(PDF)" 또는 "(PPT)" hyperlink → Drive file ID
 *   4. getFileMeta → downloadFile → extractTextFromBuffer
 *      - text < 500자 → Gemini Vision OCR fallback (이미지 PDF)
 *   5. extractTuple — sourceProject = "프로젝트 ID + 프로젝트명"
 *      - outcome = 'won' (운영 탭)
 *      - channel = 프로젝트명 휴리스틱
 *   6. dedupe: 이미 같은 sourceProject 있으면 skip
 *
 * 사용:
 *   # dry-run (LLM 호출 + 결과만, DB 저장 X)
 *   npx tsx scripts/sheet-batch-ingest.ts <sheet-url> --tab "2025년(운영)" --dry-run --limit 3
 *
 *   # 실제 ingest
 *   npx tsx scripts/sheet-batch-ingest.ts <sheet-url> --tab "2025년(운영)"
 *
 *   # 여러 탭 (콤마 구분)
 *   npx tsx scripts/sheet-batch-ingest.ts <sheet-url> --tabs "2025년(운영),2024년(운영)"
 *
 * 옵션:
 *   --tab "이름"           단일 탭
 *   --tabs "탭1,탭2"       다중 탭
 *   --limit N             탭당 최대 N 건만 (테스트용)
 *   --start N             N 번째 row 부터 (resume 용)
 *   --dry-run             DB 저장 X (LLM 호출만)
 *   --skip-vision         Vision OCR fallback 비활성 (이미지 PDF 자동 skip)
 *   --pdf-only            PPT 무시, PDF 만
 *
 * 환경: GEMINI_API_KEY · DATABASE_URL · ADC 자격 증명
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import { GoogleGenerativeAI } from '@google/generative-ai'

import type { Channel } from '../src/lib/inference/types'
import type { SheetRow } from '../src/lib/drive/sheets'

// ─────────────────────────────────────────
// Dynamic imports (dotenv 평가 후 — SASL 보호)
// ─────────────────────────────────────────

type PrismaModule = typeof import('../src/lib/prisma')
type IngestModule = typeof import('../src/lib/ingest/file-ingester')
type TupleModule = typeof import('../src/lib/inference/extract-tuple')
type DriveModule = typeof import('../src/lib/drive/client')
type SheetsModule = typeof import('../src/lib/drive/sheets')

let prisma: PrismaModule['prisma']
let extractTextFromBuffer: IngestModule['extractTextFromBuffer']
let extractTuple: TupleModule['extractTuple']
let getFileMeta: DriveModule['getFileMeta']
let downloadFile: DriveModule['downloadFile']
let exportFile: DriveModule['exportFile']
let extractSheetId: SheetsModule['extractSheetId']
let fetchSheetWorkbook: SheetsModule['fetchSheetWorkbook']
let parseTab: SheetsModule['parseTab']
let extractDriveFileId: SheetsModule['extractDriveFileId']

async function loadHeavy() {
  const [prismaMod, ingestMod, tupleMod, driveMod, sheetsMod] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/lib/ingest/file-ingester'),
    import('../src/lib/inference/extract-tuple'),
    import('../src/lib/drive/client'),
    import('../src/lib/drive/sheets'),
  ])
  prisma = prismaMod.prisma
  extractTextFromBuffer = ingestMod.extractTextFromBuffer
  extractTuple = tupleMod.extractTuple
  getFileMeta = driveMod.getFileMeta
  downloadFile = driveMod.downloadFile
  exportFile = driveMod.exportFile
  extractSheetId = sheetsMod.extractSheetId
  fetchSheetWorkbook = sheetsMod.fetchSheetWorkbook
  parseTab = sheetsMod.parseTab
  extractDriveFileId = sheetsMod.extractDriveFileId
}

// ─────────────────────────────────────────
// CLI args
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
const PDF_ONLY = argv.includes('--pdf-only')
const MIN_CONFIDENCE = parseFloat(arg('--min-confidence', '0.5')!)

if (!SHEET_URL || (!TAB_SINGLE && !TABS_MULTI)) {
  console.error('Usage: npx tsx scripts/sheet-batch-ingest.ts <sheet-url> --tab "이름" [--dry-run] [--limit N]')
  process.exit(1)
}
const TABS = TABS_MULTI ? TABS_MULTI.split(',').map((s) => s.trim()) : [TAB_SINGLE!]

// ─────────────────────────────────────────
// Channel inference
// ─────────────────────────────────────────

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
// Vision OCR fallback (이미지 PDF)
// ─────────────────────────────────────────

const VISION_MODEL = 'gemini-3-flash-preview'
const VISION_PROMPT = `이 PDF 의 모든 텍스트를 추출하세요. 구조 (제목·목록·표) 도 보존.
출력: 본문 텍스트만 (JSON X, 마크다운 펜스 X). 페이지 구분은 "--- 페이지 N ---" 형식.`

async function visionOcr(buf: Buffer): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY missing for Vision OCR')

  const client = new GoogleGenerativeAI(apiKey)
  const model = client.getGenerativeModel({
    model: VISION_MODEL,
    generationConfig: { maxOutputTokens: 32768, temperature: 0.1 },
  })

  const base64 = buf.toString('base64')
  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { text: VISION_PROMPT },
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
        ],
      },
    ],
  })
  return result.response.text()
}

// ─────────────────────────────────────────
// Row → ingest
// ─────────────────────────────────────────

interface RowMeta {
  rowNum: number
  projectId: string
  projectName: string
  sourceProject: string
  channel: Channel
  pdfFileId?: string
  pptFileId?: string
}

interface IngestResult {
  rowNum: number
  projectId: string
  status: 'success' | 'skip-existing' | 'skip-no-file' | 'fail'
  filename?: string
  patternId?: string
  contentAssetCount?: number
  confidence?: number
  elapsedSec?: number
  parsedBy?: string
  textChars?: number
  error?: string
}

/**
 * fuzzy 헤더 매칭 — 정확 일치 우선, 없으면 prefix 매칭.
 * 2024 운영 탭의 "프로젝트 ID\n(임시)" 같은 multiline + 접미사 흡수.
 */
function findCell(row: SheetRow, ...candidates: string[]) {
  for (const c of candidates) {
    if (row.byHeaderRich[c]) return row.byHeaderRich[c]
  }
  // prefix 매칭 (공백/줄바꿈 정규화)
  const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  for (const c of candidates) {
    const want = normalize(c)
    for (const [key, val] of Object.entries(row.byHeaderRich)) {
      if (normalize(key).startsWith(want)) return val
    }
  }
  return undefined
}

function findText(row: SheetRow, ...candidates: string[]): string {
  const cell = findCell(row, ...candidates)
  return (cell?.text || '').trim()
}

function rowToMeta(row: SheetRow): RowMeta | null {
  const projectId = findText(row, '프로젝트 ID', '프로젝트ID')
  const projectName = findText(row, '프로젝트명', '사업명')
  if (!projectId || !projectName) return null

  // PDF 우선, 없으면 PPT
  const pdfCell = findCell(row, '사업제안서(PDF)', '사업 제안서(PDF)')
  const pptCell = findCell(row, '사업제안서(PPT)', '사업 제안서(PPT)')
  const pdfFileId = pdfCell?.link ? extractDriveFileId(pdfCell.link) ?? undefined : undefined
  const pptFileId = pptCell?.link ? extractDriveFileId(pptCell.link) ?? undefined : undefined

  return {
    rowNum: row.rowNum,
    projectId,
    projectName,
    sourceProject: `${projectId} ${projectName}`,
    channel: inferChannel(projectName),
    pdfFileId,
    pptFileId,
  }
}

async function ingestRow(
  meta: RowMeta,
  existingProjects: Set<string>,
): Promise<IngestResult> {
  const t0 = Date.now()
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`▶ row ${meta.rowNum} [${meta.projectId}] ${meta.projectName.slice(0, 50)}`)
  console.log(`  channel=${meta.channel}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 1. Dedupe
  if (existingProjects.has(meta.sourceProject)) {
    console.log(`  ↩ 이미 ingest 됨 — skip`)
    return { rowNum: meta.rowNum, projectId: meta.projectId, status: 'skip-existing' }
  }

  // 2. PDF/PPT 선택 — PDF 우선
  let fileId = meta.pdfFileId
  if (!fileId && !PDF_ONLY) fileId = meta.pptFileId
  if (!fileId) {
    console.log(`  ↩ Drive link 없음 (PDF=${!!meta.pdfFileId} PPT=${!!meta.pptFileId})`)
    return { rowNum: meta.rowNum, projectId: meta.projectId, status: 'skip-no-file' }
  }

  try {
    // 3. Meta + download (또는 Google Apps 면 PDF export)
    const fileMeta = await getFileMeta(fileId)
    const mimeShort = fileMeta.mimeType.includes('google-apps')
      ? `google-${fileMeta.mimeType.split('.').pop()}`
      : fileMeta.mimeType.split('/').pop() ?? fileMeta.mimeType
    console.log(`  📄 ${fileMeta.name}  mime=${mimeShort}  ${fileMeta.size ? (fileMeta.size / 1024).toFixed(0) + 'KB' : '?'}`)

    // mime 별 다운로드 분기
    // - Google Slides/Docs → exportFile(fileId, 'application/pdf') — native 형식 X, PDF 변환 필수
    // - Google Sheets → 자료원이라 ingest 대상 아님 (skip)
    // - 일반 PDF/PPTX/DOCX → downloadFile (alt=media)
    let buf: Buffer
    let downloadedAsPdf = false
    if (
      fileMeta.mimeType === 'application/vnd.google-apps.presentation' ||
      fileMeta.mimeType === 'application/vnd.google-apps.document'
    ) {
      console.log(`  🔁 Google Apps → PDF export`)
      buf = await exportFile(fileId, 'application/pdf')
      downloadedAsPdf = true
    } else if (fileMeta.mimeType === 'application/vnd.google-apps.spreadsheet') {
      throw new Error('Google Sheet 자체는 ingest 대상 아님 (skip)')
    } else {
      buf = await downloadFile(fileId)
    }

    // 4. Text 추출 — Google Apps PDF export 면 file-ingester 가 .pdf 확장자 인식하도록 hint
    const effectiveName = downloadedAsPdf ? fileMeta.name.replace(/\.[^.]+$/, '') + '.pdf' : fileMeta.name
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

    // 5. 이미지 PDF fallback → Vision OCR. PDF 또는 PDF로 export 된 Google Apps 모두 대상
    const isPdfLike = fileMeta.mimeType === 'application/pdf' || downloadedAsPdf
    if (parsedText.length < 500 && isPdfLike && !SKIP_VISION) {
      console.log(`  🔄 텍스트 너무 짧음 (${parsedText.length}자) — Vision OCR fallback`)
      const tOcr = Date.now()
      try {
        parsedText = await visionOcr(buf)
        parsedBy = 'vision-ocr'
        console.log(`  ✓ Vision OCR ${parsedText.length}자 · ${Math.round((Date.now() - tOcr) / 1000)}s`)
      } catch (e) {
        throw new Error(`Vision OCR 실패: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (parsedText.length < 500) {
      throw new Error(`최종 텍스트 너무 짧음 (${parsedText.length}자)`)
    }

    // 6. extract-tuple
    const result = await extractTuple(
      {
        proposalText: parsedText,
        sourceProject: meta.sourceProject,
        outcome: 'won', // 운영 탭 = 수주
        channel: meta.channel,
        sourceType: 'archive',
        sourceRef: `sheet-row-${meta.rowNum}:drive-${fileId}`,
      },
      { dryRun: DRY_RUN },
    )

    const elapsedSec = Math.round((Date.now() - t0) / 1000)
    console.log(`  ✓ ingest 완료 · ${elapsedSec}s · confidence ${result.confidence.toFixed(2)}`)
    console.log(`    patternId: ${result.patternId}  contentAssets: ${result.contentAssetIds.length}`)

    // confidence threshold — 낮으면 즉시 cleanup (PDF 가 표지·요약본인 경우 노이즈 방지)
    if (!DRY_RUN && result.confidence < MIN_CONFIDENCE) {
      console.log(`  ⚠ confidence ${result.confidence.toFixed(2)} < min ${MIN_CONFIDENCE} — DB 에서 즉시 제거 (학습 노이즈 방지)`)
      try {
        if (result.contentAssetIds.length > 0) {
          await prisma.contentAsset.deleteMany({ where: { id: { in: result.contentAssetIds } } })
        }
        await prisma.winningPattern.delete({ where: { id: result.patternId } })
        console.log(`  🗑  ${result.contentAssetIds.length} ContentAsset + 1 WinningPattern 삭제`)
      } catch (e) {
        console.warn(`  ⚠ cleanup 실패 (수동 정리 필요): ${e instanceof Error ? e.message : String(e)}`)
      }
      return {
        rowNum: meta.rowNum,
        projectId: meta.projectId,
        status: 'fail',
        filename: fileMeta.name,
        elapsedSec,
        parsedBy,
        textChars: parsedText.length,
        error: `confidence ${result.confidence.toFixed(2)} < min ${MIN_CONFIDENCE} (auto cleanup 됨)`,
      }
    }

    return {
      rowNum: meta.rowNum,
      projectId: meta.projectId,
      status: 'success',
      filename: fileMeta.name,
      patternId: result.patternId,
      contentAssetCount: result.contentAssetIds.length,
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
  console.log('▶ Sheet-based batch ingest — Wave W W5')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Sheet: ${SHEET_URL!.slice(0, 60)}...`)
  console.log(`Tabs: ${TABS.join(', ')}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}  · limit=${LIMIT || '∞'}  start=${START}`)
  console.log(`Vision OCR fallback: ${SKIP_VISION ? 'OFF' : 'ON'}  · PDF-only: ${PDF_ONLY ? 'YES' : 'NO (PPT fallback)'}`)
  console.log('')

  // 1. Sheet load
  const { sheetId } = extractSheetId(SHEET_URL!)
  console.log(`⏳ Sheet 로드 중...`)
  const wb = await fetchSheetWorkbook(sheetId)
  console.log(`   ✓ ${wb.worksheets.length} tabs loaded`)
  console.log('')

  // 2. Dedupe — DB 의 기존 sourceProject
  const existing = await prisma.winningPattern.findMany({ select: { sourceProject: true } })
  const existingProjects = new Set(existing.map((p) => p.sourceProject))
  console.log(`📦 기존 ingest sourceProject: ${existingProjects.size}건 (dedupe 기준)`)
  console.log('')

  const allResults: IngestResult[] = []

  // 3. 탭별 row 처리
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

    // row → meta 변환 + 유효 row 만 필터
    const metas = content.rows
      .map(rowToMeta)
      .filter((m): m is RowMeta => m !== null)
      .filter((m) => m.pdfFileId || (!PDF_ONLY && m.pptFileId))

    console.log(`  유효 row (PDF/PPT 링크 있음): ${metas.length}건`)

    // start/limit 적용
    const startIdx = Math.max(0, START - 1)
    const endIdx = LIMIT > 0 ? Math.min(metas.length, startIdx + LIMIT) : metas.length
    const targets = metas.slice(startIdx, endIdx)
    console.log(`  처리 대상 (start=${START} limit=${LIMIT || '∞'}): ${targets.length}건`)

    // sequential 처리
    for (let i = 0; i < targets.length; i++) {
      console.log(`\n[${i + 1}/${targets.length}] ━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      const result = await ingestRow(targets[i], existingProjects)
      allResults.push(result)
      // 새로 ingest 되면 dedupe set 에 추가
      if (result.status === 'success') existingProjects.add(targets[i].sourceProject)
    }
  }

  // ─────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Batch Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const success = allResults.filter((r) => r.status === 'success')
  const skipExisting = allResults.filter((r) => r.status === 'skip-existing')
  const skipNoFile = allResults.filter((r) => r.status === 'skip-no-file')
  const failures = allResults.filter((r) => r.status === 'fail')
  console.log(`Total processed: ${allResults.length}`)
  console.log(`  ✓ success:        ${success.length}`)
  console.log(`  ↩ skip (이미 있음): ${skipExisting.length}`)
  console.log(`  ↩ skip (링크 없음): ${skipNoFile.length}`)
  console.log(`  ✗ fail:           ${failures.length}`)
  if (success.length > 0) {
    const totalAssets = success.reduce((sum, r) => sum + (r.contentAssetCount ?? 0), 0)
    const avgConfidence = success.reduce((s, r) => s + (r.confidence ?? 0), 0) / success.length
    const totalSec = success.reduce((s, r) => s + (r.elapsedSec ?? 0), 0)
    const visionCount = success.filter((r) => r.parsedBy === 'vision-ocr').length
    console.log(`  📚 ContentAsset 추가: ${totalAssets}건 (평균 ${(totalAssets / success.length).toFixed(1)} per pattern)`)
    console.log(`  🎯 평균 confidence: ${avgConfidence.toFixed(2)}`)
    console.log(`  👁  Vision OCR 사용: ${visionCount}건`)
    console.log(`  ⏱  총 소요: ${Math.round(totalSec / 60)}분 ${totalSec % 60}초`)
  }
  if (failures.length > 0) {
    console.log('')
    console.log('실패 row:')
    for (const f of failures) {
      console.log(`  row ${f.rowNum} [${f.projectId}]: ${f.error?.slice(0, 100)}`)
    }
  }
  console.log('')
  console.log(DRY_RUN ? '✓ dry-run 완료 — DB 변경 X' : '✓ ingest 완료')
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

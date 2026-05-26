/**
 * scripts/batch-ingest-proposals.ts — Sphere 2 batch ingest (Wave W W1)
 *
 * archive/ 폴더의 모든 PDF 를 순차 ingest (실제 DB 저장).
 *
 * 사용:
 *   npx tsx scripts/batch-ingest-proposals.ts [--folder C:/Users/USER/projects/archive] [--dry-run]
 *
 * 각 PDF:
 *   1. 파일명 → 프로젝트 ID + 사업명 + channel 자동 추정
 *   2. PDF 파싱 (pdf-parse)
 *   3. extract-tuple 호출 (3 LLM + embedding + DB transaction)
 *   4. 결과 누적
 *
 * 예상: 17 PDF × ~5분 = ~1.5시간 · $0.30
 * Sequential 처리 (Gemini RPM 보호).
 *
 * 환경: GEMINI_API_KEY · DATABASE_URL (Docker postgres 떠 있어야)
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import fs from 'node:fs'
import path from 'node:path'
import type { Channel } from '../src/lib/inference/types'

// Heavy modules — main() 안에서 dynamic import (top-level await 회피).
// dotenv 평가 후 module body run 보장 — ESM import hoisting 으로 정적 import 시
// DATABASE_URL 가 undefined → SASL error 발생.
type PrismaModule = typeof import('../src/lib/prisma')
type IngestModule = typeof import('../src/lib/ingest/file-ingester')
type TupleModule = typeof import('../src/lib/inference/extract-tuple')

let prisma: PrismaModule['prisma']
let extractTextFromBuffer: IngestModule['extractTextFromBuffer']
let extractTuple: TupleModule['extractTuple']

async function loadHeavyModules() {
  const [prismaMod, ingestMod, tupleMod] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/lib/ingest/file-ingester'),
    import('../src/lib/inference/extract-tuple'),
  ])
  prisma = prismaMod.prisma
  extractTextFromBuffer = ingestMod.extractTextFromBuffer
  extractTuple = tupleMod.extractTuple
}

// ─────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────

const argv = process.argv.slice(2)
function arg(flag: string, dflt?: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const FOLDER = arg('--folder', 'C:/Users/USER/projects/archive')!
const DRY_RUN = argv.includes('--dry-run')

// ─────────────────────────────────────────
// 채널 자동 추정 (휴리스틱)
// ─────────────────────────────────────────

/**
 * 파일명 + 클라이언트 키워드로 channel 추정.
 *
 * B2G (정부·지자체·공공): 예비창업패키지 · 중기부 · KAC · 양양군 · 청년창업 등
 * B2B (기업·대학): SK · CJ · DB · 네이버 · 하나 · KAIST · 외대 등
 * renewal: 직접 명시 어려움 — default 'B2G'
 */
function inferChannel(filename: string): Channel {
  const f = filename.toLowerCase()
  // B2B 패턴 (기업·대학)
  const b2bPatterns = [
    'sk이노', 'sk 이노', 'cj그룹', 'cj ', 'db손해', 'db ', '네이버',
    '하나금융', '하나 ', 'kaist', 'kac ', '외국어대', '한국외대',
    'cu ', '롯데', '삼성', '현대',
  ]
  if (b2bPatterns.some((p) => f.includes(p))) return 'B2B'
  // 기본: B2G (대부분의 정부·공공 사업)
  return 'B2G'
}

// ─────────────────────────────────────────
// 파일명 → 프로젝트 ID + 사업명 추출
// ─────────────────────────────────────────

function parseProjectInfo(filename: string): { projectId: string; projectName: string } {
  // 패턴 1: "A.25.0003_사업명_사업제안서(PDF)"
  // 패턴 2: "A.25 (1).0047_사업명_사업 제안서(PDF)"
  const baseFilename = filename.replace(/\.(pdf|PDF)$/, '')

  const m = baseFilename.match(/^([A-Z]\.\d+(?:\s*\(\d+\))?\.\d+)_(.+?)_사업\s*제안서/i)
  if (m) {
    return {
      projectId: m[1].replace(/\s+/g, ''),
      projectName: m[2].trim(),
    }
  }

  // fallback: 전체 파일명 (정리)
  return {
    projectId: baseFilename.split('_')[0] || 'unknown',
    projectName: baseFilename.replace(/_/g, ' ').slice(0, 200),
  }
}

// ─────────────────────────────────────────
// 단일 PDF ingest
// ─────────────────────────────────────────

interface IngestResult {
  filename: string
  projectId: string
  projectName: string
  channel: Channel
  status: 'success' | 'fail'
  patternId?: string
  contentAssetCount?: number
  confidence?: number
  elapsedSec?: number
  error?: string
}

async function ingestOne(filePath: string): Promise<IngestResult> {
  const filename = path.basename(filePath)
  const { projectId, projectName } = parseProjectInfo(filename)
  const channel = inferChannel(filename)
  const t0 = Date.now()

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`▶ ingest [${projectId}] ${projectName.slice(0, 60)}`)
  console.log(`  channel=${channel} · ${filename.slice(0, 80)}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  try {
    // 1. PDF 읽기 + 파싱
    const buf = fs.readFileSync(filePath)
    const parsed = await extractTextFromBuffer(buf, filename)

    if (parsed.text.length < 500) {
      throw new Error(`PDF 파싱 텍스트 너무 짧음 (${parsed.text.length}자) — 이미지 PDF 가능성`)
    }

    console.log(`  ✓ PDF 파싱 ${parsed.text.length}자 (by=${parsed.by})`)

    // 2. extract-tuple 호출
    const result = await extractTuple(
      {
        proposalText: parsed.text,
        sourceProject: `${projectId} ${projectName}`,
        outcome: 'won', // 2025년 운영 탭 = 수주 사업
        channel,
        sourceType: 'archive',
        sourceRef: filePath,
      },
      { dryRun: DRY_RUN },
    )

    const elapsedSec = Math.round((Date.now() - t0) / 1000)
    console.log(`  ✓ ingest 완료 · ${elapsedSec}s · confidence ${result.confidence.toFixed(2)}`)
    console.log(`    patternId: ${result.patternId}`)
    console.log(`    contentAssets: ${result.contentAssetIds.length}`)

    return {
      filename,
      projectId,
      projectName,
      channel,
      status: 'success',
      patternId: result.patternId,
      contentAssetCount: result.contentAssetIds.length,
      confidence: result.confidence,
      elapsedSec,
    }
  } catch (e) {
    const elapsedSec = Math.round((Date.now() - t0) / 1000)
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error(`  ✗ FAIL · ${elapsedSec}s`)
    console.error(`    ${errMsg.slice(0, 200)}`)
    return {
      filename,
      projectId,
      projectName,
      channel,
      status: 'fail',
      elapsedSec,
      error: errMsg.slice(0, 500),
    }
  }
}

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

async function main() {
  // 1️⃣ Heavy modules dynamic import (dotenv 평가 후)
  await loadHeavyModules()

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ Sphere 2 batch ingest — Wave W W1')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Folder: ${FOLDER}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (DB 저장 X)' : 'PRODUCTION (실제 DB 저장)'}`)

  // 1. 제안서 파일 목록 — path.extname 가 한글 파일명에서 잘못 동작.
  //    파일명 패턴: ".pdf" · ".pptx" · "(PDF)" · "(PPT)" · "_PDF" · "사업제안서" · "제안서"
  //    file-ingester 가 PDF · PPTX 모두 지원 — officeparser fallback
  const allFiles = fs.readdirSync(FOLDER)
  const pdfFiles = allFiles
    .filter((f) => {
      // 확장자 명시
      if (/\.(pdf|pptx|docx)$/i.test(f)) return true
      // 괄호 패턴
      if (/\(PDF\)|\(PPT\)|_PDF$|_PPT$/i.test(f)) return true
      // "제안서" 또는 "사업제안서" 끝
      if (/제안서\)?$/i.test(f)) return true
      return false
    })
    .sort()

  console.log(`PDF 후보: ${pdfFiles.length}건`)
  console.log('')

  if (pdfFiles.length === 0) {
    console.error('PDF 파일 없음')
    process.exit(1)
  }

  // 2. Dedupe — 이미 ingest 된 sourceProject skip
  const existing = await prisma.winningPattern.findMany({
    select: { sourceProject: true },
  })
  const existingProjects = new Set(existing.map((p) => p.sourceProject))
  console.log(`기존 ingest 된 사업: ${existingProjects.size}건 (skip)`)
  console.log('')

  // 3. 각 PDF sequential 처리
  const results: IngestResult[] = []
  let skippedCount = 0
  for (let i = 0; i < pdfFiles.length; i++) {
    const file = pdfFiles[i]
    const fullPath = path.join(FOLDER, file)
    const { projectId, projectName } = parseProjectInfo(file)
    const sourceProject = `${projectId} ${projectName}`

    if (existingProjects.has(sourceProject)) {
      console.log(`\n[${i + 1}/${pdfFiles.length}] ⏭ skip (이미 ingest 됨) — ${projectId}`)
      skippedCount++
      continue
    }

    console.log(`\n[${i + 1}/${pdfFiles.length}]`)
    const r = await ingestOne(fullPath)
    results.push(r)
  }
  console.log(`\n⏭ Skipped (dedupe): ${skippedCount}건`)

  // 3. Summary
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 BATCH SUMMARY')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const success = results.filter((r) => r.status === 'success')
  const failed = results.filter((r) => r.status === 'fail')
  console.log(`✓ 성공: ${success.length}건`)
  console.log(`✗ 실패: ${failed.length}건`)
  console.log(`📈 평균 confidence: ${(success.reduce((s, r) => s + (r.confidence ?? 0), 0) / Math.max(1, success.length)).toFixed(3)}`)
  console.log(`⏱  총 시간: ${Math.round(results.reduce((s, r) => s + (r.elapsedSec ?? 0), 0) / 60)}분`)
  console.log(`💰 예상 비용: $${(success.length * 0.015).toFixed(3)}`)
  console.log(`📦 ContentAsset 생성: ${success.reduce((s, r) => s + (r.contentAssetCount ?? 0), 0)}건`)
  console.log('')

  if (failed.length > 0) {
    console.log('━ 실패 사례 ━')
    failed.forEach((r) => {
      console.log(`✗ [${r.projectId}] ${r.projectName.slice(0, 60)}`)
      console.log(`  ${r.error?.slice(0, 200)}`)
    })
  }

  // 4. 결과 파일 저장
  const reportPath = path.join('.secrets/proposals', `batch-ingest-${Date.now()}.json`)
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, JSON.stringify({ summary: { success: success.length, failed: failed.length }, results }, null, 2))
  console.log(`📄 결과 저장: ${reportPath}`)
}

main()
  .catch((e) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('✗ BATCH FAIL')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error(e instanceof Error ? e.stack : String(e))
    process.exit(1)
  })
  .finally(() => {
    setTimeout(() => process.exit(0), 100)
  })

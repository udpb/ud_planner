/**
 * scripts/match-tuple-test.ts — Sphere 2 매칭 검증 (Wave W W2)
 *
 * 새 RFP (PDF or text) → 시드된 WinningPattern · ContentAsset 매칭 결과 출력.
 * DB 변경 X — 읽기 전용.
 *
 * 사용:
 *   npx tsx scripts/match-tuple-test.ts <rfp-path> [--channel B2G|B2B|renewal] [--limit 5]
 *
 * 예시:
 *   # PDF 입력
 *   npx tsx scripts/match-tuple-test.ts "C:/Users/USER/projects/archive/A.25.0023_2025 한국외국어대학교 학생창업캠프_사업 제안서(PDF)"
 *
 *   # 텍스트 파일 입력
 *   npx tsx scripts/match-tuple-test.ts ./rfp-sample.txt --channel B2G --limit 3
 *
 * 환경: GEMINI_API_KEY (필수)
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import fs from 'node:fs'
import path from 'node:path'

// Heavy modules — dotenv 평가 후 dynamic import (ESM hoisting 회피)
type MatchModule = typeof import('../src/lib/inference/match-tuple')
type IngestModule = typeof import('../src/lib/ingest/file-ingester')
type TypeModule = typeof import('../src/lib/inference/types')

let matchTuple: MatchModule['matchTuple']
let extractTextFromBuffer: IngestModule['extractTextFromBuffer']
let CHANNEL_VALUES: TypeModule['CHANNEL_VALUES']

async function loadHeavy() {
  const matchMod = await import('../src/lib/inference/match-tuple')
  const ingestMod = await import('../src/lib/ingest/file-ingester')
  const typeMod = await import('../src/lib/inference/types')
  matchTuple = matchMod.matchTuple
  extractTextFromBuffer = ingestMod.extractTextFromBuffer
  CHANNEL_VALUES = typeMod.CHANNEL_VALUES
}

// ─────────────────────────────────────────
// CLI arg parsing
// ─────────────────────────────────────────

function arg(argv: string[], flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}

async function loadRfpText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  const buf = fs.readFileSync(filePath)
  if (ext === '.txt' || ext === '.md') {
    return buf.toString('utf-8')
  }
  // PDF / DOCX / PPTX 등 — file-ingester 가 처리
  const parsed = await extractTextFromBuffer(buf, path.basename(filePath))
  return parsed.text
}

// ─────────────────────────────────────────
// Pretty print helpers
// ─────────────────────────────────────────

function bar(width: number, pct: number): string {
  const fill = Math.max(0, Math.min(width, Math.round(pct * width)))
  return '█'.repeat(fill) + '░'.repeat(width - fill)
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

// ─────────────────────────────────────────
// main
// ─────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)
  const rfpPath = argv.find((a) => !a.startsWith('--'))
  if (!rfpPath) {
    console.error('Usage: npx tsx scripts/match-tuple-test.ts <rfp-path> [--channel B2G|B2B|renewal] [--limit 5]')
    process.exit(1)
  }
  const channel = arg(argv, '--channel', 'B2G') as 'B2G' | 'B2B' | 'renewal'
  const limit = parseInt(arg(argv, '--limit', '5'), 10)

  await loadHeavy()

  // 채널 검증
  if (!(CHANNEL_VALUES as readonly string[]).includes(channel)) {
    throw new Error(`invalid channel: ${channel}`)
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ Sphere 2 match-tuple test')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`RFP file: ${path.basename(rfpPath)}`)
  console.log(`Channel: ${channel} · limit: ${limit}`)
  console.log('')

  // 1. RFP 텍스트 로드
  console.log('1️⃣  RFP 텍스트 로드 중...')
  const t0 = Date.now()
  const text = await loadRfpText(rfpPath)
  console.log(`   ✓ ${text.length}자 · ${Date.now() - t0}ms`)

  if (text.length < 200) {
    console.error(`   ✗ RFP 텍스트 너무 짧음 (< 200자)`)
    process.exit(1)
  }

  // 2. matchTuple 호출
  console.log('')
  console.log('2️⃣  matchTuple 호출 중... (LLM 1 + embedding 1 + DB query · ~10~20초)')
  const t1 = Date.now()
  const result = await matchTuple({
    rfp: { text },
    channel,
    limit,
  })
  console.log(`   ✓ 완료 · ${Date.now() - t1}ms`)
  console.log('')

  // ─────────────────────────────────────────
  // RFP 추정 결과
  // ─────────────────────────────────────────

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🅡  RFP 추정 (LLM 1 호출)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Message vector dim: ${result.rfpEstimate.messageVector.length}`)
  console.log(`Content keywords (${result.rfpEstimate.contentKeywords.length}):`)
  console.log(`   ${result.rfpEstimate.contentKeywords.slice(0, 15).join(' · ')}`)
  if (result.rfpEstimate.logicGraph) {
    console.log(`Logic graph: ${result.rfpEstimate.logicGraph.nodes.length} nodes / ${result.rfpEstimate.logicGraph.edges.length} edges`)
    console.log(`Section order: ${result.rfpEstimate.logicGraph.sectionOrder.join(' → ')}`)
  } else {
    console.log(`Logic graph: (LLM omitted)`)
  }
  console.log('')

  // ─────────────────────────────────────────
  // Top Messages
  // ─────────────────────────────────────────

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`🅜  Top ${result.messages.length} Messages (총 후보 ${result.totalCandidates.messages}건)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (result.messages.length === 0) {
    console.log('  (매칭된 WinningPattern 없음 — 시드된 패턴이 없거나 모두 cut)')
  }

  result.messages.forEach((m, i) => {
    console.log(`\n[${i + 1}] score=${m.matchScore.toFixed(3)} · ${m.outcome} · ${m.sourceProject}`)
    console.log(`    ${bar(30, m.matchScore)} ${(m.matchScore * 100).toFixed(1)}%`)
    console.log(`    Slogan: ${m.message.slogan}`)
    console.log(`    KeyMsg1: ${m.message.keyMessages[0]?.slice(0, 80) ?? ''}`)
    console.log(`    breakdown:`)
    console.log(`      ${pad('messageSim', 12)} ${m.breakdown.messageSim.toFixed(3)} ${bar(20, m.breakdown.messageSim)}`)
    console.log(`      ${pad('logicSim', 12)} ${m.breakdown.logicSim.toFixed(3)} ${bar(20, m.breakdown.logicSim)} (W3: hybrid embed+Jaccard)`)
    console.log(`      ${pad('channelMatch', 12)} ${m.breakdown.channelMatch.toFixed(3)} ${bar(20, m.breakdown.channelMatch)}`)
    console.log(`      ${pad('winRateBonus', 12)} ${m.breakdown.winRateBonus.toFixed(3)} ${bar(20, m.breakdown.winRateBonus)}`)
    console.log(`      ${pad('contentSim', 12)} ${m.breakdown.contentSim.toFixed(3)} (ContentAsset 별도 매칭)`)
  })

  // ─────────────────────────────────────────
  // Top Contents
  // ─────────────────────────────────────────

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📄 Top ${result.contents.length} proposal Content (총 ${result.totalCandidates.contents}건 · MMR)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (result.contents.length === 0) {
    console.log('  (매칭된 proposal 자산 없음)')
  }

  result.contents.forEach((c, i) => {
    console.log(`\n[${i + 1}] score=${c.matchScore.toFixed(3)} · mmr=${c.mmrScore.toFixed(3)} · section=${c.sectionHint ?? '?'} · tier=${c.sourceTier ?? '?'}`)
    console.log(`    ${bar(30, c.matchScore)} ${(c.matchScore * 100).toFixed(1)}%`)
    console.log(`    assetId: ${c.assetId}`)
    const preview = c.narrativeSnippet.slice(0, 220).replace(/\s+/g, ' ')
    console.log(`    snippet: ${preview}${c.narrativeSnippet.length > 220 ? '...' : ''}`)
  })

  // W10: methodology 자산 별도 출력 (회사 IP)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`🏆 Top ${result.methodologyAssets.length} methodology (회사 IP) (총 ${result.totalCandidates.methodologyAssets}건)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (result.methodologyAssets.length === 0) {
    console.log('  (매칭된 methodology 자산 없음)')
  }

  result.methodologyAssets.forEach((c, i) => {
    console.log(`\n[${i + 1}] score=${c.matchScore.toFixed(3)} · mmr=${c.mmrScore.toFixed(3)} · tier=${c.sourceTier ?? '?'}`)
    console.log(`    ${bar(30, c.matchScore)} ${(c.matchScore * 100).toFixed(1)}%`)
    console.log(`    assetId: ${c.assetId}`)
    const preview = c.narrativeSnippet.slice(0, 220).replace(/\s+/g, ' ')
    console.log(`    snippet: ${preview}${c.narrativeSnippet.length > 220 ? '...' : ''}`)
  })

  // W13: case 자산 별도 출력 (결과보고서 지표·레슨)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📈 Top ${result.caseAssets.length} case (사업 결과·교훈) (총 ${result.totalCandidates.caseAssets}건)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (result.caseAssets.length === 0) {
    console.log('  (매칭된 case 자산 없음)')
  }

  result.caseAssets.forEach((c, i) => {
    console.log(`\n[${i + 1}] score=${c.matchScore.toFixed(3)} · mmr=${c.mmrScore.toFixed(3)}`)
    console.log(`    ${bar(30, c.matchScore)} ${(c.matchScore * 100).toFixed(1)}%`)
    console.log(`    assetId: ${c.assetId}`)
    const preview = c.narrativeSnippet.slice(0, 300).replace(/\s+/g, ' ')
    console.log(`    snippet: ${preview}${c.narrativeSnippet.length > 300 ? '...' : ''}`)
  })

  // ─────────────────────────────────────────
  // Meta
  // ─────────────────────────────────────────

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Meta')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Total candidates: messages=${result.totalCandidates.messages} · contents=${result.totalCandidates.contents}`)
  console.log(`matchTuple elapsed: ${result.elapsedMs}ms`)
  console.log(`Total elapsed: ${Date.now() - t0}ms`)
  console.log('')
  console.log('✓ match-tuple test 완료')
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

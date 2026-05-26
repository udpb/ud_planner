/**
 * scripts/dry-run-extract-tuple.ts — Sphere 2 ingest 검증 (Wave W W1)
 *
 * 단일 PDF 파일 → 3-tuple (Message + LogicStructure + Content) 분해 결과 출력.
 * DB 저장 X (dryRun=true).
 *
 * 사용:
 *   npx tsx scripts/dry-run-extract-tuple.ts <pdf-path> [--channel B2G|B2B|renewal] [--outcome won|lost|pending]
 *
 * 예시:
 *   npx tsx scripts/dry-run-extract-tuple.ts "C:/Users/USER/projects/archive/A.25.0023_2025 한국외국어대학교 학생창업캠프_사업 제안서(PDF)"
 *
 * 환경: GEMINI_API_KEY (필수) · ANTHROPIC_API_KEY (fallback)
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import fs from 'node:fs'
import path from 'node:path'
import { extractTextFromBuffer } from '../src/lib/ingest/file-ingester'
import { extractTuple } from '../src/lib/inference/extract-tuple'
import type { Channel, Outcome } from '../src/lib/inference/types'

// ─────────────────────────────────────────
// CLI arg parsing
// ─────────────────────────────────────────

const argv = process.argv.slice(2)
const pdfPath = argv.find((a) => !a.startsWith('--'))
if (!pdfPath) {
  console.error('Usage: npx tsx scripts/dry-run-extract-tuple.ts <pdf-path> [--channel B2G|B2B|renewal] [--outcome won|lost|pending]')
  process.exit(1)
}

function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}

const channel = arg('--channel', 'B2G') as Channel
const outcome = arg('--outcome', 'won') as Outcome

// ─────────────────────────────────────────
// 사업명 추출 (파일명에서)
// ─────────────────────────────────────────

const filename = path.basename(pdfPath)
// 예: "A.25.0023_2025 한국외국어대학교 학생창업캠프_사업 제안서(PDF)" → "A.25.0023 2025 한국외국어대학교 학생창업캠프"
const sourceProject = filename
  .replace(/_사업\s*제안서.*$/i, '')
  .replace(/_/g, ' ')
  .replace(/\.pdf$/i, '')
  .trim()

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ Sphere 2 dry-run extract-tuple')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`PDF: ${filename}`)
  console.log(`프로젝트: ${sourceProject}`)
  console.log(`채널: ${channel} · outcome: ${outcome}`)
  console.log('')

  // 1. PDF 파싱
  console.log('1️⃣  PDF 파싱 중...')
  const buf = fs.readFileSync(pdfPath)
  const t0 = Date.now()
  const parsed = await extractTextFromBuffer(buf, filename)
  console.log(`   ✓ ${parsed.text.length}자 · ${Date.now() - t0}ms · by=${parsed.by}${parsed.truncated ? ' (truncated)' : ''}`)

  if (parsed.text.length < 500) {
    console.error(`   ✗ 텍스트 너무 짧음 (< 500자) — PDF 파싱 실패 가능성`)
    process.exit(1)
  }

  // 2. 3-tuple 추출 (3 LLM 병렬 + embedding)
  console.log('')
  console.log('2️⃣  3-tuple 분해 중... (LLM 3 호출 + embedding · ~30~45초 소요)')
  const t1 = Date.now()
  const result = await extractTuple(
    {
      proposalText: parsed.text,
      sourceProject,
      outcome,
      channel,
      sourceType: 'archive',
      sourceRef: pdfPath,
    },
    { dryRun: true },
  )
  console.log(`   ✓ 완료 · ${Date.now() - t1}ms`)
  console.log('')

  // ─────────────────────────────────────────
  // 결과 출력
  // ─────────────────────────────────────────

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🅰  Message (의미 단위 핵심)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Slogan: ${result.message.slogan}`)
  console.log('')
  console.log('Key Messages:')
  result.message.keyMessages.forEach((m, i) => console.log(`  ${i + 1}. ${m}`))
  console.log('')
  console.log(`Before: ${result.message.beforeAfter.before}`)
  console.log(`After:  ${result.message.beforeAfter.after}`)
  console.log('')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🅑  Tone Patterns (반복 출력 방지)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Openings (${result.tonePatterns.openings.length}):`, result.tonePatterns.openings.slice(0, 3))
  console.log(`Transitions (${result.tonePatterns.transitions.length}):`, result.tonePatterns.transitions.slice(0, 3))
  console.log(`Avoided words (${result.tonePatterns.avoidedWords.length}):`, result.tonePatterns.avoidedWords.slice(0, 5))
  console.log(`Signature numbers (${result.tonePatterns.signatureNumbers.length}):`)
  result.tonePatterns.signatureNumbers.slice(0, 5).forEach((n) => {
    console.log(`  - ${n.value} (${n.context})`)
  })
  console.log('')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🅒  Logic Structure (섹션 간 인과 chain)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Nodes: ${result.logicGraph.nodes.length} · Edges: ${result.logicGraph.edges.length}`)
  console.log(`Section order: ${result.logicGraph.sectionOrder.join(' → ')}`)
  console.log('')
  console.log('First 6 nodes:')
  result.logicGraph.nodes.slice(0, 6).forEach((n) => {
    console.log(`  [${n.type}] ${n.label}`)
  })
  console.log('')
  console.log('First 6 edges:')
  result.logicGraph.edges.slice(0, 6).forEach((e) => {
    console.log(`  ${e.from} --[${e.relation}]--> ${e.to}`)
  })
  console.log('')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🅓  Content Chunks (MMR 다양성 + 의미 단위)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Total chunks: ${result.contentChunks.length}`)
  console.log('')
  result.contentChunks.slice(0, 5).forEach((c, i) => {
    console.log(`[${i}] section=${c.sectionHint ?? '?'} category=${c.category} · evidence=${c.evidenceType} · tier=${c.sourceTier ?? '?'}`)
    console.log(`     ${c.text.slice(0, 140).replace(/\s+/g, ' ')}...`)
    if (c.keyNumbers.length > 0) {
      console.log(`     수치 ${c.keyNumbers.length}개: ${c.keyNumbers.slice(0, 3).map((k) => k.value).join(' · ')}`)
    }
    console.log('')
  })

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Meta')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Confidence: ${result.confidence.toFixed(2)}`)
  console.log(`Total tokens (raw bytes): ${result.totalTokensUsed}`)
  console.log(`Expected cost: $${result.costUsd}`)
  console.log(`Message vector dim: ${result.messageVector.length}`)
  console.log(`Logic graph vector dim: ${result.logicGraphVector.length}`)
  console.log('')
  console.log('✓ dry-run 완료 — DB 저장 X (dryRun=true)')
  console.log('  실제 저장하려면: extractTuple({...}, { dryRun: false })')
}

main()
  .catch((e) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('✗ FAIL')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error(e instanceof Error ? e.stack : String(e))
    process.exit(1)
  })
  .finally(() => {
    // tsx 에서 process 종료 보장
    setTimeout(() => process.exit(0), 100)
  })

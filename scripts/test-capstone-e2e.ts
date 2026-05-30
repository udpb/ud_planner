/**
 * 캡스톤 E2E — RFP → produceUltimateDraft(실 LLM, in-process) → buildPptx → 검증.
 * HTTP 라우트 300s 한계 우회 (in-process, websearch 포함 전체 파이프).
 * 실행: NODE_OPTIONS=--conditions=react-server npx tsx scripts/test-capstone-e2e.ts
 */
import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

import * as fs from 'node:fs'

async function main() {
  const { produceUltimateDraft } = await import('../src/lib/express/produce-ultimate-draft')
  const { buildPptx } = await import('../src/lib/diagrams/pptx-builder')
  const input = JSON.parse(fs.readFileSync('scripts/fixtures/capstone-rfp.json', 'utf-8'))

  console.log('▶ 캡스톤 E2E — RFP → produceUltimateDraft → .pptx')
  console.log(`  RFP: ${input.rfp.projectName} (${input.channel})`)
  const t0 = Date.now()
  const { draft, metrics, inspection } = await produceUltimateDraft({
    rfp: input.rfp,
    channel: input.channel,
    slotInputs: input.slotInputs ?? [],
    pmInputs: input.pmInputs ?? null,
    onProgress: (step: string, detail: string) => console.log(`    · [${step}] ${detail}`),
  })
  console.log(`  파이프 완료: ${((Date.now() - t0) / 1000).toFixed(0)}s`)

  fs.writeFileSync('draft-capstone.tmp.json', JSON.stringify(draft, null, 2))
  const sections = draft.sections ?? {}
  const filled = Object.entries(sections).filter(([, v]: any) => v && v.length >= 50).map(([k]) => k)
  const specs: any[] = Array.isArray(draft.slideSpecs) ? draft.slideSpecs : []
  const patCounts: Record<string, number> = {}
  specs.forEach((s) => { const p = s?.diagram?.pattern ?? '(none)'; patCounts[p] = (patCounts[p] || 0) + 1 })

  const km: string[] = Array.isArray(draft.keyMessages) ? draft.keyMessages : []
  const mh: any[] = Array.isArray((draft as any).messageHierarchy) ? (draft as any).messageHierarchy : []
  console.log(`\n[draft]`)
  console.log(`  섹션 채움: ${filled.length}/7 (${filled.join(',')})`)
  console.log(`  keyMessages: ${km.length}개 ${km.length ? '→ ' + km.map((m) => `"${m}"`).join(' · ') : '(empty!)'}`)
  console.log(`  messageHierarchy: ${mh.length}개`)
  console.log(`  slideSpec: ${specs.length} · 패턴: ${JSON.stringify(patCounts)}`)
  console.log(`  Inspector: ${inspection ? `${inspection.overallScore} (passed=${inspection.passed})` : '(없음)'}`)

  // 자산ID/cuid 누출 (P1 회귀)
  const joined = JSON.stringify({ sections, specs })
  const cuid = (joined.match(/c[a-z0-9]{24,}/gi) || []).length
  const citeMark = (joined.match(/\[자산\s*인용/g) || []).length

  const buf = await buildPptx({
    projectName: input.rfp.projectName,
    clientName: input.rfp.client,
    intent: draft.intent,
    sections: sections as any,
    slideSpecs: specs as any,
  })
  fs.writeFileSync('out-capstone.tmp.pptx', buf)

  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buf)
  const slideN = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length

  console.log(`\n[.pptx]`)
  console.log(`  ${(buf.length / 1024).toFixed(1)} KB · ${slideN} 슬라이드`)
  console.log(`  자산ID(cuid) 누출: ${cuid === 0 ? '✓ 0' : '⚠ ' + cuid} · 인용마커: ${citeMark === 0 ? '✓ 0' : '⚠ ' + citeMark}`)

  const pass = filled.length >= 6 && specs.length >= 7 && slideN >= 10 && cuid === 0 && citeMark === 0
  console.log(`\n${pass ? '✅ 캡스톤 PASS — fresh RFP → 풍부 draft → 도식 .pptx · 자산ID 0' : '❌ 캡스톤 FAIL'}`)
  process.exitCode = pass ? 0 : 1
}
main().catch((e) => { console.error('FATAL:', e?.stack || e); process.exitCode = 1 })

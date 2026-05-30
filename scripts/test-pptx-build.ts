/**
 * M3 검증 — buildPptx 로 실제 .pptx 생성 + 구조 검증.
 *
 * 실 생성 draft (generated-draft.json) → out.tmp.pptx 생성 후:
 *   1. ZIP 유효성 (JSZip re-load)
 *   2. 필수 OOXML 파트 존재 (presentation.xml, slides, master, theme)
 *   3. 슬라이드 수 = 표지+INDEX+섹션divider+spec+마무리
 *   4. Action Orange · NanumHuman 적용 확인
 *
 * node 파일읽기는 require('./상대경로').
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

async function main() {
  // server-only 가드 우회 — pptx-builder 는 server-only 아님 (JSZip 만 사용)
  const { buildPptx } = await import('../src/lib/diagrams/pptx-builder')
  const draftPath = path.join(
    process.cwd(),
    'src/app/(dashboard)/slide-preview-test/real/generated-draft.json',
  )
  const draft = JSON.parse(fs.readFileSync(draftPath, 'utf-8'))

  console.log('▶ M3 — buildPptx 검증')
  console.log(`  draft: ${Object.keys(draft.sections || {}).length} 섹션, ${(draft.slideSpecs || []).length} slideSpec`)

  const buf = await buildPptx({
    projectName: '2025 창업중심대학 Go to Market(GTM) 프로그램',
    clientName: '성균관대학교 창업지원단',
    intent: draft.intent,
    sections: draft.sections,
    slideSpecs: draft.slideSpecs,
  })

  const outPath = path.join(process.cwd(), 'out.tmp.pptx')
  fs.writeFileSync(outPath, buf)
  console.log(`  생성: ${(buf.length / 1024).toFixed(1)} KB → ${outPath}`)

  // 1. ZIP 재로드 검증
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buf)
  const names = Object.keys(zip.files)

  // 2. 필수 파트
  const required = [
    '[Content_Types].xml',
    '_rels/.rels',
    'ppt/presentation.xml',
    'ppt/_rels/presentation.xml.rels',
    'ppt/slideMasters/slideMaster1.xml',
    'ppt/slideLayouts/slideLayout1.xml',
    'ppt/theme/theme1.xml',
    'ppt/slides/slide1.xml',
  ]
  const missing = required.filter((r) => !names.includes(r))

  // 3. 슬라이드 수
  const slideCount = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length

  // 4. 디자인 시스템 확인 (slide1 + 임의 spec slide)
  const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('text')
  const allSlides = await Promise.all(
    names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async('text')),
  )
  const joined = allSlides.join('')
  const hasAccent = joined.includes('F05519')
  const hasNanum = joined.includes('NanumHuman')
  const hasPoppins = joined.includes('Poppins')
  // 자산 ID 누출 확인 (P1 회귀)
  const cuidLeak = (joined.match(/c[a-z0-9]{24,}/gi) || []).length

  console.log(`\n[검증]`)
  console.log(`  필수 파트 누락: ${missing.length === 0 ? '✓ 0' : '✗ ' + missing.join(', ')}`)
  console.log(`  슬라이드 수: ${slideCount} (표지+INDEX+섹션×(divider+spec)+마무리)`)
  console.log(`  Action Orange(F05519): ${hasAccent ? '✓' : '✗'}`)
  console.log(`  NanumHuman: ${hasNanum ? '✓' : '✗'}`)
  console.log(`  Poppins: ${hasPoppins ? '✓' : '✗'}`)
  console.log(`  자산ID(cuid) 누출: ${cuidLeak === 0 ? '✓ 0' : '⚠ ' + cuidLeak}`)
  console.log(`  slide1 valid XML: ${slide1.startsWith('<?xml') ? '✓' : '✗'}`)

  const pass = missing.length === 0 && slideCount >= 5 && hasAccent && hasNanum && cuidLeak === 0
  console.log(`\n${pass ? '✅ M3 PASS' : '❌ M3 FAIL'}`)
  process.exit(pass ? 0 : 1)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})

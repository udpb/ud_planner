/**
 * EX-3 (ADR-024) — 결정론적 슬라이드 렌더 검증 하니스
 *
 * 실행: npx tsx scripts/_render-fixture.ts
 *
 * DB·LLM 없이 docs/samples/fixtures/slidespecs-B2G.json 을 buildPptx 로 .pptx 빌드 →
 * pptx-extractor 로 재파싱해 슬라이드별 측정 (도형 수·텍스트 블록 수·dead-space 비율) 출력.
 *
 * 합격선 (브리프 §5):
 *   - 본문 슬라이드 평균 텍스트 블록 ≥ 9 (목표 12)
 *   - 6 layout 모두 1회 이상 렌더
 *   - dead-space 평균 < 25%
 *   - 생성된 .pptx 가 유효 OOXML (JSZip 로드 성공)
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import JSZip from 'jszip'
import { buildPptx, type BuildPptxInput, type PptxSlideSpec, type SlideLayoutName } from '../src/lib/diagrams/pptx-builder'
import { extractPptxSlides, reconstructSlide, SLIDE_H_EMU } from '../src/lib/diagrams/pptx-extractor'

const FIXTURE = path.join(process.cwd(), 'docs', 'samples', 'fixtures', 'slidespecs-B2G.json')
// 출력은 OS temp 로 — 레포에 산출물 잔재 남기지 않음 (런타임 의존 X, 검증 1회성)
const OUT = path.join(os.tmpdir(), 'ud-render-fixture-out.pptx')

// 본문 컨텐츠 영역 하단 (px). pptx-builder CONTENT_BOTTOM 와 동일 기준.
const CONTENT_BOTTOM_PX = 636
const SLIDE_H_PX = 720 // 6858000 EMU / 9525
// dead-space = 컨텐츠 영역(250~636) 중 마지막 컨텐츠 도형 아래 빈 비율
const CONTENT_TOP_PX = 250

interface Row {
  slide: number
  shapes: number
  textBlocks: number
  deadPct: number
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf-8'))
  const slideSpecs: PptxSlideSpec[] = raw.slideSpecs
  const layouts = new Set<SlideLayoutName>()
  for (const s of slideSpecs) if (s.layout) layouts.add(s.layout)

  const input: BuildPptxInput = {
    projectName: raw.projectName,
    clientName: raw.clientName,
    intent: raw.intent,
    sections: raw.sections,
    slideSpecs,
  }

  // 1. 빌드
  const buf = await buildPptx(input)
  fs.writeFileSync(OUT, buf)
  console.log(`\n.pptx written: ${OUT} (${(buf.length / 1024).toFixed(1)} KB)`)

  // 2. 유효 OOXML 확인 (JSZip 로드 + 필수 파트)
  const zip = await JSZip.loadAsync(buf)
  const hasPres = !!zip.file('ppt/presentation.xml')
  const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
  if (!hasPres || slideFiles.length === 0) throw new Error('invalid OOXML: missing presentation/slides')
  console.log(`OOXML valid: presentation.xml + ${slideFiles.length} slide parts`)

  // 3. 재파싱 측정
  const extracted = await extractPptxSlides(buf)

  // 본문(spec) 슬라이드 식별 — 표지/INDEX/divider/마무리 제외.
  //  divider/표지/마무리는 도형 수가 적고 텍스트 블록 위주. spec 슬라이드는 도식 rect 多.
  //  구조 의존 대신: slideSpecs 순서를 시퀀스에 매핑.
  //  시퀀스 = [표지, INDEX, (섹션마다: divider + specSlides...), 마무리]
  //  → spec 슬라이드 번호를 시퀀스 재현으로 계산.
  const sectionOrder = ['1', '2', '3', '4', '5', '6', '7'] as const
  const bySection = new Map<string, PptxSlideSpec[]>()
  for (const s of slideSpecs) {
    const n = s.sectionNum ?? ''
    if (!bySection.has(n)) bySection.set(n, [])
    bySection.get(n)!.push(s)
  }
  const specSlideNumbers = new Set<number>()
  let pageIdx = 2 // 1=표지, 2=INDEX
  for (const n of sectionOrder) {
    if (!input.sections?.[n]) continue
    pageIdx++ // divider
    const specs = (bySection.get(n) ?? [])
    for (let i = 0; i < specs.length; i++) {
      pageIdx++
      specSlideNumbers.add(pageIdx)
    }
  }

  const rows: Row[] = []
  for (const slide of extracted) {
    if (!specSlideNumbers.has(slide.slideNumber)) continue
    const recon = reconstructSlide(slide)
    // dead-space — 컨텐츠 영역 안에서 가장 아래 도형의 bottom 기준
    let maxBottomPx = CONTENT_TOP_PX
    for (const sh of slide.shapes) {
      const bottomEmu = (sh.position.y + sh.position.h) * SLIDE_H_EMU
      const bottomPx = bottomEmu / 9525
      // footer(648 이하) 는 컨텐츠 아님 → 제외
      if (bottomPx <= CONTENT_BOTTOM_PX + 4 && bottomPx > maxBottomPx) maxBottomPx = bottomPx
    }
    const usedH = maxBottomPx - CONTENT_TOP_PX
    const totalH = CONTENT_BOTTOM_PX - CONTENT_TOP_PX
    const deadPct = Math.max(0, Math.round((1 - usedH / totalH) * 1000) / 10)
    rows.push({
      slide: slide.slideNumber,
      shapes: recon.shapeStats.total,
      textBlocks: recon.shapeStats.withText,
      deadPct,
    })
  }

  // 4. 출력
  console.log('\n┌─────────┬────────┬─────────────┬────────────┐')
  console.log('│ slide   │ shapes │ text blocks │ dead-space │')
  console.log('├─────────┼────────┼─────────────┼────────────┤')
  for (const r of rows) {
    console.log(
      `│ ${String(r.slide).padEnd(7)} │ ${String(r.shapes).padStart(6)} │ ${String(r.textBlocks).padStart(11)} │ ${(r.deadPct + '%').padStart(10)} │`,
    )
  }
  console.log('└─────────┴────────┴─────────────┴────────────┘')

  const avgBlocks = rows.reduce((a, r) => a + r.textBlocks, 0) / rows.length
  const avgDead = rows.reduce((a, r) => a + r.deadPct, 0) / rows.length
  console.log(`\nbody slides            : ${rows.length}`)
  console.log(`avg text blocks/slide  : ${avgBlocks.toFixed(1)}  (pass ≥ 9, target 12)`)
  console.log(`avg dead-space         : ${avgDead.toFixed(1)}%  (pass < 25%)`)
  console.log(`layouts rendered       : ${[...layouts].sort().join(', ')} (${layouts.size}/6)`)

  // 5. 합격 판정
  const fails: string[] = []
  if (avgBlocks < 9) fails.push(`avg text blocks ${avgBlocks.toFixed(1)} < 9`)
  if (avgDead >= 25) fails.push(`avg dead-space ${avgDead.toFixed(1)}% ≥ 25%`)
  if (layouts.size < 6) fails.push(`only ${layouts.size}/6 layouts (${[...layouts].join(',')})`)
  const ALL_LAYOUTS: SlideLayoutName[] = ['hero-stat', 'split-visual', 'full-diagram', 'detail-grid', 'comparison', 'narrative']
  const missing = ALL_LAYOUTS.filter((l) => !layouts.has(l))
  if (missing.length) fails.push(`missing layouts: ${missing.join(', ')}`)

  console.log('')
  if (fails.length === 0) {
    console.log('✅ PASS — all acceptance bars met.')
  } else {
    console.log('❌ FAIL:')
    for (const f of fails) console.log(`   - ${f}`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * N1 Verification — PPTX 도형 추출기 검증.
 *
 * 템플릿 .pptx 로 도형·이미지·텍스트 박스 좌표 + 색상 정확히 파싱되는지 확인.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
async function main() {
  const pptxPath =
    process.argv[2] ||
    path.join(process.cwd(), 'design-kit/templates/underdogs-proposal-template-v01-16-9.pptx')
  if (!fs.existsSync(pptxPath)) {
    console.error('파일 없음:', pptxPath)
    process.exit(1)
  }
  const buffer = fs.readFileSync(pptxPath)
  const { extractPptxSlides, summarizeSlide } = await import(
    '../src/lib/diagrams/pptx-extractor'
  )
  console.log(`▶ 추출 시작 — ${pptxPath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`)
  const slides = await extractPptxSlides(buffer)
  console.log(`\n총 ${slides.length} 슬라이드 추출\n`)

  // 슬라이드 별 요약
  for (const s of slides.slice(0, 8)) {
    console.log(summarizeSlide(s))
    console.log()
  }

  // 통계
  const totalShapes = slides.reduce((sum, s) => sum + s.shapes.length, 0)
  const shapeTypes = new Map<string, number>()
  const geomPresets = new Map<string, number>()
  const colors = new Map<string, number>()
  for (const slide of slides) {
    for (const sh of slide.shapes) {
      shapeTypes.set(sh.type, (shapeTypes.get(sh.type) ?? 0) + 1)
      if (sh.geomPreset) geomPresets.set(sh.geomPreset, (geomPresets.get(sh.geomPreset) ?? 0) + 1)
      if (sh.fillColor) colors.set(sh.fillColor, (colors.get(sh.fillColor) ?? 0) + 1)
    }
  }
  console.log(`[총계 — ${totalShapes} 도형]`)
  console.log(`  type:`, Object.fromEntries(shapeTypes))
  console.log(`  geomPreset 상위:`, Array.from(geomPresets.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10))
  console.log(`  fillColor 상위:`, Array.from(colors.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10))
}
main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})

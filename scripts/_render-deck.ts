/**
 * DECK-1·2 (ADR-025) — 결정론적 HTML→PDF 슬라이드 렌더 + 밀도 검증 하니스
 *
 * 실행: npx tsx scripts/_render-deck.ts
 *
 * DB·LLM 없이 docs/samples/fixtures/deck-v3.tsx 의 리치 덱을 renderToStaticMarkup →
 * 자체완결 HTML → playwright chromium →
 *   - docs/samples/sample-deck-v3.pdf      (고해상 PDF)
 *   - docs/samples/sample-deck-v3-p1.png   (1페이지 스냅샷, 하위호환)
 *   - docs/samples/snaps/p{n}.png          (전 페이지 PNG — 육안 검증)
 * + 슬라이드별 밀도 측정표 (정보 블록 수 · 근거 밴드 · dead-space).
 *
 * 합격선 (DECK-2 브리프 §5):
 *   - 본문 슬라이드(표지 제외) 평균 정보 블록 ≥ 11 (목표 12)
 *   - 본문 슬라이드 평균 dead-space < 15% (목표 12%)
 *   - 모든 본문 슬라이드에 근거 밴드 존재
 *   - 유효 PDF · PDF 페이지 = 슬라이드 수 · 16:9 · 한글 · 폰트 임베드
 *   - 리치 어휘 ≥ 3종 (아이콘/이미지/로고)
 *
 * ⚠️ 긴 백그라운드 프로세스 금지 — 1회 렌더 후 종료.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildDeckV3 } from '../docs/samples/fixtures/deck-v3'
import { renderDeckToPdf } from '../src/lib/deck/render-html'

const OUT_PDF = path.join(process.cwd(), 'docs', 'samples', 'sample-deck-v3.pdf')
const OUT_PNG = path.join(process.cwd(), 'docs', 'samples', 'sample-deck-v3-p1.png')
const SNAP_DIR = path.join(process.cwd(), 'docs', 'samples', 'snaps')

/** PDF 페이지 수 — /Type /Page 오브젝트 카운트 (Pages 노드 제외) */
function countPdfPages(buf: Buffer): number {
  const s = buf.toString('latin1')
  const matches = s.match(/\/Type\s*\/Page(?![sa-zA-Z])/g)
  return matches ? matches.length : 0
}

/** PDF MediaBox 추출 → 첫 페이지 치수(pt) */
function firstMediaBox(buf: Buffer): [number, number] | null {
  const s = buf.toString('latin1')
  const m = s.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/)
  if (!m) return null
  return [parseFloat(m[3]) - parseFloat(m[1]), parseFloat(m[4]) - parseFloat(m[2])]
}

async function main() {
  const slides = buildDeckV3()
  console.log(`\nslides authored: ${slides.length}`)

  const { pages, bytes, html, metrics } = await renderDeckToPdf(slides, OUT_PDF, {
    snapshotPath: OUT_PNG,
    snapshotDir: SNAP_DIR,
    collectMetrics: true,
  })
  console.log(`PDF written: ${OUT_PDF} (${(bytes / 1024).toFixed(1)} KB)`)
  console.log(`PNG snapshots: ${SNAP_DIR}\\p1..p${pages}.png`)

  const buf = fs.readFileSync(OUT_PDF)

  // 1. 유효 PDF
  const isPdf = buf.subarray(0, 5).toString('latin1') === '%PDF-'
  const pdfPages = countPdfPages(buf)
  const box = firstMediaBox(buf)
  const ratio = box ? box[0] / box[1] : 0

  // 2. 한글 임베드 신호
  const hasKoreanInHtml = /[가-힣]/.test(html)
  const fontEmbedded = /@font-face\{font-family:'NanumHuman'.*base64,/s.test(html)

  // 3. 리치 어휘 등장
  const iconCount = (html.match(/<svg/g) || []).length
  const imgCount = (html.match(/<img/g) || []).length
  const logoUsed = /underdogs-(wordmark|symbol)/.test(html)
  const richTypes = [iconCount > 0 && 'icons(svg)', imgCount > 0 && 'images/photos', logoUsed && 'logos'].filter(Boolean)

  // ── 슬라이드별 밀도 측정표 (DECK-2) ──
  console.log('\n슬라이드별 밀도 측정 (블록 수 · 근거 밴드 · dead-space)')
  console.log('┌──────┬────────┬────────┬─────────────┬────────────┐')
  console.log('│ 슬라이드 │ 블록 수 │ 근거밴드 │ dead-space  │ 분류        │')
  console.log('├──────┼────────┼────────┼─────────────┼────────────┤')
  for (const m of metrics) {
    const kind = m.isCover ? '표지/비본문' : '본문'
    const ds = `${(m.deadSpace * 100).toFixed(1)}%`
    console.log(
      `│ p${String(m.index).padEnd(3)} │ ${String(m.blocks).padStart(5)}  │ ${(m.hasEvidenceBand ? '있음' : '—').padEnd(5)}  │ ${ds.padStart(9)}   │ ${kind.padEnd(9)}  │`,
    )
  }
  console.log('└──────┴────────┴────────┴─────────────┴────────────┘')

  const body = metrics.filter((m) => !m.isCover)
  const avgBlocks = body.length ? body.reduce((a, m) => a + m.blocks, 0) / body.length : 0
  const avgDead = body.length ? body.reduce((a, m) => a + m.deadSpace, 0) / body.length : 0
  const allHaveEvidence = body.every((m) => m.hasEvidenceBand)

  console.log('\n┌──────────────────────────────┬──────────────────┐')
  const row = (k: string, v: string) => console.log(`│ ${k.padEnd(28)} │ ${v.padEnd(16)} │`)
  row('valid PDF (%PDF- header)', String(isPdf))
  row('PDF pages', `${pdfPages} (slides ${pages})`)
  row('first MediaBox (pt)', box ? `${box[0]}×${box[1]}` : 'n/a')
  row('aspect ratio', ratio ? `${ratio.toFixed(3)} (16:9=1.778)` : 'n/a')
  row('Korean in markup', String(hasKoreanInHtml))
  row('font embedded (data URI)', String(fontEmbedded))
  row('rich vocab types', richTypes.join(', '))
  row('body slides', String(body.length))
  row('avg info blocks/body', avgBlocks.toFixed(2))
  row('avg dead-space/body', `${(avgDead * 100).toFixed(1)}%`)
  row('all body have evidence', String(allHaveEvidence))
  console.log('└──────────────────────────────┴──────────────────┘')

  const fails: string[] = []
  if (!isPdf) fails.push('PDF 헤더 없음')
  if (pdfPages !== pages) fails.push(`PDF 페이지 ${pdfPages} ≠ 슬라이드 ${pages}`)
  if (!box || Math.abs(ratio - 16 / 9) > 0.02) fails.push(`16:9 아님 (ratio ${ratio.toFixed(3)})`)
  if (!hasKoreanInHtml) fails.push('한글 마크업 없음')
  if (!fontEmbedded) fails.push('폰트 data URI 임베드 안 됨')
  if (richTypes.length < 3) fails.push(`리치 어휘 ${richTypes.length}종 < 3`)
  // DECK-2 밀도 합격선
  if (avgBlocks < 11) fails.push(`본문 평균 블록 ${avgBlocks.toFixed(2)} < 11`)
  if (avgDead >= 0.15) fails.push(`본문 평균 dead-space ${(avgDead * 100).toFixed(1)}% ≥ 15%`)
  if (!allHaveEvidence) fails.push('근거 밴드 없는 본문 슬라이드 존재')

  console.log('')
  if (fails.length === 0) {
    console.log('✅ PASS — 모든 합격선 충족 (기질 + 당선 밀도).')
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

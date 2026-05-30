/**
 * P2 검증 — 8 도식화 패턴 전부 .pptx 네이티브 렌더 확인.
 * 4 신규(before-after·timeline·matrix-2x2·hierarchy-tree)가 텍스트 폴백이 아니라
 * 다수 도형(rect+textBox)으로 렌더되는지 검증.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

async function main() {
  const { buildPptx } = await import('../src/lib/diagrams/pptx-builder')
  const mk = (sectionNum: string, order: number, pattern: string, data: any) => ({
    kicker: pattern, headline: `${pattern} 테스트 슬라이드`, caption: 'caption',
    diagram: { pattern, data }, evidence: [{ text: '근거', source: '출처 2025.01' }],
    sectionNum, order,
  })
  const slideSpecs = [
    mk('1', 0, 'before-after', { before: { label: '기술 우위, 시장 부재', metrics: ['첫 매출 12%'] }, after: { label: '시장 견인 검증', metrics: ['MVP 80%+', 'LOI 5건'] } }),
    mk('2', 0, 'matrix-2x2', { axisX: { label: '시장 견인력' }, axisY: { label: '기술 우위' }, quadrants: [
      { q: 'TR', label: '시장 견인 검증', description: '본 사업 목표', highlight: true },
      { q: 'TL', label: '기술 과잉', description: '시장 부재' },
      { q: 'BR', label: '레드오션', description: '경쟁 심화' },
      { q: 'BL', label: '초기 탐색', description: '검증 필요' } ] }),
    mk('3', 0, 'timeline', { units: ['M1','M2','M3','M4','M5','M6'], tracks: [
      { name: '교육', bars: [{ startIdx: 0, endIdx: 1, label: 'IMPACT' }, { startIdx: 2, endIdx: 3, label: 'GTM' }] },
      { name: '코칭', bars: [{ startIdx: 1, endIdx: 4, label: '1:1 코칭' }] },
      { name: '검증', bars: [{ startIdx: 4, endIdx: 5, label: 'LOI 확보' }] } ] }),
    mk('4', 0, 'hierarchy-tree', { root: { label: '운영 PMO', sublabel: '전담' }, children: [
      { label: 'Lead 코치', sublabel: '前 카카오', children: [{ label: '주 코칭' }] },
      { label: 'Domain 코치', sublabel: '딥테크' },
      { label: 'Global 코치', sublabel: '해외 진출' } ] }),
  ]
  const sections = { '1': '배경 '.repeat(20), '2': '전략 '.repeat(20), '3': '커리큘럼 '.repeat(20), '4': '운영 '.repeat(20) }
  const buf = await buildPptx({ projectName: 'P2 패턴 테스트', clientName: '테스트 발주처', intent: '테스트', sections, slideSpecs })

  const outPath = path.join(process.cwd(), 'out-patterns.tmp.pptx')
  fs.writeFileSync(outPath, buf)
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buf)
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))

  // spec 슬라이드(헤드라인에 패턴명)별 도형 수 — rect/textBox 갯수로 네이티브 여부 판정
  console.log('▶ P2 — 8 패턴 .pptx 네이티브 렌더 검증')
  console.log(`  생성: ${(buf.length / 1024).toFixed(1)} KB · 슬라이드 ${names.length}`)
  let allNative = true
  for (const pat of ['before-after', 'matrix-2x2', 'timeline', 'hierarchy-tree']) {
    let found = false, rects = 0, tbs = 0
    for (const n of names) {
      const xml = await zip.file(n)!.async('text')
      if (xml.includes(`${pat} 테스트 슬라이드`)) {
        found = true
        rects = (xml.match(/name="rect\d+"/g) || []).length
        tbs = (xml.match(/txBox="1"/g) || []).length
        break
      }
    }
    // 네이티브면 rect(도형 면) 여러개. 텍스트 폴백이면 rect=1(헤더 라인) + tb 다수지만 도형 rect 거의 없음.
    const native = found && rects >= 3
    if (!native) allNative = false
    console.log(`  ${pat}: ${found ? `rect ${rects} · txBox ${tbs} → ${native ? '✓ 네이티브 도형' : '✗ 폴백 의심'}` : '✗ 슬라이드 없음'}`)
  }
  fs.rmSync(outPath, { force: true })
  console.log(`\n${allNative ? '✅ P2 PASS — 4 신규 패턴 전부 네이티브 도형 렌더' : '❌ P2 FAIL'}`)
  process.exitCode = allNative ? 0 : 1
}
main().catch((e) => { console.error('FATAL:', e); process.exitCode = 1 })

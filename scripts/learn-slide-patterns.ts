/**
 * N2 — 실제 당선 PPT 슬라이드 메시지 구조 학습.
 *
 * 흐름:
 *   1. design-kit/diagram-samples/*.json (pptx) 로드
 *   2. 콘텐츠 풍부한 슬라이드 재구성 (reconstructSlide) — 텍스트 5+ blocks
 *   3. 대표 슬라이드 N개 샘플링 (파일당 1-2, 총 ~50)
 *   4. LLM 으로 슬라이드 청사진 분석:
 *      { sectionGuess, diagramPattern, headlineStyle, evidenceCount, messageStructure }
 *   5. 집계 → design-kit/learned-slide-patterns.json (커밋, 작은 파일)
 *      · 섹션별 자주 쓰는 도식화 패턴
 *      · 헤드라인 작성 스타일 예시
 *      · 평균 메시지 밀도 (blocks / numeric ratio)
 *
 * 결과는 produce-slide-specs prompt 에 역주입 → "기존 제안서 수준" 의 밀도·구조 학습.
 *
 * 사용:
 *   npx tsx scripts/learn-slide-patterns.ts            # dry-run 10 슬라이드
 *   npx tsx scripts/learn-slide-patterns.ts --apply --sample 60
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
for (const file of ['.env', '.env.local']) {
  const envPath = path.join(process.cwd(), file)
  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    process.env[k] = v
  }
}

const SAMPLE_DIR = path.join(process.cwd(), 'design-kit', 'diagram-samples')
const OUT_PATH = path.join(process.cwd(), 'design-kit', 'learned-slide-patterns.json')

interface RichSlide {
  assetName: string
  slideNumber: number
  title: string | null
  blocks: { zone: string; text: string; isNumeric: boolean }[]
  geomCounts: Record<string, number>
  numericRatio: number
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const sIdx = args.indexOf('--sample')
  const sampleN = sIdx >= 0 ? parseInt(args[sIdx + 1] ?? '50', 10) : apply ? 50 : 10

  const { reconstructSlide } = await import('../src/lib/diagrams/pptx-extractor')
  const { invokeAi } = await import('../src/lib/ai-fallback')
  const { safeParseJson } = await import('../src/lib/ai/parser')
  const { AI_TOKENS } = await import('../src/lib/ai/config')

  console.log(`▶ N2 — 슬라이드 메시지 구조 학습`)
  console.log(`  mode: ${apply ? 'APPLY' : 'DRY-RUN'} · sample ${sampleN}`)
  console.log()

  // 1. PPTX 샘플 로드 + rich slide 추출
  const files = fs.readdirSync(SAMPLE_DIR).filter((f) => f.endsWith('.json'))
  const richSlides: RichSlide[] = []
  let pptxFiles = 0
  for (const f of files) {
    let data: any
    try {
      data = JSON.parse(fs.readFileSync(path.join(SAMPLE_DIR, f), 'utf-8'))
    } catch {
      continue
    }
    if (data.kind !== 'pptx' || !Array.isArray(data.slides)) continue
    pptxFiles++
    // 파일당 최대 2 rich slide
    let pickedFromFile = 0
    for (const slide of data.slides) {
      if (pickedFromFile >= 2) break
      const recon = reconstructSlide(slide)
      // rich 조건: blocks 5+ AND (도형 있거나 numeric block 2+)
      const numericBlocks = recon.blocks.filter((b) => b.isNumeric).length
      const hasGeom = Object.keys(recon.shapeStats.geomCounts).length > 0
      if (recon.blocks.length >= 5 && (hasGeom || numericBlocks >= 2)) {
        richSlides.push({
          assetName: data.name ?? data.fileName ?? f,
          slideNumber: recon.slideNumber,
          title: recon.title,
          blocks: recon.blocks,
          geomCounts: recon.shapeStats.geomCounts,
          numericRatio: recon.blocks.length > 0 ? numericBlocks / recon.blocks.length : 0,
        })
        pickedFromFile++
      }
    }
  }

  console.log(`PPTX 파일: ${pptxFiles}건 · rich slide 후보: ${richSlides.length}건`)

  // 2. 샘플링 — 다양성 확보: numeric-rich + geom-rich + text-rich 를 interleave
  //    (numericRatio 정렬만 하면 kpi-grid 류로 치우쳐 §1/4/5 커버 부족)
  const byNumeric = [...richSlides].sort((a, b) => b.numericRatio - a.numericRatio)
  const byGeom = [...richSlides].sort(
    (a, b) => Object.keys(b.geomCounts).length - Object.keys(a.geomCounts).length,
  )
  const byBlocks = [...richSlides].sort((a, b) => b.blocks.length - a.blocks.length)
  const seen = new Set<string>()
  const sampled: RichSlide[] = []
  const key = (s: RichSlide) => `${s.assetName}#${s.slideNumber}`
  let li = 0
  while (sampled.length < sampleN && li < richSlides.length) {
    for (const list of [byNumeric, byGeom, byBlocks]) {
      const s = list[li]
      if (s && !seen.has(key(s))) {
        seen.add(key(s))
        sampled.push(s)
        if (sampled.length >= sampleN) break
      }
    }
    li++
  }
  console.log(`분석 샘플: ${sampled.length}건 (다양성 interleave)\n`)

  // 3. LLM 분석 — 배치 (5 슬라이드씩)
  const analyses: any[] = []
  const BATCH = 5
  for (let i = 0; i < sampled.length; i += BATCH) {
    const batch = sampled.slice(i, i + BATCH)
    const prompt = buildAnalysisPrompt(batch)
    try {
      const r = await invokeAi({
        prompt,
        maxTokens: AI_TOKENS.LARGE,
        temperature: 0.2,
        label: `learn-slides-${i}`,
      })
      const raw = safeParseJson<any>(r.raw, `learn-${i}`)
      if (Array.isArray(raw?.analyses)) analyses.push(...raw.analyses)
      console.log(`  [${Math.min(i + BATCH, sampled.length)}/${sampled.length}] analyzed (${analyses.length} total)`)
    } catch (e) {
      console.warn(`  batch ${i} 실패:`, e instanceof Error ? e.message.slice(0, 80) : e)
    }
  }

  // 4. 집계
  const bySectionPatterns: Record<string, Record<string, number>> = {}
  const headlineExamples: string[] = []
  let totalEvidence = 0
  let totalBlocks = 0
  for (const a of analyses) {
    const sec = a.sectionGuess ?? 'unknown'
    const pat = a.diagramPattern ?? 'text-only'
    bySectionPatterns[sec] = bySectionPatterns[sec] ?? {}
    bySectionPatterns[sec][pat] = (bySectionPatterns[sec][pat] ?? 0) + 1
    if (a.headlineStyle && headlineExamples.length < 30) headlineExamples.push(a.headlineStyle)
    if (typeof a.evidenceCount === 'number') totalEvidence += a.evidenceCount
    if (typeof a.blockCount === 'number') totalBlocks += a.blockCount
  }

  const learned = {
    learnedAt: new Date().toISOString(),
    sampleSize: analyses.length,
    sourcePptxFiles: pptxFiles,
    // 섹션별 자주 쓰는 도식화 패턴 (빈도순)
    sectionPatterns: Object.fromEntries(
      Object.entries(bySectionPatterns).map(([sec, pats]) => [
        sec,
        Object.entries(pats)
          .sort((a, b) => b[1] - a[1])
          .map(([p, c]) => ({ pattern: p, count: c })),
      ]),
    ),
    // 헤드라인 작성 스타일 예시 (역주입용)
    headlineExamples,
    // 평균 메시지 밀도
    avgEvidencePerSlide: analyses.length > 0 ? Math.round((totalEvidence / analyses.length) * 10) / 10 : 0,
    avgBlocksPerSlide: analyses.length > 0 ? Math.round((totalBlocks / analyses.length) * 10) / 10 : 0,
  }

  console.log(`\n[학습 결과]`)
  console.log(`  분석 슬라이드: ${learned.sampleSize}`)
  console.log(`  섹션별 패턴:`, JSON.stringify(learned.sectionPatterns, null, 2).slice(0, 600))
  console.log(`  평균 evidence/slide: ${learned.avgEvidencePerSlide}`)
  console.log(`  평균 blocks/slide: ${learned.avgBlocksPerSlide}`)
  console.log(`  헤드라인 예시 ${learned.headlineExamples.length}건`)

  if (apply) {
    fs.writeFileSync(OUT_PATH, JSON.stringify(learned, null, 2), 'utf-8')
    console.log(`\n✅ 저장: ${OUT_PATH}`)
  } else {
    console.log(`\n✓ Dry-run. --apply 로 ${OUT_PATH} 저장`)
  }
}

function buildAnalysisPrompt(slides: RichSlide[]): string {
  const slideText = slides
    .map((s, i) => {
      const blocks = s.blocks.map((b) => `    [${b.zone}${b.isNumeric ? '·수치' : ''}] ${b.text}`).join('\n')
      const geoms = Object.entries(s.geomCounts).map(([g, c]) => `${g}×${c}`).join(', ')
      return `슬라이드 ${i} (출처: ${s.assetName.slice(0, 40)})\n  제목: ${s.title ?? '(없음)'}\n  도형: ${geoms || '없음'}\n  내용 블록:\n${blocks}`
    })
    .join('\n\n')

  return `
당신은 한국 사업 제안서 슬라이드 분석가입니다.
실제 당선 제안서의 슬라이드 ${slides.length}장을 분석해, 각 슬라이드의 메시지 구조를 분류하세요.

[분석 대상]
${slideText}

[각 슬라이드 분류 항목]
- sectionGuess: 이 슬라이드가 7 섹션 중 어디에 속할지 추정
  ('1'=제안배경/목적, '2'=추진전략/방법론, '3'=교육커리큘럼, '4'=운영체계/코치진,
   '5'=예산/경제성, '6'=기대성과/임팩트, '7'=수행역량/실적)
- diagramPattern: 가장 가까운 도식화 패턴
  (process-flow / matrix-2x2 / kpi-grid / hierarchy-tree / timeline /
   comparison-table / architecture-stack / before-after / text-only)
- headlineStyle: 이 슬라이드의 헤드라인을 한 문장으로 재작성 (어떻게 핵심을 전달하는지 — 실제 스타일 모방)
- evidenceCount: 정량 근거(수치·연도·기관) 개수
- blockCount: 의미 있는 텍스트 블록 수
- messageStructure: 메시지 전개 방식 한 단어
  (problem-solution / before-after / step-by-step / comparison / proof-stacking / hierarchy / single-thesis)

[출력 JSON]
{
  "analyses": [
    { "slideIndex": 0, "sectionGuess": "3", "diagramPattern": "process-flow",
      "headlineStyle": "6개월 24주, 단계별 시장 검증으로 데스밸리를 넘는다",
      "evidenceCount": 3, "blockCount": 8, "messageStructure": "step-by-step" }
  ]
}

JSON 만. 마크다운 펜스 X.
`.trim()
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})

/**
 * DECK-4 (ADR-025 Phase 4) — 밀도 비평 + 세로 여백 축소 검증 하니스 (결정론적, LLM·DB 없음)
 *
 * 실행: npx tsx scripts/_render-density.ts
 *
 * 두 갈래 검증:
 *   (A) 밀도 floor 단위 (렌더 없음): 손작성 sparse/dense DeckSpec 으로 slideDensityScore 가
 *       floor 미달 슬라이드를 정확히 flag 하는지 단언(코치 2명·커리큘럼 2활동 → belowFloor=true,
 *       4명·3활동 → false). composite 내부 sparse part 도 잡히는지 확인.
 *   (B) 세로 여백 축소 dead-space 측정 (렌더): deckspec-B2G.json(밀도 fixture)을
 *       deckSpecToElements → renderDeckToPdf 로 렌더해 본문 평균 dead-space 측정.
 *       DECK-4 합격선: 본문 평균 dead-space < 8% (브리프 §4). + sparse 변형을 같이 렌더해
 *       "항목이 적어도 셀이 채워지는지" 비교(before-ish 대비 채움 효과).
 *
 * ⚠️ 실 LLM densify 루프는 여기서 돌리지 않는다(쿼터·긴 run — 메인이 _smoke-deck-e2e 로 실측).
 *    이 스크립트는 (a) 결정론 밀도 측정 함수 자체와 (b) 컴포넌트 렌더 채움만 검증한다.
 * ⚠️ 긴 백그라운드 프로세스 금지 — 1회 렌더 후 종료.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { pathToFileURL } from 'node:url'
import { deckSpecToElements } from '../src/lib/deck/render-spec'
import { renderDeckToPdf, buildDeckHtml } from '../src/lib/deck/render-html'
import { slideDensityScore, parseDeckSpec, type DeckSpec, type SlideSpec } from '../src/lib/deck/spec'

const FIXTURE = path.join(process.cwd(), 'docs', 'samples', 'fixtures', 'deckspec-B2G.json')
const OUT_PDF = path.join(process.cwd(), 'docs', 'samples', 'sample-density-dense.pdf')
const SNAP_DIR = path.join(process.cwd(), 'docs', 'samples', 'snaps-density')

const DEAD_SPACE_TARGET = 0.08 // 본문 평균 dead-space < 8% (DECK-4)

const fails: string[] = []
function expect(cond: boolean, msg: string) {
  if (!cond) fails.push(msg)
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`)
}

// ─────────────────────────────────────────
// (A) 밀도 floor 단위 — slideDensityScore 정확도 (렌더 없음)
// ─────────────────────────────────────────
function coachBody(n: number): SlideSpec {
  return {
    kind: 'coachDetailGrid',
    kicker: 'COACHES',
    headline: `코치 ${n}명 배치`,
    columns: n >= 4 ? 4 : 2,
    coaches: Array.from({ length: n }, (_, i) => ({
      photo: '/design-kit/sample/coach-1.svg',
      name: `코치${i + 1}`,
      role: '리드 코치',
      affiliation: '前 액셀러레이터 파트너',
      bio: ['투자·보육 11년', 'IR 멘토링 다수', '데모데이 배출'],
      stats: [
        { value: '120팀', label: '멘토링' },
        { value: '₩340억', label: '후속 투자' },
      ],
    })),
  }
}

function curriculumBody(phaseCount: number, actsPerPhase: number): SlideSpec {
  return {
    kind: 'curriculumMatrix',
    kicker: 'CURRICULUM',
    headline: '커리큘럼',
    phases: Array.from({ length: phaseCount }, (_, i) => ({
      weeks: `W${i * 4 + 1}–${i * 4 + 4}`,
      phase: `단계${i + 1}`,
      activities: Array.from({ length: actsPerPhase }, (_, a) => `활동${a + 1}`),
      deliverable: '산출물',
    })),
  }
}

function runFloorUnit() {
  console.log('\n(A) 밀도 floor 단위 — slideDensityScore')

  // 코치: 2명 sparse → belowFloor, 4명 → 합격
  const c2 = slideDensityScore(coachBody(2))
  expect(c2.belowFloor === true && c2.itemCount === 2 && c2.floor === 4, '코치 2명 → belowFloor(floor 4)')
  expect(c2.deficiencies.some((d) => d.includes('코치')), '코치 2명 부족 사유에 "코치" 명시')
  const c4 = slideDensityScore(coachBody(4))
  expect(c4.belowFloor === false && c4.itemCount === 4, '코치 4명 → 합격')

  // 커리큘럼: 6단계×2활동 = 18 항목이지만 phase당 활동<3 → belowFloor (형태 제약)
  const curSparseActs = slideDensityScore(curriculumBody(6, 2))
  expect(curSparseActs.belowFloor === true, '커리큘럼 6단계×2활동 → belowFloor(활동/단계 부족)')
  expect(curSparseActs.deficiencies.length >= 6, '커리큘럼 활동 부족이 단계별로 사유에 누적')
  // 2단계×3활동 = 8 항목 → itemCount<12 floor 미달 + 단계<3 형태 미달
  const curFewPhases = slideDensityScore(curriculumBody(2, 3))
  expect(curFewPhases.belowFloor === true, '커리큘럼 2단계 → belowFloor(단계<3 & 항목<12)')
  // 6단계×3활동 = 24 항목 → 합격
  const curOk = slideDensityScore(curriculumBody(6, 3))
  expect(curOk.belowFloor === false && curOk.itemCount === 24, '커리큘럼 6단계×3활동 → 합격(24항목)')

  // kpi: 2개 sparse → belowFloor, 3개 합격
  const kpi2 = slideDensityScore({
    kind: 'kpiWithLogic',
    headline: 'kpi',
    kpis: [
      { value: '60팀', label: '발굴', logic: '연 2기' },
      { value: '2.4', label: 'SROI', logic: '편익/투입' },
    ],
  })
  expect(kpi2.belowFloor === true && kpi2.floor === 3, 'KPI 2개 → belowFloor(floor 3)')

  // strategyCanvas: 2 zone → belowFloor
  const zone2 = slideDensityScore({
    kind: 'strategyCanvas',
    headline: 'strategy',
    zones: [
      { icon: 'target', title: '문제정의', body: 'b', rationale: 'r' },
      { icon: 'rocket', title: '실행', body: 'b', rationale: 'r' },
    ],
  })
  expect(zone2.belowFloor === true, '전략 존 2개 → belowFloor(floor 3)')

  // composite: 내부 coach part 가 2명이면 composite 도 belowFloor
  const compSparse = slideDensityScore({
    kind: 'composite',
    parts: [coachBody(2), { kind: 'evidenceBand', items: [
      { figure: '39%', proves: 'p', source: 's' },
      { figure: '1만+', proves: 'p', source: 's' },
      { figure: '1:5', proves: 'p', source: 's' },
    ] }],
  })
  expect(compSparse.belowFloor === true, 'composite(코치 2명 part) → belowFloor 전파')

  // 비본문(cover) → 평가 제외
  const cover = slideDensityScore({ kind: 'cover', title: 'x' })
  expect(cover.isNonBody === true && cover.belowFloor === false, 'cover → isNonBody, belowFloor=false')
}

// ─────────────────────────────────────────
// (B) dead-space 측정 — 컴포넌트 세로 여백 축소 효과 (렌더)
// ─────────────────────────────────────────
/** deckspec-B2G.json 의 본문 슬라이드들을 "코치 2명·커리큘럼 2활동"으로 깎은 sparse 변형 — 채움 비교용. */
function sparsifyDeck(deck: DeckSpec): DeckSpec {
  const slides = deck.slides.map((s) => {
    const b = s.body
    if (b.kind === 'coachDetailGrid') {
      return { ...s, body: { ...b, coaches: b.coaches.slice(0, 2), columns: 2 as const } }
    }
    if (b.kind === 'curriculumMatrix') {
      return {
        ...s,
        body: { ...b, phases: b.phases.slice(0, 3).map((p) => ({ ...p, activities: p.activities.slice(0, 1) })) },
      }
    }
    return s
  })
  return { ...deck, slides }
}

async function renderAndMeasure(deck: DeckSpec, outPdf: string, snapDir: string, label: string) {
  const slides = deckSpecToElements(deck)
  const { metrics } = await renderDeckToPdf(slides, outPdf, { snapshotDir: snapDir, collectMetrics: true })

  const body = metrics.filter((m) => !m.isCover)
  const avgDead = body.length ? body.reduce((a, m) => a + m.deadSpace, 0) / body.length : 0

  console.log(`\n[${label}] 슬라이드별 dead-space`)
  for (const m of metrics) {
    const cls = m.isCover ? '비본문' : '본문'
    console.log(`  p${String(m.index).padStart(2)}  blocks=${String(m.blocks).padStart(2)}  dead=${(m.deadSpace * 100).toFixed(1)}%  ${cls}`)
  }
  console.log(`  → 본문 평균 dead-space: ${(avgDead * 100).toFixed(1)}%`)
  return avgDead
}

/**
 * 셀 내부 "최대 빈 간격" 측정 — 코치 카드/커리큘럼 셀의 *중앙 공백*을 직접 잡는다.
 * 거친 grid dead-space(28×16)·콘텐츠 span 은 카드 박스가 셀을 덮어 "반쯤 빈 카드"를 못 잡는다.
 * 사용자 불만("셀 중앙 여백이 크다")의 본질 = 콘텐츠 줄들 *사이*의 큰 간격.
 *
 * maxGapRatio = (셀 안 연속 콘텐츠 줄 사이 최대 세로 간격) / 셀 높이. 작을수록 고르게 채워짐.
 * 세로 여백 축소(space-between/flex distribute)가 중앙 큰 간격을 잘게 분산했는지 before/after 로 보인다.
 */
async function measureCellFill(deck: DeckSpec): Promise<{ coach: number; curriculum: number }> {
  const html = buildDeckHtml(deckSpecToElements(deck))
  const htmlPath = path.join(os.tmpdir(), `ud-density-${Date.now()}.html`)
  fs.writeFileSync(htmlPath, html, 'utf-8')
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts?.ready)
    // 주의: tsx/esbuild 가 named 중첩 함수에 __name 헬퍼를 주입 → 브라우저 컨텍스트에서 ReferenceError.
    // 따라서 page.evaluate 인자로 selector 를 넘기고 본문은 단일 화살표(중첩 선언 없음)로 유지한다.
    const measureOne = (selector: string) =>
      page.evaluate((sel) => {
        const cells = Array.from(document.querySelectorAll(sel)) as HTMLElement[]
        if (!cells.length) return 0
        let total = 0
        for (const cell of cells) {
          const cellRect = cell.getBoundingClientRect()
          if (cellRect.height <= 0) continue
          // 셀 안 leaf 콘텐츠 줄들의 [top,bottom] 구간을 모아 정렬 → 연속 줄 사이 최대 빈 간격을 잡는다.
          const spans: Array<[number, number]> = []
          const leaves = cell.querySelectorAll('*')
          for (let i = 0; i < leaves.length; i++) {
            const el = leaves[i] as HTMLElement
            const isLeaf = el.children.length === 0 && (el.textContent || '').trim().length > 0
            const isMedia = el.tagName === 'IMG' || el.tagName === 'svg'
            if (!isLeaf && !isMedia) continue
            const r = el.getBoundingClientRect()
            if (r.height <= 0) continue
            spans.push([r.top - cellRect.top, r.bottom - cellRect.top])
          }
          if (spans.length < 2) continue
          spans.sort((a, b) => a[0] - b[0])
          // 누적 커버 끝을 추적하며 다음 줄 시작과의 간격(겹치면 0) 중 최대치 = 중앙 큰 공백.
          let maxGap = 0
          let coveredTo = spans[0][1]
          for (let i = 1; i < spans.length; i++) {
            const gap = spans[i][0] - coveredTo
            if (gap > maxGap) maxGap = gap
            if (spans[i][1] > coveredTo) coveredTo = spans[i][1]
          }
          total += maxGap / cellRect.height
        }
        return total / cells.length
      }, selector)
    return { coach: await measureOne('[data-block="coach-card"]'), curriculum: await measureOne('[data-block="curriculum-phase"]') }
  } finally {
    await browser.close()
    try {
      fs.unlinkSync(htmlPath)
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  runFloorUnit()

  // (B) 렌더 — dense fixture(현행 컴포넌트, 세로 여백 축소 적용 후)
  console.log('\n(B) dead-space 측정 — 컴포넌트 세로 채움 (렌더)')
  const denseDeck = parseDeckSpec(JSON.parse(fs.readFileSync(FIXTURE, 'utf-8')))
  const sparseDeck = sparsifyDeck(denseDeck)

  const denseAvg = await renderAndMeasure(denseDeck, OUT_PDF, SNAP_DIR, 'DENSE (deckspec-B2G)')
  const sparseAvg = await renderAndMeasure(
    sparseDeck,
    path.join(process.cwd(), 'docs', 'samples', 'sample-density-sparse.pdf'),
    path.join(process.cwd(), 'docs', 'samples', 'snaps-density-sparse'),
    'SPARSE 변형 (코치 2명·커리큘럼 1활동)',
  )

  // 셀 내부 최대 빈 간격 — 세로 여백 축소 효과(카드 *중앙* 공백)를 직접 측정. 작을수록 좋다.
  console.log('\n셀 내부 최대 빈 간격 (연속 콘텐츠 줄 사이 최대 세로 공백 / 셀 높이 — 작을수록 고르게 참)')
  const denseFill = await measureCellFill(denseDeck)
  const sparseFill = await measureCellFill(sparseDeck)
  console.log(`  DENSE  코치카드=${(denseFill.coach * 100).toFixed(1)}%  커리큘럼셀=${(denseFill.curriculum * 100).toFixed(1)}%`)
  console.log(`  SPARSE 코치카드=${(sparseFill.coach * 100).toFixed(1)}%  커리큘럼셀=${(sparseFill.curriculum * 100).toFixed(1)}%`)

  console.log('\n┌──────────────────────────────┬──────────────────┐')
  const row = (k: string, v: string) => console.log(`│ ${k.padEnd(28)} │ ${v.padEnd(16)} │`)
  row('dense body avg dead-space', `${(denseAvg * 100).toFixed(1)}%`)
  row('sparse body avg dead-space', `${(sparseAvg * 100).toFixed(1)}%`)
  row('dead-space target', `< ${(DEAD_SPACE_TARGET * 100).toFixed(0)}%`)
  row('dense coach max-gap', `${(denseFill.coach * 100).toFixed(1)}%`)
  row('dense curriculum max-gap', `${(denseFill.curriculum * 100).toFixed(1)}%`)
  console.log('└──────────────────────────────┴──────────────────┘')

  // dense fixture(채워진 정상 덱)는 합격선을 충족해야 한다.
  expect(denseAvg < DEAD_SPACE_TARGET, `DENSE 본문 평균 dead-space ${(denseAvg * 100).toFixed(1)}% < ${DEAD_SPACE_TARGET * 100}%`)
  // 세로 채움: 코치 카드·커리큘럼 셀 중앙에 큰 빈 간격이 없어야 한다(여백 축소 효과). 셀 높이의 25% 미만.
  expect(denseFill.coach < 0.25, `코치 카드 최대 빈 간격 ${(denseFill.coach * 100).toFixed(1)}% < 25%`)
  expect(denseFill.curriculum < 0.25, `커리큘럼 셀 최대 빈 간격 ${(denseFill.curriculum * 100).toFixed(1)}% < 25%`)

  console.log('')
  if (fails.length === 0) {
    console.log('✅ PASS — 밀도 floor 측정 정확 + 컴포넌트 세로 채움(dead-space 목표 충족).')
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

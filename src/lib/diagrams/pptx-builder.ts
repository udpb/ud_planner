/**
 * PPTX Builder — Phase M3 (2026-05-31)
 *
 * ExpressDraft → PowerPoint(.pptx) 파일 생성. PM 이 다운로드해 직접 편집.
 *
 * 접근: JSZip 으로 OOXML(PresentationML) 구조를 직접 빌드.
 *   pptx-extractor.ts(읽기) 의 역방향 — 도형 좌표를 EMU 로 환산, OOXML 태그 생성.
 *
 * 16:9 캔버스: 12,192,000 × 6,858,000 EMU (13.33 × 7.5 inch)
 * 디자인 시스템: Action Orange F05519 · NanumHuman(KR) · Poppins(EN) · 다크 #373938
 *
 * 슬라이드 시퀀스 (PpProposalSlides 와 동일 논리):
 *   1. 표지 (intent + 발주처)
 *   2. INDEX (목차)
 *   3-N. 섹션별: divider + slideSpec (도식화는 표/텍스트로 단순화)
 *   마지막. 마무리
 *
 * 한계 (정직): PPTX 네이티브 차트/SmartArt 는 복잡 → 도식화 패턴을 "표 + 텍스트박스"
 *   조합으로 표현 (PM 이 PowerPoint 에서 추가 시각화 가능한 편집 가능 상태).
 *   화면 미리보기(React)가 풀 시각, .pptx 는 "편집 시작점".
 */

import JSZip from 'jszip'

// ─────────────────────────────────────────
// 좌표·색상 상수 (16:9)
// ─────────────────────────────────────────
const SLIDE_W = 12_192_000
const SLIDE_H = 6_858_000
const EMU_PER_PX = 9525 // 1px = 9525 EMU (96 DPI)

const COLOR = {
  accent: 'F05519',
  ink: '373938',
  white: 'FFFFFF',
  paper: 'FFFFFF',
  softInk: '4B4D4C',
  muted: '878888',
  line: 'D9D9D9',
  tint: 'F0F0F0',
  accentTint: 'FDEBE3',
}

const FONT_KR = 'NanumHuman'
const FONT_EN = 'Poppins'

// ─────────────────────────────────────────
// 입력 타입
// ─────────────────────────────────────────
export type SlideLayoutName =
  | 'hero-stat'
  | 'split-visual'
  | 'full-diagram'
  | 'detail-grid'
  | 'comparison'
  | 'narrative'

export interface PptxSlideSpec {
  kicker?: string
  headline: string
  caption?: string
  /** 레이아웃 아키타입 (ADR-024) — 없으면 pattern+sectionNum 으로 추론 */
  layout?: SlideLayoutName
  /** 키메시지를 받치는 세부(메커니즘·how) — split-visual/narrative 프로즈 */
  body?: { heading?: string; text: string }[]
  diagram?: { pattern: string; data: any }
  evidence?: { text: string; source?: string }[]
  sectionNum?: string
  order?: number
}

export interface BuildPptxInput {
  projectName?: string | null
  clientName?: string | null
  intent?: string
  sections?: Record<string, string>
  slideSpecs?: PptxSlideSpec[]
}

const SECTION_TITLES: Record<string, { num: string; ko: string; en: string }> = {
  '1': { num: '01', ko: '제안 배경 및 목적', en: 'BACKGROUND & PURPOSE' },
  '2': { num: '02', ko: '추진 전략 및 방법론', en: 'STRATEGY & METHOD' },
  '3': { num: '03', ko: '교육 커리큘럼', en: 'CURRICULUM' },
  '4': { num: '04', ko: '운영 체계 및 코치진', en: 'OPERATION & COACHES' },
  '5': { num: '05', ko: '예산 및 경제성', en: 'BUDGET & FEASIBILITY' },
  '6': { num: '06', ko: '기대 성과 및 임팩트', en: 'IMPACT' },
  '7': { num: '07', ko: '수행 역량 및 실적', en: 'TRACK RECORD' },
}

// ─────────────────────────────────────────
// XML escape
// ─────────────────────────────────────────
function esc(s: string | undefined | null): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const px = (n: number) => Math.round(n * EMU_PER_PX)

// ─────────────────────────────────────────
// 텍스트 박스 생성 헬퍼
// ─────────────────────────────────────────
interface TextRun {
  text: string
  bold?: boolean
  size?: number // pt
  color?: string
  font?: string
}
interface TextBoxOpts {
  x: number // EMU
  y: number
  w: number
  h: number
  runs: TextRun[] | { runs: TextRun[] }[] // 단락 배열 또는 단일 단락 runs
  align?: 'l' | 'ctr' | 'r'
  anchor?: 't' | 'ctr' | 'b'
  fill?: string // bg fill hex
  lineColor?: string
  id: number
}

function textBox(opts: TextBoxOpts): string {
  const paragraphs: { runs: TextRun[] }[] = Array.isArray(opts.runs) && (opts.runs as any[])[0]?.runs
    ? (opts.runs as { runs: TextRun[] }[])
    : [{ runs: opts.runs as TextRun[] }]

  const paraXml = paragraphs
    .map((p) => {
      const runsXml = p.runs
        .map((r) => {
          const sz = Math.round((r.size ?? 14) * 100)
          const font = r.font ?? FONT_KR
          return `<a:r><a:rPr lang="ko-KR" altLang="en-US" sz="${sz}" b="${r.bold ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${r.color ?? COLOR.ink}"/></a:solidFill><a:latin typeface="${font}"/><a:ea typeface="${FONT_KR}"/></a:rPr><a:t>${esc(r.text)}</a:t></a:r>`
        })
        .join('')
      return `<a:p><a:pPr algn="${opts.align ?? 'l'}"/>${runsXml}</a:p>`
    })
    .join('')

  const fillXml = opts.fill
    ? `<a:solidFill><a:srgbClr val="${opts.fill}"/></a:solidFill>`
    : '<a:noFill/>'
  const lnXml = opts.lineColor
    ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${opts.lineColor}"/></a:solidFill></a:ln>`
    : ''

  return `<p:sp><p:nvSpPr><p:cNvPr id="${opts.id}" name="tb${opts.id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${opts.x}" y="${opts.y}"/><a:ext cx="${opts.w}" cy="${opts.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml}${lnXml}</p:spPr><p:txBody><a:bodyPr wrap="square" anchor="${opts.anchor ?? 't'}" lIns="91440" tIns="45720" rIns="91440" bIns="45720"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paraXml}</p:txBody></p:sp>`
}

// 직사각형 채움 도형 (배경 면)
function rect(id: number, x: number, y: number, w: number, h: number, fill: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="rect${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`
}

// ─────────────────────────────────────────
// 슬라이드 본문 (spTree) 생성
// ─────────────────────────────────────────
function wrapSlide(spTreeInner: string, dark = false): string {
  const bg = dark
    ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${COLOR.ink}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
    : `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${COLOR.paper}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${spTreeInner}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

// 페이지 하단 공통 (페이지 번호 + 로고 텍스트)
function footer(idBase: number, pageNum: number, dark = false): string {
  const color = dark ? COLOR.white : COLOR.muted
  return (
    rect(idBase, px(60), px(648), px(1200), px(2), dark ? COLOR.white : COLOR.line) +
    textBox({
      id: idBase + 1,
      x: px(60),
      y: px(655),
      w: px(600),
      h: px(40),
      runs: [{ text: `UNDERDOGS`, size: 9, color, font: FONT_EN, bold: true }],
      align: 'l',
    }) +
    textBox({
      id: idBase + 2,
      x: px(1080),
      y: px(655),
      w: px(180),
      h: px(40),
      runs: [{ text: `${pageNum}`, size: 9, color, font: FONT_EN }],
      align: 'r',
    })
  )
}

// ── 표지 ──
function coverSlide(input: BuildPptxInput): string {
  let id = 10
  const inner =
    textBox({
      id: id++,
      x: px(80),
      y: px(220),
      w: px(1000),
      h: px(40),
      runs: [{ text: esc(input.clientName ?? ''), size: 14, color: COLOR.accent, font: FONT_EN, bold: true }],
    }) +
    textBox({
      id: id++,
      x: px(80),
      y: px(270),
      w: px(1100),
      h: px(160),
      runs: [{ text: input.projectName ?? '제안서', size: 40, color: COLOR.ink, bold: true }],
    }) +
    (input.intent
      ? textBox({
          id: id++,
          x: px(80),
          y: px(450),
          w: px(900),
          h: px(120),
          runs: [{ text: input.intent, size: 16, color: COLOR.softInk }],
        })
      : '') +
    textBox({
      id: id++,
      x: px(80),
      y: px(640),
      w: px(600),
      h: px(50),
      runs: [{ text: 'underdogs.', size: 24, color: COLOR.accent, font: FONT_EN, bold: true }],
    })
  return wrapSlide(inner)
}

// ── INDEX ──
function indexSlide(input: BuildPptxInput, pageNum: number): string {
  let id = 20
  const present = ['1', '2', '3', '4', '5', '6', '7'].filter((n) => input.sections?.[n])
  let inner =
    textBox({
      id: id++,
      x: px(80),
      y: px(50),
      w: px(400),
      h: px(40),
      runs: [{ text: 'INDEX', size: 11, color: COLOR.accent, font: FONT_EN, bold: true }],
    }) +
    textBox({
      id: id++,
      x: px(80),
      y: px(90),
      w: px(600),
      h: px(70),
      runs: [{ text: '목차', size: 32, color: COLOR.ink, bold: true }],
    }) +
    rect(id++, px(80), px(170), px(1120), px(4), COLOR.ink)

  let y = 210
  for (const n of present) {
    const info = SECTION_TITLES[n]
    inner += textBox({
      id: id++,
      x: px(80),
      y: px(y),
      w: px(1120),
      h: px(56),
      runs: [
        { text: `${info.num}   `, size: 14, color: COLOR.accent, font: FONT_EN, bold: true },
        { text: info.ko, size: 16, color: COLOR.ink, bold: true },
        { text: `    ${info.en}`, size: 11, color: COLOR.muted, font: FONT_EN },
      ],
    })
    y += 60
  }
  inner += footer(id, pageNum)
  return wrapSlide(inner)
}

// ── 섹션 divider (다크) ──
function dividerSlide(num: string, pageNum: number): string {
  const info = SECTION_TITLES[num]
  let id = 30
  const inner =
    textBox({
      id: id++,
      x: px(80),
      y: px(240),
      w: px(400),
      h: px(40),
      runs: [{ text: info.num, size: 14, color: COLOR.accent, font: FONT_EN, bold: true }],
    }) +
    textBox({
      id: id++,
      x: px(80),
      y: px(290),
      w: px(1000),
      h: px(90),
      runs: [{ text: info.en, size: 40, color: COLOR.white, font: FONT_EN, bold: true }],
    }) +
    textBox({
      id: id++,
      x: px(80),
      y: px(390),
      w: px(1000),
      h: px(60),
      runs: [{ text: info.ko, size: 28, color: COLOR.white, bold: true }],
    }) +
    footer(id, pageNum, true)
  return wrapSlide(inner, true)
}

// ─────────────────────────────────────────
// 레이아웃 아키타입 (ADR-024) — 본문 슬라이드 배치
// ─────────────────────────────────────────

// 컨텐츠 가용 영역 (헤드라인 하단 ~ footer 위). 밀도·dead-space 분배 기준.
const MARGIN_X = 80
const CONTENT_W = 1120 // SLIDE_W(1280px 환산) - 2*margin
const CONTENT_TOP = 250 // 헤드라인/캡션/구분선 아래
const CONTENT_BOTTOM = 636 // footer(648) 위
const CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP

interface Zone {
  x: number
  y: number
  w: number
  h: number
}

/**
 * layout 미지정 시 추론 (ADR-024 §4-2 규칙).
 * pattern + sectionNum + body 유무로 가장 어울리는 아키타입 선택.
 */
function inferLayout(spec: PptxSlideSpec): SlideLayoutName {
  if (spec.layout) return spec.layout
  const pattern = spec.diagram?.pattern
  const section = spec.sectionNum
  const hasBody = Array.isArray(spec.body) && spec.body.length > 0

  if (pattern === 'kpi-grid' && (section === '6' || section === '7')) return 'hero-stat'
  if (pattern === 'before-after' || pattern === 'comparison-table') return 'comparison'
  if (pattern === 'timeline' || pattern === 'process-flow') return 'full-diagram'
  if (pattern === 'matrix-2x2' || pattern === 'architecture-stack') return 'full-diagram'
  if ((pattern === 'hierarchy-tree' || pattern === 'kpi-grid') && (section === '3' || section === '4')) return 'detail-grid'
  if (hasBody) return 'split-visual'
  if (pattern === 'text-only' || !pattern) return 'narrative'
  return 'split-visual'
}

// 키커 + 헤드라인 + 캡션 + 구분선 (모든 본문 레이아웃 공통 헤더) → { xml, nextId }
function slideHeader(spec: PptxSlideSpec, startId: number): { xml: string; nextId: number } {
  let id = startId
  let xml = ''
  if (spec.kicker) {
    xml += textBox({
      id: id++, x: px(MARGIN_X), y: px(50), w: px(1000), h: px(34),
      runs: [{ text: spec.kicker, size: 11, color: COLOR.accent, font: FONT_EN, bold: true }],
    })
  }
  xml += textBox({
    id: id++, x: px(MARGIN_X), y: px(86), w: px(CONTENT_W), h: px(96),
    runs: [{ text: spec.headline, size: 20, color: COLOR.ink, bold: true }],
  })
  if (spec.caption) {
    xml += textBox({
      id: id++, x: px(MARGIN_X), y: px(190), w: px(CONTENT_W), h: px(40),
      runs: [{ text: spec.caption, size: 12, color: COLOR.muted }],
    })
  }
  xml += rect(id++, px(MARGIN_X), px(236), px(CONTENT_W), px(2), COLOR.line)
  return { xml, nextId: id }
}

// body 프로즈 블록을 zone 안에 채움 (heading + text) → { xml, nextId }
function bodyProse(body: { heading?: string; text: string }[], zone: Zone, startId: number): { xml: string; nextId: number } {
  let id = startId
  let xml = ''
  const blocks = body.slice(0, 4)
  if (blocks.length === 0) return { xml, nextId: id }
  const gap = 14
  const blockH = (zone.h - gap * (blocks.length - 1)) / blocks.length
  blocks.forEach((b, i) => {
    const y = zone.y + i * (blockH + gap)
    // accent 좌측 스트로크 (반복 정렬 — border-brand-left 정신)
    xml += rect(id++, px(zone.x), px(y + 2), px(4), px(blockH - 4), COLOR.accent)
    const runs: { runs: TextRun[] }[] = []
    if (b.heading) runs.push({ runs: [{ text: b.heading, size: 13, color: COLOR.ink, bold: true }] })
    runs.push({ runs: [{ text: b.text, size: 11, color: COLOR.softInk }] })
    xml += textBox({
      id: id++, x: px(zone.x + 16), y: px(y), w: px(zone.w - 16), h: px(blockH),
      runs, anchor: 't',
    })
  })
  return { xml, nextId: id }
}

// evidence 밴드 — 주어진 y 위치에 tint 박스 (정량+메커니즘 근거) → { xml, nextId }
function evidenceBand(evidence: { text: string; source?: string }[], y: number, startId: number, w = CONTENT_W): { xml: string; nextId: number } {
  let id = startId
  const ev = evidence.slice(0, 3)
  if (ev.length === 0) return { xml: '', nextId: id }
  const bandH = 22 + ev.length * 20
  let xml = rect(id++, px(MARGIN_X), px(y), px(w), px(bandH), COLOR.tint)
  xml += textBox({
    id: id++, x: px(MARGIN_X + 15), y: px(y + 6), w: px(200), h: px(20),
    runs: [{ text: '근거', size: 10, color: COLOR.accent, bold: true }],
  })
  const evRuns = ev.map((e) => ({
    runs: [
      { text: `• ${e.text}`, size: 10, color: COLOR.softInk },
      ...(e.source ? [{ text: ` (${e.source})`, size: 9, color: COLOR.muted }] : []),
    ],
  }))
  xml += textBox({
    id: id++, x: px(MARGIN_X + 15), y: px(y + 26), w: px(w - 30), h: px(bandH - 30),
    runs: evRuns,
  })
  return { xml, nextId: id }
}

// 본문 슬라이드 디스패처 — layout 별 분기
function specSlide(spec: PptxSlideSpec, pageNum: number): string {
  const layout = inferLayout(spec)
  const h = slideHeader(spec, 40)
  let id = h.nextId
  let body = h.xml

  switch (layout) {
    case 'hero-stat': { const r = layoutHeroStat(spec, id); body += r.xml; id = r.nextId; break }
    case 'split-visual': { const r = layoutSplitVisual(spec, id); body += r.xml; id = r.nextId; break }
    case 'full-diagram': { const r = layoutFullDiagram(spec, id); body += r.xml; id = r.nextId; break }
    case 'detail-grid': { const r = layoutDetailGrid(spec, id); body += r.xml; id = r.nextId; break }
    case 'comparison': { const r = layoutComparison(spec, id); body += r.xml; id = r.nextId; break }
    case 'narrative': { const r = layoutNarrative(spec, id); body += r.xml; id = r.nextId; break }
  }
  body += footer(id, pageNum)
  return wrapSlide(body)
}

// hero-stat: 좌 빅넘버 도식(kpi) 지배 + 우/하 body·evidence
function layoutHeroStat(spec: PptxSlideSpec, startId: number): { xml: string; nextId: number } {
  let id = startId
  let xml = ''
  const hasBody = Array.isArray(spec.body) && spec.body.length > 0
  const evH = spec.evidence?.length ? 22 + Math.min(spec.evidence.length, 3) * 20 : 0
  const diagH = CONTENT_H - (evH ? evH + 16 : 0)
  // kpi-grid 를 풀폭 대형으로 (빅넘버 강조)
  const zone: Zone = { x: MARGIN_X, y: CONTENT_TOP, w: hasBody ? 740 : CONTENT_W, h: diagH }
  const diag = renderDiagramToShapes(spec.diagram, id, zone, { hero: true })
  xml += diag.xml
  id = diag.nextId
  if (hasBody) {
    const r = bodyProse(spec.body!, { x: MARGIN_X + 760, y: CONTENT_TOP, w: CONTENT_W - 760, h: diagH }, id)
    xml += r.xml; id = r.nextId
  }
  if (evH) {
    const r = evidenceBand(spec.evidence!, CONTENT_BOTTOM - evH, id)
    xml += r.xml; id = r.nextId
  }
  return { xml, nextId: id }
}

// split-visual: 좌 40% body 프로즈 / 우 60% 도식
function layoutSplitVisual(spec: PptxSlideSpec, startId: number): { xml: string; nextId: number } {
  let id = startId
  let xml = ''
  const evH = spec.evidence?.length ? 22 + Math.min(spec.evidence.length, 3) * 20 : 0
  const upperH = CONTENT_H - (evH ? evH + 16 : 0)
  const leftW = 420
  const rightX = MARGIN_X + leftW + 30
  const rightW = CONTENT_W - leftW - 30
  // 좌 프로즈 (body 없으면 caption/headline 보조 텍스트로라도 채움)
  const proseBody = (spec.body && spec.body.length > 0)
    ? spec.body
    : [{ text: spec.caption ?? spec.headline }]
  const lp = bodyProse(proseBody, { x: MARGIN_X, y: CONTENT_TOP, w: leftW, h: upperH }, id)
  xml += lp.xml; id = lp.nextId
  // 우 도식
  const diag = renderDiagramToShapes(spec.diagram, id, { x: rightX, y: CONTENT_TOP, w: rightW, h: upperH })
  xml += diag.xml; id = diag.nextId
  if (evH) {
    const r = evidenceBand(spec.evidence!, CONTENT_BOTTOM - evH, id)
    xml += r.xml; id = r.nextId
  }
  return { xml, nextId: id }
}

// full-diagram: 도식이 풀폭·풀높이 지배
function layoutFullDiagram(spec: PptxSlideSpec, startId: number): { xml: string; nextId: number } {
  let id = startId
  let xml = ''
  const evH = spec.evidence?.length ? 22 + Math.min(spec.evidence.length, 3) * 20 : 0
  const diagH = CONTENT_H - (evH ? evH + 16 : 0)
  const diag = renderDiagramToShapes(spec.diagram, id, { x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W, h: diagH }, { fill: true })
  xml += diag.xml; id = diag.nextId
  // body 가 있으면 도식 아래 한 줄 요약 (full-diagram 은 도식 우선이므로 evidence 위에만)
  if (evH) {
    const r = evidenceBand(spec.evidence!, CONTENT_BOTTOM - evH, id)
    xml += r.xml; id = r.nextId
  }
  return { xml, nextId: id }
}

// detail-grid: 도식(주로 hierarchy/kpi) 풀 + body 셀 보조 (고밀도)
function layoutDetailGrid(spec: PptxSlideSpec, startId: number): { xml: string; nextId: number } {
  let id = startId
  let xml = ''
  const hasBody = Array.isArray(spec.body) && spec.body.length > 0
  const evH = spec.evidence?.length ? 22 + Math.min(spec.evidence.length, 3) * 20 : 0
  // 상단: 도식 (가용 높이의 ~60%), 하단: body 그리드 (있으면)
  const diagH = hasBody ? Math.round(CONTENT_H * 0.55) : CONTENT_H - (evH ? evH + 16 : 0)
  const diag = renderDiagramToShapes(spec.diagram, id, { x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W, h: diagH }, { fill: true })
  xml += diag.xml; id = diag.nextId
  if (hasBody) {
    // body 를 가로 그리드 셀로 (3~4 셀)
    const blocks = spec.body!.slice(0, 4)
    const gridY = CONTENT_TOP + diagH + 16
    const gridH = CONTENT_BOTTOM - gridY - (evH ? evH + 12 : 0)
    const gap = 16
    const cellW = (CONTENT_W - gap * (blocks.length - 1)) / blocks.length
    blocks.forEach((b, i) => {
      const x = MARGIN_X + i * (cellW + gap)
      xml += rect(id++, px(x), px(gridY), px(cellW), px(gridH), COLOR.tint)
      const runs: { runs: TextRun[] }[] = []
      if (b.heading) runs.push({ runs: [{ text: b.heading, size: 12, color: COLOR.accent, bold: true }] })
      runs.push({ runs: [{ text: b.text, size: 10, color: COLOR.softInk }] })
      xml += textBox({ id: id++, x: px(x + 12), y: px(gridY + 10), w: px(cellW - 24), h: px(gridH - 20), runs })
    })
  }
  if (evH) {
    const r = evidenceBand(spec.evidence!, CONTENT_BOTTOM - evH, id)
    xml += r.xml; id = r.nextId
  }
  return { xml, nextId: id }
}

// comparison: 대비 도식(before-after/comparison-table) 풀 + 행별 근거
function layoutComparison(spec: PptxSlideSpec, startId: number): { xml: string; nextId: number } {
  let id = startId
  let xml = ''
  const evH = spec.evidence?.length ? 22 + Math.min(spec.evidence.length, 3) * 20 : 0
  const diagH = CONTENT_H - (evH ? evH + 16 : 0)
  const diag = renderDiagramToShapes(spec.diagram, id, { x: MARGIN_X, y: CONTENT_TOP, w: CONTENT_W, h: diagH }, { fill: true })
  xml += diag.xml; id = diag.nextId
  if (evH) {
    const r = evidenceBand(spec.evidence!, CONTENT_BOTTOM - evH, id)
    xml += r.xml; id = r.nextId
  }
  return { xml, nextId: id }
}

// narrative: 좌 본문 다단 + 우 콜아웃(accent stroke) 박스
function layoutNarrative(spec: PptxSlideSpec, startId: number): { xml: string; nextId: number } {
  let id = startId
  let xml = ''
  const evH = spec.evidence?.length ? 22 + Math.min(spec.evidence.length, 3) * 20 : 0
  const upperH = CONTENT_H - (evH ? evH + 16 : 0)
  const hasDiagram = spec.diagram && spec.diagram.pattern !== 'text-only' && spec.diagram.data
  const leftW = hasDiagram ? 640 : CONTENT_W
  const proseBody = (spec.body && spec.body.length > 0)
    ? spec.body
    : [{ text: spec.caption ?? spec.headline }]
  const lp = bodyProse(proseBody, { x: MARGIN_X, y: CONTENT_TOP, w: leftW, h: upperH }, id)
  xml += lp.xml; id = lp.nextId
  if (hasDiagram) {
    const calloutX = MARGIN_X + leftW + 30
    const calloutW = CONTENT_W - leftW - 30
    // accent stroke 콜아웃 박스 안에 도식
    xml += textBox({
      id: id++, x: px(calloutX), y: px(CONTENT_TOP), w: px(calloutW), h: px(upperH),
      runs: [{ runs: [{ text: '', size: 1, color: COLOR.ink }] }], lineColor: COLOR.accent,
    })
    const diag = renderDiagramToShapes(spec.diagram, id, { x: calloutX + 14, y: CONTENT_TOP + 14, w: calloutW - 28, h: upperH - 28 }, { fill: true })
    xml += diag.xml; id = diag.nextId
  }
  if (evH) {
    const r = evidenceBand(spec.evidence!, CONTENT_BOTTOM - evH, id)
    xml += r.xml; id = r.nextId
  }
  return { xml, nextId: id }
}

/**
 * 도식화 패턴 → 단순 도형(표 형태) 변환.
 * PPTX 네이티브 표는 복잡하므로 "행별 텍스트 박스" 로 표현 (편집 가능).
 */
interface DiagramOpts {
  /** 빅넘버 강조 (hero-stat) — kpi value 폰트 대형 */
  hero?: boolean
  /** zone 높이를 채우도록 항목 높이 신축 (full-diagram/comparison/detail-grid) */
  fill?: boolean
}

function renderDiagramToShapes(
  diagram: { pattern: string; data: any } | undefined,
  startId: number,
  zone: Zone,
  opts: DiagramOpts = {},
): { xml: string; nextId: number; bottomY: number } {
  let id = startId
  let xml = ''
  let bottomY = zone.y
  if (!diagram || !diagram.data) return { xml, nextId: id, bottomY }
  const { pattern, data } = diagram
  const X = zone.x
  const W = zone.w
  const Y0 = zone.y
  const H = zone.h
  // zone 높이를 채울지 — fill 이면 H, 아니면 컨텐츠 자연 높이
  const fillH = opts.fill ? H : undefined

  if (pattern === 'process-flow' && Array.isArray(data.steps)) {
    const steps = data.steps.slice(0, 7) // 상한 6→7
    const gap = 16
    const stepW = (W - gap * (steps.length - 1)) / steps.length
    const stepH = Math.max(Math.min(fillH ?? 200, H), 120)
    steps.forEach((s: any, i: number) => {
      const x = X + i * (stepW + gap)
      xml += rect(id++, px(x), px(Y0), px(stepW), px(stepH), i === 0 ? COLOR.accentTint : COLOR.tint)
      xml += textBox({
        id: id++, x: px(x + 8), y: px(Y0 + 10), w: px(stepW - 16), h: px(stepH - 20),
        runs: [
          { runs: [{ text: s.num ?? `${i + 1}`, size: 13, color: COLOR.accent, font: FONT_EN, bold: true }] },
          { runs: [{ text: s.label ?? '', size: 13, color: COLOR.ink, bold: true }] },
          ...(s.description ? [{ runs: [{ text: s.description, size: 10, color: COLOR.softInk }] }] : []),
        ],
      })
    })
    bottomY = Y0 + stepH
  } else if (pattern === 'kpi-grid' && Array.isArray(data.kpis)) {
    const cols = data.columns ?? 4
    const gap = 16
    const kpis = data.kpis.slice(0, cols * 2) // 최대 2행
    const cellW = (W - gap * (cols - 1)) / cols
    const nRows = Math.max(Math.ceil(kpis.length / cols), 1)
    // fill 이면 zone 높이에 맞춰 셀 높이 신축 (dead-space 최소화)
    const cellH = fillH
      ? Math.max((fillH - gap * (nRows - 1)) / nRows, 100)
      : opts.hero ? 150 : 110
    const valSize = opts.hero ? 40 : 26
    kpis.forEach((k: any, i: number) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = X + col * (cellW + gap)
      const y = Y0 + row * (cellH + gap)
      xml += rect(id++, px(x), px(y), px(cellW), px(cellH), COLOR.tint)
      xml += textBox({
        id: id++, x: px(x + 10), y: px(y + 10), w: px(cellW - 20), h: px(cellH - 20),
        anchor: opts.hero ? 'ctr' : 't',
        runs: [
          { runs: [{ text: k.value ?? '', size: valSize, color: COLOR.accent, font: FONT_EN, bold: true }] },
          { runs: [{ text: k.label ?? '', size: 12, color: COLOR.ink, bold: true }] },
          ...(k.sublabel ? [{ runs: [{ text: k.sublabel, size: 9, color: COLOR.muted }] }] : []),
        ],
      })
    })
    bottomY = Y0 + nRows * (cellH + gap) - gap
  } else if (pattern === 'comparison-table' && Array.isArray(data.rows)) {
    const rows = data.rows.slice(0, 8) // 상한 6→8
    const colDim = Math.round(W * 0.25), colL = Math.round(W * 0.375), colR = W - colDim - colL
    // fill 이면 행 높이를 zone 에 맞춰 신축
    const rowH = fillH ? Math.max(Math.min((fillH) / (rows.length + 1), 56), 32) : 40
    xml += rect(id++, px(X), px(Y0), px(colDim), px(rowH), COLOR.ink)
    xml += rect(id++, px(X + colDim), px(Y0), px(colL), px(rowH), COLOR.ink)
    xml += rect(id++, px(X + colDim + colL), px(Y0), px(colR), px(rowH), COLOR.accent)
    xml += textBox({ id: id++, x: px(X + 10), y: px(Y0 + 8), w: px(colDim - 20), h: px(rowH - 12), runs: [{ text: '구분', size: 11, color: COLOR.white, bold: true }], anchor: 'ctr' })
    xml += textBox({ id: id++, x: px(X + 10 + colDim), y: px(Y0 + 8), w: px(colL - 20), h: px(rowH - 12), runs: [{ text: data.leftLabel ?? '기존', size: 11, color: COLOR.white, bold: true }], anchor: 'ctr' })
    xml += textBox({ id: id++, x: px(X + 10 + colDim + colL), y: px(Y0 + 8), w: px(colR - 20), h: px(rowH - 12), runs: [{ text: data.rightLabel ?? '언더독스', size: 11, color: COLOR.white, bold: true }], anchor: 'ctr' })
    rows.forEach((r: any, i: number) => {
      const y = Y0 + rowH + i * rowH
      const rightFill = r.advantageOnRight ? COLOR.accentTint : COLOR.paper
      xml += rect(id++, px(X), px(y), px(colDim), px(rowH), COLOR.tint)
      xml += rect(id++, px(X + colDim), px(y), px(colL), px(rowH), COLOR.paper)
      xml += rect(id++, px(X + colDim + colL), px(y), px(colR), px(rowH), rightFill)
      xml += textBox({ id: id++, x: px(X + 10), y: px(y + 8), w: px(colDim - 20), h: px(rowH - 12), runs: [{ text: r.dim ?? '', size: 10, color: COLOR.ink, bold: true }], anchor: 'ctr' })
      xml += textBox({ id: id++, x: px(X + 10 + colDim), y: px(y + 8), w: px(colL - 20), h: px(rowH - 12), runs: [{ text: r.left ?? '', size: 10, color: COLOR.softInk }], anchor: 'ctr' })
      xml += textBox({ id: id++, x: px(X + 10 + colDim + colL), y: px(y + 8), w: px(colR - 20), h: px(rowH - 12), runs: [{ text: r.right ?? '', size: 10, color: COLOR.ink, bold: !!r.advantageOnRight }], anchor: 'ctr' })
    })
    bottomY = Y0 + rowH * (1 + rows.length)
  } else if (pattern === 'architecture-stack' && Array.isArray(data.layers)) {
    const layers = data.layers.slice(0, 6) // 상한 5→6
    const gap = 8
    const rowH = fillH ? Math.max(Math.min((fillH - gap * (layers.length - 1)) / layers.length, 80), 44) : 52
    const nameW = Math.round(W * 0.16)
    layers.forEach((l: any, i: number) => {
      const y = Y0 + i * (rowH + gap)
      xml += rect(id++, px(X), px(y), px(nameW), px(rowH), COLOR.ink)
      xml += textBox({ id: id++, x: px(X + 10), y: px(y + 8), w: px(nameW - 20), h: px(rowH - 12), runs: [{ text: l.name ?? '', size: 12, color: COLOR.white, bold: true }], anchor: 'ctr' })
      const items = (l.items ?? []).slice(0, 6) // 상한 4→6
      const itemsX = X + nameW + gap
      const itemsW = W - nameW - gap
      const itemW = (itemsW - gap * (items.length - 1)) / Math.max(items.length, 1)
      items.forEach((it: string, j: number) => {
        const x = itemsX + j * (itemW + gap)
        xml += rect(id++, px(x), px(y), px(itemW), px(rowH), l.accent ? COLOR.accentTint : COLOR.tint)
        xml += textBox({ id: id++, x: px(x + 6), y: px(y + 8), w: px(itemW - 12), h: px(rowH - 12), runs: [{ text: it, size: 10, color: COLOR.ink }], anchor: 'ctr', align: 'ctr' })
      })
    })
    bottomY = Y0 + (layers.length - 1) * (rowH + gap) + rowH
  } else if (pattern === 'before-after' && (data.before || data.after)) {
    const boxH = fillH ? Math.max(Math.min(fillH, 280), 160) : 200
    const arrowW = 80
    const boxW = (W - arrowW) / 2
    const drawBA = (bx: number, fill: string, header: string, hColor: string, node: any) => {
      let s = rect(id++, px(bx), px(Y0), px(boxW), px(boxH), fill)
      s += textBox({ id: id++, x: px(bx + 16), y: px(Y0 + 14), w: px(boxW - 32), h: px(28), runs: [{ text: header, size: 11, color: hColor, font: FONT_EN, bold: true }] })
      const metrics: string[] = Array.isArray(node?.metrics) ? node.metrics.slice(0, 4) : []
      s += textBox({
        id: id++, x: px(bx + 16), y: px(Y0 + 46), w: px(boxW - 32), h: px(boxH - 60),
        runs: [
          { runs: [{ text: node?.label ?? '', size: 15, color: COLOR.ink, bold: true }] },
          ...(node?.description ? [{ runs: [{ text: node.description, size: 11, color: COLOR.softInk }] }] : []),
          ...metrics.map((m) => ({ runs: [{ text: `• ${m}`, size: 11, color: hColor === COLOR.accent ? COLOR.accent : COLOR.softInk }] })),
        ],
      })
      return s
    }
    xml += drawBA(X, COLOR.tint, 'BEFORE', COLOR.muted, data.before)
    xml += textBox({ id: id++, x: px(X + boxW), y: px(Y0 + boxH / 2 - 30), w: px(arrowW), h: px(60), runs: [{ text: '→', size: 40, color: COLOR.accent, font: FONT_EN, bold: true }], align: 'ctr', anchor: 'ctr' })
    xml += drawBA(X + boxW + arrowW, COLOR.accentTint, 'AFTER', COLOR.accent, data.after)
    bottomY = Y0 + boxH
  } else if (pattern === 'timeline' && Array.isArray(data.tracks)) {
    const units: any[] = Array.isArray(data.units) && data.units.length ? data.units.slice(0, 12) : []
    const tracks = data.tracks.slice(0, 6) // 상한 4→6
    const labelW = Math.round(W * 0.13)
    const unitsX = X + labelW
    const nUnits = Math.max(units.length, 1)
    const unitW = (W - labelW) / nUnits
    const headerH = 30
    const gap = 8
    const rowH = fillH ? Math.max(Math.min((fillH - headerH - 8 - gap * (tracks.length - 1)) / Math.max(tracks.length, 1), 60), 36) : 46
    units.forEach((u, i) => {
      const x = unitsX + i * unitW
      xml += rect(id++, px(x), px(Y0), px(unitW - 3), px(headerH), COLOR.tint)
      xml += textBox({ id: id++, x: px(x), y: px(Y0 + 6), w: px(unitW - 3), h: px(headerH - 8), runs: [{ text: String(u), size: 9, color: COLOR.softInk, bold: true }], align: 'ctr', anchor: 'ctr' })
    })
    const rowsY = Y0 + headerH + 8
    tracks.forEach((t: any, ti: number) => {
      const y = rowsY + ti * (rowH + gap)
      xml += rect(id++, px(X), px(y), px(labelW - 6), px(rowH), COLOR.ink)
      xml += textBox({ id: id++, x: px(X + 6), y: px(y + 6), w: px(labelW - 18), h: px(rowH - 12), runs: [{ text: t.name ?? '', size: 11, color: COLOR.white, bold: true }], anchor: 'ctr' })
      const bars: any[] = Array.isArray(t.bars) ? t.bars : []
      bars.forEach((b, bi) => {
        const s = Math.max(0, Number(b.startIdx ?? 0))
        const e = Math.max(s, Number(b.endIdx ?? s))
        const bx = unitsX + s * unitW
        const bw = Math.max((e - s + 1) * unitW - 6, 20)
        xml += rect(id++, px(bx), px(y + 6), px(bw), px(rowH - 12), bi % 2 === 0 ? COLOR.accentTint : COLOR.tint)
        if (b.label) xml += textBox({ id: id++, x: px(bx + 4), y: px(y + 8), w: px(bw - 8), h: px(rowH - 16), runs: [{ text: String(b.label), size: 9, color: COLOR.ink }], anchor: 'ctr' })
      })
    })
    bottomY = rowsY + Math.max(tracks.length - 1, 0) * (rowH + gap) + rowH
  } else if (pattern === 'matrix-2x2' && Array.isArray(data.quadrants)) {
    const axisW = 64
    const gridX = X + axisW
    const gridW = W - axisW
    const cellGap = 4
    const cellW = (gridW - cellGap) / 2
    const cellH = fillH ? Math.max(Math.min((fillH - 30 - cellGap) / 2, 150), 90) : 110
    const pos: Record<string, [number, number]> = {
      TL: [gridX, Y0], TR: [gridX + cellW + cellGap, Y0],
      BL: [gridX, Y0 + cellH + cellGap], BR: [gridX + cellW + cellGap, Y0 + cellH + cellGap],
    }
    if (data.axisY?.label) xml += textBox({ id: id++, x: px(X), y: px(Y0 + cellH - 10), w: px(axisW - 4), h: px(40), runs: [{ text: data.axisY.label, size: 10, color: COLOR.muted, bold: true }], align: 'ctr' })
    data.quadrants.slice(0, 4).forEach((q: any) => {
      const p = pos[(q.q as string) ?? 'TL'] ?? pos.TL
      xml += rect(id++, px(p[0]), px(p[1]), px(cellW), px(cellH), q.highlight ? COLOR.accentTint : COLOR.tint)
      xml += textBox({
        id: id++, x: px(p[0] + 14), y: px(p[1] + 12), w: px(cellW - 28), h: px(cellH - 20),
        runs: [
          { runs: [{ text: (q.highlight ? '★ ' : '') + (q.label ?? ''), size: 13, color: q.highlight ? COLOR.accent : COLOR.ink, bold: true }] },
          ...(q.description ? [{ runs: [{ text: q.description, size: 10, color: COLOR.softInk }] }] : []),
        ],
      })
    })
    if (data.axisX?.label) xml += textBox({ id: id++, x: px(gridX), y: px(Y0 + 2 * cellH + cellGap + 6), w: px(gridW), h: px(24), runs: [{ text: data.axisX.label, size: 10, color: COLOR.muted, bold: true }], align: 'ctr' })
    bottomY = Y0 + 2 * cellH + cellGap + 30
  } else if (pattern === 'hierarchy-tree' && data.root) {
    const rootW = 320, rootX = X + (W - rootW) / 2, rootH = 54
    const childH = fillH ? Math.max(Math.min(fillH - rootH - 50, 110), 64) : 64
    xml += rect(id++, px(rootX), px(Y0), px(rootW), px(rootH), COLOR.ink)
    xml += textBox({
      id: id++, x: px(rootX + 10), y: px(Y0 + 8), w: px(rootW - 20), h: px(rootH - 12),
      runs: [
        { runs: [{ text: data.root.label ?? '', size: 13, color: COLOR.white, bold: true }] },
        ...(data.root.sublabel ? [{ runs: [{ text: data.root.sublabel, size: 9, color: COLOR.line }] }] : []),
      ], align: 'ctr', anchor: 'ctr',
    })
    const children: any[] = Array.isArray(data.children) ? data.children.slice(0, 5) : [] // 상한 4→5
    if (children.length) {
      const gap = 18
      const childW = (W - gap * (children.length - 1)) / children.length
      const childY = Y0 + rootH + 50
      const rootCx = rootX + rootW / 2
      xml += rect(id++, px(rootCx - 1), px(Y0 + rootH), px(2), px(28), COLOR.muted)
      const firstCx = X + childW / 2
      const lastCx = X + (children.length - 1) * (childW + gap) + childW / 2
      xml += rect(id++, px(firstCx), px(Y0 + rootH + 26), px(Math.max(lastCx - firstCx, 2)), px(2), COLOR.muted)
      children.forEach((c, i) => {
        const cx = X + i * (childW + gap)
        const ccx = cx + childW / 2
        xml += rect(id++, px(ccx - 1), px(Y0 + rootH + 26), px(2), px(24), COLOR.muted)
        xml += rect(id++, px(cx), px(childY), px(childW), px(childH), COLOR.tint)
        const gkids: string[] = Array.isArray(c.children) ? c.children.map((g: any) => g.label).filter(Boolean).slice(0, 3) : []
        xml += textBox({
          id: id++, x: px(cx + 8), y: px(childY + 8), w: px(childW - 16), h: px(childH - 12),
          runs: [
            { runs: [{ text: c.label ?? '', size: 11, color: COLOR.ink, bold: true }] },
            ...(c.sublabel ? [{ runs: [{ text: c.sublabel, size: 9, color: COLOR.muted }] }] : []),
            ...(gkids.length ? [{ runs: [{ text: gkids.join(' · '), size: 9, color: COLOR.softInk }] }] : []),
          ], align: 'ctr', anchor: 'ctr',
        })
      })
      bottomY = childY + childH
    } else {
      bottomY = Y0 + rootH
    }
  } else {
    // 알 수 없는/malformed 패턴 (text-only 등) → 데이터 요약 텍스트 (안전망)
    const summary = summarizeDiagramData(pattern, data)
    if (summary.length > 0) {
      xml += textBox({
        id: id++, x: px(X), y: px(Y0), w: px(W), h: px(Math.min(H, 260)),
        runs: summary.map((line) => ({ runs: [{ text: line, size: 12, color: COLOR.softInk }] })),
      })
      bottomY = Y0 + Math.min(260, summary.length * 24 + 16)
    }
  }
  return { xml, nextId: id, bottomY }
}

function summarizeDiagramData(pattern: string, data: any): string[] {
  const lines: string[] = []
  if (pattern === 'before-after') {
    if (data.before) lines.push(`[Before] ${data.before.label ?? ''} ${(data.before.metrics ?? []).join(', ')}`)
    if (data.after) lines.push(`[After] ${data.after.label ?? ''} ${(data.after.metrics ?? []).join(', ')}`)
  } else if (pattern === 'matrix-2x2' && Array.isArray(data.quadrants)) {
    for (const q of data.quadrants) lines.push(`· ${q.label ?? ''}${q.highlight ? ' ★' : ''} — ${q.description ?? ''}`)
  } else if (pattern === 'timeline' && Array.isArray(data.tracks)) {
    for (const t of data.tracks) lines.push(`· ${t.name}: ${(t.bars ?? []).map((b: any) => b.label).filter(Boolean).join(' → ')}`)
  } else if (pattern === 'hierarchy-tree') {
    if (data.root) lines.push(`▣ ${data.root.label ?? ''}`)
    for (const c of (data.children ?? [])) lines.push(`  └ ${c.label ?? ''} ${c.sublabel ? `(${c.sublabel})` : ''}`)
  }
  return lines
}

// ── 마무리 (다크) ──
function closingSlide(pageNum: number): string {
  let id = 90
  const inner =
    textBox({
      id: id++,
      x: px(80),
      y: px(280),
      w: px(1000),
      h: px(40),
      runs: [{ text: 'THANK YOU', size: 14, color: COLOR.accent, font: FONT_EN, bold: true }],
      align: 'ctr',
    }) +
    textBox({
      id: id++,
      x: px(80),
      y: px(330),
      w: px(1000),
      h: px(90),
      runs: [{ text: 'UNDERDOGS', size: 40, color: COLOR.white, font: FONT_EN, bold: true }],
      align: 'ctr',
    }) +
    textBox({
      id: id++,
      x: px(80),
      y: px(430),
      w: px(1000),
      h: px(40),
      runs: [{ text: '창업가의 페이스 메이커', size: 14, color: COLOR.white }],
      align: 'ctr',
    })
  return wrapSlide(inner, true)
}

// ─────────────────────────────────────────
// 슬라이드 시퀀스 빌드
// ─────────────────────────────────────────
function buildSlideXmls(input: BuildPptxInput): string[] {
  const xmls: string[] = []
  let page = 0
  xmls.push(coverSlide(input))
  page++
  xmls.push(indexSlide(input, ++page))

  const useSpecs = Array.isArray(input.slideSpecs) && input.slideSpecs.length > 0
  if (useSpecs) {
    const bySection = new Map<string, PptxSlideSpec[]>()
    for (const s of input.slideSpecs!) {
      if (!s || !s.sectionNum) continue
      if (!bySection.has(s.sectionNum)) bySection.set(s.sectionNum, [])
      bySection.get(s.sectionNum)!.push(s)
    }
    for (const n of ['1', '2', '3', '4', '5', '6', '7']) {
      if (!input.sections?.[n]) continue
      xmls.push(dividerSlide(n, ++page))
      const specs = (bySection.get(n) ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      for (const spec of specs) {
        xmls.push(specSlide(spec, ++page))
      }
    }
  } else {
    // sections 텍스트만 있는 경우 — divider + 텍스트 슬라이드
    for (const n of ['1', '2', '3', '4', '5', '6', '7']) {
      const body = input.sections?.[n]
      if (!body) continue
      xmls.push(dividerSlide(n, ++page))
      const info = SECTION_TITLES[n]
      let id = 50
      const paras = body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean).slice(0, 5)
      const inner =
        textBox({ id: id++, x: px(80), y: px(50), w: px(1000), h: px(34), runs: [{ text: `${info.num} ${info.ko}`, size: 11, color: COLOR.accent, font: FONT_EN, bold: true }] }) +
        rect(id++, px(80), px(96), px(1120), px(2), COLOR.line) +
        textBox({ id: id++, x: px(80), y: px(110), w: px(1120), h: px(520), runs: paras.map((p) => ({ runs: [{ text: p, size: 13, color: COLOR.softInk }] })) }) +
        footer(id, ++page)
      xmls.push(wrapSlide(inner))
    }
  }
  xmls.push(closingSlide(++page))
  return xmls
}

// ─────────────────────────────────────────
// OOXML 패키지 조립 (JSZip)
// ─────────────────────────────────────────
export async function buildPptx(input: BuildPptxInput): Promise<Buffer> {
  const slideXmls = buildSlideXmls(input)
  const n = slideXmls.length
  const zip = new JSZip()

  // [Content_Types].xml
  const slideOverrides = slideXmls
    .map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
    .join('')
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}</Types>`,
  )

  // _rels/.rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
  )

  // ppt/presentation.xml
  const sldIdList = slideXmls
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
    .join('')
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${sldIdList}</p:sldIdLst><p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  )

  // ppt/_rels/presentation.xml.rels
  const presRels = [
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
    ...slideXmls.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`),
    `<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`,
  ].join('')
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels}</Relationships>`,
  )

  // 슬라이드 파일 + rels
  slideXmls.forEach((xml, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, xml)
    zip.file(
      `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`,
    )
  })

  // slideMaster + layout + theme (최소 1세트)
  zip.file('ppt/slideMasters/slideMaster1.xml', SLIDE_MASTER_XML)
  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`,
  )
  zip.file('ppt/slideLayouts/slideLayout1.xml', SLIDE_LAYOUT_XML)
  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
  )
  zip.file('ppt/theme/theme1.xml', THEME_XML)

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// ─────────────────────────────────────────
// 최소 slideMaster / layout / theme XML
// ─────────────────────────────────────────
const SLIDE_MASTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`

const SLIDE_LAYOUT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`

const THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Underdogs"><a:themeElements><a:clrScheme name="Underdogs"><a:dk1><a:srgbClr val="373938"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="373938"/></a:dk2><a:lt2><a:srgbClr val="D9D9D9"/></a:lt2><a:accent1><a:srgbClr val="F05519"/></a:accent1><a:accent2><a:srgbClr val="F48053"/></a:accent2><a:accent3><a:srgbClr val="878888"/></a:accent3><a:accent4><a:srgbClr val="D8D4D7"/></a:accent4><a:accent5><a:srgbClr val="06A9D0"/></a:accent5><a:accent6><a:srgbClr val="F9BBA3"/></a:accent6><a:hlink><a:srgbClr val="F05519"/></a:hlink><a:folHlink><a:srgbClr val="878888"/></a:folHlink></a:clrScheme><a:fontScheme name="Underdogs"><a:majorFont><a:latin typeface="Poppins"/><a:ea typeface="NanumHuman"/><a:cs typeface="NanumHuman"/></a:majorFont><a:minorFont><a:latin typeface="Poppins"/><a:ea typeface="NanumHuman"/><a:cs typeface="NanumHuman"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`

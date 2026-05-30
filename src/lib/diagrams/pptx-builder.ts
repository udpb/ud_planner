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
export interface PptxSlideSpec {
  kicker?: string
  headline: string
  caption?: string
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

// ── slideSpec 슬라이드 (headline + 도식화(표 단순화) + 근거) ──
function specSlide(spec: PptxSlideSpec, pageNum: number): string {
  let id = 40
  let inner = ''
  // kicker
  if (spec.kicker) {
    inner += textBox({
      id: id++,
      x: px(80),
      y: px(50),
      w: px(1000),
      h: px(34),
      runs: [{ text: spec.kicker, size: 11, color: COLOR.accent, font: FONT_EN, bold: true }],
    })
  }
  // headline
  inner += textBox({
    id: id++,
    x: px(80),
    y: px(86),
    w: px(1120),
    h: px(110),
    runs: [{ text: spec.headline, size: 20, color: COLOR.ink, bold: true }],
  })
  // caption
  if (spec.caption) {
    inner += textBox({
      id: id++,
      x: px(80),
      y: px(196),
      w: px(1120),
      h: px(40),
      runs: [{ text: spec.caption, size: 12, color: COLOR.muted }],
    })
  }
  inner += rect(id++, px(80), px(240), px(1120), px(2), COLOR.line)

  // diagram → 표/텍스트로 단순화
  const diagramY = 260
  const diag = renderDiagramToShapes(spec.diagram, id, diagramY)
  inner += diag.xml
  id = diag.nextId

  // evidence (하단 tint 박스) — 도식 실제 하단 바로 아래에 배치 (페이지당 텍스트 밀도 적응:
  //   짧은 도식이면 근거가 바로 붙고, 긴 도식이어도 footer(648) 위에서 충돌 없이 안착)
  if (Array.isArray(spec.evidence) && spec.evidence.length > 0) {
    const evY = Math.min(Math.max(diag.bottomY + 16, 300), 560)
    inner += rect(id++, px(80), px(evY), px(1120), px(80), COLOR.tint)
    inner += textBox({
      id: id++,
      x: px(95),
      y: px(evY + 6),
      w: px(200),
      h: px(24),
      runs: [{ text: '근거', size: 10, color: COLOR.accent, bold: true }],
    })
    const evRuns = spec.evidence.slice(0, 3).map((e) => ({
      runs: [
        { text: `• ${e.text}`, size: 10, color: COLOR.softInk },
        ...(e.source ? [{ text: ` (${e.source})`, size: 9, color: COLOR.muted }] : []),
      ],
    }))
    inner += textBox({
      id: id++,
      x: px(95),
      y: px(evY + 28),
      w: px(1090),
      h: px(48),
      runs: evRuns,
    })
  }
  inner += footer(id, pageNum)
  return wrapSlide(inner)
}

/**
 * 도식화 패턴 → 단순 도형(표 형태) 변환.
 * PPTX 네이티브 표는 복잡하므로 "행별 텍스트 박스" 로 표현 (편집 가능).
 */
function renderDiagramToShapes(
  diagram: { pattern: string; data: any } | undefined,
  startId: number,
  startY: number,
): { xml: string; nextId: number; bottomY: number } {
  let id = startId
  let xml = ''
  let bottomY = startY // 도식 실제 하단 — evidence/footer 충돌 방지 + 밀도 적응용
  if (!diagram || !diagram.data) return { xml, nextId: id, bottomY }
  const { pattern, data } = diagram

  if (pattern === 'process-flow' && Array.isArray(data.steps)) {
    const steps = data.steps.slice(0, 6)
    const gap = 20
    const totalW = 1120
    const stepW = (totalW - gap * (steps.length - 1)) / steps.length
    steps.forEach((s: any, i: number) => {
      const x = 80 + i * (stepW + gap)
      xml += rect(id++, px(x), px(startY), px(stepW), px(120), i === 0 ? COLOR.accentTint : COLOR.tint)
      xml += textBox({
        id: id++,
        x: px(x + 8),
        y: px(startY + 8),
        w: px(stepW - 16),
        h: px(104),
        runs: [
          { runs: [{ text: s.num ?? `${i + 1}`, size: 12, color: COLOR.accent, font: FONT_EN, bold: true }] },
          { runs: [{ text: s.label ?? '', size: 13, color: COLOR.ink, bold: true }] },
          ...(s.description ? [{ runs: [{ text: s.description, size: 9, color: COLOR.softInk }] }] : []),
        ],
      })
    })
    bottomY = startY + 120
  } else if (pattern === 'kpi-grid' && Array.isArray(data.kpis)) {
    const cols = data.columns ?? 4
    const gap = 16
    // 페이지당 텍스트량 — 최대 2행(cols*2)만 노출해 evidence/footer 와 충돌 방지
    const kpis = data.kpis.slice(0, cols * 2)
    const cellW = (1120 - gap * (cols - 1)) / cols
    const cellH = 104
    kpis.forEach((k: any, i: number) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = 80 + col * (cellW + gap)
      const y = startY + row * (cellH + gap)
      xml += rect(id++, px(x), px(y), px(cellW), px(cellH), COLOR.tint)
      xml += textBox({
        id: id++,
        x: px(x + 10),
        y: px(y + 8),
        w: px(cellW - 20),
        h: px(cellH - 16),
        runs: [
          { runs: [{ text: k.value ?? '', size: 26, color: COLOR.accent, font: FONT_EN, bold: true }] },
          { runs: [{ text: k.label ?? '', size: 12, color: COLOR.ink, bold: true }] },
          ...(k.sublabel ? [{ runs: [{ text: k.sublabel, size: 9, color: COLOR.muted }] }] : []),
        ],
      })
    })
    bottomY = startY + Math.ceil(kpis.length / cols) * (cellH + gap)
  } else if (pattern === 'comparison-table' && Array.isArray(data.rows)) {
    const rows = data.rows.slice(0, 6)
    const colDim = 280, colL = 420, colR = 420
    const rowH = 40
    // header
    xml += rect(id++, px(80), px(startY), px(colDim), px(rowH), COLOR.ink)
    xml += rect(id++, px(80 + colDim), px(startY), px(colL), px(rowH), COLOR.ink)
    xml += rect(id++, px(80 + colDim + colL), px(startY), px(colR), px(rowH), COLOR.accent)
    xml += textBox({ id: id++, x: px(90), y: px(startY + 8), w: px(colDim - 20), h: px(rowH - 12), runs: [{ text: '구분', size: 11, color: COLOR.white, bold: true }] })
    xml += textBox({ id: id++, x: px(90 + colDim), y: px(startY + 8), w: px(colL - 20), h: px(rowH - 12), runs: [{ text: data.leftLabel ?? '기존', size: 11, color: COLOR.white, bold: true }] })
    xml += textBox({ id: id++, x: px(90 + colDim + colL), y: px(startY + 8), w: px(colR - 20), h: px(rowH - 12), runs: [{ text: data.rightLabel ?? '언더독스', size: 11, color: COLOR.white, bold: true }] })
    rows.forEach((r: any, i: number) => {
      const y = startY + rowH + i * rowH
      const rightFill = r.advantageOnRight ? COLOR.accentTint : COLOR.paper
      xml += rect(id++, px(80), px(y), px(colDim), px(rowH), COLOR.tint)
      xml += rect(id++, px(80 + colDim), px(y), px(colL), px(rowH), COLOR.paper)
      xml += rect(id++, px(80 + colDim + colL), px(y), px(colR), px(rowH), rightFill)
      xml += textBox({ id: id++, x: px(90), y: px(y + 8), w: px(colDim - 20), h: px(rowH - 12), runs: [{ text: r.dim ?? '', size: 10, color: COLOR.ink, bold: true }] })
      xml += textBox({ id: id++, x: px(90 + colDim), y: px(y + 8), w: px(colL - 20), h: px(rowH - 12), runs: [{ text: r.left ?? '', size: 10, color: COLOR.softInk }] })
      xml += textBox({ id: id++, x: px(90 + colDim + colL), y: px(y + 8), w: px(colR - 20), h: px(rowH - 12), runs: [{ text: r.right ?? '', size: 10, color: COLOR.ink, bold: !!r.advantageOnRight }] })
    })
    bottomY = startY + rowH * (1 + rows.length)
  } else if (pattern === 'architecture-stack' && Array.isArray(data.layers)) {
    const layers = data.layers.slice(0, 5)
    const rowH = 52, gap = 6
    layers.forEach((l: any, i: number) => {
      const y = startY + i * (rowH + gap)
      xml += rect(id++, px(80), px(y), px(180), px(rowH), COLOR.ink)
      xml += textBox({ id: id++, x: px(90), y: px(y + 8), w: px(160), h: px(rowH - 12), runs: [{ text: l.name ?? '', size: 12, color: COLOR.white, bold: true }], anchor: 'ctr' })
      const items = (l.items ?? []).slice(0, 4)
      const itemW = (940 - gap * (items.length - 1)) / Math.max(items.length, 1)
      items.forEach((it: string, j: number) => {
        const x = 268 + j * (itemW + gap)
        xml += rect(id++, px(x), px(y), px(itemW), px(rowH), l.accent ? COLOR.accentTint : COLOR.tint)
        xml += textBox({ id: id++, x: px(x + 6), y: px(y + 8), w: px(itemW - 12), h: px(rowH - 12), runs: [{ text: it, size: 9, color: COLOR.ink }], anchor: 'ctr', align: 'ctr' })
      })
    })
    bottomY = startY + (layers.length - 1) * (rowH + gap) + rowH
  } else if (pattern === 'before-after' && (data.before || data.after)) {
    // 좌 Before(tint) → 화살표(accent) → 우 After(accentTint)
    const boxH = 200
    const drawBA = (bx: number, fill: string, header: string, hColor: string, node: any) => {
      let s = rect(id++, px(bx), px(startY), px(480), px(boxH), fill)
      s += textBox({ id: id++, x: px(bx + 16), y: px(startY + 14), w: px(448), h: px(28), runs: [{ text: header, size: 11, color: hColor, font: FONT_EN, bold: true }] })
      const metrics: string[] = Array.isArray(node?.metrics) ? node.metrics.slice(0, 4) : []
      s += textBox({
        id: id++, x: px(bx + 16), y: px(startY + 46), w: px(448), h: px(boxH - 60),
        runs: [
          { runs: [{ text: node?.label ?? '', size: 15, color: COLOR.ink, bold: true }] },
          ...metrics.map((m) => ({ runs: [{ text: `• ${m}`, size: 11, color: hColor === COLOR.accent ? COLOR.accent : COLOR.softInk }] })),
        ],
      })
      return s
    }
    xml += drawBA(80, COLOR.tint, 'BEFORE', COLOR.muted, data.before)
    xml += textBox({ id: id++, x: px(560), y: px(startY + 70), w: px(80), h: px(60), runs: [{ text: '→', size: 40, color: COLOR.accent, font: FONT_EN, bold: true }], align: 'ctr', anchor: 'ctr' })
    xml += drawBA(640, COLOR.accentTint, 'AFTER', COLOR.accent, data.after)
    bottomY = startY + boxH
  } else if (pattern === 'timeline' && Array.isArray(data.tracks)) {
    // 간트 — units 헤더 + 트랙별 bar(startIdx~endIdx)
    const units: any[] = Array.isArray(data.units) && data.units.length ? data.units.slice(0, 12) : []
    const tracks = data.tracks.slice(0, 4)
    const labelW = 150
    const unitsX = 80 + labelW
    const nUnits = Math.max(units.length, 1)
    const unitW = (1120 - labelW) / nUnits
    const headerH = 32
    units.forEach((u, i) => {
      const x = unitsX + i * unitW
      xml += rect(id++, px(x), px(startY), px(unitW - 3), px(headerH), COLOR.tint)
      xml += textBox({ id: id++, x: px(x), y: px(startY + 6), w: px(unitW - 3), h: px(headerH - 8), runs: [{ text: String(u), size: 9, color: COLOR.softInk, bold: true }], align: 'ctr', anchor: 'ctr' })
    })
    const rowH = 46, gap = 8
    const rowsY = startY + headerH + 8
    tracks.forEach((t: any, ti: number) => {
      const y = rowsY + ti * (rowH + gap)
      xml += rect(id++, px(80), px(y), px(labelW - 6), px(rowH), COLOR.ink)
      xml += textBox({ id: id++, x: px(86), y: px(y + 6), w: px(labelW - 18), h: px(rowH - 12), runs: [{ text: t.name ?? '', size: 11, color: COLOR.white, bold: true }], anchor: 'ctr' })
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
    // 2x2 — 사분면 + 축 라벨, highlight 사분면은 accent
    const gridX = 150, gridW = 980
    const cellW = gridW / 2, cellH = 110
    const pos: Record<string, [number, number]> = {
      TL: [gridX, startY], TR: [gridX + cellW, startY],
      BL: [gridX, startY + cellH + 4], BR: [gridX + cellW, startY + cellH + 4],
    }
    if (data.axisY?.label) xml += textBox({ id: id++, x: px(80), y: px(startY + cellH - 10), w: px(64), h: px(40), runs: [{ text: data.axisY.label, size: 10, color: COLOR.muted, bold: true }], align: 'ctr' })
    data.quadrants.slice(0, 4).forEach((q: any) => {
      const p = pos[(q.q as string) ?? 'TL'] ?? pos.TL
      xml += rect(id++, px(p[0]), px(p[1]), px(cellW - 4), px(cellH), q.highlight ? COLOR.accentTint : COLOR.tint)
      xml += textBox({
        id: id++, x: px(p[0] + 14), y: px(p[1] + 12), w: px(cellW - 32), h: px(cellH - 20),
        runs: [
          { runs: [{ text: (q.highlight ? '★ ' : '') + (q.label ?? ''), size: 13, color: q.highlight ? COLOR.accent : COLOR.ink, bold: true }] },
          ...(q.description ? [{ runs: [{ text: q.description, size: 10, color: COLOR.softInk }] }] : []),
        ],
      })
    })
    if (data.axisX?.label) xml += textBox({ id: id++, x: px(gridX), y: px(startY + 2 * cellH + 12), w: px(gridW), h: px(24), runs: [{ text: data.axisX.label, size: 10, color: COLOR.muted, bold: true }], align: 'ctr' })
    bottomY = startY + 2 * cellH + 40
  } else if (pattern === 'hierarchy-tree' && data.root) {
    // 루트 박스(ink) → 자식 박스(tint) 1단, 연결선은 가는 rect
    const rootW = 320, rootX = 80 + (1120 - rootW) / 2, rootH = 54
    xml += rect(id++, px(rootX), px(startY), px(rootW), px(rootH), COLOR.ink)
    xml += textBox({
      id: id++, x: px(rootX + 10), y: px(startY + 8), w: px(rootW - 20), h: px(rootH - 12),
      runs: [
        { runs: [{ text: data.root.label ?? '', size: 13, color: COLOR.white, bold: true }] },
        ...(data.root.sublabel ? [{ runs: [{ text: data.root.sublabel, size: 9, color: COLOR.line }] }] : []),
      ], align: 'ctr', anchor: 'ctr',
    })
    const children: any[] = Array.isArray(data.children) ? data.children.slice(0, 4) : []
    if (children.length) {
      const gap = 20
      const childW = (1120 - gap * (children.length - 1)) / children.length
      const childY = startY + rootH + 50, childH = 64
      const rootCx = rootX + rootW / 2
      xml += rect(id++, px(rootCx - 1), px(startY + rootH), px(2), px(28), COLOR.muted)
      const firstCx = 80 + childW / 2
      const lastCx = 80 + (children.length - 1) * (childW + gap) + childW / 2
      xml += rect(id++, px(firstCx), px(startY + rootH + 26), px(Math.max(lastCx - firstCx, 2)), px(2), COLOR.muted)
      children.forEach((c, i) => {
        const cx = 80 + i * (childW + gap)
        const ccx = cx + childW / 2
        xml += rect(id++, px(ccx - 1), px(startY + rootH + 26), px(2), px(24), COLOR.muted)
        xml += rect(id++, px(cx), px(childY), px(childW), px(childH), COLOR.tint)
        const gkids: string[] = Array.isArray(c.children) ? c.children.map((g: any) => g.label).filter(Boolean).slice(0, 2) : []
        xml += textBox({
          id: id++, x: px(cx + 8), y: px(childY + 8), w: px(childW - 16), h: px(childH - 12),
          runs: [
            { runs: [{ text: c.label ?? '', size: 11, color: COLOR.ink, bold: true }] },
            ...(c.sublabel ? [{ runs: [{ text: c.sublabel, size: 9, color: COLOR.muted }] }] : []),
            ...(gkids.length ? [{ runs: [{ text: gkids.join(' · '), size: 8, color: COLOR.softInk }] }] : []),
          ], align: 'ctr', anchor: 'ctr',
        })
      })
    }
    bottomY = startY + (children.length ? rootH + 50 + 64 : rootH)
  } else {
    // 알 수 없는/malformed 패턴 (text-only 등) → 데이터 요약 텍스트 (안전망)
    const summary = summarizeDiagramData(pattern, data)
    if (summary.length > 0) {
      xml += textBox({
        id: id++,
        x: px(80),
        y: px(startY),
        w: px(1120),
        h: px(260),
        runs: summary.map((line) => ({ runs: [{ text: line, size: 12, color: COLOR.softInk }] })),
      })
      bottomY = startY + Math.min(260, summary.length * 24 + 16)
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

/**
 * PPTX Shape Extractor — Phase N1 (2026-05-29)
 *
 * .pptx 바이너리에서 각 슬라이드의 도형·이미지·텍스트 박스 직접 파싱.
 *
 * PPTX 구조:
 *   - .pptx = ZIP
 *   - ppt/slides/slideN.xml = 각 슬라이드 (XML)
 *   - 도형: <p:sp> · 이미지: <p:pic> · 표: <p:graphicFrame>
 *   - 위치: <a:xfrm><a:off x="EMU" y="EMU"/><a:ext cx="EMU" cy="EMU"/></a:xfrm>
 *     · 1 inch = 914,400 EMU
 *     · 슬라이드 16:9 기본: 12,192,000 × 6,858,000 EMU (13.33 × 7.5 inch)
 *
 * 사용:
 *   const slides = await extractPptxSlides(buffer)
 *   slides[0].shapes // → 도형 배열
 */

import JSZip from 'jszip'

// 슬라이드 좌표계 (16:9 기준)
export const SLIDE_W_EMU = 12_192_000
export const SLIDE_H_EMU = 6_858_000

export interface ShapePosition {
  x: number // 0~1 정규화 (EMU / SLIDE_W_EMU)
  y: number
  w: number
  h: number
}

export interface ExtractedShape {
  type: 'shape' | 'pic' | 'table' | 'group'
  /** 도형 형태 (rectangle / oval / arrow / etc.) — PPT prstGeom prst 속성 */
  geomPreset?: string
  position: ShapePosition
  /** 텍스트 박스 안 텍스트 (있으면) */
  text?: string
  /** 도형 fill 색상 (sRGB hex 없이 6자리) */
  fillColor?: string
  /** 외곽선 색상 */
  strokeColor?: string
  /** 텍스트 색상 (첫번째 run) */
  textColor?: string
  /** 텍스트 폰트 크기 (pt, 100 단위 → 정수로 변환) */
  fontSize?: number
  /** placeholder 타입 (title/body/sldNum/...) */
  placeholderType?: string
  /** 자식 (group 일 때) */
  children?: ExtractedShape[]
}

export interface ExtractedSlide {
  slideNumber: number
  shapes: ExtractedShape[]
}

/**
 * PPTX 버퍼에서 각 슬라이드의 도형 추출.
 */
export async function extractPptxSlides(buffer: Buffer): Promise<ExtractedSlide[]> {
  const zip = await JSZip.loadAsync(buffer)
  const slideEntries: { num: number; path: string }[] = []
  zip.forEach((path) => {
    const m = path.match(/^ppt\/slides\/slide(\d+)\.xml$/)
    if (m) slideEntries.push({ num: parseInt(m[1], 10), path })
  })
  slideEntries.sort((a, b) => a.num - b.num)

  const slides: ExtractedSlide[] = []
  for (const { num, path } of slideEntries) {
    const file = zip.file(path)
    if (!file) continue
    const xml = await file.async('text')
    const shapes = parseSlideXml(xml)
    slides.push({ slideNumber: num, shapes })
  }
  return slides
}

/**
 * 단일 슬라이드 XML 을 받아 도형 배열 반환.
 * 정규식 기반 파싱 — 95%+ 케이스에서 정확.
 */
export function parseSlideXml(xml: string): ExtractedShape[] {
  const shapes: ExtractedShape[] = []

  // 1. <p:sp>...</p:sp> (text box / autoshape)
  const spRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g
  let m: RegExpExecArray | null
  while ((m = spRegex.exec(xml)) !== null) {
    const inner = m[1]
    const shape = parseShapeBlock(inner, 'shape')
    if (shape) shapes.push(shape)
  }

  // 2. <p:pic>...</p:pic> (이미지)
  const picRegex = /<p:pic>([\s\S]*?)<\/p:pic>/g
  while ((m = picRegex.exec(xml)) !== null) {
    const inner = m[1]
    const shape = parseShapeBlock(inner, 'pic')
    if (shape) shapes.push(shape)
  }

  // 3. <p:graphicFrame>...</p:graphicFrame> (표·차트)
  const gfRegex = /<p:graphicFrame>([\s\S]*?)<\/p:graphicFrame>/g
  while ((m = gfRegex.exec(xml)) !== null) {
    const inner = m[1]
    const shape = parseShapeBlock(inner, 'table')
    if (shape) shapes.push(shape)
  }

  return shapes
}

function parseShapeBlock(
  inner: string,
  type: ExtractedShape['type'],
): ExtractedShape | null {
  // 위치 — <a:xfrm><a:off x= y= /><a:ext cx= cy= /></a:xfrm>
  const xfrmMatch = inner.match(
    /<a:xfrm[^>]*>\s*<a:off x="(\d+)" y="(\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/,
  )

  // 좌표 없으면 placeholder 등 — slide layout 에서 상속받음
  // 일단 절대 좌표 있는 것만 추출
  const position: ShapePosition = xfrmMatch
    ? {
        x: parseInt(xfrmMatch[1], 10) / SLIDE_W_EMU,
        y: parseInt(xfrmMatch[2], 10) / SLIDE_H_EMU,
        w: parseInt(xfrmMatch[3], 10) / SLIDE_W_EMU,
        h: parseInt(xfrmMatch[4], 10) / SLIDE_H_EMU,
      }
    : { x: 0, y: 0, w: 1, h: 1 } // unknown

  // geomPreset — <a:prstGeom prst="rect"> 등
  const geomMatch = inner.match(/<a:prstGeom\s+prst="([^"]+)"/)
  const geomPreset = geomMatch?.[1]

  // placeholder type
  const phMatch = inner.match(/<p:ph\s+(?:[^>]*\s)?type="([^"]+)"/)
  const placeholderType = phMatch?.[1]

  // fill 색상 — <a:solidFill><a:srgbClr val="HEX"/></a:solidFill>
  const fillMatch = inner.match(/<a:solidFill>\s*<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/)
  const fillColor = fillMatch?.[1]

  // 외곽선 색상 — <a:ln>...<a:solidFill><a:srgbClr val=...>
  const lnMatch = inner.match(
    /<a:ln[^>]*>[\s\S]*?<a:solidFill>\s*<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/,
  )
  const strokeColor = lnMatch?.[1]

  // 텍스트 — 모든 <a:t>...</a:t> 합쳐서
  const textRuns: string[] = []
  const tRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g
  let tMatch: RegExpExecArray | null
  while ((tMatch = tRegex.exec(inner)) !== null) {
    if (tMatch[1].trim().length > 0) textRuns.push(tMatch[1])
  }
  const text = textRuns.join('').trim() || undefined

  // 첫번째 run 의 색상 + 크기 — <a:rPr sz="2400"> · <a:solidFill><a:srgbClr val="HEX"/>
  const firstRunMatch = inner.match(/<a:rPr[^>]*sz="(\d+)"/)
  const fontSize = firstRunMatch ? parseInt(firstRunMatch[1], 10) / 100 : undefined

  // 텍스트 색상 — 첫 runProperties 안의 색상
  const txtColorMatch = inner.match(
    /<a:rPr[\s\S]*?<a:solidFill>\s*<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/,
  )
  const textColor = txtColorMatch?.[1]

  // 의미 있는 도형이려면 텍스트 OR fill 색상 OR geomPreset 있어야 함
  // (단순 빈 placeholder 제외)
  if (!text && !fillColor && !geomPreset && type === 'shape') return null

  return {
    type,
    geomPreset,
    position,
    text,
    fillColor,
    strokeColor,
    textColor,
    fontSize,
    placeholderType,
  }
}

/**
 * 슬라이드 도형들을 공간 순서 (위→아래, 좌→우) 로 정렬해 읽기 가능한 텍스트로 재구성.
 * LLM 이 "이 슬라이드가 무슨 메시지를 어떤 구조로 전달하는지" 분석할 수 있게 함. (N2)
 */
export interface ReconstructedSlide {
  slideNumber: number
  title: string | null
  blocks: { zone: string; text: string; isNumeric: boolean }[]
  shapeStats: {
    total: number
    withText: number
    geomCounts: Record<string, number>
    accentColored: number
  }
}

export function reconstructSlide(slide: ExtractedSlide): ReconstructedSlide {
  const textShapes = slide.shapes.filter((s) => s.text && s.text.trim().length > 0)

  // 공간 순서 정렬 — y 우선, 같은 행이면 x
  const sorted = [...textShapes].sort((a, b) => {
    const dy = a.position.y - b.position.y
    if (Math.abs(dy) > 0.05) return dy
    return a.position.x - b.position.x
  })

  // title 후보 — 상단 (y < 0.35) + 큰 폰트 OR placeholder=title
  let title: string | null = null
  let bestTitleScore = -1
  for (const s of textShapes) {
    if (!s.text) continue
    const isTitlePh = s.placeholderType === 'title'
    const topness = 1 - s.position.y
    const fontBonus = (s.fontSize ?? 18) / 40
    const score = (isTitlePh ? 2 : 0) + topness + fontBonus
    if (s.position.y < 0.35 && s.text.length >= 4 && s.text.length <= 80 && score > bestTitleScore) {
      bestTitleScore = score
      title = s.text
    }
  }

  const zoneOf = (y: number, x: number): string => {
    const v = y < 0.33 ? '상' : y < 0.66 ? '중' : '하'
    const h = x < 0.4 ? '좌' : x < 0.7 ? '중' : '우'
    return `${v}${h}`
  }

  const blocks = sorted
    .filter((s) => s.text !== title)
    .map((s) => ({
      zone: zoneOf(s.position.y, s.position.x),
      text: s.text!.slice(0, 300),
      isNumeric: /\d{2,}|\d+%|\d+억|\d+만|\d+명|\d+건|\d+년/.test(s.text!),
    }))

  const geomCounts: Record<string, number> = {}
  let accentColored = 0
  for (const s of slide.shapes) {
    if (s.geomPreset) geomCounts[s.geomPreset] = (geomCounts[s.geomPreset] ?? 0) + 1
    if (s.fillColor && /^F[0-9A-F]5[0-9A-F]/i.test(s.fillColor)) accentColored++
  }

  return {
    slideNumber: slide.slideNumber,
    title,
    blocks,
    shapeStats: { total: slide.shapes.length, withText: textShapes.length, geomCounts, accentColored },
  }
}

/**
 * 추출 결과 요약 — 디버깅용.
 */
export function summarizeSlide(slide: ExtractedSlide): string {
  const lines: string[] = []
  lines.push(`Slide ${slide.slideNumber}: ${slide.shapes.length} shapes`)
  for (const s of slide.shapes.slice(0, 10)) {
    const pos = `(${(s.position.x * 100).toFixed(0)}%, ${(s.position.y * 100).toFixed(0)}%, ${(s.position.w * 100).toFixed(0)}×${(s.position.h * 100).toFixed(0)})`
    const preview = s.text ? ` "${s.text.slice(0, 40)}"` : ''
    const color = s.fillColor ? ` fill=#${s.fillColor}` : ''
    const geom = s.geomPreset ? ` geom=${s.geomPreset}` : ''
    lines.push(`  - ${s.type}${geom} ${pos}${color}${preview}`)
  }
  return lines.join('\n')
}

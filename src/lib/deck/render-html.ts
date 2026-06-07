/**
 * Deck HTML → 고해상 PDF 렌더 파이프라인 — DECK-1 (ADR-025 Phase 1)
 *
 * 결정론적 오프라인 렌더 (dev 서버·DB·LLM 불필요):
 *   React 슬라이드 → renderToStaticMarkup → 자체완결 HTML
 *   (underdogs-slide.css 원문 인라인 + @font-face 폰트 data URI + 자산 절대 file:// 경로)
 *   → headless chromium(playwright) file:// 로드 → page.pdf() 16:9.
 *
 * 1 슬라이드 = 1 PDF 페이지 (1280×720px, printBackground, margin 0). 잘림/여백 없음.
 *
 * ⚠️ 서버리스/Vercel chromium 패키징은 이 모듈 범위 밖 (DECK-1 발견사항만 보고).
 *    운영 배포 시 @sparticuz/chromium + puppeteer-core 또는 playwright 브라우저 번들 필요.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// 자산 루트 env (DECK-3b-3): 이 모듈은 esbuild 번들로 워커(plain node)에 들어갈 수 있다. 그 경우
// `__dirname` 은 번들 위치(render-worker/)이라 레포 상대 경로가 깨진다. 워커는 public/src/styles 를
// COPY 한 뒤 DECK_ASSETS_DIR(=public) 와 DECK_REPO_ROOT(=레포 루트) 를 env 로 주입한다.
// 미설정 시 기존 동작(레포 public·src/styles) — 하위호환(Next/dev/스크립트 경로 불변).
const REPO_ROOT = process.env.DECK_REPO_ROOT ?? path.resolve(__dirname, '..', '..', '..')
const PUBLIC_DIR = process.env.DECK_ASSETS_DIR ?? path.join(REPO_ROOT, 'public')
const CSS_PATH = path.join(REPO_ROOT, 'src', 'styles', 'underdogs-slide.css')
const FONT_DIR = path.join(PUBLIC_DIR, 'design-kit', 'fonts')

const SLIDE_W = 1280
const SLIDE_H = 720 // 16:9

/** woff2 폰트 → data URI @font-face 블록 (chromium 임베드 보장) */
function buildFontFaces(): string {
  const faces: Array<{ family: string; weight: number; file: string }> = [
    { family: 'NanumHuman', weight: 400, file: 'NanumHuman-Regular.woff2' },
    { family: 'NanumHuman', weight: 700, file: 'NanumHuman-Bold.woff2' },
    { family: 'NanumHuman', weight: 800, file: 'NanumHuman-ExtraBold.woff2' },
    { family: 'PoppinsUD', weight: 400, file: 'Poppins-Regular.woff2' },
    { family: 'PoppinsUD', weight: 500, file: 'Poppins-Medium.woff2' },
    { family: 'PoppinsUD', weight: 600, file: 'Poppins-SemiBold.woff2' },
  ]
  return faces
    .map(({ family, weight, file }) => {
      const p = path.join(FONT_DIR, file)
      if (!fs.existsSync(p)) {
        throw new Error(`[render-html] 폰트 누락: ${p} — 한글/숫자 폰트 임베드 불가`)
      }
      const b64 = fs.readFileSync(p).toString('base64')
      return `@font-face{font-family:'${family}';font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`
    })
    .join('\n')
}

/**
 * CSS 안의 url('/design-kit/...') 같은 절대경로 자산을 file:// 절대경로로 치환.
 * (@font-face 는 buildFontFaces 가 data URI 로 대체하므로 폰트 url 은 제거 대상)
 */
function stripMediaPrint(css: string): string {
  // 기존 underdogs-slide.css 의 @media print {...} 블록은 "브라우저 인쇄(앱 화면)" 전제로
  // body > *:not(.ud-print-only){display:none} 등 슬라이드 외 요소를 숨긴다.
  // page.pdf() 는 print 미디어로 렌더하므로 이 블록이 우리 deck-page 까지 숨겨 빈 PDF 가 된다.
  // 자체완결 덱 HTML 에서는 print 블록을 제거하고, 우리 자체 @page 규칙만 쓴다.
  let out = ''
  let i = 0
  while (i < css.length) {
    const at = css.indexOf('@media print', i)
    if (at === -1) {
      out += css.slice(i)
      break
    }
    out += css.slice(i, at)
    // @media print 의 여는 { 부터 짝 맞는 } 까지 스킵
    const braceOpen = css.indexOf('{', at)
    if (braceOpen === -1) break
    let depth = 1
    let j = braceOpen + 1
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    i = j
  }
  return out
}

function rewriteCssAssetUrls(css: string): string {
  // @media print 블록 제거 (page.pdf 가 print 미디어라 슬라이드를 숨겨버림)
  const noPrint = stripMediaPrint(css)
  // @font-face 블록 전체 제거 (data URI 버전으로 대체)
  const withoutFontFaces = noPrint.replace(/@font-face\s*\{[^}]*\}/g, '')
  // url('/x') | url("/x") | url(/x) → file:// 절대
  return withoutFontFaces.replace(/url\((['"]?)(\/[^)'"]+)\1\)/g, (_m, _q, p) => {
    const abs = path.join(PUBLIC_DIR, p.replace(/^\//, ''))
    return `url('${pathToFileURL(abs).href}')`
  })
}

/** HTML 마크업 안의 src="/design-kit/..." 절대경로를 file:// 로 치환 */
function rewriteHtmlAssetUrls(html: string): string {
  return html.replace(/(src|href)=(['"])(\/[^'"]+)\2/g, (_m, attr, q, p) => {
    const abs = path.join(PUBLIC_DIR, p.replace(/^\//, ''))
    return `${attr}=${q}${pathToFileURL(abs).href}${q}`
  })
}

/** 슬라이드 React 엘리먼트 배열 → 자체완결 HTML 문서 문자열 */
export function buildDeckHtml(slides: ReactElement[]): string {
  const css = rewriteCssAssetUrls(fs.readFileSync(CSS_PATH, 'utf-8'))
  const fontFaces = buildFontFaces()

  const pages = slides
    .map((slide) => {
      const markup = rewriteHtmlAssetUrls(renderToStaticMarkup(slide))
      return `<section class="deck-page">${markup}</section>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<style>
${fontFaces}
*{margin:0;padding:0;}
html,body{background:#fff;font-family:'NanumHuman',system-ui,sans-serif;}
@page{size:${SLIDE_W}px ${SLIDE_H}px;margin:0;}
.deck-page{
  width:${SLIDE_W}px;height:${SLIDE_H}px;
  overflow:hidden;position:relative;
  page-break-after:always;break-after:page;
}
.deck-page:last-child{page-break-after:auto;break-after:auto;}
/* 슬라이드 캔버스는 페이지를 꽉 채운다 (aspect-ratio 대신 고정 px) */
.deck-page .ud-slide-canvas{
  width:${SLIDE_W}px !important;height:${SLIDE_H}px !important;
  aspect-ratio:auto !important;
}
${css}
</style>
</head>
<body>
${pages}
</body>
</html>`
}

export interface RenderDeckOptions {
  /** PNG 스냅샷 출력 경로 (1페이지) — 생략 시 스냅샷 없음 */
  snapshotPath?: string
  /** 전 페이지 PNG 스냅샷 디렉토리 — 지정 시 p1.png … pN.png 출력 (DECK-2 육안 검증) */
  snapshotDir?: string
  /** 디버그용 자체완결 HTML 저장 경로 */
  htmlDebugPath?: string
  /** 슬라이드별 밀도 측정 (블록 수·근거 밴드·dead-space) 수집 여부 (DECK-2) */
  collectMetrics?: boolean
}

/** 슬라이드별 밀도 측정 (DECK-2 합격선 — 결정론적, 렌더된 DOM 기준) */
export interface SlideMetric {
  /** 1-based 페이지 번호 */
  index: number
  /** [data-block] 정보 블록 수 */
  blocks: number
  /** [data-evidence-band] 근거 밴드 존재 */
  hasEvidenceBand: boolean
  /** 표지/디바이더 등 비본문 슬라이드 여부 (cover/section-divider) */
  isCover: boolean
  /**
   * dead-space 비율 (0~1) — main 영역(헤더 하단~footer 위) 중 컨텐츠가 덮지 못한 빈 면적.
   * main 의 clientHeight 대비 자식 컨텐츠가 실제로 차지한 최대 하단(bottom) 까지의 빈 영역.
   */
  deadSpace: number
}

/**
 * 슬라이드 → 고해상 PDF. 1 슬라이드 = 1 PDF 페이지 (16:9).
 * playwright(설치돼 있어야 함, npm run e2e:install 로 chromium 설치)로 file:// 로드 후 page.pdf().
 */
export async function renderDeckToPdf(
  slides: ReactElement[],
  outPath: string,
  options: RenderDeckOptions = {},
): Promise<{ pages: number; bytes: number; html: string; metrics: SlideMetric[] }> {
  if (slides.length === 0) throw new Error('[render-html] 빈 슬라이드 배열')

  const html = buildDeckHtml(slides)

  // 자체완결 HTML 을 temp 파일로 (file:// 로드)
  const htmlPath = options.htmlDebugPath ?? path.join(os.tmpdir(), `ud-deck-${Date.now()}.html`)
  fs.writeFileSync(htmlPath, html, 'utf-8')

  // playwright 동적 import (devDependency 미설치 환경에서 모듈 로드 자체 실패 방지)
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: SLIDE_W, height: SLIDE_H }, deviceScaleFactor: 2 })
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
    // 폰트 로드 완료 대기 (data URI 라 즉시이지만 안전하게)
    await page.evaluate(() => document.fonts?.ready)

    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    // 타일링 방식: body 를 N*720px 1열로 쌓고 page.pdf 의 width/height 로 슬라이스.
    // 각 .deck-page 에 break-after:page 가 페이지 경계를 720px 마다 강제 → 1슬라이드=1페이지.
    await page.pdf({
      path: outPath,
      width: `${SLIDE_W}px`,
      height: `${SLIDE_H}px`,
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })

    // 1페이지 PNG 스냅샷
    if (options.snapshotPath) {
      const first = page.locator('.deck-page').first()
      fs.mkdirSync(path.dirname(options.snapshotPath), { recursive: true })
      await first.screenshot({ path: options.snapshotPath })
    }

    // 전 페이지 PNG 스냅샷 (DECK-2 육안 검증)
    if (options.snapshotDir) {
      fs.mkdirSync(options.snapshotDir, { recursive: true })
      const all = page.locator('.deck-page')
      const count = await all.count()
      for (let i = 0; i < count; i++) {
        await all.nth(i).screenshot({ path: path.join(options.snapshotDir, `p${i + 1}.png`) })
      }
    }

    // 슬라이드별 밀도 측정 (DECK-2) — 렌더된 DOM 기준 결정론적
    let metrics: SlideMetric[] = []
    if (options.collectMetrics) {
      metrics = await page.evaluate(() => {
        const pages = Array.from(document.querySelectorAll('.deck-page'))
        return pages.map((pg, idx) => {
          const canvas = pg.querySelector('.ud-slide-canvas')
          const isCover = !!canvas && (canvas.classList.contains('ud-cover') || canvas.classList.contains('ud-section-divider'))
          const blocks = pg.querySelectorAll('[data-block]').length
          const hasEvidenceBand = !!pg.querySelector('[data-evidence-band]')

          // dead-space: main 영역(헤더 하단~footer 위)을 격자(28×16)로 나눠 "디자인된 표면"이 덮지
          // 못한 셀 비율 = 디자이너가 채워야 할 큰 공백. "디자인된 표면" =
          //   (a) 정보 블록([data-block]) · 근거 밴드([data-evidence-band])
          //   (b) 가시 테두리/비투명 배경을 가진 박스 (카드·매트릭스 셀·헤더 띠)
          //   (c) 텍스트/이미지/아이콘 leaf
          // → 카드·셀 내부 줄간격은 점유로 보되, p2 중앙 공백처럼 진짜 빈 영역은 잡아낸다.
          const main = pg.querySelector('.ud-slide-inner > main') as HTMLElement | null
          let deadSpace = 0
          if (main) {
            const mainRect = main.getBoundingClientRect()
            if (mainRect.width > 0 && mainRect.height > 0) {
              const COLS = 28
              const ROWS = 16
              const occupied = new Uint8Array(COLS * ROWS)
              const cellW = mainRect.width / COLS
              const cellH = mainRect.height / ROWS
              const all = main.querySelectorAll('*')
              for (let k = 0; k < all.length; k++) {
                const el = all[k] as HTMLElement
                const tag = el.tagName.toLowerCase()
                const isBlock = el.hasAttribute('data-block') || el.hasAttribute('data-evidence-band')
                const isLeafText = el.children.length === 0 && (el.textContent || '').trim().length > 0
                const isMedia = tag === 'img' || tag === 'svg'
                let isDesignedBox = false
                if (!isBlock && !isLeafText && !isMedia) {
                  const cs = getComputedStyle(el)
                  const hasBorder =
                    parseFloat(cs.borderTopWidth) + parseFloat(cs.borderRightWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) > 0
                  const bg = cs.backgroundColor
                  const hasBg = !!bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
                  isDesignedBox = hasBorder || hasBg
                }
                if (!(isBlock || isLeafText || isMedia || isDesignedBox)) continue
                const r = el.getBoundingClientRect()
                if (r.width <= 0 || r.height <= 0) continue
                const x0 = Math.max(0, Math.floor((r.left - mainRect.left) / cellW))
                const x1 = Math.min(COLS - 1, Math.floor((r.right - mainRect.left - 0.01) / cellW))
                const y0 = Math.max(0, Math.floor((r.top - mainRect.top) / cellH))
                const y1 = Math.min(ROWS - 1, Math.floor((r.bottom - mainRect.top - 0.01) / cellH))
                for (let yy = y0; yy <= y1; yy++) {
                  for (let xx = x0; xx <= x1; xx++) occupied[yy * COLS + xx] = 1
                }
              }
              let filled = 0
              for (let k = 0; k < occupied.length; k++) filled += occupied[k]
              deadSpace = 1 - filled / occupied.length
            }
          }
          return { index: idx + 1, blocks, hasEvidenceBand, isCover, deadSpace: Math.round(deadSpace * 1000) / 1000 }
        })
      })
    }

    const bytes = fs.statSync(outPath).size
    return { pages: slides.length, bytes, html, metrics }
  } finally {
    await browser.close()
    if (!options.htmlDebugPath) {
      try {
        fs.unlinkSync(htmlPath)
      } catch {
        /* ignore */
      }
    }
  }
}

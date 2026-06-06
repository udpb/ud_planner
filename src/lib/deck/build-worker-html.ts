/**
 * build-worker-html — 워커 전송용 자체완결 덱 HTML 빌더 (DECK-3b-2, ADR-025 Phase 3b)
 *
 * `buildDeckHtml`(DECK-1) 은 슬라이드 React → 자체완결 HTML 을 만들되, public/ 의 이미지/로고
 * 자산을 **`file://` 절대경로**로 남긴다(로컬 chromium 이 file:// 로드 가능 전제). 그러나 렌더
 * **워커는 파일시스템 접근이 0**(별도 컨테이너 — ADR-025 §1, render-worker/server.mjs 는 setContent
 * 로 HTML 만 받음). 따라서 워커로 보내기 전 **모든 `file://` 참조를 data URI 로 인라인**해야 한다.
 *
 * 인라인 대상 (메인이 render-worker/fixtures/sample-deck.html 만들 때 검증한 동일 정규식):
 *   - HTML 속성:  (src|href|xlink:href)="file://...(png|svg|jpg|...)"
 *   - CSS url():  url(file://...)
 *  → 해당 file:// URL 을 fs 로 읽어 base64 data URI 로 치환. (폰트는 buildDeckHtml 이 이미 인라인.)
 *
 * 보장: 반환 HTML 에 `file://` 0 개. (검증: scripts/_check-deck-pdf.ts 가 단언.)
 *
 * ⚠️ `renderToStaticMarkup`(buildDeckHtml 내부)을 호출하므로 **Node 런타임에서만** 동작한다.
 *    PDF 라우트는 `export const runtime = 'nodejs'` 를 명시한다.
 */
import 'server-only'

import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactElement } from 'react'

import { buildDeckHtml } from './render-html'

/** 확장자 → data URI MIME 타입. (덱 자산: 로고 svg · 샘플 png/jpg.) */
const MIME_BY_EXT: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

function extOf(p: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(p)
  return m ? `.${m[1].toLowerCase()}` : ''
}

/**
 * file:// URL → data URI. 파일이 없거나 읽기 실패 시 원본 file:// 를 그대로 반환하지 않고
 * 빈 data URI(투명 1px) 로 degrade — 워커에 file:// 가 새어나가 깨지는 것을 막기 위함.
 * (그러나 정상 경로에서는 모든 자산이 존재하므로 도달하지 않음. 누락은 경고 로그.)
 */
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function fileUrlToDataUri(fileUrl: string): string {
  try {
    const abs = fileURLToPath(fileUrl)
    const ext = extOf(abs)
    const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
    const b64 = fs.readFileSync(abs).toString('base64')
    return `data:${mime};base64,${b64}`
  } catch (e) {
    console.warn(
      '[build-worker-html] 자산 인라인 실패 → 투명 placeholder:',
      fileUrl,
      e instanceof Error ? e.message : e,
    )
    return TRANSPARENT_PNG
  }
}

/**
 * HTML 문자열 안의 모든 file:// 참조(속성 + CSS url())를 data URI 로 인라인.
 * 메인이 fixture 만들 때 검증한 정규식과 동일.
 */
export function inlineFileUrls(html: string): string {
  // 1) HTML/SVG 속성: src|href|xlink:href="file://..."
  let out = html.replace(
    /(src|href|xlink:href)=(["'])(file:\/\/[^"']+)\2/g,
    (_m, attr: string, q: string, url: string) => `${attr}=${q}${fileUrlToDataUri(url)}${q}`,
  )
  // 2) CSS url(file://...) — 따옴표 유무 모두
  out = out.replace(
    /url\((["']?)(file:\/\/[^)"']+)\1\)/g,
    (_m, q: string, url: string) => `url(${q}${fileUrlToDataUri(url)}${q})`,
  )
  return out
}

/**
 * 슬라이드 React 엘리먼트 배열 → **워커 전송용** 자체완결 HTML.
 * buildDeckHtml(폰트 인라인 + file:// 자산경로) → inlineFileUrls(자산 data URI 인라인).
 * 결과 HTML 은 file:// 0 개 — 파일시스템 없는 워커에서 안전.
 */
export function buildWorkerHtml(slides: ReactElement[]): string {
  return inlineFileUrls(buildDeckHtml(slides))
}

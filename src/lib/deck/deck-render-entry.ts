/**
 * deck-render-entry — esbuild 번들 엔트리: DeckSpec(JSON) → 자체완결 HTML (DECK-3b-3, ADR-025 Phase 3b)
 *
 * ⚠️⚠️ 이 파일과 그 번들(render-worker/deck-render.bundle.mjs)은 **렌더 워커 전용**이다.
 *      `src/app/**`·클라이언트 컴포넌트에서 **절대 import 금지** — `react-dom/server`(buildDeckHtml 경유)
 *      가 다시 Next 앱 번들에 들어가면 App Router 가 전체 빌드를 차단한다(라이브 E2E 발견 2026-06-07).
 *      앱은 DeckSpec(JSON)만 워커로 POST 하고(worker-client.ts `renderDeckViaWorker`), HTML 생성은
 *      오직 워커가 이 번들로 수행한다. (ADR-025 §1 — 렌더는 워커에서만.)
 *
 * 따라서 `build-worker-html.ts` 와 달리 **`'server-only'` 를 import 하지 않는다**(번들 가능해야 함).
 * 대신 위 주석 + Dockerfile + grep 검증으로 앱 import 0 를 보장한다.
 *
 * 파이프라인(build-worker-html.ts 와 동일):
 *   safeParseDeckSpec(spec) → deckSpecToElements(render-spec) → buildDeckHtml(render-html)
 *   → file:// 이미지(`src|href|xlink:href` 속성 + CSS `url(file://...)`) 를 fs 로 읽어 data URI 인라인.
 * 결과 HTML 에 `file://` 0 개 — 파일시스템 없는 워커 setContent 에서 안전. (폰트는 buildDeckHtml 이 이미 인라인.)
 */
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { buildDeckHtml } from './render-html'
import { deckSpecToElements } from './render-spec'
import { safeParseDeckSpec } from './spec'

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

/** 자산 인라인 실패 시 투명 1px 로 degrade — file:// 가 워커로 새어나가는 것을 막는다. */
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
      '[deck-render-entry] 자산 인라인 실패 → 투명 placeholder:',
      fileUrl,
      e instanceof Error ? e.message : e,
    )
    return TRANSPARENT_PNG
  }
}

/**
 * HTML 문자열 안의 모든 file:// 참조(속성 + CSS url())를 data URI 로 인라인.
 * build-worker-html.ts 의 정규식과 동일(드리프트 방지 위해 의도적으로 동일 유지).
 */
function inlineFileUrls(html: string): string {
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
 * DeckSpec(JSON, 미검증 unknown) → 워커 전송 불필요한 **자체완결 HTML** (file:// 0).
 * 잘못된 DeckSpec 은 safeParseDeckSpec 실패 메시지를 담아 throw(워커가 400 매핑).
 *
 * @throws {Error} DeckSpec 검증 실패 시. message 에 zod 이슈 경로·사유 포함.
 */
export function deckSpecToSelfContainedHtml(deckSpec: unknown): string {
  const parsed = safeParseDeckSpec(deckSpec)
  if (!parsed.ok) {
    throw Object.assign(new Error(`invalid DeckSpec: ${parsed.error}`), { statusCode: 400 })
  }
  const elements = deckSpecToElements(parsed.deck)
  const html = buildDeckHtml(elements)
  return inlineFileUrls(html)
}

// build-deck-render — esbuild bundle of the deck render code (DECK-3b-3, ADR-025 Phase 3b).
//
// WHY: Next 16 App Router HARD-BLOCKS importing `react-dom/server` in the app bundle, so
// DeckSpec→HTML (renderToStaticMarkup) cannot run inside the Next route. The render moved to
// the WORKER. This script bundles `src/lib/deck/deck-render-entry.ts` (+ its React/SSR deps)
// into a single Next-independent ESM file the plain-node worker can dynamic-import.
//
// Output: render-worker/deck-render.bundle.mjs  (COMMITTED — worker imports it without a build).
//   exports: deckSpecToSelfContainedHtml(deckSpec: unknown): string
//
// Run: node render-worker/build-deck-render.mjs   (also runs in the Dockerfile build stage)
//
// NOTE: the bundle reads CSS/fonts/images from disk at RUNTIME (not bundled), resolved via
//   DECK_REPO_ROOT (src/styles) + DECK_ASSETS_DIR (public). See render-html.ts + Dockerfile.

import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Resolve esbuild: prefer render-worker's own devDependency (Docker `npm install`), but fall back
// to any esbuild already resolvable on this machine (e.g. a global tool) so the bundle can be built
// without a dedicated install during local dev. Pin the devDependency in package.json for CI/Docker.
const require = createRequire(import.meta.url)
async function loadEsbuild() {
  const candidates = [
    'esbuild', // render-worker/node_modules (devDependency) — the reproducible path
  ]
  for (const id of candidates) {
    try {
      const mod = await import(id)
      return mod.build ?? mod.default?.build
    } catch {
      /* try next */
    }
  }
  // Last resort: search node's global/user module paths (incl. NODE_PATH) for an installed esbuild.
  const searchPaths = [
    ...(require.resolve.paths('esbuild') ?? []),
    ...((process.env.NODE_PATH ?? '').split(process.platform === 'win32' ? ';' : ':').filter(Boolean)),
  ]
  try {
    const p = require.resolve('esbuild', { paths: searchPaths })
    const mod = await import(pathToFileURL(p).href)
    return mod.build ?? mod.default?.build
  } catch {
    throw new Error(
      "[build-deck-render] esbuild not found. Run `npm install` in render-worker (devDependency esbuild) before building.",
    )
  }
}
const build = await loadEsbuild()
const REPO_ROOT = resolve(__dirname, '..') // render-worker/ -> repo root
const SRC_DIR = join(REPO_ROOT, 'src')
const ENTRY = join(SRC_DIR, 'lib', 'deck', 'deck-render-entry.ts')
const OUT = join(__dirname, 'deck-render.bundle.mjs')

await build({
  entryPoints: [ENTRY],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // Resolve the app's `@/` path alias to <repo>/src (matches tsconfig.json paths).
  alias: { '@': SRC_DIR },
  // Bundle React + react-dom/server + lucide-react + zod INTO the output (worker has no node_modules
  // for these). node builtins (fs, path, url) stay external (platform:'node').
  // `playwright` is referenced only by render-html's `renderDeckToPdf` (a dynamic import never reached
  // by this entry — we only use buildDeckHtml). Mark it external so esbuild doesn't try to bundle the
  // whole browser driver (which pulls unresolved chromium-bidi deps). The worker never calls that path.
  external: ['playwright', 'playwright-core', 'chromium-bidi'],
  // `process.env.NODE_ENV` must be defined so react-dom/server picks the prod build.
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'text' }, // safety: any incidental css import inlined as text (none expected)
  // ESM output of bundled CJS deps (react-dom/server) does `require('util')`/`__dirname`. esbuild's
  // ESM `require` shim can't load node builtins, so inject a real createRequire + __dirname/__filename.
  banner: {
    js: [
      "import { createRequire as __ud_createRequire } from 'node:module';",
      "import { fileURLToPath as __ud_fileURLToPath } from 'node:url';",
      "import { dirname as __ud_dirname } from 'node:path';",
      'const require = __ud_createRequire(import.meta.url);',
      'const __filename = __ud_fileURLToPath(import.meta.url);',
      'const __dirname = __ud_dirname(__filename);',
    ].join('\n'),
  },
  logLevel: 'info',
  // 'use client'/'use server' directives in any incidentally-reached file are harmless no-op
  // string literals under plain bundling; the render tree (rich/diagrams/SlideShell) is pure SSR.
})

// eslint-disable-next-line no-console
console.log(`[build-deck-render] bundled -> ${OUT}`)

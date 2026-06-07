// Deterministic verification for /render-deck (DECK-3b-3) — NO DB / LLM / Next.
// Starts the server, POSTs the B2G DeckSpec fixture as { deckSpec }, asserts a valid 8-page 16:9 PDF,
// and (separately) asserts the intermediate self-contained HTML has 0 file:// references. Then closes.
//
// Run: node test-deck.mjs   (DECK_ASSETS_DIR/DECK_REPO_ROOT default to the repo for local dev)
// Requires: chromium (npx playwright install chromium) + a built deck-render.bundle.mjs.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createServer, shutdown } from './server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const FIXTURE = join(REPO_ROOT, 'docs', 'samples', 'fixtures', 'deckspec-B2G.json');
const EXPECTED_PAGES = 8;
const TOKEN = 'test-secret-token';

// Default the deck asset roots to the repo (local dev) unless already set.
process.env.DECK_ASSETS_DIR ??= join(REPO_ROOT, 'public');
process.env.DECK_REPO_ROOT ??= REPO_ROOT;

let passed = 0;
let failed = 0;
function ok(label, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function countPdfPages(buf) {
  const s = buf.toString('latin1');
  const matches = s.match(/\/Type\s*\/Page(?![s])/g);
  return matches ? matches.length : 0;
}
function firstMediaBox(buf) {
  const s = buf.toString('latin1');
  const m = s.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!m) return null;
  return { w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) };
}
async function fetchBin(url, opts) {
  const res = await fetch(url, opts);
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, contentType: res.headers.get('content-type') || '', buf };
}

async function main() {
  process.env.RENDER_WORKER_TOKEN = TOKEN; // exercise the auth path
  const deckSpec = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  console.log(`Fixture: ${FIXTURE}`);
  console.log(`DeckSpec slides: ${deckSpec.slides.length} (expected ${EXPECTED_PAGES})\n`);

  // 0. Intermediate HTML has 0 file:// (assert via the bundle directly — no chromium needed).
  const bundleUrl = pathToFileURL(join(__dirname, 'deck-render.bundle.mjs')).href;
  const { deckSpecToSelfContainedHtml } = await import(bundleUrl);
  const html = deckSpecToSelfContainedHtml(deckSpec);
  const fileUrlCount = (html.match(/file:\/\//g) || []).length;
  const deckPages = (html.match(/class="[^"]*\bdeck-page\b[^"]*"/g) || []).length;
  ok('Intermediate HTML has 0 file://', fileUrlCount === 0, `count=${fileUrlCount}`);
  ok(`Intermediate HTML has ${EXPECTED_PAGES} .deck-page`, deckPages === EXPECTED_PAGES, `count=${deckPages}`);

  // Bad DeckSpec -> the bundle throws a 400-tagged error.
  let bad400 = false;
  try {
    deckSpecToSelfContainedHtml({ version: 'deck-v3', slides: [] });
  } catch (e) {
    bad400 = e && e.statusCode === 400;
  }
  ok('Invalid DeckSpec throws statusCode 400', bad400);

  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  console.log(`\nServer listening on ${base}\n`);

  try {
    // 1. auth: missing token -> 401
    const noTok = await fetchBin(`${base}/render-deck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckSpec }),
    });
    ok('POST /render-deck without token -> 401', noTok.status === 401, `status=${noTok.status}`);

    // 2. render the fixture -> 8-page 16:9 PDF
    const t0 = Date.now();
    const pdf = await fetchBin(`${base}/render-deck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Render-Token': TOKEN },
      body: JSON.stringify({ deckSpec }),
    });
    const ms = Date.now() - t0;
    ok('POST /render-deck (token) -> 200', pdf.status === 200, `status=${pdf.status}, ${ms}ms`);
    ok('Content-Type application/pdf', pdf.contentType.includes('application/pdf'), pdf.contentType);
    ok('Valid PDF header (%PDF-)', pdf.buf.subarray(0, 5).toString('latin1') === '%PDF-', pdf.buf.subarray(0, 8).toString('latin1'));

    const pages = countPdfPages(pdf.buf);
    ok(`Page count = ${EXPECTED_PAGES}`, pages === EXPECTED_PAGES, `got ${pages}`);

    const box = firstMediaBox(pdf.buf);
    const ratioOk = box && Math.abs(box.w / box.h - 16 / 9) < 0.01;
    ok('First MediaBox is 16:9', ratioOk, box ? `${box.w} x ${box.h} pt (ratio ${(box.w / box.h).toFixed(4)})` : 'no MediaBox');
    ok('MediaBox ~ 960x540pt', box && Math.abs(box.w - 960) < 2 && Math.abs(box.h - 540) < 2, box ? `${box.w}x${box.h}` : 'n/a');
    ok('PDF bytes > 50KB', pdf.buf.length > 50 * 1024, `${(pdf.buf.length / 1024).toFixed(1)} KB`);

    // 3. invalid deckSpec over HTTP -> 400
    const bad = await fetchBin(`${base}/render-deck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Render-Token': TOKEN },
      body: JSON.stringify({ deckSpec: { version: 'deck-v3', slides: [] } }),
    });
    ok('POST /render-deck invalid deckSpec -> 400', bad.status === 400, `status=${bad.status}`);
  } finally {
    server.close();
    await shutdown();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('test crashed:', err);
  process.exit(1);
});

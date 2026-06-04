// Deterministic verification — NO DB / LLM / Next. Starts the server, renders the
// self-contained fixture, asserts the output, then closes everything.
//
// Run: node test.mjs   (or: npm test)
// Requires chromium: `npx playwright install chromium` if missing.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { createServer, shutdown } from './server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'sample-deck.html');
const EXPECTED_PAGES = 8;
const TOKEN = 'test-secret-token';

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

// Count PDF page objects (/Type /Page, not /Pages) — robust enough for our generated PDFs.
function countPdfPages(buf) {
  const s = buf.toString('latin1');
  const matches = s.match(/\/Type\s*\/Page(?![s])/g);
  return matches ? matches.length : 0;
}

// First MediaBox: [ x0 y0 x1 y1 ] in PDF points (1pt = 1/72 inch).
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
  const html = readFileSync(FIXTURE, 'utf8');
  const fixturePages = (html.match(/class="[^"]*\bdeck-page\b[^"]*"/g) || []).length;
  console.log(`Fixture: ${FIXTURE}`);
  console.log(`Fixture .deck-page count: ${fixturePages} (expected ${EXPECTED_PAGES})`);

  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  console.log(`Server listening on ${base}\n`);

  try {
    // 1. healthz
    const health = await fetchBin(`${base}/healthz`);
    ok('GET /healthz -> 200', health.status === 200, `status=${health.status}`);
    ok('GET /healthz -> {ok:true}', health.buf.toString().includes('"ok":true'));

    // 2. auth: missing/wrong token -> 401
    const noTok = await fetchBin(`${base}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });
    ok('POST /render without token -> 401', noTok.status === 401, `status=${noTok.status}`);

    // 3. PDF render with correct token
    const t0 = Date.now();
    const pdf = await fetchBin(`${base}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Render-Token': TOKEN },
      body: JSON.stringify({ html, width: 1280, height: 720, format: 'pdf' }),
    });
    const ms = Date.now() - t0;
    ok('POST /render (token) -> 200', pdf.status === 200, `status=${pdf.status}, ${ms}ms`);
    ok('Content-Type application/pdf', pdf.contentType.includes('application/pdf'), pdf.contentType);

    const isPdf = pdf.buf.subarray(0, 5).toString('latin1') === '%PDF-';
    ok('Valid PDF header (%PDF-)', isPdf, pdf.buf.subarray(0, 8).toString('latin1'));

    const pages = countPdfPages(pdf.buf);
    ok(`Page count = ${EXPECTED_PAGES}`, pages === EXPECTED_PAGES, `got ${pages}`);

    const box = firstMediaBox(pdf.buf);
    // 1280x720px -> 960x540pt (px * 72/96). 16:9 ratio.
    const ratioOk = box && Math.abs(box.w / box.h - 16 / 9) < 0.01;
    ok('First MediaBox is 16:9', ratioOk, box ? `${box.w} x ${box.h} pt (ratio ${(box.w / box.h).toFixed(4)})` : 'no MediaBox');
    ok('MediaBox ~ 960x540pt', box && Math.abs(box.w - 960) < 2 && Math.abs(box.h - 540) < 2, box ? `${box.w}x${box.h}` : 'n/a');

    ok('PDF bytes > 50KB', pdf.buf.length > 50 * 1024, `${(pdf.buf.length / 1024).toFixed(1)} KB`);

    // 4. PNG render (thumbnail)
    const png = await fetchBin(`${base}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Render-Token': TOKEN },
      body: JSON.stringify({ html, format: 'png' }),
    });
    const pngMagic = png.buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    ok('POST /render format=png -> valid PNG', png.status === 200 && png.contentType.includes('image/png') && pngMagic, `status=${png.status}, ${(png.buf.length / 1024).toFixed(1)} KB`);

    // 5. bad request -> 400
    const bad = await fetchBin(`${base}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Render-Token': TOKEN },
      body: JSON.stringify({ html: '' }),
    });
    ok('POST /render empty html -> 400', bad.status === 400, `status=${bad.status}`);
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

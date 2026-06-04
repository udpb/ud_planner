// ud-render-worker — generic HTML -> high-fidelity 16:9 PDF/PNG render service.
//
// Pure HTML->PDF: ZERO dependency on the main Next app / React / deck code.
// The Next route (DECK-3b-2) builds the deck HTML and POSTs it here.
//
// Endpoints:
//   POST /render   { html, width?=1280, height?=720, format?:'pdf'|'png'='pdf' } -> binary PDF/PNG
//   GET  /healthz  -> 200 { ok: true }
//
// Chromium is launched ONCE and reused (new context+page per request).
// Auth: if RENDER_WORKER_TOKEN env is set, require matching X-Render-Token header (401 otherwise).
// Port: PORT env (default 8080, Cloud Run convention).

import http from 'node:http';
import { chromium } from 'playwright';

// ---- config (env-tunable) ----
const PORT = Number(process.env.PORT) || 8080;
const BODY_LIMIT = Number(process.env.RENDER_BODY_LIMIT) || 12 * 1024 * 1024; // 12MB
const REQUEST_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS) || 60_000;
const MAX_CONCURRENCY = Number(process.env.RENDER_CONCURRENCY) || 3; // chromium memory cap
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

// ---- shared browser (launched once, reused) ----
/** @type {import('playwright').Browser | null} */
let browser = null;
let browserPromise = null;

async function getBrowser() {
  if (browser) return browser;
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        // chromium is preinstalled in the playwright base image; these args are container-safe.
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
      })
      .then((b) => {
        browser = b;
        // If the browser dies unexpectedly, allow re-launch on next request.
        b.on('disconnected', () => {
          browser = null;
          browserPromise = null;
        });
        return b;
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

// ---- tiny concurrency gate ----
let active = 0;
const waiters = [];
function acquireSlot() {
  if (active < MAX_CONCURRENCY) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}
function releaseSlot() {
  active -= 1;
  const next = waiters.shift();
  if (next) {
    active += 1;
    next();
  }
}

// ---- core render fn (exported for direct testing) ----
/**
 * Render an HTML string to a PDF or PNG buffer.
 * @param {{ html: string, width?: number, height?: number, format?: 'pdf'|'png' }} opts
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
export async function render({ html, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, format = 'pdf' }) {
  if (typeof html !== 'string' || html.length === 0) {
    throw Object.assign(new Error('html (non-empty string) is required'), { statusCode: 400 });
  }
  const w = Number(width) || DEFAULT_WIDTH;
  const h = Number(height) || DEFAULT_HEIGHT;
  const fmt = format === 'png' ? 'png' : 'pdf';

  await acquireSlot();
  const b = await getBrowser();
  // Device scale 2 => crisp screenshots; PDF uses CSS px regardless.
  const context = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    // setContent avoids URL-length limits for large (~1.5MB) decks; assets are inlined data: URIs.
    await page.setContent(html, { waitUntil: 'networkidle', timeout: REQUEST_TIMEOUT_MS });
    // Wait for (inlined) fonts to be ready so glyphs are laid out before snapshot/pdf.
    await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve());

    if (fmt === 'png') {
      // Thumbnail: first-page (above-the-fold) screenshot at the requested 16:9 viewport.
      const buffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: w, height: h } });
      return { buffer, contentType: 'image/png' };
    }

    // PDF: explicit page box = viewport size; .deck-page{break-after:page} => 1 slide = 1 page.
    await page.emulateMedia({ media: 'screen' });
    const buffer = await page.pdf({
      width: `${w}px`,
      height: `${h}px`,
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return { buffer, contentType: 'application/pdf' };
  } finally {
    await context.close().catch(() => {});
    releaseSlot();
  }
}

// ---- http helpers ----
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error(`body exceeds limit (${BODY_LIMIT} bytes)`), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function authorized(req) {
  // Read at request time so the value tracks the live env (and is testable).
  const token = process.env.RENDER_WORKER_TOKEN || '';
  if (!token) return true; // local dev: no token configured => allow
  return req.headers['x-render-token'] === token;
}

// ---- request handler ----
async function handle(req, res) {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/render') {
    if (!authorized(req)) return sendJson(res, 401, { error: 'unauthorized' });
    let payload;
    try {
      const raw = await readBody(req);
      payload = JSON.parse(raw.toString('utf8'));
    } catch (err) {
      const status = err && err.statusCode ? err.statusCode : 400;
      return sendJson(res, status, { error: err.message || 'invalid request body' });
    }
    try {
      const timeout = setTimeout(() => {
        if (!res.headersSent) sendJson(res, 504, { error: 'render timeout' });
      }, REQUEST_TIMEOUT_MS);
      const { buffer, contentType } = await render(payload);
      clearTimeout(timeout);
      if (res.headersSent) return; // timed out already
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': buffer.length });
      return res.end(buffer);
    } catch (err) {
      const status = err && err.statusCode ? err.statusCode : 500;
      if (!res.headersSent) return sendJson(res, status, { error: err.message || 'render failed' });
      return;
    }
  }

  return sendJson(res, 404, { error: 'not found' });
}

// ---- server lifecycle ----
export function createServer() {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) sendJson(res, 500, { error: err.message || 'internal error' });
    });
  });
  server.requestTimeout = REQUEST_TIMEOUT_MS + 5_000;
  return server;
}

export async function shutdown() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    browserPromise = null;
  }
}

// Start only when run directly (not when imported by test.mjs).
const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('server.mjs');
if (isMain) {
  const server = createServer();
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[render-worker] listening on :${PORT} (auth ${process.env.RENDER_WORKER_TOKEN ? 'ON' : 'OFF'}, concurrency ${MAX_CONCURRENCY})`);
  });

  let shuttingDown = false;
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      // eslint-disable-next-line no-console
      console.log(`[render-worker] ${sig} received, shutting down...`);
      server.close();
      await shutdown();
      process.exit(0);
    });
  }
}

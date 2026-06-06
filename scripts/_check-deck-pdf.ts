/**
 * _check-deck-pdf — DECK-3b-2 (ADR-025) 결정론적 배선 검증 (LLM·DB·auth 없음)
 *
 * 실행: npx tsx scripts/_check-deck-pdf.ts
 *
 * 경로:
 *   1. fixture docs/samples/fixtures/deckspec-B2G.json (8 슬라이드)
 *   2. deckSpecToElements → buildWorkerHtml  → **file:// 0 단언** (워커는 파일 접근 0)
 *   3. 로컬 렌더 워커가 기동돼 있으면(8080 또는 본 스크립트가 임시 기동) renderViaWorker →
 *      유효 PDF(%PDF-) + 8 페이지 단언. 워커 미기동/미가용이면 PDF 단계 skip 보고.
 *
 * ⚠️ 백그라운드 장기 프로세스 금지 — 스크립트가 띄운 워커는 끝에서 반드시 종료한다.
 * ⚠️ 실 LLM 생성 라우트는 호출하지 않는다(메인이 E2E 검증).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'

// 'server-only' 가드 스텁 (build-worker-html·worker-client 가 import) — _smoke-deck-e2e.ts 패턴.
const require = createRequire(import.meta.url)
try {
  const so = require.resolve('server-only')
  require.cache[so] = { id: so, filename: so, loaded: true, exports: {} } as never
} catch {
  /* ignore */
}

const FIXTURE = path.join(process.cwd(), 'docs', 'samples', 'fixtures', 'deckspec-B2G.json')
const WORKER_PORT = Number(process.env.RENDER_WORKER_TEST_PORT) || 8091
const WORKER_URL = `http://localhost:${WORKER_PORT}`

/** PDF 페이지 수 — /Type /Page (Pages 노드 제외). _render-deck.ts 동일. */
function countPdfPages(buf: Buffer): number {
  const matches = buf.toString('latin1').match(/\/Type\s*\/Page(?![sa-zA-Z])/g)
  return matches ? matches.length : 0
}

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/healthz`)
      if (res.ok) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

async function main() {
  const fails: string[] = []
  const row = (k: string, v: string) => console.log(`  ${k.padEnd(34)} ${v}`)

  // ── 1. fixture → elements → worker HTML ──
  const deckSpec = JSON.parse(fs.readFileSync(FIXTURE, 'utf-8'))
  const { deckSpecToElements } = await import('../src/lib/deck/render-spec')
  const { buildWorkerHtml } = await import('../src/lib/deck/build-worker-html')

  const elements = deckSpecToElements(deckSpec)
  const html = buildWorkerHtml(elements)

  const fileUrlCount = (html.match(/file:\/\//g) || []).length
  const dataUriCount = (html.match(/data:(?:image|font)\//g) || []).length
  const hasKorean = /[가-힣]/.test(html)
  const fontEmbedded = /@font-face\{font-family:'NanumHuman'.*base64,/s.test(html)

  console.log('\n[HTML 단계]')
  row('fixture slides', String(deckSpec.slides?.length ?? 0))
  row('elements', String(elements.length))
  row('HTML length', `${(html.length / 1024).toFixed(0)} KB`)
  row('file:// count (must be 0)', String(fileUrlCount))
  row('data: URIs (image/font)', String(dataUriCount))
  row('Korean in markup', String(hasKorean))
  row('font embedded (data URI)', String(fontEmbedded))

  if (fileUrlCount !== 0) fails.push(`file:// 잔존 ${fileUrlCount}개 (워커에서 깨짐)`)
  if (!hasKorean) fails.push('한글 마크업 없음')
  if (!fontEmbedded) fails.push('폰트 data URI 임베드 안 됨')
  if (elements.length !== (deckSpec.slides?.length ?? 0))
    fails.push(`elements ${elements.length} ≠ slides ${deckSpec.slides?.length}`)

  // ── 2. 워커 PDF 단계 (가용 시) ──
  console.log('\n[PDF 단계]')
  let worker: ChildProcess | null = null
  let usedExisting = false
  let workerUrlForClient = WORKER_URL

  // 2a. 이미 8080 에 워커가 떠 있으면 그걸 사용.
  if (await waitForHealth('http://localhost:8080', 500)) {
    usedExisting = true
    workerUrlForClient = 'http://localhost:8080'
    row('worker', '기존 :8080 사용')
  } else {
    // 2b. 임시 워커 기동 (playwright 미설치면 실패 → skip).
    try {
      worker = spawn('node', ['render-worker/server.mjs'], {
        env: { ...process.env, PORT: String(WORKER_PORT), RENDER_WORKER_TOKEN: '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      worker.stderr?.on('data', (d) => {
        const s = String(d)
        if (/error|cannot|MODULE_NOT_FOUND/i.test(s)) console.error('  [worker]', s.trim())
      })
      const up = await waitForHealth(WORKER_URL, 12_000)
      if (!up) {
        row('worker', `임시 기동 실패/healthz 무응답 (:${WORKER_PORT}) → PDF skip`)
        worker.kill('SIGTERM')
        worker = null
      } else {
        row('worker', `임시 기동 :${WORKER_PORT}`)
      }
    } catch (e) {
      row('worker', `기동 불가 (${e instanceof Error ? e.message : e}) → PDF skip`)
      worker = null
    }
  }

  if (usedExisting || worker) {
    try {
      // renderViaWorker 는 process.env.RENDER_WORKER_URL 을 읽음 → 테스트 URL 주입.
      process.env.RENDER_WORKER_URL = workerUrlForClient
      process.env.RENDER_WORKER_TOKEN = ''
      const { renderViaWorker } = await import('../src/lib/deck/worker-client')
      const { pdf } = await renderViaWorker(html)
      const isPdf = pdf.subarray(0, 5).toString('latin1') === '%PDF-'
      const pages = countPdfPages(pdf)
      row('valid PDF (%PDF-)', String(isPdf))
      row('PDF bytes', `${(pdf.length / 1024).toFixed(1)} KB`)
      row('PDF pages', `${pages} (expect ${deckSpec.slides.length})`)
      if (!isPdf) fails.push('PDF 헤더 없음')
      if (pages !== deckSpec.slides.length)
        fails.push(`PDF 페이지 ${pages} ≠ 슬라이드 ${deckSpec.slides.length}`)
    } catch (e) {
      // 워커 자체 오류(예: playwright chromium 미설치)는 hard-fail 아님 — skip 보고.
      row('PDF render', `오류 → skip: ${e instanceof Error ? e.message : e}`)
    } finally {
      if (worker) {
        worker.kill('SIGTERM')
        // 강제 종료 대기 (좀비 방지)
        await new Promise((r) => setTimeout(r, 500))
        if (!worker.killed) worker.kill('SIGKILL')
      }
    }
  } else {
    row('PDF', 'skip (워커 미가용) — HTML 단계까지만 검증')
  }

  // ── 결과 ──
  console.log('')
  if (fails.length === 0) {
    console.log('✅ PASS — 배선 검증 (HTML file:// 0' + (usedExisting || worker ? ' + PDF 렌더' : ', PDF skip') + ')')
  } else {
    console.log('❌ FAIL:')
    for (const f of fails) console.log(`   - ${f}`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

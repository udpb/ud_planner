/**
 * worker-client — 렌더 워커 HTTP 클라이언트 (DECK-3b-2, ADR-025 Phase 3b)
 *
 * Next 앱은 chromium 을 띄우지 않는다(서버리스). 대신 자체완결 HTML 을 **별도 렌더 워커**
 * (render-worker/server.mjs · Cloud Run/컨테이너)로 POST 해 PDF 를 받는다. (ADR-025 §1.)
 *
 * 계약: POST `${RENDER_WORKER_URL}/render`  body `{ html }` → `application/pdf` 바이너리.
 *   - 인증: 워커에 RENDER_WORKER_TOKEN 이 설정돼 있으면 `X-Render-Token` 헤더 일치 필요.
 *           로컬 dev(토큰 미설정)면 헤더 빈 값이어도 통과.
 *   - 실패: 워커가 4xx/5xx JSON({error}) 반환 → 본 함수가 Error throw (라우트가 5xx 매핑).
 */
import 'server-only'

/** RENDER_WORKER_URL 기본값 — 로컬 워커. (운영은 Cloud Run URL 을 env 로 주입.) */
const DEFAULT_WORKER_URL = 'http://localhost:8080'

export interface RenderViaWorkerResult {
  pdf: Buffer
  /** 워커가 보고한 content-type (정상 'application/pdf'). */
  contentType: string
}

/**
 * 자체완결 HTML(file:// 0 — build-worker-html 이 인라인 완료)을 워커로 보내 PDF 를 받는다.
 * @throws 워커 미응답·인증 실패·렌더 오류 시 메시지 포함 Error.
 */
export async function renderViaWorker(html: string): Promise<RenderViaWorkerResult> {
  const base = (process.env.RENDER_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/$/, '')
  const url = `${base}/render`
  const token = process.env.RENDER_WORKER_TOKEN ?? ''

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Render-Token': token,
      },
      body: JSON.stringify({ html }),
    })
  } catch (e) {
    throw new Error(
      `[worker-client] 렌더 워커(${url}) 연결 실패 — 워커 미기동/네트워크: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
  }

  if (!res.ok) {
    // 워커는 실패 시 JSON({error}) 반환.
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.error) detail = `${res.status} ${body.error}`
    } catch {
      /* 본문이 JSON 이 아니면 status 만 */
    }
    throw new Error(`[worker-client] 렌더 워커 오류: ${detail}`)
  }

  const contentType = res.headers.get('content-type') ?? 'application/pdf'
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length === 0) {
    throw new Error('[worker-client] 렌더 워커가 빈 응답 반환')
  }
  return { pdf: buf, contentType }
}

/**
 * DeckSpec(JSON)을 워커로 보내 PDF 를 받는다 — **렌더(React→HTML→chromium)를 워커가 수행**.
 * Next App Router 는 `react-dom/server` import 를 빌드 차단하므로, 앱은 DeckSpec(JSON)만 넘기고
 * HTML 생성은 워커의 deck-render 번들이 한다. (ADR-025 §1 — 렌더는 워커에서만.)
 * 계약: POST `${RENDER_WORKER_URL}/render-deck` body `{ deckSpec }` → `application/pdf`.
 */
export async function renderDeckViaWorker(deckSpec: unknown): Promise<RenderViaWorkerResult> {
  const base = (process.env.RENDER_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/$/, '')
  const url = `${base}/render-deck`
  const token = process.env.RENDER_WORKER_TOKEN ?? ''

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Render-Token': token },
      body: JSON.stringify({ deckSpec }),
    })
  } catch (e) {
    throw new Error(
      `[worker-client] 렌더 워커(${url}) 연결 실패 — 워커 미기동/네트워크: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.error) detail = `${res.status} ${body.error}`
    } catch {
      /* non-JSON */
    }
    throw new Error(`[worker-client] 렌더 워커 오류: ${detail}`)
  }
  const contentType = res.headers.get('content-type') ?? 'application/pdf'
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length === 0) throw new Error('[worker-client] 렌더 워커가 빈 응답 반환')
  return { pdf: buf, contentType }
}

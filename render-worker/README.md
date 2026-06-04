# ud-render-worker — HTML → high-fidelity 16:9 PDF/PNG

A **generic, standalone** render service: it accepts an HTML string and returns a
high-fidelity 16:9 PDF (1 slide = 1 page) or a first-page PNG thumbnail.

It has **zero dependency** on the main Next app / React / deck code. The Next deck
route (DECK-3b-2) builds the deck HTML and `POST`s it here; this worker only knows
HTML → Chromium → PDF. See `docs/decisions/025-deck-first-html-substrate.md` §1 for
why rendering lives in a separate worker (Vercel serverless has no Chromium).

## Endpoints

| Method | Path       | Body                                                              | Response                       |
| ------ | ---------- | ----------------------------------------------------------------- | ------------------------------ |
| POST   | `/render`  | `{ html: string, width?=1280, height?=720, format?:'pdf'\|'png' }` | binary `application/pdf` / `image/png` |
| GET    | `/healthz` | —                                                                 | `200 { ok: true }`             |

- **PDF**: `page.pdf({ width, height, printBackground:true, preferCSSPageSize:false, margin:0 })`.
  The deck HTML's `.deck-page { break-after: page }` produces 1 slide = 1 page.
- **PNG**: first-page (above-the-fold) screenshot at the requested viewport (thumbnail).
- Chromium is launched **once** and reused (new context+page per request). Graceful
  shutdown on `SIGTERM`/`SIGINT`.

## Config (env)

| Env                    | Default | Notes                                                            |
| ---------------------- | ------- | ---------------------------------------------------------------- |
| `PORT`                 | `8080`  | Cloud Run convention.                                            |
| `RENDER_WORKER_TOKEN`  | _unset_ | If set, requests must send `X-Render-Token: <token>` (401 else). Unset = open (local dev). |
| `RENDER_BODY_LIMIT`    | `12MB`  | Max request body bytes (deck HTML ~1.5MB + headroom).            |
| `RENDER_TIMEOUT_MS`    | `60000` | Per-request render timeout.                                      |
| `RENDER_CONCURRENCY`   | `3`     | Max concurrent renders (Chromium memory cap).                    |

## Local run

```bash
npm install          # also generates package-lock.json (used by `npm ci` in Docker)
# If Chromium isn't already installed by playwright:
npx playwright install chromium
npm start            # listens on :8080
```

### curl example

```bash
# build a JSON body with an HTML string and POST it
node -e "const fs=require('fs');process.stdout.write(JSON.stringify({html:fs.readFileSync('fixtures/sample-deck.html','utf8')}))" > /tmp/body.json

curl -sS -X POST http://localhost:8080/render \
  -H 'Content-Type: application/json' \
  --data @/tmp/body.json \
  -o out.pdf
# out.pdf => 8-page 16:9 (960x540pt) PDF

curl -sS http://localhost:8080/healthz   # {"ok":true}
```

If `RENDER_WORKER_TOKEN` is set, add `-H "X-Render-Token: <token>"`.

## Test

```bash
npm test   # node test.mjs
```

Deterministic, no DB/LLM/Next. Starts the server on an ephemeral port, renders
`fixtures/sample-deck.html`, and asserts: valid `%PDF-` header, page count = 8,
first MediaBox 960×540pt (16:9), bytes > 50KB, `/healthz` 200, and auth (401 without
token / 200 with). The fixture has fonts + images inlined as data URIs (0 `file://`),
so it renders with no external assets.

## Docker

```bash
docker build -t ud-render-worker .
docker run --rm -p 8080:8080 ud-render-worker
# with auth:
docker run --rm -p 8080:8080 -e RENDER_WORKER_TOKEN=secret ud-render-worker
```

The base image (`mcr.microsoft.com/playwright:v1.59.1-jammy`) ships Chromium and OS
deps. **Keep the image tag pinned to the `playwright` npm version in `package.json`**
(both `1.59.1`) so the Chromium revision matches.

## Cloud Run deploy notes

- **Memory ≥ 1Gi** (2Gi recommended): Chromium + 16:9 high-DPI rendering is memory-hungry.
- **CPU**: ≥ 1 vCPU. Consider "CPU always allocated" if you keep instances warm to avoid
  re-launching Chromium on cold start.
- **Concurrency**: keep Cloud Run request concurrency low (e.g. 2–4) and match
  `RENDER_CONCURRENCY` — each render holds a Chromium context. The worker also gates
  internally.
- **Timeout**: set the Cloud Run request timeout ≥ `RENDER_TIMEOUT_MS` (e.g. 120s).
- **`RENDER_WORKER_TOKEN`**: set it (store in Secret Manager) so only the Next route can call.
- **Cold start**: first request after scale-to-zero pays the Chromium launch (~1–3s).
  Set `min-instances=1` to avoid it on a latency-sensitive path.

```bash
gcloud run deploy ud-render-worker \
  --source . \
  --region asia-northeast3 \
  --memory 2Gi --cpu 1 \
  --concurrency 2 --timeout 120 \
  --min-instances 1 \
  --set-env-vars RENDER_WORKER_TOKEN=...     # prefer --set-secrets
```

### How the Next route calls it (DECK-3b-2)

The Vercel API route POSTs the built deck HTML to `RENDER_WORKER_URL` with the
`X-Render-Token` header (= `RENDER_WORKER_TOKEN`), then streams the returned PDF to the
client. Screen preview does **not** use this worker — the browser renders the React
slides directly; only PDF/PNG export goes through here.

### CJK fonts

The verification fixture inlines its Korean font as a data URI, so no font install is
needed for that path. If you render HTML that relies on system Korean fonts (no inlined
@font-face), add Noto CJK to the image to avoid tofu:

```dockerfile
USER root
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*
USER pwuser
```

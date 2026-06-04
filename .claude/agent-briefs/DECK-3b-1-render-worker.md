# DECK-3b-1 — 렌더 워커 (HTML → 고해상 PDF, 컨테이너/Cloud Run)

> 자급자족 브리프. `이 브리프 + CLAUDE.md + AGENTS.md + docs/glossary.md + docs/decisions/025-deck-first-html-substrate.md` 만으로 작업. 의문 = STOP 후 보고.

- **트랙/ID**: DECK-3b-1 (ADR-025 Phase 3b, 렌더 인프라)
- **상태**: 🟡 in-progress
- **결정 근거**: 렌더 실행 위치 = **별도 렌더 워커**(사용자 결정 2026-06-04, ADR-025 §1). Vercel 서버리스는 chromium 미포함 → 독립 서비스로 분리.

---

## 0. 왜
덱 자동 저작(DECK-3/3a)은 작동한다. 이제 그 결과(자급자족 덱 HTML)를 **고해상 PDF로 렌더**해야 하는데, Vercel 함수에선 chromium을 못 돌린다. 그래서 **HTML을 받아 PDF를 반환하는 범용 렌더 서비스**를 컨테이너로 분리한다. Next 앱(라우트, DECK-3b-2)이 DeckSpec→HTML을 만들어 이 워커에 POST한다. **워커는 deck/React/Next에 의존하지 않는 순수 HTML→PDF 서비스다.**

## 1. 목표 (한 문장)
`POST /render { html }` → 16:9 고해상 PDF(1 슬라이드=1 페이지)를 반환하는 **컨테이너화된 렌더 워커**(`render-worker/`)를 만들고, 동봉된 자급자족 fixture(`render-worker/fixtures/sample-deck.html`, 8페이지·이미지/폰트 인라인)로 **로컬에서 결정론적으로 검증**한다.

## 2. 스코프 — CAN touch / MUST NOT touch
**CAN touch (전부 신규, 격리):**
- `render-worker/` 디렉터리 전체: `package.json`(독립), 서버 코드(ESM JS 권장 — 무빌드), `Dockerfile`, `.dockerignore`, `README.md`, 자체 테스트(`test.mjs`).
- 이미 존재: `render-worker/fixtures/sample-deck.html`(메인이 생성한 검증 fixture — **수정 금지, 입력으로 사용**).

**MUST NOT touch:**
- `src/**`, Next 앱, `prisma`, `package.json`(루트), 모듈 manifest, 다른 트랙. **워커는 메인 레포 코드에 import 의존 0.**
- 루트 `npm run typecheck`/`lint`/`check:manifest` 결과를 바꾸지 말 것(워커는 src 밖이라 영향 없어야 정상 — 확인해 보고).

## 3. 사양
- **런타임**: Node ESM(권장, 무빌드) 또는 최소 TS. 의존성 최소(`playwright` 또는 `puppeteer-core`+@sparticuz는 불필요 — 컨테이너엔 chromium 동봉). **`playwright` 권장** + 컨테이너 base = `mcr.microsoft.com/playwright:v1.59.x-jammy`(chromium 사전설치, 버전 핀 일치). 브라우저는 **1회 launch 후 재사용**(요청마다 new context/page), graceful shutdown.
- **엔드포인트**:
  - `POST /render` — body JSON `{ html: string, width?=1280, height?=720, format?: 'pdf'|'png'='pdf' }`. PDF: `page.pdf({ width:`${w}px`, height:`${h}px`, printBackground:true, preferCSSPageSize:false, margin:0 })`. HTML의 `.deck-page{break-after:page}`가 1슬라이드=1페이지를 만든다(DECK-1 검증된 방식). PNG: 1페이지 스냅샷(썸네일용). 응답 `Content-Type: application/pdf`(또는 image/png), 바이너리.
  - `GET /healthz` — 200 `{ok:true}`.
- **인증**: `RENDER_WORKER_TOKEN` env가 설정돼 있으면 `X-Render-Token` 헤더 일치 요구(불일치 401). 미설정(로컬)이면 통과.
- **한도**: body 한도 ≥ 12MB(덱 HTML ~1.5MB·여유), 요청 타임아웃(예 60s), 동시성 캡(예 2~4 — chromium 메모리). 초과/에러는 4xx/5xx + JSON 메시지.
- **포트**: `PORT` env(기본 8080 — Cloud Run 규약).
- **Dockerfile**: playwright base → `WORKDIR /app` → `COPY package*.json` → `npm ci --omit=dev` → `COPY .` → `EXPOSE 8080` → `CMD ["node","server.mjs"]`(또는 해당). `.dockerignore`(node_modules·fixtures 큰 파일은 포함하되 불필요물 제외).
- **README**: 로컬 실행(`npm i && npm start`, 필요시 `npx playwright install chromium`), `curl`로 /render 호출 예시, `docker build`/`run`, **Cloud Run 배포 노트**(메모리 ≥1Gi·동시성·`RENDER_WORKER_TOKEN`·CPU). DECK-3b-2(라우트)가 `RENDER_WORKER_URL`+토큰으로 호출함을 명시.

## 4. 검증 (결정론적 — 메인 재확인)
- `render-worker/test.mjs` (또는 `npm test`): 서버를 띄우거나 렌더 함수를 직접 호출 → `fixtures/sample-deck.html`을 POST/렌더 → **검증**: 응답이 유효 PDF(`%PDF-`), **페이지 8 = .deck-page 8**, 첫 MediaBox 16:9(960×540pt 등), 바이트>50KB. + `/healthz` 200. + 인증 토큰 동작(설정 시 401, 일치 시 200).
- 로컬 실행으로 PASS. (Docker **build는 best-effort** — Docker 데몬 불안정하면 Dockerfile은 리뷰만, build 실패를 차단으로 보지 말고 ⚠️에 보고.)
- 루트 `npm run typecheck`·`npm run check:manifest` 영향 없음 확인(워커는 src 밖).
- ⚠️ LLM·DB·메인 src import 금지. 백그라운드 장기 프로세스 금지(테스트는 서버 띄웠다 닫기).

## 5. Return Format (5섹션)
- ✅ 한 일 / ❌ 못한 일(Docker build 미검증이면 명시) / 🤔 결정(ADR 후보만) / 🔬 검증(test.mjs 출력: PDF 유효·페이지수·MediaBox·healthz·auth + 루트 gate 무영향) / ⚠️ 위험(Cloud Run 메모리·콜드스타트·동시성·폰트)
- `git diff --name-only` ⊆ `render-worker/**` 확인. 워커 의존성 명시.

## 6. Hints
- fixture HTML은 폰트·이미지·로고가 **전부 data URI 인라인**(file:// 0) — 컨테이너에서 외부 자산 없이 그대로 렌더된다. 폰트도 인라인이라 컨테이너에 폰트 설치 불필요(단, CJK 폴백 깨짐 대비 base image의 fonts-noto-cjk 설치는 README 권장사항으로).
- playwright 버전은 루트와 맞출 필요 없음(독립 패키지). base image 태그의 playwright 버전과 package.json playwright 버전을 일치시켜야 chromium revision이 맞다.
- `page.goto`는 `data:text/html,` 또는 `page.setContent(html, {waitUntil:'networkidle'})` 사용(파일 안 거침). `await page.evaluate(()=>document.fonts?.ready)`로 폰트 로드 대기.
- 큰 HTML은 `setContent` 권장(URL 길이 한계 회피).

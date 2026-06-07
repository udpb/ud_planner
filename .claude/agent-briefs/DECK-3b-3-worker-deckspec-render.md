# DECK-3b-3 — 워커 DeckSpec 렌더: `/render-deck` (esbuild deck-render 번들)

> 자급자족 브리프. `이 브리프 + CLAUDE.md + AGENTS.md + docs/glossary.md + docs/decisions/025-deck-first-html-substrate.md` 만으로 작업. 의문 = STOP 후 보고.

- **트랙/ID**: DECK-3b-3 (ADR-025 Phase 3b 마무리)
- **상태**: 🟡 in-progress
- **선행(✅)**: DECK-3b-1(워커 `/render` HTML→PDF) · DECK-3b-2(라우트·UI) · DECK-3b PDF 이관 수정(라우트가 `renderDeckViaWorker(deckSpec)`로 워커 `/render-deck` 호출 — 엔드포인트 아직 없음).

---

## 0. 왜 (라이브 E2E 발견 2026-06-07)
**Next 16 App Router 는 앱 번들에 `react-dom/server` import 를 하드 차단**한다(라이브에서 전체 앱 빌드 에러 확인). 그래서 `DeckSpec→HTML`(renderToStaticMarkup) 을 Next 앱에서 못 한다 → **렌더를 워커가 수행**하도록 이관함. 라우트는 이제 `POST 워커 /render-deck {deckSpec}` 를 호출하는데 **워커에 그 엔드포인트가 없다.** 이 브리프가 그걸 만든다. 완료되면 ud-planner 에서 PDF 다운로드까지 작동.

## 1. 목표 (한 문장)
워커가 **DeckSpec(JSON) → 자체완결 HTML → chromium → PDF** 를 수행하는 `/render-deck` 엔드포인트를 추가하되, HTML 생성 코드(`render-spec`+`rich`+`render-html`)를 **Next/앱과 무관한 esbuild 번들**로 묶어 워커(plain node)가 import 하게 한다.

## 2. 스코프 — CAN touch / MUST NOT touch
**CAN touch:**
- `render-worker/**` — `/render-deck` 엔드포인트(server.mjs), esbuild 빌드 스크립트(`build-deck-render.mjs`), 빌드 산출 번들(`deck-render.bundle.mjs` 커밋), Dockerfile(public 자산 COPY + 빌드), package.json(esbuild devDep), README 갱신, 테스트.
- 신규 `src/lib/deck/deck-render-entry.ts` — 번들 엔트리: `export function deckSpecToSelfContainedHtml(deckSpec: unknown): string` = `safeParseDeckSpec`→`deckSpecToElements`→`buildDeckHtml`→**이미지 file:// → data URI 인라인**(build-worker-html 의 인라인 로직 재사용하되 **`'server-only'` 없이** — 번들 가능하게). 결과 HTML 은 file:// 0.
- `src/lib/deck/render-html.ts`·`build-worker-html.ts` — **자산 루트 env 화**(아래 §3). 최소·하위호환 수정만.

**MUST NOT touch:**
- `src/app/**` (라우트는 이미 DECK-3b 수정 완료 — 건드리지 말 것) · `invokeAi` · `prisma` · `express/schema.ts` 키 · manifest · deck 트랙의 다른 로직(spec/render-spec 의 계약) · 다른 트랙.
- ⚠️ `deck-render-entry.ts` 나 그 번들을 **앱(src/app, 클라 컴포넌트)에서 import 금지** — react-dom/server 가 다시 앱 번들에 들어가면 빌드 차단 재발. (오직 워커만 번들을 쓴다.)

## 3. 구현
1. **deck-render-entry.ts**: `deckSpecToSelfContainedHtml(deckSpec)` — `safeParseDeckSpec`(spec) → `deckSpecToElements`(render-spec) → `buildDeckHtml`(render-html) → file:// 이미지(`src|href|xlink:href` + `url()`)를 `fs` 로 읽어 data URI 인라인(build-worker-html 의 정규식 그대로). **'server-only' import 금지**(번들용). 폰트는 buildDeckHtml 이 이미 인라인.
2. **자산 루트 env**: `render-html.ts`(FONT_DIR)·deck-render-entry 의 PUBLIC_DIR 을 `process.env.DECK_ASSETS_DIR ?? <기존 public 경로>` 로. 로컬=레포 public, 컨테이너=COPY 된 경로. 하위호환(미설정 시 현 동작).
3. **esbuild 번들**: `render-worker/build-deck-render.mjs` — esbuild 로 `deck-render-entry.ts` 를 `render-worker/deck-render.bundle.mjs` 로 번들(`platform:'node'`, `format:'esm'`, `bundle:true`). `@/` alias 해결(esbuild `alias` 또는 tsconfig-paths 플러그인 → `@/`→`<repo>/src/`). React·react-dom/server·lucide-react·zod 번들 포함. 'use client' 컴포넌트 없음(이미 제거됨) — 순수 SSR. 번들을 **커밋**(워커가 빌드 없이 import).
4. **워커 `/render-deck`**: `POST {deckSpec}` → 동적 import `./deck-render.bundle.mjs` 의 `deckSpecToSelfContainedHtml(deckSpec)` → 기존 HTML→PDF 렌더(server.mjs 의 chromium 경로 재사용) → `application/pdf`. 인증·한도 `/render` 와 동일. 잘못된 DeckSpec → 400.
5. **Dockerfile**: `public/design-kit`(fonts·logo·sample) COPY + `DECK_ASSETS_DIR` 설정 + 번들 COPY. (빌드는 CI/로컬에서, 또는 Docker 빌드 스텝에 esbuild.)

## 4. 검증
- **결정론(서브 직접, LLM·DB 없음)**: `render-worker/build-deck-render.mjs` 실행 → 번들 생성. 워커 기동(`node render-worker/server.mjs`, 로컬 `DECK_ASSETS_DIR=<repo>/public`) → `POST /render-deck {deckSpec: <docs/samples/fixtures/deckspec-B2G.json>}` → **유효 PDF(`%PDF-`)·8페이지·16:9** 단언(test 스크립트). + file:// 0 단언.
- 루트 `npm run typecheck` 0 · `npm run check:manifest` 0 · `npm run lint`(touch). **⚠️ 앱 빌드가 깨지지 않는지**: deck-render-entry/번들이 src/app 에서 import 안 됨 확인(grep).
- ⚠️ 백그라운드 장기 프로세스 금지(워커 테스트는 띄웠다 닫기). LLM·DB 금지.
- **메인이 라이브 PDF 다운로드 재검증**(dev+워커+브라우저).

## 5. Return Format (5섹션)
- ✅ 한 일 / ❌ 못한 일 / 🤔 결정(ADR 후보만) / 🔬 검증(번들 빌드 + /render-deck fixture→PDF 8p + typecheck/manifest + 앱 import 0) / ⚠️ 위험(자산 경로·번들 React 버전·Cloud Run)
- `git diff --name-only` ⊆ CAN-touch. 신규 의존성(esbuild — render-worker 한정) 명시.

## 6. Hints
- 라우트는 이미 `renderDeckViaWorker(deckSpec)`→`POST ${RENDER_WORKER_URL}/render-deck {deckSpec}` 를 호출(worker-client.ts). 워커는 그 계약(`{deckSpec}`→PDF)만 맞추면 됨.
- 워커 server.mjs 의 HTML→PDF 로직(setContent→fonts.ready→page.pdf)을 `/render`·`/render-deck` 공용 헬퍼로 추출 권장.
- esbuild `@/` alias: `{ alias: { '@': path.resolve('src') } }` 또는 `esbuild-plugin-tsconfig-paths`. react-dom/server 는 platform node 에서 정상 번들.
- 번들 import 는 워커에서 `await import(new URL('./deck-render.bundle.mjs', import.meta.url))`.
- build-worker-html.ts 는 앱에서 더 이상 import 안 됨(라우트 수정 완료) — entry 가 그 인라인 로직을 재사용/복제.

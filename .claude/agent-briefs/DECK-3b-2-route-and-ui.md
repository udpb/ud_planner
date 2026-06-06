# DECK-3b-2 — 덱 생성/렌더 API 라우트 + 미리보기·PDF 다운로드 UI

> 자급자족 브리프. `이 브리프 + CLAUDE.md + AGENTS.md + docs/glossary.md + docs/decisions/025-deck-first-html-substrate.md` 만으로 작업. 의문 = STOP 후 보고. Next.js 16 — `node_modules/next/dist/docs` 의 관련 가이드 먼저 읽고 라우트/RSC 작성.

- **트랙/ID**: DECK-3b-2 (ADR-025 Phase 3b)
- **상태**: 🟡 in-progress
- **선행(✅)**: DECK-1(render-html) · DECK-2(rich) · DECK-3/3a(author 실 LLM 작동, 메인 E2E 검증) · DECK-3b-1(렌더 워커 `render-worker/` — `POST /render {html}`→PDF).

---

## 0. 왜
author가 실 프로젝트+실 코퍼스로 당선 덱을 자동 생성함이 검증됐다(메인 E2E). 렌더 워커도 작동한다. 이제 **앱에 배선**한다: PM이 프로젝트에서 "덱 생성"→미리보기→"PDF 다운로드". **이게 ud-planner에서 덱을 보이게 하는 단계.** (production 배포·master 머지는 이후.)

## 1. 목표 (한 문장)
프로젝트에서 **덱을 생성(grounding→author)**하는 API 라우트, **DeckSpec→워커→PDF 다운로드** 라우트, 그리고 **미리보기(클라 React, chromium 불필요)+생성/다운로드 버튼 UI**를 만든다.

## 2. 스코프 — CAN touch / MUST NOT touch
**CAN touch:**
- 신규 `src/app/api/projects/[id]/deck/route.ts` (POST 생성).
- 신규 `src/app/api/projects/[id]/deck/pdf/route.ts` (POST 렌더→PDF).
- 신규 `src/lib/deck/build-worker-html.ts` — `deckSpecToElements`→`buildDeckHtml`(DECK-1) 결과의 **이미지 자산을 data URI 로 인라인**(워커는 파일 접근 0; 폰트는 buildDeckHtml 이 이미 인라인). public/ 의 `/design-kit/...` 를 `fs` 로 읽어 base64.
- 신규 `src/lib/deck/worker-client.ts` — `renderViaWorker(html): Promise<Buffer>` (fetch `RENDER_WORKER_URL`/render + `X-Render-Token`).
- UI: 프로젝트 상세 화면에 "덱" 영역 추가 — **기존 페이지에 최소 침습**으로 섹션/탭 추가하거나 신규 컴포넌트 `src/components/deck/*`. 미리보기 컴포넌트(`deckSpecToElements(deck)` 를 scale 컨테이너에 렌더) + 생성/다운로드 버튼.
- `.env`/`.env.example` 에 `RENDER_WORKER_URL`(기본 `http://localhost:8080`)·`RENDER_WORKER_TOKEN` 주석 추가(값 X).

**MUST NOT touch:**
- `prisma/schema.prisma`(스키마 변경 금지 — **DeckSpec 영속화 안 함**, 아래 §3) · `invokeAi` 시그니처 · `express/schema.ts` 섹션 키 · 모듈 manifest.
- `render-worker/**`(DECK-3b-1 — 수정 금지) · `src/lib/deck/{spec,render-spec,render-html,author}.ts` 로직(import·재사용만; 필요한 신규 export 는 최소).
- 다른 트랙(Express turn/Deep/Brain).

## 3. 설계 결정 (지킬 것)
- **영속화 없음(v1)**: DeckSpec 을 DB 에 저장하지 않는다(마이그레이션 회피). 생성 라우트가 **DeckSpec 을 클라에 반환** → 클라가 보관 → PDF 라우트에 **body 로 DeckSpec 전달**. (영속화는 후속 DATA 브리프.)
- **렌더는 워커에서만**: Next 앱은 chromium 안 띄운다. PDF 라우트 = `deckSpec→elements→build-worker-html(이미지 인라인)→renderViaWorker→PDF` 스트리밍(`Content-Type: application/pdf`, `Content-Disposition: attachment`).
- **미리보기는 클라**: 브라우저가 `deckSpecToElements` 결과를 직접 렌더(고해상 PDF 불필요). 16:9 비율 컨테이너 scale.
- **생성 라우트 = assemble 라우트 패턴 재사용**: `requireProjectAccess` → Project(rfpParsed·programProfile·expressDraft) 로드 → EngineInput 구성(채널: body>autoDiagnosis>rfp.projectType) → `gather` → `findWinningReference` → `authorDeck` → `{ deckSpec }`. `maxDuration=300`. (winThemes 는 옵션 — 없어도 됨.)
- AI 진입점 = invokeAi 단일(author 가 이미 준수). 라우트에서 직접 LLM 호출 추가 금지.

## 4. 구현 메모
- 생성 라우트 입력/권한은 `src/app/api/projects/[id]/assemble/route.ts` 를 **그대로 참고**(EngineInput 구성·resolveChannel·requireProjectAccess). 단 generateDraft 대신 gather+authorDeck.
- `build-worker-html.ts`: `buildDeckHtml` 출력에서 `(src|href)="file://...png|svg"` 와 `url(file://...)` 를 public 파일 base64 data URI 로 치환(메인이 fixture 만들 때 쓴 방식과 동일). **결과 HTML 에 file:// 0** 이어야 워커에서 안 깨짐.
- `renderViaWorker`: `fetch(`${process.env.RENDER_WORKER_URL}/render`, {method:'POST', headers:{'content-type':'application/json', 'X-Render-Token': process.env.RENDER_WORKER_TOKEN ?? ''}, body: JSON.stringify({html})})` → arrayBuffer→Buffer. 실패 시 5xx + 메시지.
- ⚠️ **Next 16 RSC**: `renderToStaticMarkup`(buildDeckHtml 내부)은 라우트 핸들러(Node 서버 런타임)에서 동작해야 함 — `export const runtime = 'nodejs'` 명시. 'use client' 컴포넌트의 정적 렌더가 라우트에서 문제되면 STOP 후 보고(우회: 서버-안전 렌더 경계 분리).
- UI 미리보기는 'use client' 컴포넌트에서 `deckSpecToElements` 사용.

## 5. 검증
- **결정론(서브 직접, LLM·DB·auth 없음)**: `scripts/_check-deck-pdf.ts` — fixture `docs/samples/fixtures/deckspec-B2G.json` → `deckSpecToElements` → `build-worker-html`(file:// 0 단언) → **로컬 실행 중인 워커**(`node render-worker/server.mjs` 백그라운드 또는 안내)에 `renderViaWorker` → 유효 PDF(`%PDF-`)·8페이지 단언. 워커 미기동이면 build-worker-html 의 file:// 0 + HTML 유효까지만 단언하고 PDF 단계는 skip 보고.
- `npm run typecheck` 0 · `npm run lint`(touch) · `npm run check:manifest` 통과.
- ⚠️ **생성 라우트의 실 LLM E2E 는 서브가 돌리지 말 것**(쿼터·긴 run). authorDeck 은 이미 메인이 E2E 검증함. 라우트 배선·typecheck 까지가 서브 책임. 메인이 dev 서버+워커로 풀 E2E 확인.
- ⚠️ 백그라운드 장기 프로세스 금지(워커 테스트는 띄웠다 닫기).

## 6. Return Format (5섹션)
- ✅ 한 일 / ❌ 못한 일(생성 라우트 실 LLM 미검증·RSC 이슈 등 명시) / 🤔 결정(ADR 후보만) / 🔬 검증(_check-deck-pdf 출력 + typecheck/lint/manifest) / ⚠️ 위험(RSC·워커 URL·이미지 인라인·미영속화)
- `git diff --name-only` ⊆ CAN-touch 확인. 신규 의존성 명시(없어야 정상).

## 7. Hints
- 워커는 로컬에서 `cd render-worker && node server.mjs`(기본 8080) — 테스트 전 띄우기. 인증 토큰 미설정이면 통과.
- 이미지 인라인 helper 는 메인이 `render-worker/fixtures/sample-deck.html` 만들 때 쓴 정규식과 동일 로직(이미 검증됨): `(src|href|xlink:href)="file://"` + `url(file://)`.
- 미리보기 scale: `.ud-slide-canvas` 는 1280×720 고정 → `transform: scale()` 컨테이너로 축소.
- UI 침습 최소: 프로젝트 페이지에 "덱" 탭/카드 하나 + 생성/다운로드. 과한 리디자인 금지(디자인 시스템 `ud-design-system` 스킬 준수).

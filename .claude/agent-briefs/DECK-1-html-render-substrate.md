# DECK-1 — HTML 렌더 기질 수직 슬라이스 (HTML 슬라이드 → 고해상 PDF) + 리치 컴포넌트 proof

> 자급자족 브리프. `이 브리프 + CLAUDE.md + AGENTS.md + docs/glossary.md + docs/decisions/025-deck-first-html-substrate.md` 만으로 작업. 의문 = 추측 금지, STOP 후 메인 보고.

- **트랙/ID**: DECK-1 (ADR-025 Phase 1)
- **상태**: 🟡 in-progress
- **근거 ADR**: ADR-025 (Proposed) — 반드시 정독. (ADR-024는 OOXML 보조 강등 — 이 브리프에서 OOXML 빌더 건드리지 말 것.)

---

## 0. 왜 (맥락)
사용자 평가: 현재 PPTX 출력이 실제 당선 덱의 **20-30%** 수준. 구조적 천장 = ①8패턴 추상 어휘 ②손코딩 사각형(OOXML) 기질 ③산문→슬라이드 슬라이싱. ADR-025 결정: **기질을 HTML/CSS → headless 브라우저 고해상 PDF로 전환**(편집 PPTX는 보조). DECK-1은 이 전환의 **인프라 de-risk + 육안 검증 가능한 수직 슬라이스**다. 저작(스토리라인·비평·grounding)은 후속 브리프(DECK-2~4·DATA-2) — **여기선 다루지 않는다.**

## 1. 목표 (한 문장)
기존 브랜드 HTML 슬라이드 시스템(`SlideShell` + `underdogs-slide.css` + `diagrams/`)을 **headless 브라우저로 고해상 PDF로 렌더하는 결정론적 파이프라인**을 세우고, **리치 어휘(아이콘·이미지/사진·로고·배지·밀도 높은 맞춤 레이아웃)**를 적용한 6~8장 proof 덱을 PDF로 출력해 "당선 덱에 근접한" 시각 품질을 시연한다. **LLM·DB 없이.**

## 2. 스코프 — CAN touch / MUST NOT touch

**CAN touch:**
- 신규 `src/lib/deck/render-html.ts` (또는 유사) — React 슬라이드 → 정적 HTML → headless PDF 렌더 함수.
- `src/components/express/slides/SlideShell.tsx`, `src/components/express/slides/diagrams/index.tsx` — 어휘 확장(아이콘·이미지 슬롯·새 리치 컴포넌트 추가). 기존 props 하위호환.
- 신규 리치 컴포넌트 파일 `src/components/express/slides/rich/*.tsx` (아이콘 process, 사진 조직도, 파트너/로고 그리드, 배지, 콜아웃, 빅넘버 hero, 주석 이미지 블록 등).
- `src/styles/underdogs-slide.css` — 신 컴포넌트 스타일 추가(디자인 킷 준수).
- 폰트/자산: `public/design-kit/` 하위에 폰트(@font-face용 woff/ttf)·아이콘·샘플 이미지 추가 가능. (없으면 조달 방법 명시.)
- 신규 `scripts/_render-deck.ts` (검증 하니스), `docs/samples/fixtures/deck-v3.tsx` 또는 `.ts`(리치 fixture 덱 정의), 출력 `docs/samples/sample-deck-v3.pdf`.
- 의존성: `playwright`(또는 `puppeteer`) devDependency 추가 가능. 가장 가벼운·신뢰 가능한 것 선택. (서버리스/Vercel chromium 패키징은 **이 브리프 범위 밖** — 발견사항만 보고.)

**MUST NOT touch:**
- `src/lib/diagrams/pptx-builder.ts` (OOXML — ADR-025에서 보조로 강등, DECK-1 무관).
- `src/lib/express/schema.ts` 섹션 키 1~7·슬롯 enum.
- `src/lib/ai-fallback.ts` `invokeAi` 시그니처. `prisma/schema.prisma`. 모듈 manifest.
- 생성 파이프라인(`produce-slide-specs.ts`·engine/) — 저작은 후속 브리프.
- 다른 트랙(Express turn/Deep/Brain) 컴포넌트.

## 3. 레퍼런스 (활용)
- 기존 자산: `SlideShell.tsx`(16:9 캔버스·로고·density·cover/divider variant), `src/components/express/slides/diagrams/index.tsx`(8 패턴 React), `src/styles/underdogs-slide.css`(CSS 변수·`.ud-slide-canvas` 등), 로고 `/public/design-kit/logo/underdogs-*.svg`.
- `design-kit/learned-slide-patterns.json` — 밀도(블록 ~12.5)·당선 헤드라인 톤.
- `design-kit/diagram-samples/*.json` + `design-kit/templates/*.pptx` — 당선 덱 레이아웃·비주얼 감각.
- 디자인 킷 규칙(메모리 `reference_underdogs_design_kit` 정신): 단일 accent `#F05519`(10~15%), 라운드/그림자/이모지/그라데이션 **금지**, tint vs stroke 박스, NanumHuman(KR)/Poppins(EN·숫자), 로고 1개. 아이콘은 **단색 라인(stroke)**, 장식 금지.

## 4. 구현

### 4-1. 렌더 파이프라인 (핵심 de-risk)
- **결정론적 오프라인 렌더**(dev 서버·DB·LLM 불필요): 슬라이드 React 컴포넌트를 `react-dom/server`의 `renderToStaticMarkup`으로 정적 HTML 문자열화 → `underdogs-slide.css` + `@font-face`(폰트 파일) + 로고/이미지(파일경로 또는 data URI) 인라인한 자체완결 `.html` 작성 → headless 브라우저가 `file://` 로드 → `page.pdf()`.
  - 페이지 크기 **16:9 고정**(예: 1280×720px, `printBackground: true`, 배경/색 보존). 슬라이드 1장 = PDF 1페이지(딱 맞게, 잘림/여백 없이).
  - 한글 폰트 **임베드 확인**: NanumHuman(또는 NanumGothic 등 디자인 킷 지정 폰트)을 `@font-face`로 로드 → chromium이 렌더·임베드. 폰트 파일이 레포에 없으면: 조달(공개 폰트 다운로드/번들) 또는 대체 + **위험으로 보고**.
  - 'use client' 컴포넌트의 정적 렌더 이슈(Next 번들 조건) 발생 시: 슬라이드 렌더에 필요한 최소 컴포넌트를 순수 함수로 분리하거나, 임시 정적 라우트를 띄워 Playwright가 navigate 하는 대안 허용. **단 최종 검증은 LLM·DB 없이 1커맨드로 재현 가능해야 함.**
- 함수 시그니처(예): `renderDeckToPdf(slides: ReactElement[], outPath: string): Promise<void>`.

### 4-2. 어휘 확장 (proof 범위 — "할 수 있다"를 보여주는 수준)
ADR-024 레이아웃 6종을 HTML로 계승하되, **OOXML로 불가능했던 어휘**를 최소 다음을 포함해 시연:
- **아이콘**: 단계/항목에 단색 라인 아이콘(lucide-react 또는 인라인 SVG).
- **이미지/사진 슬롯**: 표지 또는 배경에 실제 이미지(샘플 이미지 1~2개 `public/design-kit/sample/`), 사진 박힌 코치/조직 카드.
- **로고/파트너 그리드 또는 배지**: 실적/파트너 생태계 한 장.
- **밀도 높은 맞춤 레이아웃**: 빅넘버 hero, 주차 커리큘럼 그리드(아이콘+세부), 마일스톤 타임라인 — 당선 덱 밀도(블록 ~12) 수준.
- 디자인 킷 가드 준수(accent 비율·라운드/그림자/이모지 금지).

### 4-3. 리치 fixture 덱
- `docs/samples/fixtures/deck-v3.*` — 손작성 충남 청년창업 B2G proof 덱 6~8장: 표지(이미지) · 배경/목적(빅넘버 hero 또는 before-after) · 전략(아이콘 process/matrix) · 커리큘럼(아이콘 그리드+타임라인) · 코치진(사진 조직도) · 실적/파트너(로고 그리드+배지) · 임팩트(KPI). **액션 타이틀 톤**(learned headline 스타일)으로.
- 내용은 예시(grounding 아님) — 시각 어휘·밀도·기질을 시연하는 게 목적.

## 5. 검증 (결정론적 — 메인이 재확인)
- `npx tsx scripts/_render-deck.ts` → `docs/samples/sample-deck-v3.pdf` 생성. 출력:
  - PDF 페이지 수 = 슬라이드 수, 각 페이지 16:9.
  - **한글 렌더 확인**: PDF 텍스트 추출 또는 슬라이드 1장 PNG 스냅샷으로 한글 깨짐 없음 확인(가능하면 `docs/samples/sample-deck-v3-p1.png`도 출력).
  - 폰트 임베드 여부 보고.
- **합격선**: 유효 PDF 생성 · 페이지=슬라이드 수 · 16:9 · 한글 정상 · 6~8장 모두 리치 어휘(아이콘/이미지/로고 중 ≥3종 등장) 적용.
- `npm run typecheck` 0 · `npm run lint`(touch 파일) · `npm run check:manifest` 통과.
- ⚠️ **금지**: 긴 백그라운드 프로세스 띄우고 종료. LLM·DB 호출 금지. 검증은 1커맨드 결정론적 렌더로 한정.
- ⚠️ 서버리스/Vercel chromium 패키징은 풀지 말 것 — **발견사항만** ⚠️위험에 보고(예: `@sparticuz/chromium` 필요, 콜드스타트, maxDuration).

## 6. Return Format (5섹션 — 그대로)
- ✅ 한 일 / ❌ 못한 일 / 🤔 결정(ADR 후보만 보고) / 🔬 검증(PDF 경로·페이지수·폰트임베드·스냅샷 + typecheck/lint/manifest) / ⚠️ 위험(특히 Vercel 렌더 인프라·폰트·렌더시간)
- `git diff --name-only` ⊆ CAN-touch 확인 보고. 추가한 의존성 명시.

## 7. Hints
- 슬라이드는 정적(인터랙션 0)이라 `renderToStaticMarkup`이 자연스럽다. CSS는 빌드 거치지 말고 `underdogs-slide.css` 원문 + 전역 토큰(`:root` 변수)을 인라인.
- 폰트는 chromium이 *실제 사용*해야 임베드된다 — `@font-face` + 실제 적용 확인.
- 이미지/로고는 `file://` 로드 시 절대경로 또는 data URI 라야 깨지지 않는다.
- Playwright 설치 시 `npx playwright install chromium` 필요할 수 있음(보고).
- 작게 시작: 슬라이드 1장 PDF부터 통과시키고 어휘·장수 확장.

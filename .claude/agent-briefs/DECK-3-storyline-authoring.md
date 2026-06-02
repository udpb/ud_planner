# DECK-3 — 덱-우선 자동 저작: 스토리라인 아키텍트 + 슬라이드별 저작 + 스펙↔렌더 계약

> 자급자족 브리프. `이 브리프 + CLAUDE.md + AGENTS.md + docs/glossary.md + docs/decisions/025-deck-first-html-substrate.md` 만으로 작업. 의문 = 추측 금지, STOP 후 메인 보고.

- **트랙/ID**: DECK-3 (ADR-025 Phase 3)
- **상태**: 🟡 in-progress
- **선행(✅)**: DECK-1(`src/lib/deck/render-html.ts` HTML→PDF) · DECK-2(`src/components/express/slides/rich/index.tsx` 당선 밀도 컴포넌트 11종 + fixture `docs/samples/fixtures/deck-v3.tsx`).

---

## 0. 왜 (맥락)
DECK-2까지는 **사람이 손으로** 당선 밀도 덱을 만들 수 있음을 증명했다(`deck-v3.tsx`). DECK-3의 임무 = **프로젝트마다 그 덱이 자동으로 나오게** 하는 저작 파이프라인. 단 LLM·DB가 필요하므로(현재 로컬 DB down) — **결정론적으로 검증 가능한 "스펙↔렌더 계약"을 먼저 확정**하고(JSON 스펙이 DECK-2 컴포넌트를 구동해 동일 품질 PDF), **LLM 저작 함수는 명확한 인터페이스로 구현하되 실행 검증은 환경 가용 시 메인이 직접**(브리프 §5). **앱 라우트·UI 배선은 DECK-3b(후속)** — 본 브리프 범위 밖.

## 1. 목표 (한 문장)
(1) DECK-2 리치 컴포넌트 11종을 **타입 안전한 `DeckSpec`(JSON)** 으로 표현하는 스펙과 **`DeckSpec → React → PDF` 렌더 브리지**를 만들고, (2) 그 DeckSpec을 RFP·grounding·유사 당선 덱 골격에서 **자동 생성**하는 스토리라인 아키텍트 + 슬라이드별 저작 함수를 구현한다. **검증은 손작성 fixture DeckSpec(JSON)이 DECK-2 밀도의 PDF로 렌더되는지(LLM·DB 없이)로 한다.**

## 2. 스코프 — CAN touch / MUST NOT touch

**CAN touch (신규 lib 중심):**
- 신규 `src/lib/deck/spec.ts` — `DeckSpec` 타입 + zod 스키마. 슬라이드 = `kind` 판별 유니온, 각 kind는 DECK-2 컴포넌트(`rich/index.tsx`)와 표지/디바이더/마무리(DECK-1)의 props를 **1:1로** 담는다. + 근거(`EvidenceItem`) 공통.
- 신규 `src/lib/deck/render-spec.tsx` — `deckSpecToElements(spec: DeckSpec): ReactElement[]`. 각 슬라이드 spec → 해당 React 컴포넌트로 매핑(+ SlideShell·표지·디바이더·마무리). `renderDeckToPdf`(DECK-1)에 그대로 투입 가능.
- 신규 `src/lib/deck/author.ts` — 저작 파이프라인(invokeAi 단일 진입점 사용):
  - `architectStoryline(...)`: grounding + 유사 당선 덱 골격 → 슬라이드별 **아웃라인**(액션 타이틀 + so-what + 선택 component `kind` + 근거 요건). learned 헤드라인 톤·섹션별 패턴 시드.
  - `authorSlide(outline, grounding)`: 선택된 component의 content 슬롯을 grounding에서 채움(출처-only 근거 금지 → 수치+메커니즘+출처).
  - `authorDeck(input)`: 위를 오케스트레이션 → `DeckSpec` 반환.
- `scripts/_render-deck.ts` 확장 또는 신규 `scripts/_render-spec.ts` — fixture DeckSpec(JSON) → `deckSpecToElements` → `renderDeckToPdf` → PDF + 전페이지 PNG + 밀도 측정.
- 신규 fixture `docs/samples/fixtures/deckspec-B2G.json` — DECK-2 `deck-v3` 와 동등한 덱을 **JSON DeckSpec**으로 손작성(스펙↔렌더 계약 증명용).

**MUST NOT touch:**
- `src/app/**` (라우트·페이지·UI) — **DECK-3b**.
- `src/components/express/slides/rich/*` 컴포넌트 **props 변경 금지**(읽고 import만; 새 prop 필요하면 STOP 후 보고).
- `src/lib/express/schema.ts` 섹션 키·슬롯 enum · `invokeAi` 시그니처 · `prisma/schema.prisma` · 모듈 manifest.
- `src/lib/diagrams/pptx-builder.ts`(OOXML 보조) · `produce-slide-specs.ts`(구 slideSpec 경로 — 본 트랙과 별개, 건드리지 말 것).
- 다른 트랙(Express turn/Deep/Brain).

## 3. 입력·grounding (기존 자산 재사용 — 발명 금지)
- 엔진 표면: `src/lib/express/engine/{index,gather,types}.ts` — `generateDraft`·`gather`·`EngineInput`·`EvidencePool`·`EngineResult`. **author 의 입력 = grounding(EvidencePool + 프로젝트 사실 + workstreams + win-themes + trackRecord)**. ⚠️ **기존 7섹션 산문을 "썰지" 말 것** — grounding에서 덱을 *새로 설계*(deck-first, ADR-025).
- 유사 당선 덱 골격: `src/lib/express/winning-reference.ts`(`findWinningReference`·`retrieveWinningPassages`) + `src/lib/retrieval/*` — 가장 유사한 당선 덱의 슬라이드 골격을 storyline 시드로. (DB 필요 → 실행은 환경 가용 시.)
- 밀도·톤·패턴: `design-kit/learned-slide-patterns.json`(블록~12.5·당선 헤드라인 30·섹션별 패턴) · `src/lib/diagrams/learned-patterns.ts`.
- 컴포넌트 어휘: `rich/index.tsx`(IconProcess·IconCardGrid·PhotoOrgGrid·PartnerLogoGrid·BadgeRow·BigNumberHero·AnnotatedImage·MilestoneTimeline·CoachDetailGrid·CurriculumMatrix·KpiWithLogic·StrategyCanvas·EvidenceBand) + `diagrams/index.tsx`. **DeckSpec kind 는 이 목록에서 파생.**
- 디자인/근거 원칙: 단일 accent·라운드/그림자/이모지 금지(렌더는 컴포넌트가 이미 보장). 근거 = 수치+무엇을 증명+출처. 수치 창작 금지(grounding/제공값만; 실 숫자는 DATA-2).

## 4. 구현 메모
- **스펙↔렌더 계약이 핵심**: `DeckSpec`은 JSON 직렬화 가능(React 노드 없음). `deckSpecToElements`가 유일한 React 경계. zod로 런타임 검증(LLM 출력 안전망) + 잘못된 kind/누락 슬롯은 명확히 reject 또는 안전 degrade.
- **author는 invokeAi만** 사용(eslint 강제). 품질-결정(스토리라인·헤드라인) = Pro 티어, plumbing(슬롯 채움) = Flash 가능(`ai/config` modelFor 참고). 출력은 `DeckSpec`에 zod-검증.
- **storyline = 수평 논리**: 표지 → 섹션별 1~N 슬라이드(액션 타이틀로 논증 전개) → 마무리. 유사 당선 덱 골격을 미러링하되 본 RFP grounding으로 채움.
- author는 **env-gated**: DB/LLM 없는 환경에서 import·typecheck는 통과하되 실제 호출은 안 함(검증 §5는 fixture 경로만).

## 5. 검증 (결정론적 — 메인이 PDF로 재확인)
- `npx tsx scripts/_render-spec.ts`(또는 확장된 `_render-deck.ts`): fixture `deckspec-B2G.json` 로드 → zod 검증 통과 → `deckSpecToElements` → `renderDeckToPdf` → `docs/samples/sample-deckspec-v3.pdf` + 전페이지 PNG + 밀도 측정표.
- **합격선**: JSON DeckSpec이 **DECK-2 동등 밀도**로 렌더 — 본문 평균 블록 ≥ 11 · dead-space < 15% · 모든 본문 근거 밴드 · 16:9 · 한글 · 유효 PDF · 디자인 킷 위반 0. (즉 "손코딩 React" 없이 **JSON이 덱을 구동**함을 증명.)
- `author.ts` 는 **typecheck·lint 통과**(인터페이스 확정) — 단 **실행 검증 안 함**(DB/LLM 의존, 메인이 환경 가용 시 직접). 그 사실을 ❌/⚠️에 명시.
- `npm run typecheck` 0 · `npm run lint`(touch 파일) · `npm run check:manifest` 통과.
- ⚠️ 백그라운드 장기 프로세스·LLM·DB 호출 금지(검증 경로). author 실 호출은 메인 몫.

## 6. Return Format (5섹션)
- ✅ 한 일 / ❌ 못한 일(특히 author 실행 미검증) / 🤔 결정(ADR 후보만) / 🔬 검증(fixture spec→PDF 밀도 측정표 + PNG 경로 + typecheck/lint/manifest) / ⚠️ 위험
- `git diff --name-only` ⊆ CAN-touch 확인. 신규 의존성 명시(없어야 정상).

## 7. Hints
- `DeckSpec` 슬라이드 유니온 예: `{kind:'curriculumMatrix', kicker, headline, phases:[...], evidence:[...]}` 가 `CurriculumMatrix` props와 동형. 컴포넌트 props 인터페이스를 그대로 스펙으로 승격하면 매핑이 단순.
- 표지/디바이더/마무리는 DECK-1 패턴 재사용(`deck-v3.tsx` 참고).
- author 프롬프트는 컴포넌트 카탈로그(각 kind가 무엇에 적합한지)를 LLM에 제공 → kind 선택. learned 섹션별 패턴 빈도를 기본값 힌트로.
- 작게: 먼저 spec+render-spec+fixture로 "JSON→PDF" 통과시키고(결정론), 그다음 author.ts 인터페이스를 붙인다.

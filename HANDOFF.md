# HANDOFF — 세션 핸드오버 (라이브 문서)

> 매 세션 끝 메인이 **전체 덮어쓰기**. 새 세션 읽는 순서: **HANDOFF → [HISTORY](docs/HISTORY.md) → [glossary](docs/glossary.md) → [decisions/README](docs/decisions/README.md) → 활성 브리프**.
> 최종 정리: 2026-06-01 (덱 출력 구조 전환 아크 — DECK-3까지).

---

## 📍 현재 상태 (2026-06-01)

- **브랜치:** `feat/alpha-test-prep` (HEAD `141abc9`). auto-push 훅으로 origin 동기. ⚠️ **production은 `master`에서 배포 — 이 브랜치는 master보다 ~61커밋 앞서며 미머지. 즉 엔진·덱 작업 전부 아직 production(ud-planner) 미반영(정상 — 배선·검증 후 머지 예정).**
- **무엇을 만들었나 (직전 아크 = 덱 출력 구조 전환):** 사용자 피드백 "PPTX가 당선 덱의 20-30%" → 구조적 천장 진단(8패턴 추상 어휘·손코딩 OOXML 기질·산문→슬라이드 슬라이싱) → **ADR-025 덱-우선 HTML 렌더 기질 전환**. DECK-1(HTML→고해상 PDF 렌더) · DECK-2(당선 밀도·디테일 컴포넌트 11종 + proof) · DECK-3(**JSON DeckSpec↔렌더 계약** + 덱-우선 저작 파이프라인). **모두 메인 육안+측정 검증 통과.**
- **그 이전 아크 = 생성 엔진:** 운영 인프라 → 과업 레이어 → 검색 계약 → 단일 생성 엔진 → 검증 레이어 → Gemini 단일화 → 도식 PPTX(OOXML, ADR-024 → 025에서 보조 강등).
- **일하는 방식:** 위임+검증+투명보고 (ADR-020). 메인=구조/문서, 기능 코드=자급자족 브리프 위임.

## ✅ 완료·작동 (검증됨)
| 영역 | 상태 |
|---|---|
| 운영 인프라 (ADR-020) | playbook·glossary·HANDOFF·HISTORY·brief 시스템. stale 8건 archive. |
| 과업 레이어 (ADR-019) | Prisma 8모델(42→50) + migration **DB 적용 완료** + workstream types/adapter. |
| 단일 검색 계약 (RET-1) | `src/lib/retrieval/` — Contextual·hybrid·RRF·Flash rerank·recall eval. |
| **단일 생성 엔진 (EX-1, ADR-021)** | `src/lib/express/engine/` — gather→assemble(과업 투영)→win-theme→compliance→verify→self-score→정제. `POST /api/projects/[id]/assemble`. **E2E 7섹션 1차본 생성.** |
| 검증 레이어 (EX-2) | proof 강제 win-theme·compliance matrix·결정론 faithfulness gate. |
| 정직한 측정 (EVAL-1) | judge가 win-theme/compliance/인용 입력으로 봄·다중샘플 n=3·**단조 refine(역행 0)**. |
| Gemini 단일화 (ADR-023) | `@google/genai 2.7.0`, Claude 제거, intra-Gemini 폴백. SDK 마이그레이션 완료. |
| 모델 2-tier (ADR-022) | **하이브리드** — 기본 3.5 Flash, **Pro 3키**(`engine.section.core`·`engine.self-score`·`engine.wintheme`). 폴백 3.1Pro→2.5Pro→3.5Flash. |
| 품질 sharpening (QUAL-1·2) | evidence/differentiation grounding·ghosting·named 컨셉 + §3 주차 커리큘럼표·전체 타임라인·실행계획 + **slideSpecs→도식 PPTX(22슬라이드)**. |
| **덱 HTML 렌더 기질 (DECK-1, ADR-025)** | `src/lib/deck/render-html.ts` — React 슬라이드→`renderToStaticMarkup`→headless chromium(playwright) **고해상 PDF**(16:9, 한글 폰트 임베드). 표지·KPI 슬라이드 당선덱급. |
| **당선 밀도 컴포넌트 (DECK-2)** | `src/components/express/slides/rich/*` 11종(코치 약력+정량배지·24주 주차×단계 매트릭스·KPI+산출논리·전략 캔버스·근거 밴드 등). 본문 평균 **12.9 블록·dead-space 1.5%**(당선 평균 12.5). |
| **스펙↔렌더 계약 + 저작 (DECK-3)** | `src/lib/deck/{spec.ts,render-spec.tsx}` — **JSON DeckSpec → 렌더가 DECK-2와 픽셀 동등**. `author.ts` 덱-우선 저작(architectStoryline→authorSlide→authorDeck, invokeAi 단일). ⚠️ author는 **env-gated**(LLM/DB 필요 — 실행 검증 미완). |

## 📊 정직한 품질 현황
- 엔진은 **유능한 멀티 과업 1차본**을 만든다(과업 분리·named 컨셉·주차 커리큘럼·타임라인·리스크 레지스터·도식 PPTX). 샘플: **`docs/samples/sample-draft-B2G-v2.{md,pptx}`** (사용자 검증용).
- 외부 패널 점수는 **~52~66(보완필요/미흡)에서 plateau** — fixture RFP + 얕은 매칭 코퍼스 기준. self-score(74~78)는 자가 judge가 부풀린 값(외부 패널과 괴리).
- ⚠️ **합성 튜닝(EX-2·EVAL-1·QUAL-1·2)은 수확 체감 도달.** 최약 렌즈 = **evidence·differentiation**, 이는 **실 자산 grounding(DATA-2)·실 RFP**에 의존 — 생성 튜닝 아닌 **데이터** 문제.
- ⚠️ 측정 한계: 패널 프롬프트가 섹션을 900자로 잘라 채점 → 주차 표가 잘려 과소평가. (실 §3엔 온전. `_gen-sample.ts` PANEL slice 상향 필요.)

## 🎯 다음 진짜 레버 (우선순위)
1. **DECK-3b** — `author.ts` 실 LLM 실행 검증(DB/env 필요) + **API 라우트**(`/api/projects/[id]/deck` = authorDeck→renderDeckToPdf) + **앱 UI**(미리보기·PDF 다운로드). **이게 덱을 ud-planner에서 보이게 만드는 단계.** 이후 master 머지 → Vercel 배포.
2. **DECK-4** — 슬라이드별 비평 루프(디자인+설득 critic, 멀티 에이전트) — 자동 생성물의 밀도·근거·so-what 게이트.
3. **DATA-2** — pgvector + **실 코퍼스/실 자산 grounding**(`learn-winning-fulltext`+`embed-winning-chunks` 운영화) → 덱 evidence·§7 실적 수치 *진실화*(현재 fixture는 예시). 배선은 됨(gather→retrieve→winning chunks), 데이터 적재·임베딩이 미완. author의 grounding 소스.
4. **실 RFP + 실 연결 자산으로 검증** (fixture 아님).
5. **headless 렌더 서버리스 인프라** — Vercel은 chromium 미포함 → `@sparticuz/chromium`+puppeteer-core 또는 별 렌더 워커(Cloud Run). 렌더 시간·콜드스타트·번들 50MB. DECK-3b 전 결정 필요.
6. async 라우트(생성 장시간 > Vercel 타임아웃) · 레거시 3엔진 제거 · AI-2(트레이싱)·BR-batch · WinningPattern 벡터 재임베딩.

## 🔑 모델·인프라 핵심
- **Gemini 단일** (`@google/genai`). Pro=`gemini-3.1-pro-preview`(품질·RPD **250/일**), Flash=`gemini-3.5-flash`(plumbing·RPD 10K). Tier 2는 ~30일 뒤(빌링). Flash-우세라 평소 Pro 소진 적음.
- ⚠️ `.env.local` GEMINI_MODEL 핀 **제거됨**(과거 구형 flash 둔갑 버그 해소). 모델은 `ai/config.ts` MODEL_ROUTING(가변)이 제어.
- DB: 로컬 migration 동기(24개). 운영(Neon)은 `migrate deploy` 시 add_workstream_layer 적용 필요.

## ⚠️ 함정 / 하지 말 것 (검증된 교훈)
- **planning-agent 통째 삭제 금지** — `lib/ai/config.ts`·`modules/_types.ts`·`api/agent/*` 라이브 import.
- **브랜치 일괄 삭제 금지** (건별 `--merged` 확인). **회귀 스크립트 선삭제 금지**(vitest 커버 후).
- **stale worktree 2개 실재** — `.claude/worktrees/{amazing-khorana,blissful-goodall}-*` (사용자 확인 후 삭제).
- **서브 에이전트가 측정 run을 자기 백그라운드로 띄우면 결과 미수집** — 측정은 메인이 직접 완주(EVAL-AB·QUAL 교훈).

## 🗂 transient (무시 — gitignore)
- `eval-results-ab-*/`·`*.log`·`docs/samples/snaps*/` (전부 gitignore). `scripts/_gen-sample.ts` = 엔진 샘플 재생성기.
- **덱 렌더 검증(결정론적·LLM/DB 없음):** `npx tsx scripts/_render-deck.ts`(DECK-2 손코딩 fixture) · `npx tsx scripts/_render-spec.ts`(DECK-3 JSON DeckSpec). → `docs/samples/sample-deck-v3.pdf`·`sample-deckspec-v3.pdf`.
- `docs/samples/` = **샘플(스펙 아님)**. 스펙은 `docs/UD-Engine-*` + ADR-024/025.

## 보안/위생 follow-up
- express `turn`·`init` auth = ✅ 닫음(FIX-2). lint baseline 4 에러 = 무관 .tsx(setState-in-effect·children-prop) 잔존.

## 🏁 다음 진입 한 줄
**덱 출력 구조 전환(HTML 기질·당선 밀도·JSON 스펙↔렌더 계약)은 DECK-3까지 완료·검증. 다음 = DECK-3b(author 실 LLM 실행 + API 라우트 + 미리보기/PDF UI) — 이게 덱을 ud-planner에 보이게 한다. DB/env 올려 author 생성부터 메인이 직접 검증 → DECK-4(비평 루프)·DATA-2(실 grounding) → master 머지·배포.** (덱 검증: `_render-deck.ts`·`_render-spec.ts` → `docs/samples/*.pdf`.)

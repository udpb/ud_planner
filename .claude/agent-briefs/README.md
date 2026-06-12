# Agent Briefs — 서브 에이전트 위임 브리프

서브 에이전트에게 위임할 작업의 **자급자족 브리프** 모음. 메인 세션이 `Agent` 도구로 서브 에이전트를 생성할 때 브리프 내용을 `prompt` 로 전달한다.

> 일하는 방식: [../../docs/playbook/working-method.md](../../docs/playbook/working-method.md)
> 브리프 12항목: [../../docs/playbook/brief-checklist.md](../../docs/playbook/brief-checklist.md)
> 템플릿: [`_template.md`](./_template.md)

## 자급자족 원칙
서브 에이전트는 `브리프 + ../../CLAUDE.md + ../../AGENTS.md + ../../docs/glossary.md` 만으로 작업 가능해야 한다. 메인 세션 대화 컨텍스트 없음 가정. 막히면 추측 금지 → STOP 후 메인 보고.

## ID 트랙 prefix
| prefix | 트랙 |
|---|---|
| `EX{N}` | Express (생성 엔진·inspector·슬롯) |
| `BR{N}` | Brain (ingest·RAG·당선패턴·concept) |
| `DP{N}` | Deep (커리큘럼·코치·예산·임팩트) |
| `WS{N}` | Workstream 레이어 (ADR-019) |
| `UI{N}` | 프론트엔드 |
| `DATA{N}` | Prisma·migration·시드 |
| `EVAL{N}` | 평가·테스트·eval 하니스 |
| `FIX-*` / `DOCS-*` | 핫픽스 / 문서 정합성 |

## 호출 패턴
```
// Foreground (결과 즉시 필요)
Agent({ description, subagent_type: "general-purpose", prompt: <브리프 내용> })
// Background + worktree (병렬 독립 트랙, 파일 충돌 위험 시)
Agent({ ..., isolation: "worktree", run_in_background: true, prompt: <브리프> })
// 탐색 only (read-only)
Agent({ subagent_type: "Explore", prompt: "..." })
```

## 생명주기
🟡 in-progress → ✅ 완료 → `_archive/` 이동. 완료 후 메인이 `git diff --name-only` ⊆ CAN-touch 검증 → 위반 시 revert. 브리프는 살아있는 문서 — 실행 전 Prerequisites 재확인, 실행 후 교훈을 Hints 에 추가.

## 활성 브리프
- `UI-1-design-kit-app-migration.md` — 📦 **deferred** (2026-06-12). 앱 UI를 공식 디자인 킷 260529(`docs/design-kit/`)로 마이그레이션. 스킬(`ud-design-system` v2)은 선반영 완료 — 착수는 사용자 승인 + Open Decisions 3건(radius 전면 0 · lucide 존치 · NanumHuman 교체) 확정 후.
- `DECK-5-consume-planning.md` — ⏸️ **ON HOLD / 재스코프 대기 (2026-06-12)**. ADR-026 기반이나 사용자 2026-06-12 피드백으로 방향 전환 — 덱은 PipelineContext를 **재저작**하면 안 되고 **정본 텍스트 제안서를 받아 슬라이드로 변환하는 분리된 터미널 모듈**이어야 함. **ADR-027(026 supersede) 작성 + 브리프 재스코프 전까지 이 브리프대로 진행 금지.** 상세: [HANDOFF.md](../../HANDOFF.md) 최상단.
- `DECK-4-density-critic.md` — ✅ 완료 (2026-06-04). 밀도 비평 루프 + 여백 축소.
- `QUAL-THROTTLE-gather-backoff.md` — ✅ 완료 (2026-06-04). gather 동시성 + 429 백오프.
- `DECK-3b-2-route-and-ui.md` — ✅ 완료 (2026-06-04). API 라우트(`POST /api/projects/[id]/deck` 생성: gather→findWinningReference→authorDeck) + PDF 라우트(DeckSpec→build-worker-html(이미지 인라인)→워커→PDF) + 미리보기(클라 React)·다운로드 UI. **영속화 없음(v1, 마이그레이션 회피)**. 메인 E2E 검증: 실 프로젝트(계원예술대)→실 코퍼스 grounding→8장 덱 작동 확인(2026-06-04).
- `DECK-3b-1-render-worker.md` — ✅ 완료 (2026-06-04). 렌더 워커 12/12 검증. **ADR-025 Phase 3b.** 별도 렌더 워커(`render-worker/`, 컨테이너): `POST /render {html}` → 16:9 PDF. Next/deck 의존 0(범용 HTML→PDF). 자급자족 fixture(`render-worker/fixtures/sample-deck.html` 8p)로 로컬 결정론 검증. 다음(3b-2): API 라우트(grounding→authorDeck→워커) + 미리보기/다운로드 UI.
- `DECK-3a-author-slot-fidelity.md` — ✅ 완료 (2026-06-04). authorSlide per-kind 필드 예시 주입 + zod-error 1회 재시도 → **실 Gemini 스모크에서 1장→8장 완전 덱**(grounding 인용 정확). 메인 실측 검증.
- `DECK-3-storyline-authoring.md` — ✅ 완료 (2026-06-01). **ADR-025 Phase 3.** 스펙↔렌더 계약(`DeckSpec` JSON → DECK-2 컴포넌트 → PDF) + 덱-우선 자동 저작(스토리라인 아키텍트 + 슬라이드별 저작, invokeAi + 유사 당선 덱 골격). 검증=fixture DeckSpec(JSON)→당선 밀도 PDF(결정론적). LLM 실행·앱 UI 배선은 DECK-3b(환경 가용 후).
- `DECK-2-density-detail-proof.md` — ✅ 완료 (2026-06-01). **ADR-025 Phase 2.** 본문 슬라이드를 당선 덱 밀도(블록~12)·요소별 디테일(코치 약력+실적·주차별 커리큘럼·정량 근거)로 손작성 proof + 리치 컴포넌트 라이브러리 확정. DECK-3(자동저작)이 목표 삼을 밀도 규격. 검증=결정론적 PDF+전페이지 PNG.
- `DECK-1-html-render-substrate.md` — ✅ 완료 (2026-06-01). **ADR-025 Phase 1.** HTML 슬라이드 → headless 브라우저 고해상 PDF 렌더 기질 + 리치 어휘(아이콘·이미지·로고) proof 덱. 출력 "20-30% 천장" 구조 전환의 인프라 de-risk. 검증=결정론적 PDF 렌더(LLM·DB 없이). 후속: DECK-2(컴포넌트 라이브러리)·DECK-3(스토리라인)·DECK-4(비평 루프)·DATA-2(grounding).
- `EX-3-slide-composition-v2.md` — ✅ 완료 (2026-06-01, ADR-024). OOXML 레이아웃 아키타입 6종+고밀도. **ADR-025에서 OOXML은 "보조 편집 export"로 강등** — 산출물 유지(`docs/samples/sample-layout-v2-DEMO.pptx`), 플래그십은 HTML→PDF로 이동.

## 아카이브 (`_archive/`)
- `QUAL-2-sharpen-and-diagrams.md` — ✅ 완료 (2026-06-01). §3 주차 커리큘럼표·전체 타임라인·실행계획 + §2 named 컨셉 + slideSpecs→도식 PPTX(22슬라이드). 산출물 `docs/samples/sample-draft-B2G-v2.*`.
- `QUAL-1-evidence-differentiation.md` — ✅ 완료 (2026-06-01). win-theme→Pro 승격(3키)·evidence grounding·ghosting. 측정은 메인 직접.
- `EVAL-1-judge-refine-quality.md` — ✅ 완료 (2026-06-01). judge가 EX-2 산출물 봄·다중샘플 n=3·단조 refine(역행 0)·risk/ergonomics 보강. 점수 plateau 원인=코퍼스 grounding 확정.
- `EVAL-AB-flash-vs-hybrid.md` — ✅ 완료 (2026-06-01). Flash vs 하이브리드 패널 A/B → hybrid 66 vs flash 61(+5, win-deciding 렌즈 우위) → **하이브리드 유지**(ADR-022 §4-A). 실행은 메인 직접.
- `AI-3-flash-dominant-routing.md` — ✅ 완료 (2026-06-01). Flash-우세 라우팅(Pro=2키)·폴백 `3.1→2.5pro→3.5flash`·.env.local 핀 제거. 메인 검증(routing-probe).
- `EX-1-generation-engine.md` — ✅ 완료 (2026-06-01). 단일 생성 엔진 골격(gather→assemble 과업투영→self-score→정제) + assemble 라우트. **E2E로 7섹션 1차본 실제 생성**(self-score 71, 구형 flash). 메인 검증.
- `AI-1-genai-sdk-migration.md` — ✅ 완료 (2026-06-01). `@google/genai 2.7.0` 마이그레이션 + Gemini 단일화(Claude 제거)+intra-Gemini 폴백. 메인 검증(typecheck 0·구SDK 0). 🔴 런타임 positive는 spend cap 429로 보류.
- `RET-1-retrieval-contract.md` — ✅ 완료 (2026-06-01). 단일 검색 계약(RRF·Flash rerank/blurb·recall eval, 기존 모듈 wrap). 메인 검증(단위 14·typecheck·manifest).
- `DATA-1-workstream-schema.md` — ✅ 완료 (2026-06-01). 과업 레이어 8모델(42→50)·관계·nullable·types/ensure-default. 메인 검증. **migration 적용 완료**(resolve brain_models→migrate dev, 2026-06-01).
- `FIX-2-p0-truthing.md` — ✅ 완료 (2026-06-01). turn/init auth · embedding 768→3072+assert · web-search 판단(grounding). 메인 검증·eslint 예외 추가.
- `FIX-1-dead-code-removal.md` — ✅ 완료 (2026-06-01). 확정 죽은 코드 6건 삭제 + proxy/admin-brain 정리. 메인 검증 통과.
- `phase-3-enrich.md` · `phase-4-recommend.md` · `phase-5-coach-ui.md` · `guidebook/` · `redesign/` — 옛 Planning Agent / 가이드북 / 재설계 트랙 브리프 (2026-04 시대, 완료/superseded). 참조·결정 추적용 보존.

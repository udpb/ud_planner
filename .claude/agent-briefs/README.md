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
(없음 — compact 직전 클린업 완료. 다음 진짜 레버 = **DATA-2**(실 자산 grounding). HANDOFF 참조.)

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

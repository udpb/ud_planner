# HANDOFF — 세션 핸드오버 (라이브 문서)

> 갱신 룰: 매 세션 끝 메인 세션이 **전체 덮어쓰기** (git 으로 히스토리 추적).
> 새 세션 읽는 순서: **HANDOFF → HISTORY → glossary → 활성 브리프**.
> ⚠️ 이 파일이 단일 라이브 상태. 루트 `HANDOVER.md`(04-29) 는 stale — 아카이브 대상.

---

## 📍 현재 상태 (2026-06-01)

- **브랜치:** `feat/alpha-test-prep` (HEAD `0d39a3e`)
- **Phase:** Phase 3 — 종합 점검 후 **3기둥 재기획 + 운영 인프라 부트스트랩**
- **방금 한 일:** (1) ActBot 운영 체계 채택 → 운영 인프라 부트스트랩 (ADR-020). (2) **대규모 정리** — stale 문서 8건 archive·참조 전수 수정(README/CLAUDE/ROADMAP/PRD-Brain/ADR-015·017)·확정 죽은 코드 6건 삭제(FIX-1 브리프, 메인 검증 통과).
- **일하는 방식:** ✅ **위임 + 검증 + 투명 보고 채택** (메인=구조, 서브=구현 브리프 위임).

### ⭐ 권위 소스 포인터
- 일하는 방식 = `docs/playbook/working-method.md`
- 용어 = `docs/glossary.md`
- 문서 진실/버전 = `docs/HISTORY.md`
- 제품 방향(3기둥·과업 레이어) = **`docs/UD-Engine-PRD-v1.0.html`** (신규 단일 진실 PRD, 벤치마크 포함) + ADR-019 + 메모리 `project-direction-workstream`
- 현재 코드 상태 정밀 = `docs/journey/2026-05-31-alpha-test-prep-MASTER.md`

## 🎯 북극성 3기둥
1. **훨씬 높은 품질** — 단일 생성 엔진 수렴 + production 배선 + pro 모델 (ADR-021 예정)
2. **지속 학습 + 주입 용이** — 멱등 ingest · 워커 · 주입 UX · RAG recall 평가
3. **멀티 과업 구조** — 과업(Workstream) 레이어 (ADR-019 Proposed)

## 기획 산출물 (2026-06-01)
- **PRD**: `docs/UD-Engine-PRD-v1.0.html` (방향·기획·벤치마크·4분류 분석, 디자인 킷)
- **저니맵**: `docs/UD-Engine-JourneyMap-v1.0.html` (목업 기반 8단계·9결정지점, 디자인 킷)
- **Tech Spec**: `docs/UD-Engine-TechSpec-v1.0.md` (구현 바이블 — 설계공리 품질최우선·토큰무제약 / 데이터모델 / 생성 G1~G13 / 검색 / Rubric / 플라이휠 / API / 브리프 P0~P5)
- **사용자 핵심 지시 (2026-06-01)**: "좋은 제안서가 1번. 토큰 얼마든 OK." → Tech Spec §0 공리에 박음.
- **구현 착수 (2026-06-01, "이대로 가자")**: ADR-019·020 **Accepted** · ADR-021(단일 엔진) **Proposed 작성** · **FIX-2 브리프 위임 중**(turn/init auth·embedding 차원·web-search invokeAi).
- **ADR-022 Accepted — 2-tier (사용자 지시)**: 품질-결정=**Pro `gemini-3.1-pro-preview`**, plumbing(추출·분류·rewrite·대화즉답)=**Flash `gemini-3.5-flash`**(~2.5× 빠름). 둘 다 런타임 검증·thinking 모델. 라우팅 표는 `ai/config.ts`(가변). ("Gemini=flash" 오해는 eval override 한정이었음 — 종결.)
- **ADR-023: LLM = Gemini 단일화 (사용자 지시)** — Claude/Anthropic 제거, 폴백=intra-Gemini(Pro→pro-latest→Flash). ⚠️ **현 SDK `@google/generative-ai` EOL·아카이브 → `@google/genai`(GA) 마이그레이션 예정**(AI-1 브리프, RET-1 후). 네이티브 responseSchema·thinkingConfig 채택. (ANTHROPIC_API_KEY 이슈 = Gemini-only로 해소.)
- **✅ DB drift 해결(2026-06-01)**: `migrate resolve --applied brain_models` → `migrate dev --name add_workstream_layer`. 24 migrations 동기화, "up to date", 신규 migration 순수 additive(DROP 0·CREATE 8), **운영 배포용 파일 생성**, typecheck 0. ("23개 전면 drift"는 DATA-1 에이전트 과장 — 실제 brain_models 1개 미기록뿐.)
- **✅ RET-1 완료·검수**: 단일 검색 계약(RRF·Flash rerank·recall eval).
- **✅ EX-1 완료·검수**: 단일 생성 엔진(engine/ 5파일 + `assemble` 라우트). **E2E로 7섹션 1차본 실제 생성**(parse PASS·self-score 71·정제 루프 작동·과업 투영 §3 확인). 레거시 3엔진 무변경(제거는 검증 후).
- ⚠️ **`.env.local`에 `GEMINI_MODEL=gemini-3-flash-preview`(구형!) + dotenv override:true** → **로컬 생성·eval 전부 구형 flash로 실행**(EX-1 smoke 71도 구형 flash·Pro/3.5 아님). 운영(.env.local 없음)=Pro 기본. **모델 A/B 하려면 이 핀부터 제거/정렬**(override가 GEMINI_MODEL 강제). eval 패널 83도 구형 flash 측정치.
- ⚠️ **maxDuration 510s** (정제 2회·구형 flash) > Vercel 300s → 동기 라우트 prod 타임아웃 위험. 스트리밍/async job 필요(후속).
- **진행 현황**: ✅ FIX-1·FIX-2·DATA-1·RET-1·DB drift·**AI-1**(@google/genai 2.7.0+Gemini단일화, 검증). 
- ✅ **spend cap 해제 완료(2026-06-01)** — 실호출 검증: Pro·Flash 텍스트 반환 + 임베딩 3072. **AI-1 마이그레이션 런타임까지 완전 검증.** Gemini 정상.
- ⚠️ **데이터 점검**: ContentAsset 1765·WinningProposalChunk 2048 빈 임베딩 0(✅ 생성 경로 깨끗). **WinningPattern 10/102 벡터 비어있음**(matchTuple/Brain 패널 한정, 생성 영향 적음) → 재임베딩 follow-up. (자산수 진실=1765, PRD-Brain "1062" stale.)
- **다음 시퀀스 (순서대로)**: AI-1 검수 → **EX-1**(단일 생성 엔진 골격, ADR-021 — 최우선·"좋은 제안서") → **AI-2**(LLM 트레이싱 강화, 사용자 확정) · **BR-batch**(Batch API ingest blurb, 사용자 확정) · **DATA-2**(pgvector) · WS-1(과업유형 레지스트리) · EVAL(스윕 Pro pin·recall 라벨). responseSchema 전면적용·thinking 튜닝은 EX-1에 통합.
- ⚠️ AI-2·BR-batch는 **AI-1 완료 선결**(LLM 코어 위 작동·동시수정 충돌 방지).
- ✅ **AI-3 완료**: **Flash-우세 라우팅**(사용자 ① 결정) — 기본 3.5 Flash, **Pro는 2키만**(`engine.section.core` ③합성·`engine.self-score` judge). 폴백 `3.1 Pro→2.5 Pro(1K)→3.5 Flash(10K)`(429 강등). `.env.local` 구형 핀(`gemini-3-flash-preview`) 제거 → Pro 복원. `EVAL_ALL_FLASH` 플래그.
- ✅ **EVAL-AB 완료 → 하이브리드 유지 결정**(ADR-022 §4-A): hybrid 66 vs flash 61(+5), win-deciding 렌즈(logic+12·winningLang+8·차별성+6) hybrid 우위, 속도 동일·Pro 4콜/건. **Flash-only 채택 안 함.** ⚠️ 단 둘 다 <78(당선권 미달) → **모델은 작은 레버, 진짜 품질은 EX-2**(faithfulness·win-theme·compliance). n=3 노이즈.
- 🔴 RPD: 3.1 Pro 250/일. Tier 2는 ~30일 뒤(사용자). Flash-우세라 평소 Pro 소진 거의 없음.
- 디자인 에셋: `docs/fonts/`·`docs/assets/logo/` (HTML과 co-located). 킷 레퍼런스: 메모리 `reference-underdogs-design-kit`.

## ⭐ 다음 세션 진입점 (우선순위)
1. **ADR-019 (과업 레이어) · ADR-020 (운영 인프라) 사용자 검토** → Accepted 전환.
2. **저위험 즉시 작업** (FIX/DOCS 브리프 or 메인 직접):
   - Gemini pro/flash 로그 확인 (모든 품질의 전제)
   - 확정 죽은 코드 삭제 (`infer-program-profile.ts`·`extract-quote.ts`·admin/brain 죽은 루프·slide-preview-test/agent-test 페이지)
   - `PRD-v11` 깨진 참조·모델수 42·README HANDOVER 라우팅 정정
   - `HANDOVER.md`·`current-state-audit.md` → `docs/archive/`
3. **ADR-021 작성** — 단일 생성 엔진 수렴 (ADR-019 과 짝).
4. **첫 기능 브리프** — 과업 레이어 Prisma/registry (WS1) 또는 단일 엔진 (EX1).

## ⚠️ 함정 / 하지 말 것 (검증된 교훈)
- **planning-agent 통째 삭제 금지** — `lib/ai/config.ts`·`modules/_types.ts`·`api/agent/*` 라이브 import. manifest 가드 깨짐. 의존성 해체 먼저.
- **브랜치 ~55개 일괄 삭제 금지** — 건별 `git branch --merged` 확인 후에만.
- **회귀 스크립트 선삭제 금지** — vitest 가 같은 범위 커버한 뒤 은퇴.
- **embedding 차원** — 실제 3072, 코드 주석 768 (정정 대상). 섞어 재임베딩 시 무성 zero-recall.
- **stale worktree 2개 실재** — `.claude/worktrees/{amazing-khorana,blissful-goodall}-*` (CLAUDE.md 는 "삭제됨" 이라 주장). 삭제 전 사용자 확인.

## 보안 / 위생 (정리된 follow-up)
- express `turn`·`init` 라우트만 `requireProjectAccess` 없음 (나머지 10개는 有). 닫아야 함.
- **lint baseline 6 에러 (사전 존재)** — 특히 `src/lib/web-search.ts:13` 가 `@google/generative-ai` 직접 import (invokeAi 단일 진입점 = AGENTS.md 변경금지 위반). ai-fallback 경유로 리팩터 필요. 나머지: v2-shell·S3Checklist·settings setState-in-effect, agent-chat-ui no-children-prop.
- 라우트 삭제 후 `.next/dev/types/validator.ts` stale 가능 — 향후 라우트 삭제 시 `.next` 캐시 정리.

## 사용자 강조 원칙 (재확인)
구체적 작업지시(자급자족 브리프) · 제대로 검증(메인 직접) · 투명 보고(5섹션) · 모든 기록 보존(ADR/Journey) · 용어/스키마 일관성(glossary 충돌 검사).

## 🏁 다음 진입 한 줄
**ADR-019·020 검토 받고 → Gemini 로그 확인 + 확정 죽은 코드 정리(저위험) → ADR-021(단일 엔진) 작성.**

@AGENTS.md

# UD-Ops Workspace — 개발 규칙

## ⭐ 일하는 방식 (위임 + 검증 + 투명 보고 — ADR-020, 2026-06-01)

> **"기능을 만드는 자(서브 에이전트)와 구조를 지키는 자(메인 세션)를 분리한다."**

- **메인 세션** = Architect · Guardian · Curator · Orchestrator · Historian. **기능 코드 직접 구현 금지** (문서·메타·기획만 직접).
- **서브 에이전트** = 자급자족 브리프 받아 구현 → 자체 검증 → 5섹션 보고. (`.claude/agent-briefs/`)
- **사용자** = 제품 방향 · 비즈니스 결정 · 스코프 승인 · 자료 공급.
- 중요 결정 = **ADR 먼저, 코드 나중**. ADR Accepted 후 수정 금지(새 ADR supersede). 서브는 ADR 작성 금지(후보만 보고).
- 가변(프롬프트·가중치·루브릭) **하드코딩 금지 → 데이터**. 안정(스키마 키·invokeAi·manifest 계약)은 ADR 동결.
- 보고는 5섹션(`✅한일/❌못한일/🤔결정/🔬검증/⚠️위험`). 성공 위주 요약 금지.

**상세**: [docs/playbook/working-method.md](docs/playbook/working-method.md) · [brief-checklist.md](docs/playbook/brief-checklist.md) · [reporting.md](docs/playbook/reporting.md)

### 📖 새 세션 읽는 순서 (필독)
1. [HANDOFF.md](HANDOFF.md) — 현재 라이브 상태·다음 진입점 (⚠️ `HANDOVER.md`(04-29)는 stale·아카이브 대상)
2. [docs/HISTORY.md](docs/HISTORY.md) — 문서 진실/버전 (모델 42 · 코드 frontier)
3. [docs/glossary.md](docs/glossary.md) — 용어 SSoT (명명 충돌 정리)
4. [docs/decisions/README.md](docs/decisions/README.md) — ADR 001~020 인덱스
5. 활성 브리프 ([.claude/agent-briefs/](.claude/agent-briefs/))

---

## ⚠️ 명명 사전 (Naming Dictionary — Compact-safe, 2026-05-19)

> 약어 충돌 방지. 컴팩트·요약 시 항상 풀네임 병기.

| 코드 | 풀네임 | 영역 | 비고 |
|---|---|---|---|
| **Phase A~L** | 원본 12 Phase | 파이프라인 + Express L1~L6 base | ADR-001~011 |
| **Phase M** | Express 2.0 (ADR-013) | Express UI — AI 자동 진단·채널 분기 | M0~M3 4 단계, 부분 완료 |
| **Wave N** | Asset Architecture | `src/lib/ingest/*` · web/file ingester · vector · cron | N1~N5 ✅ 완료 (2026-05-15) |
| **Wave M-Impact** ⚠ | Impact Measurement embed | `src/lib/impact/*` · ImpactForecast · forecast UI | M1~M5 ✅ 완료. **Phase M 과 다름!** |
| **Wave C** | Forecast Enhancements | budget context · win-rate 학습 · Deep Step 5 통합 | C-7·C-8·C-9 ✅ 완료 |
| **Wave P** | PM Polish | EvaluatorScoreBar · 자산 인용 1-click · 카드 explainability | P1·P2·P3 ✅ 완료 |
| **Wave Q** | PM 자산 제안 → Admin 검수 | submitterNote · /api/content-hub/submit · /admin/review | ✅ 완료 (2026-05-19) |
| **Wave U** ⭐ | **UX Redesign + ActionAI 디자인 토큰** | Now Bar · Cmd+K palette · S1 inline citation · S2 SMART · S3 Risk · 자산 inline diff · 사이드바 자동 활성 | ✅ 완료 (2026-05-19, 9일 통째) |
| **Wave U 후속** | B1~B5 + D1~D4 + E1~E3 패치 | RFP 날짜 정규식 fallback · 검수 카드 스크롤 · Deep 자동 시드 뱃지 · 탭 효과 라벨 · 품질 순서 · DEV 권한 우회 · HTML 응답 감지 · autosave retry 중단 · Cmd+K crash · Decimal 직렬화 · Deep 인계 CTA | ✅ 완료 (2026-05-19) |
| **Wave V** ⭐⭐⭐ | **Express+Deep 완전 통합 + AI 자동 채움 패러다임 (다음 진행)** | 단일 URL · 5 Stage progressive disclosure · AI 자동 60% 채움 · 코치/커리큘럼/리서치 자동 · PM 9 결정 지점만 · 질문 차등화 | 🔲 F1~F5 단계별 게이트 (ADR-015) |

**중요 충돌**: `Phase M` ≠ `Wave M-Impact`. 둘 다 "M" 시작하지만 완전히 다른 영역.

---

## 프로젝트 개요
언더독스 교육 기획 자동화 웹앱. **Express (메인) + Deep (보조) 두 트랙**:

- **Express Track** (메인, ADR-011 / 2026-04-27): RFP → 30~45분 → "당선 가능한 기획 1차본 (7 섹션 초안)". 단일 화면 챗봇 + Slot Filling 12 슬롯 + 점진 미리보기 + 부차 기능 1줄 자동 인용.
- **Deep Track** (보조, 6 스텝 파이프라인): **RFP + 기획방향 → 커리큘럼 → 코치 → 예산 설계 → 임팩트 + SROI → 제안서**
  - 2026-04-15 Step 순서 재설계 / 2026-04-23 Impact Value Chain 5단계 (ADR-008, ⑤ Outcome = SROI 수렴점) / Step 4·5 재구성

- **Tech**: Next.js 16 (App Router) + TypeScript + Prisma 7 + PostgreSQL
- **DB**: **50개 모델** (`prisma/schema.prisma`. ADR-019 과업 레이어 +8 → 2026-06-01 기준 50. ⚠️ 로컬 DB migration 보류 — drift, 별건)
- **AI = Gemini 단일화 (ADR-023)**: 품질=**Pro `gemini-3.1-pro-preview`** / plumbing=**Flash `gemini-3.5-flash`** (2-tier, ADR-022). 폴백=intra-Gemini(Pro→pro-latest→Flash). **Claude/Anthropic 제거.**
- **SDK**: ⚠️ 현 `@google/generative-ai`(EOL·deprecated) → **`@google/genai`(GA) 마이그레이션 예정**(ADR-023, AI-1 브리프)
- **AI 단일 진입점**: `src/lib/ai-fallback.ts` `invokeAi(params)` (eslint 강제)
- **Coach 단일 source**: Supabase `coaches_directory` (coach-finder 와 동기, 715명 활성)

## 최신 설계 소스 (Single Source of Truth)
- **[PRD-v8.0.md](PRD-v8.0.md)** ⭐⭐⭐ — 단일 진실 원본 (v8.0 2026-05-03 — **Express 2.0** AI 자동 진단 + 채널 분기 + 외부 LLM 최소화)
- **[docs/decisions/013-express-v2-auto-diagnosis.md](docs/decisions/013-express-v2-auto-diagnosis.md)** ⭐⭐ — Express 2.0 의사결정 (슬기님 03/25 + 사용자 통찰 기반)
- **[docs/architecture/express-mode.md](docs/architecture/express-mode.md)** ⭐ — v2.0 (Express 2.0 자동 진단·채널 분기·사이드바 4 패널)
- **[docs/architecture/user-flow.md](docs/architecture/user-flow.md)** — User flow ASCII 다이어그램 (v1.0 2026-04-29)
- **현재 상태 정본**: [HANDOFF.md](HANDOFF.md) + [docs/HISTORY.md](docs/HISTORY.md). ⚠️ `ROADMAP.md` 는 2026-05-19 stale (이력 참조용).
- `docs/archive/PRD-v7.1.md` — 이전 PRD (v8.0 으로 대체됨, 2026-05-03 ADR-013 채택)
- **[docs/archive/REDESIGN.md](docs/archive/REDESIGN.md)** — 상세 설계 v2 (아카이브, Phase-A 시대)
- **[docs/architecture/](docs/architecture/)** — 아키텍처 9문서
  - [modules.md](docs/architecture/modules.md) — 모듈 4계층 + Manifest 패턴
  - [data-contract.md](docs/architecture/data-contract.md) — PipelineContext 슬라이스 계약
  - [ingestion.md](docs/architecture/ingestion.md) — 자료 업로드 → 자산 자동 고도화
  - [quality-gates.md](docs/architecture/quality-gates.md) — 4계층 품질 검증 체계
  - [value-chain.md](docs/architecture/value-chain.md) ⭐ — Impact Value Chain 5단계 + SROI 수렴점 (ADR-008)
  - [asset-registry.md](docs/architecture/asset-registry.md) ⭐ — UD Asset Registry v1 + RFP 자동 매핑 (ADR-009)
  - [content-hub.md](docs/architecture/content-hub.md) ⭐ — Content Hub v2 (DB + 계층 + 담당자 UI, ADR-010)
  - [express-mode.md](docs/architecture/express-mode.md) ⭐⭐ — **Express Mode v2.0 — AI 자동 진단 4종 + 채널 분기 + 사이드바 4 패널 (ADR-013, 2026-05-03)**
  - [program-profile.md](docs/architecture/program-profile.md) — ProgramProfile v1.1 11축 (ADR-006)
  - [program-profile.md](docs/architecture/program-profile.md) 등 — 아키텍처 스펙 (current-state-audit 는 docs/archive 로 이동)
- **[docs/decisions/](docs/decisions/)** — ADR-001 ~ **ADR-020** ([README](docs/decisions/README.md) 인덱스). 중요 결정 전후 필수 참조
- **[docs/journey/](docs/journey/)** — 시행착오 일지 ([README](docs/journey/README.md) 골격). 세션 끝에 기록
- **[docs/glossary.md](docs/glossary.md)** — 용어 SSoT · **[docs/playbook/](docs/playbook/)** — 일하는 방식
- `docs/archive/PLANNING_AGENT_ROADMAP.md` — Planning Agent 트랙 (아카이브 · 단 planning-agent lib 코드는 라이브)
- `docs/archive/PRD-v6.0.md` — ⚠️ Archived (PRD-v7.0 으로 대체됨, 2026-04-27 ADR-011 채택)
- `docs/archive/PRD-v5.0.md` — ⚠️ 아카이브. 비즈니스 룰·IMPACT·SROI만 참고

## 아키텍처 (꼭 읽어야 할 파일)
- `prisma/schema.prisma` — 전체 데이터 모델 (42개, 2026-06-01)
- `src/lib/ai-fallback.ts` ⭐ — **invokeAi 단일 진입점 (Gemini Primary / Claude Fallback) — Phase L1**
- `src/lib/ai/*` ⭐ — 8 모듈 (parser / parse-rfp / impact-goal / logic-model / curriculum-types / research / strategic-notes / proposal-section). 2026-05-03 claude.ts 단일 파일 1014줄에서 분할 후 shim 제거 완료.
- `src/lib/express/` ⭐ — Express Track 코어 (schema·conversation·prompts·handoff·inspector — L2~L6)
- `src/lib/planning-agent/` — Planning Agent 코어 (7개 모듈, Deep 부수 트랙)
- `src/app/(dashboard)/projects/[id]/express/` ⭐ — Express 단일 화면 (L2)
- `src/app/(dashboard)/projects/[id]/` — Deep Track 6단계 파이프라인 UI

## 디자인 시스템
- **폰트**: Nanum Gothic (나눔고딕) — `font-sans` / `--font-sans` 변수
- **메인 컬러**: Action Orange `#F05519` (underdogs.global 공식 기준, 2026-04-15 마이그레이션 완료) — `bg-primary` / `text-primary` / `--ud-orange`
- **블랙**: `#000000`, 화이트: `#FFFFFF`
- **오렌지 그라데이션**: `#F05519` (100) → `#F48053` (80) → `#F9BBA3` (40) → `#FBD4C5` (20)
- **서브 컬러**: `#373938`(dark/sidebar), `#D8D4D7`(gray), `#06A9D0`(cyan)
- **컬러 비율**: Action Orange는 전체 UI의 10~15% 이하 (CTA, 강조, 아이콘 등)
- **비주얼 패턴**: Spread/Scale, Repetition/Alignment, Expansion/Progress
  - 반복 정렬: `border-brand-left` 유틸리티 클래스 사용
  - 진행 상태: `progress-brand` 그라데이션 클래스
- **반경**: `--radius: 0.5rem` (rounded-md 기본)
- **사이드바**: 다크 `#373938` 배경 (`bg-sidebar`)
- **UI 라이브러리**: shadcn/ui (src/components/ui/)
- **아이콘**: lucide-react
- **토스트**: sonner (`toast.success()`, `toast.error()`)

## 설계 철학 (재설계 v2, 2026-04-15 · Value Chain 2026-04-23 · Express Mode 2026-04-27 · **Express 2.0 2026-05-03**)
1. **데이터는 위에서 아래로 흐른다** — 각 스텝은 이전 스텝 산출물을 `PipelineContext`로 받는다 (Deep Track)
2. **내부 자산은 자동으로 올라온다** — IMPACT 모듈·코치·SROI 프록시 등 PM이 찾아가지 않음. ⭐ **Express 의 자동 인용으로 진짜 구현** — `narrativeSnippet` 이 1차본 sections 에 자연 박힘 (Phase G·H 의 의도를 Express 가 더 일찍 실현)
3. **AI는 맥락 안에서 호출된다** — 매번 처음부터가 아니라 축적된 컨텍스트 위에서. invokeAi (Gemini Primary / Claude Fallback) + safeParseJson 강화 (Phase L1 완료)
4. **신입 PM도 왜 이렇게 써야 하는지 안다** — 각 스텝에 가이드·레퍼런스·경고 내장 (Deep). Express 는 챗봇 자체가 가이드 역할 흡수.
5. **Impact-First는 커리큘럼 위에서 재구성된다** — Activity를 커리큘럼에서 자동 추출해 Outcome/Impact만 AI 생성 (Deep Step 5)
6. **Action Week 강제**: 이론 3회 연속 시 경고, Action Week 삽입 제안 (Deep curriculum-rules R-002)
7. **AI가 정보 부족 시 → 자동 생성 대신 질문으로 보완** — Express 의 외부 LLM 카드 (3 카드 유형) + planning-agent 동적 꼬리질문
8. ⭐ **Impact Value Chain 5단계 (ADR-008, 2026-04-23)** — 파이프라인에는 UI 6 스텝과는 독립된 의미 레이어가 있다:
   `① Impact(의도·Before/After) → ② Input(자원) → ③ Output(RFP/산출물) → ④ Activity(커리큘럼·코칭) → ⑤ Outcome(SROI)`
   **⑤ Outcome = SROI Forecast** 가 루프의 수렴점. SROI 숫자 축 3방향 얼라인 체크(⑤→①·②·④)로 품질 검증.
   각 UI 스텝은 자신이 건드리는 단계를 `valueChainStage` 로 태그 ([value-chain.md](docs/architecture/value-chain.md)). Express 도 동일 의미 레이어 — 5 단계를 한 화면에서 동시 빌드.
9. ⭐ **UD Asset Registry v1 → Content Hub v2 (ADR-009 → ADR-010, 2026-04-24)** — 2번 원칙의 물리적 구현.
   - v1: 자산을 3중 태그(카테고리·RFP 섹션·Value Chain 단계·증거 유형)로 등록 · RFP 파싱 직후 자동 매핑 · Step 1 패널 제안 · Step 6 `narrativeSnippet` 주입.
   - v2: DB(`ContentAsset`) 기반 + 1단 계층(상품 → 세션/주차/챕터) + `/admin/content-hub` 담당자 UI + 단순 version 관리 + 원본 파일은 외부 (sourceReferences URL 만).
   - 스키마: [asset-registry.md](docs/architecture/asset-registry.md) (v1) · [content-hub.md](docs/architecture/content-hub.md) (v2).
10. ⭐⭐ **Express 가 메인, Deep 은 옵션 (ADR-011, 2026-04-27)** — 시스템 정체성 재정의.
    - **북극성**: RFP → 30~45분 → "당선 가능한 기획 1차본 (7 섹션 초안)"
    - **신규 프로젝트 진입 시 Express 부터** — 단일 화면 (좌 챗봇 + 우 점진 미리보기), Slot Filling 12 슬롯, 외부 LLM 분기 3 카드 유형, 부차 기능 1줄 자동 인용
    - **정밀화 필요 시 Deep Track** — 기존 6 스텝 (Phase A~H 산출물 100% 보존). SROI/예산/코치 정밀, 루프 얼라인 Gate
    - 스펙: [docs/architecture/express-mode.md](docs/architecture/express-mode.md) v2.0 + [PRD-v8.0.md](PRD-v8.0.md)
    - 사용자 원문: *"핵심은 RFP에 맞춰서 당선 가능한 기획 1차본이 나오는거지"*

11. ⭐⭐⭐ **Express 2.0 — AI 자동 진단 + 채널 분기 + 외부 LLM 최소화 (ADR-013, 2026-05-03)** — Express 패러다임 전환.
    - **AI 가 콘텐츠 생성자 → 오케스트레이터·자동 진단자** — PM 입력 부담 동일, AI 가 더 일함, 외부 LLM 은 무거운 리서치만
    - **AI 자동 진단 4종**: ChannelDetector (B2G/B2B/renewal 추론) · FramingInspector (사회공헌 vs 일반전략) · FactCheckLight (수치 5 카테고리·5 검증 상태) · LogicChainChecker (채널별 chain)
    - **채널 분기**: 슬롯은 12개 공통, **Inspector 가중치·UI 사이드바·진단 lens** 만 채널별 분기
    - **외부 LLM 5건 → 2~3건**: 정부 통계·발주처 공식 문서·시장 데이터만 (왔다갔다 60% ↓)
    - **사이드바 4 패널**: 다음 1 액션 · AI 자동 진단 · 외부 LLM · 슬롯 진행 (행동 흐름)
    - **의사결정 컨펌 4 마일스톤**: 채널 결정 / 메인 솔루션 / 1차본 조립 / 검수 결과 (슬랙 새싹 패턴 흡수)
    - **슬기님 5 원칙 점수**: 51% → 74% (+23%p) — 특히 논리 흐름 (+45%p), 팩트체크 (+50%p)
    - 스펙: [PRD-v8.0.md](PRD-v8.0.md) + [docs/decisions/013-express-v2-auto-diagnosis.md](docs/decisions/013-express-v2-auto-diagnosis.md)
    - 사용자 원문: *"토큰은 좀 소모되어도 되는데, 무거운 리서치만 외부에서 하자. 너무 왔다갔다하면 번거롭잖아."*
    - 슬기님 03/25 인용: *"논리 흐름이 '사회공헌사업' 보다는 '일반 사업 전략 제안'으로 읽힘"*

## AI API (Gemini 단일화 — ADR-022·023, 2026-06-01)
- **단일 진입점**: `src/lib/ai-fallback.ts` `invokeAi(params)` (eslint `no-restricted-imports` 강제)
- **2-tier**: 품질-결정(본문·win-theme·판단·Rubric) = **Pro `gemini-3.1-pro-preview`** / plumbing(추출·분류·rewrite·rerank·대화즉답) = **Flash `gemini-3.5-flash`**. 라우팅 표 = `ai/config.ts`(가변).
- **폴백**: intra-Gemini (Pro→`gemini-pro-latest`→Flash). **Claude/Anthropic 제거(ADR-023).**
- **SDK**: ⚠️ `@google/generative-ai`(EOL·아카이브) → **`@google/genai`(GA) 마이그레이션 예정** (ADR-023 · AI-1 브리프). thinking 모델 → `thinkingConfig`·maxOutputTokens 크게.
- JSON: 네이티브 `responseSchema`(새 SDK) + `safeParseJson()`(`src/lib/ai/parser.ts`) 이중 안전.
- **`max_tokens` (L1 확장)**: RFP 파싱 8192 / Logic Model 8192 / 커리큘럼 8192 / **Express 일괄 16384**
- L1 커밋: `f2c0c38` (Gemini 통합) · `6369403` (모델명 fix) · `f0ffab8` (provider/model/elapsed 로깅)

## 인증
- NextAuth v5 (JWT 전략) — `src/lib/auth.ts`
- Google OAuth + 개발 모드 Credentials
- 미들웨어: `src/middleware.ts` (로그인 페이지 제외 전체 보호)
- 역할: PM, DIRECTOR, CM, FM, COACH, ADMIN

## 워크트리 정책 (2026-04-27 통합)
- ⭐ **유일한 작업 경로**: `C:\Users\USER\projects\ud-ops-workspace` (master 디렉토리)
- ⚠️ `.claude/worktrees/{amazing-khorana,blissful-goodall}-*` 두 워크트리가 **디스크에 아직 남아 있음** (사용 안 함 — 삭제 예정, 사용자 확인 후). 이 경로로 작업·dev 금지.
- 새 작업도 master 에 직접. Claude Code 의 자동 worktree 생성 기능을 쓸 때만 임시로 워크트리 사용 → 완료 즉시 머지·삭제.
- `npm run dev` 실행 시 `predev` 훅(`scripts/print-worktree.cjs`)이 현재 경로·브랜치를 출력하고, 워크트리 안에서 띄우면 경고.
- Phase 진행 중 dev 가 멈춘 듯하면 가장 먼저 출력 첫 줄(📁 경로) 부터 확인.

## 병렬 작업 규칙
- 기능 개발은 `feat/<task-id>` 브랜치에서 진행
- master 직접 커밋은 인프라/설정 변경만 허용
- 태스크 스펙은 `.claude/tasks/` 디렉토리에 저장됨
- 스펙 파일을 읽고 지시대로 수행 → 완료 시 커밋
- 다른 step의 컴포넌트는 건드리지 않기 (충돌 방지)

## 커밋 컨벤션
- `feat(scope): 설명` / `fix(scope): 설명`
- scope: step-rfp, step-curriculum, step-coaches, step-budget, step-impact, step-proposal, pipeline-context, planning-agent, pm-guide, winning-pattern, channel-preset, auth, coaches, modules, value-chain, loop-gate, asset-registry, content-hub, **express** ⭐, **ai** ⭐ 등
- Phase 작업은 `feat(phase-l,express): ...` (현재 **Phase L Express Mode** 진행 중)
- 다른 Phase 예: `feat(phase-h,content-hub): ...`
- 한글 커밋 메시지 OK

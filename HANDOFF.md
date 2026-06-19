# HANDOFF — 세션 핸드오버 (라이브 문서)

> 매 세션 끝 메인이 **전체 덮어쓰기**. 새 세션 읽는 순서: **HANDOFF → [HISTORY](docs/HISTORY.md) → [glossary](docs/glossary.md) → [decisions/README](docs/decisions/README.md) → 활성 브리프**.
> 최종 정리: **2026-06-16** (스코프 축소 — 제안서 고도화 → **프로그램 기획 고도화**. DesignRule 브레인 + D0~D8 엔진 가동).

---

## 🔴 지금 가장 중요한 것 — 방향 전환 (2026-06-16)

**스코프 축소 (사용자 결정):** 제안서 전체 고도화 → **"좋은 프로그램 기획"에만 집중.**
- **북극성:** 대상이 바뀌면 프로그램 설계(사전학습·온/오프·회차·코칭·코호트·발표)가 어떻게 바뀌는가를 데이터+규칙으로 만들어, 브레인이 **구체적·탄탄한 1차 설계**를 내고 사람이 검수한다.
- **정본 = `docs/UD-Brain-CurriculumDesignLogic-v1.2.html`** — 제0원칙 + D0~D8 + 운영유형 T1~T5 + 흐름문법 + §09 출력형태. (사용자가 큐레이션한 설계 로직)
- **사용자 핵심 원칙:** 규칙은 **강제값이 아니라 유연한 기본값**. 모호한 선택은 **사람에게 위임 → 결정 → 다음 턴**(턴 기반). 대상은 **제안서가 아니라 프로그램 기획.**
- **자연스러운 흐름 4단계 (합의):** ①토대잡기(목표 미리채움 + **선례·담당자 의도** 캐치) → ②큰 갈림길만(명백하면 자동, 모호하면 멈춤) → ③자동조립+근거 → ④1차안(§09 결정로그+구조)+검수. = 기존 Express 패러다임과 동형(Express=그릇, 브레인=내용물).
- **해소 우선순위(암묵지 토대):** ① 담당자 의도+이전 진행(선례) → ② 목표·RFP → ③ DesignRule 기본값. 브레인은 덮어쓰지 않고 빈칸을 근거와 함께 채운다.

## 📍 현재 상태 (브랜치·배포)
- **브랜치:** `feat/alpha-test-prep`. auto-push 훅으로 origin 동기.
- ⚠️ **production(ud-planner.vercel.app)은 `master`에서 배포** — 이 브랜치 미머지. **그래서 `/admin/design-rules` 등 신규 화면은 production 404. 로컬 dev(`localhost:3000`)에서만 보임.** 머지·배포는 엔진·UI 검증 끝낸 뒤.
- **일하는 방식:** 위임+검증+투명보고(ADR-020). 메인=구조/문서/기획·규칙 큐레이션, 기능 코드=자급자족 브리프로 서브 위임.

## ✅ 완료·작동 (이번 아크 — 검증됨)
| 영역 | 상태 |
|---|---|
| **브레인 추출 (BR-1, ADR-028)** | WinningProposalDoc 147건 → 운영 16축 JSON(`data/program-design/extracted/`) + `_aggregate.json` + P3 가설판정. |
| **DesignRule 스키마 (ADR-028 추록 3)** | JSON-first `data/program-design/design-rules.json`. `decisionPolicy`(auto/ask_human/auto_unless_conflict)·`isDefault` 항상 true(제0원칙)·ruleType A~G+Z. |
| **DesignRule 시드 23규칙** | 메인이 v1.2에서 큐레이션. 전부 `status:draft`. ask_human 4건(시니어·재창업·온오프·사전학습·예산대). |
| **검수 UI (BR-2)** | `/admin/design-rules` — 8그룹 카드(근거·신뢰도·decisionPolicy), 승인/반려/메모 → JSON 되기록. `design-rule.ts`(zod·loadDesignRules·saveRuleStatus). ADMIN/DIRECTOR 가드. |
| **D0~D8 엔진 (BR-3a)** ⭐ | `src/lib/program-design/{plan-types,resolve-rules,generate-plan}.ts`. 운영유형 T1~T5 **우선분기**, **T4/T5 회차표 미생성**, 수치 하드코딩 0(전부 규칙/입력), 결정마다 근거. approved 0건 graceful. 검증: typecheck·결정론 18/18·**LLM E2E 19/19(실 Gemini Pro — A→T3 sessions / B→T4 individual / C→T5 event)**. |
| 데드코드 정리 | `budget-rules.ts`·`curriculum/session-count.ts`·`analyze-lost-patterns.ts`·`extractClaudeText` 제거(−724줄). |
| (기존 인프라, 그대로) | 단일 생성 엔진(EX-1)·검색 계약(RET-1)·Gemini 단일화(ADR-023)·모델 2-tier(ADR-022)·예산 자동편성. |

## 🔲 진행/대기
- **BR-3b (턴 기반 인테이크 UI)** — 브리프 작성 완료(`.claude/agent-briefs/BR-3b-program-plan-intake-ui.md`), **위임 대기.** 엔진 위에 4단계 흐름 UI + 게이트 응답 되먹임 루프.
- **UI-2 (컴포넌트 토큰 정리)** — P3 기술부채(시각 변화 0). 백그라운드 진행 중일 수 있음(브리프 `UI-2-component-token-cleanup.md`).
- **규칙 검수 (사용자)** — 23규칙 승인. **승인할수록 엔진이 게이트 대신 자동으로 원칙 수치를 채움.** 로컬 `/admin/design-rules`.
- **BR-3a 열린질문:** approved 0일 때 T3 세션 세부수치를 LLM이 제안(게이트 아님) — 미해결 수치축도 게이트화할지 BR-3b에서 결정.

## ⏸ 동결 (Parked — 삭제 안 함, 재개 시까지 손 안 댐)
- **덱/PPT 출력 모듈** (ADR-025/026, ADR-027 대기) — `src/lib/deck/**`·`render-worker/`·`src/lib/diagrams/pptx-builder.ts`·`scripts/learn-slide-patterns.ts`·DECK-5. **제안서 출력 레이어라 "프로그램 기획" 범위 밖.** 깨끗한 하류 leaf(express→deck 역의존 0 검증) → 재추가 비용 0. 렌더 기질은 작동하니 자산으로 보존.

## 🟡 스코프 확인 대상 (작동하는 기능 — 죽은 코드 아님, 유지/은퇴 미정)
- **Brain 개념그래프/inference** — `src/lib/inference/**`(13 추출기) + `/projects/[id]/brain` + `/api/v1/inference/*` + 개념진화 cron + ~10 배치 스크립트. 작동 중. "프로그램 기획" 집중과의 관계는 사용자 확인 필요.
- **`/admin/interview-ingest`** — 인터뷰 자료 처리 admin 기능(페이지+API+컴포넌트). 작동. 유지 여부 미정.

## 🔑 모델·인프라 핵심
- **Gemini 단일** (`@google/genai`). Pro=`gemini-3.1-pro-preview`(품질), Flash=`gemini-3.5-flash`(plumbing). 라우팅 = `ai/config.ts`. **AI 단일 진입점** `src/lib/ai-fallback.ts invokeAi`(eslint 강제).
- DB: 로컬 docker `localhost:5432`. ⚠️ **로컬 migration 보류(drift)** — 그래서 DesignRule·ProgramDesignPattern 은 **JSON-first**(Prisma 모델 안 만듦).
- 키: GEMINI_API_KEY = `.env`. 스크립트가 dotenv 미로드면: `node --env-file=.env` 또는 `npx tsx -e "import 'dotenv/config'; import './scripts/x.ts'"`.

## ⚠️ 함정 / 하지 말 것
- **DesignRule·엔진은 JSON-first** — Prisma 스키마 건드리지 마라(migration 보류).
- **엔진(BR-3a) 계약 동결** — `PlanInput`/`ProgramPlan` 대로 소비. 엔진 수정은 메인 검수.
- **수치 하드코딩 금지** — 회차·코칭·AW 전부 규칙/입력에서. 없으면 게이트(추측 금지).
- **기존 `curriculum-ai.ts`는 보존**(Deep 트랙 back-compat) — BR-3 신규 모듈이 대체. 강제 패턴(L213·L433 등) 복붙 금지.
- **planning-agent 통째 삭제 금지** — `api/agent/*` 라이브 import.
- **서브가 측정/LLM E2E를 자기 백그라운드로 띄우면 결과 유실** — LLM/DB 검증은 메인이 직접.
- Next 16 ≠ 익숙한 Next — `node_modules/next/dist/docs/` 읽고 코딩.

## 🗂 핵심 파일·문서
- 정본: `docs/UD-Brain-CurriculumDesignLogic-v1.2.html`(설계 로직) · `docs/decisions/028-program-design-grammar.md`(추록 3 = DesignRule 계약).
- 엔진: `src/lib/program-design/{plan-types,resolve-rules,generate-plan,design-rule,operating-format}.ts` · 시드 `data/program-design/design-rules.json`.
- 검증: `npx tsx scripts/_test-program-plan.ts`(결정론) · `FULL_LLM=true ... `(E2E) · `npx tsx scripts/_check-design-rules.ts`(시드).
- 활성 브리프: `.claude/agent-briefs/BR-3b-*`(위임 대기) · `UI-2-*`(진행).

## 🏁 다음 진입 한 줄
**프로그램 기획 브레인 가동 국면.** 추출(BR-1)→규칙 발행(BR-2)→엔진(BR-3a)까지 완료·검증. **다음 = (1) 규칙 검수(사용자, 로컬 `/admin/design-rules`) → (2) BR-3b 위임(턴 기반 UI) → (3) 검증 후 master 머지·배포.** 덱은 동결, Express 연결·DesignRule DB 이관은 그 다음.

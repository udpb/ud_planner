# Brief BR-3b — 프로그램 기획 턴 기반 인테이크 UI (엔진 위에)

> **이 브리프는 자급자족입니다.** 서브 에이전트는 본 파일 + `../../CLAUDE.md`
> + `../../AGENTS.md` + `../../docs/glossary.md` 외에 메인 세션 컨텍스트 없이도
> 작업 가능해야 합니다. 막히면 추측하지 말고 STOP 후 메인에 보고하세요.

| 메타 | 값 |
|------|----|
| ID | `BR-3b-program-plan-intake-ui` |
| Owner | 메인 세션 |
| 작성일 | 2026-06-16 |
| 상태 | 🔲 대기 |
| 의존 브리프 | BR-3a (✅ — `planProgram`·`PlanInput`·`ProgramPlan` 존재) · BR-2 (DesignRule 검수) |
| 우선순위 | P0 |
| 예상 시간 | 1.5~2일 |
| 격리 | 일반 (master 직접 / 현재 브랜치 `feat/alpha-test-prep` in-place) |
| 관련 ADR | ADR-028 추록 3 (해소 우선순위·자동/물음) |

---

## 🎯 Mission
BR-3a 엔진(`planProgram`) 위에 **턴 기반 인테이크 UI** 를 얹어, 우리가 합의한 **4단계 흐름**을 실제로 굴린다:
**① 토대잡기**(목표 미리채움 + 선례·담당자 의도 입력) → **② 큰 갈림길만**(엔진이 낸 `PlanGate` 를 사람이 결정) →
**③ 자동조립**(엔진 결정로그를 근거와 함께 표시) → **④ 1차안**(결정로그 + 구조 = v1.2 §09 형태, 수정 가능).

> 핵심 원칙(사용자): **브레인은 "답+이유"를 들고 오고, 사람은 빈칸을 채우는 게 아니라 확인/방향수정.**
> 멈추는 건 **엔진이 낸 게이트(모호·ask_human)뿐** — 모든 수치를 묻지 않는다. 자동 결정도 근거와 함께 보인다.

## 📋 Context
BR-3a 엔진은 헤드리스로 완성·검증됨(운영유형 T1~T5 우선분기, T4/T5 회차표 없음, 결정마다 근거, 게이트로 graceful).
하지만 **턴 루프를 받을 UI 가 없으면 게이트 응답을 되먹일 수 없어** 가치가 안 난다(엔진이 멈춰도 사람이 답할 데가 없음).
이 브리프가 그 루프를 붙인다. **제안서가 아니라 프로그램 기획 1차안**을 내는 화면이다(범위 축소 — Express/덱 미연결).

## ✅ Prerequisites (STOP 조건)
- [ ] `src/lib/program-design/{generate-plan,plan-types,resolve-rules}.ts` 존재 (BR-3a)
- [ ] `src/lib/program-design/design-rule.ts` 존재 (BR-2)
- [ ] `npm run dev` 기동 가능 · GEMINI 키(`.env`) — `planProgram` 의 구조 생성 단계용
- [ ] 프로젝트에서 RFP 슬라이스를 만드는 기존 경로 확인 (아래 §6) — 없거나 다르면 STOP·보고

## 📖 Read These Files First
1. `../../CLAUDE.md` · `../../AGENTS.md` · `../../docs/glossary.md`
2. `../../src/lib/program-design/plan-types.ts` ⭐ — `PlanInput`(rfp·precedent·intent·decisions) · `ProgramPlan`(operatingType·decisionLog·openGates·structure·meta) · `PlanGate` · `SessionTable`/`NonSessionStructure`. **이 계약대로 UI 를 만든다.**
3. `../../src/lib/program-design/generate-plan.ts` — `planProgram(input): Promise<ProgramPlan>` 시그니처(엔진 호출부)
4. `../../docs/UD-Brain-CurriculumDesignLogic-v1.2.html` ⭐ — **§09 출력 형태**(결정로그 + 회차표/구조)가 ④ 1차안 화면의 모양. **§01 4단계 흐름**이 UI 골격.
5. `../../docs/decisions/028-program-design-grammar.md` 추록 3 — 해소 우선순위(의도·선례 1순위) → 토대잡기 입력의 의미
6. `../../.claude/skills/ud-design-system/SKILL.md` ⭐ — 디자인킷 토큰만(radius 0·`--accent`/`--ink`/`--paper`/`--muted`/`--line`·틴트박스). `bg-primary`/`rounded-*`/폐기 hex 금지. **BR-2 의 `src/app/admin/design-rules/_components/rule-board.tsx` 를 스타일 레퍼런스로** (같은 톤으로).
7. `../../src/app/api/ai/curriculum/route.ts` ⭐ — **프로젝트 → RfpSlice 조립 패턴**(projectId 로 RFP 슬라이스 만드는 기존 코드). 이 패턴을 **읽고 재사용**(route 수정 금지).
8. `../../src/app/(dashboard)/projects/[id]/` — 기존 프로젝트 하위 라우트 구조·레이아웃 참고

## 🎯 Scope
### CAN touch
- `src/lib/program-design/plan-input.ts` (신규 — `buildPlanInputFromProject(projectId, extra)` 헬퍼: 프로젝트 → PlanInput.rfp + precedent/intent/decisions 합성)
- `src/app/api/projects/[id]/program-design/route.ts` (신규 — `POST`: body `{precedent?, intent?, decisions?}` → planProgram → ProgramPlan 반환)
- `src/app/(dashboard)/projects/[id]/program-design/**` (신규 — 페이지 + 클라이언트 컴포넌트)
- `data/program-design/plans/**` (선택 — 최종안 저장 시 JSON. 만들면 read-modify-write 원자적)
### MUST NOT touch
- `src/lib/program-design/{plan-types,resolve-rules,generate-plan,design-rule,operating-format,extraction-prompt,vod-catalog}.ts` (BR-3a/BR-1/BR-2 동결 — 읽기만)
- `src/lib/curriculum-ai.ts` · `src/app/api/ai/curriculum/route.ts` (읽기만 — RfpSlice 패턴 참고용)
- `data/program-design/design-rules.json`·`extracted/**` (읽기만)
- `prisma/schema.prisma` (스키마 변경 금지 — 저장은 JSON 파일 또는 기존 Json 컬럼만) · `ai-fallback.ts` 시그니처 · `src/components/ui/**`(shadcn) · Express/Deck 컴포넌트 · manifest

## 🛠 Tasks

### 1. 입력 합성 (`plan-input.ts`)
- `buildPlanInputFromProject(projectId, extra?: { precedent?, intent?, decisions? }): Promise<PlanInput>`
- 프로젝트 로드 → `src/app/api/ai/curriculum/route.ts` 가 RfpSlice 만드는 방식을 **그대로 재사용**해 `PlanInput.rfp` 구성. precedent/intent/decisions 는 `extra` 에서.
- RFP 가 없거나 파싱 전이면 명확한 에러(UI 가 안내).

### 2. API (`POST /api/projects/[id]/program-design`)
- body: `{ precedent?, intent?, decisions? }` (decisions = 누적된 게이트 응답).
- `buildPlanInputFromProject` → `planProgram(input)` → `ProgramPlan` 반환(openGates 있으면 그대로, 구조 미생성 pending 포함).
- 인증 가드(로그인 사용자). 에러는 4xx + 메시지.
- (선택) `?save=1` 또는 별 액션으로 최종안을 `data/program-design/plans/<projectId>.json` 저장.

### 3. 턴 기반 UI (`/projects/[id]/program-design`)
서버 컴포넌트(프로젝트·RFP 로드) → 클라이언트 컴포넌트(턴 루프). **4단계**:

- **① 토대잡기**: RFP 에서 읽은 목표·대상·예산·기간을 **미리 채워** 보여주고, 사람에게 3가지 입력:
  - 목표 확인/수정(자유 텍스트), **선례**("이전에 비슷한 거 했으면…" — precedent.summary), **담당자 의도**("꼭 지키고 싶은 운영 방식…" — intent.summary). → "기획 시작" → API 첫 호출.
- **② 갈림길 (게이트)**: 응답의 `openGates` 를 카드로. 각 게이트: `question` · `options`(있으면 선택 버튼/라디오) · `recommended`(있으면 "추천" 배지로 강조) · `why`/`reason`(왜 묻는지). 사람이 고른 값 → `decisions[axis]=값` 누적 → **재호출**(턴 진행). `reason` 별 시각 구분(ask_human=accent 강조).
- **③ 자동조립 표시**: `decisionLog`(자동 해소된 결정)를 **D0~D8 순서**로, 각 항목에 `decision`·`rationale`·`evidence.source`·`source` 배지(의도/선례/RFP/규칙)·`conflictNote`(있으면). "이건 안 물어보고 이렇게 정했어요 + 이유"를 보여주는 게 핵심.
- **④ 1차안 (openGates 0건일 때)**: v1.2 §09 형태 —
  - **결정 로그**(D0~D8) 위 ③ 그대로 + 완결.
  - **구조**: `structure.kind==='sessions'`(T1~T3) → 회차표(no·title·hours·format·kind·rationale). `'individual'`/`'event'`(T4/T5) → 단계 리스트(label·content·rationale) — **회차표 아님**.
  - **수치는 수정 가능**: LLM 이 제안한 회차/구조 값은 인라인 편집 가능하게(또는 "이 값 출처: AI 제안" 라벨 + 편집). 사람이 확인/수정하는 흐름(빈칸 채우기 아님).
  - (선택) "저장" → API save.

### 4. 흐름·상태
- 클라이언트가 `decisions` 를 누적 보관(턴마다 게이트 응답 머지 후 재호출). 새로고침 시 처음부터여도 OK(저장은 선택).
- 로딩/에러 상태(sonner toast). LLM 구조 생성은 수 초~수십 초 — 진행 표시.

## 🧪 Self-Verification (완료 전)
- [ ] `npm run typecheck` · `npm run lint` · `npm run check:manifest` 통과
- [ ] `npm run dev` 실측: 한 프로젝트에서 `/projects/[id]/program-design` 진입 → 토대잡기 입력 → "기획 시작" →
  - **게이트가 있으면** 카드로 뜨고, 답하면 다음 턴으로 진행(decisions 누적 재호출 동작)
  - **운영유형이 T4/T5 로 풀리면** 1차안이 **회차표가 아니라 단계 리스트**로 표시(엔진 structure.kind 그대로)
  - 결정로그에 source 배지·근거가 보임
  - ⚠️ dev 서버·LLM 호출을 **백그라운드로 돌려 결과 유실 금지** — 직접 띄워 확인하고 안 되면 정직히 보고
- [ ] 디자인킷 위반 0(새 코드 grep: `bg-primary`/`rounded-*`/폐기 hex 없음, 킷 토큰만)
- [ ] `git diff --name-only` ⊆ CAN-touch · 엔진/규칙/스키마 무수정
- [ ] 스크린샷/스냅샷으로 "게이트 1턴 → 1차안" 한 사이클 증명(텍스트 스냅샷이라도)

## 📤 Return Format (5섹션, 한국어)
**✅ 한 일** / **❌ 못한 일** / **🤔 결정**(ADR 후보만, 직접 작성 금지) / **🔬 검증**(체크리스트 실측 + 한 사이클 증명 + `git diff --stat`) / **⚠️ 위험**

## ⚠️ 주의
- **엔진을 고치지 마라** — UI/입력합성/API 만. 엔진 계약(`PlanInput`/`ProgramPlan`)대로 쓴다. 엔진이 이상하면 STOP·보고(메인이 BR-3a 검수자).
- **모든 수치를 게이트로 만들지 마라** — 멈추는 건 엔진이 낸 `openGates` 뿐. 자동 결정은 근거와 함께 "보여주되 안 묻는다". (수치 수정은 ④에서 인라인 편집으로.)
- **T4/T5 에 회차표 UI 강요 금지** — `structure.kind` 분기 그대로 렌더.
- 저장은 **JSON 파일 또는 기존 Json 컬럼**만 — Prisma 스키마 변경 금지(migration 보류).
- 새 화면 = **처음부터 디자인킷 토큰**. rule-board.tsx 톤 따라가되 `bg-primary`/`rounded-*` 복붙 금지.
- 프로젝트→RfpSlice 조립은 **기존 curriculum route 패턴 재사용**(중복 구현·route 수정 금지).

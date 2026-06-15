# Brief BR-3a — 프로그램 기획 엔진 (D0~D8, 운영유형 우선, DesignRule 소비)

> **이 브리프는 자급자족입니다.** 서브 에이전트는 본 파일 + `../../CLAUDE.md`
> + `../../AGENTS.md` + `../../docs/glossary.md` 외에 메인 세션 컨텍스트 없이도
> 작업 가능해야 합니다. 막히면 추측하지 말고 STOP 후 메인에 보고하세요.

| 메타 | 값 |
|------|----|
| ID | `BR-3a-program-plan-engine` |
| Owner | 메인 세션 |
| 작성일 | 2026-06-16 |
| 상태 | 🔲 대기 |
| 의존 브리프 | BR-2 (✅ — `design-rule.ts` 로더·23규칙 시드 존재) |
| 우선순위 | P0 |
| 예상 시간 | 1.5~2일 |
| 격리 | 일반 (master 직접 / 현재 브랜치 `feat/alpha-test-prep` in-place) |
| 관련 ADR | **ADR-028 추록 3** (DesignRule·해소 우선순위) · ADR-022 (모델 2-tier) · ADR-021 (생성 엔진) |
| 후속 | BR-3b (턴 기반 인테이크 UI — 이 엔진 위에) |

---

## 🎯 Mission
RFP + 승인된 DesignRule + (선례·담당자 의도) 를 받아 **"좋은 프로그램 기획 1차안"** 을 내는
**헤드리스 엔진**을 만든다. 핵심은 (1) **운영유형(T1~T5)이 첫 분기** — T4/T5 에 회차표를 강요하지 않음,
(2) **하드코딩 강제값 추방** — 모든 값은 DesignRule 기본값 또는 사람 결정에서 나옴,
(3) **결정마다 근거**(§09 결정로그 형태) 출력, (4) **모호하면 멈춤** — 턴 기반 결정 게이트.

> ⚠️ 이건 제안서 생성기가 아니다. **프로그램 기획**(운영유형·흐름·회차/구조·근거)을 짓는 엔진이다.
> UI 는 BR-3b 별도. 이 브리프는 **엔진 + 헤드리스 검증**까지.

## 📋 Context — 왜 새로 짓나
기존 `src/lib/curriculum-ai.ts` 는 **방법론(methodology.primary 9-way)이 첫 분기 + 항상 회차표 +
"Action Week 2회+/실습 60%+/1:1 코칭" 하드코딩 강제** (L213·L233·L408·L433·L625). 이는 설계 정본
`docs/UD-Brain-CurriculumDesignLogic-v1.2.html` 과 정반대다. v1.2 는 **운영유형이 회차표보다 먼저**,
모든 문법은 **기본값이지 강제가 아니며**(제0원칙), T4 개별밀착·T5 행사운영(코퍼스 1/3~1/2)에는
회차표가 정답이 아니라고 실측으로 말한다. 기존 코드를 뜯지 않고 **새 모듈로 깨끗하게** 짓는다
(기존 curriculum-ai 는 Deep 트랙 back-compat 으로 보존, 건드리지 마라).

**범위 축소(2026-06-15)**: 이번엔 Express 7섹션 조립·제안서/덱 출력에 **엮지 않는다**. 독립적으로
"프로그램 기획 1차안"(결정로그 + 구조)이 나오는 것까지가 BR-3a.

## ✅ Prerequisites (STOP 조건)
- [ ] `src/lib/program-design/design-rule.ts` 존재 (BR-2 — `loadDesignRules` 로더)
- [ ] `data/program-design/design-rules.json` 존재 (23규칙). ⚠️ 검수 진행 중이라 `status:"approved"` 가 0건일 수 있다 — **엔진은 approved 0건에도 동작**해야 한다(아래 §graceful).
- [ ] `docs/UD-Brain-CurriculumDesignLogic-v1.2.html` 존재 — D0~D8·T1~T5·§09 형태의 정본
- [ ] GEMINI 키 (`.env`) — invokeAi 용

## 📖 Read These Files First
1. `../../CLAUDE.md` · `../../AGENTS.md` · `../../docs/glossary.md`
2. `../../docs/decisions/028-program-design-grammar.md` **추록 3** ⭐ — DesignRule 구조·`decisionPolicy`·**해소 우선순위**(① 담당자 의도+선례 → ② 목표·RFP → ③ DesignRule 기본값)·"자동 가능하면 자동, 모호하면 물음"
3. `../../docs/UD-Brain-CurriculumDesignLogic-v1.2.html` ⭐ — **§04 운영유형 T1~T5**·**§05 흐름문법**·**§08 D0~D8**·**§09 예시 출력 형태**(결정로그 + 회차표/구조). 출력 모양의 정본.
4. `../../data/program-design/design-rules.json` ⭐ — 소비할 규칙(8그룹 A~G+Z). recommend.value 구조 학습.
5. `../../src/lib/program-design/design-rule.ts` — `loadDesignRules`·타입 재사용
6. `../../src/lib/curriculum-ai.ts` ⭐ — **반면교사**. L213·L233·L408·L433·L625 의 하드코딩 강제를 **이 엔진에선 재현하지 마라**. 단 RfpSlice/입력 직렬화 패턴은 참고.
7. `../../src/lib/ai-fallback.ts` — `invokeAi` 단일 진입점(eslint 강제) · `../../src/lib/ai/config.ts` — 모델 라우팅(생성=Pro, 추출/분류=Flash) · `AI_TOKENS`
8. `../../src/lib/pipeline-context.ts` — `RfpSlice`·`ParsedRfp` 타입(엔진 입력)
9. `../../scripts/fixtures/` (capstone-rfp.json 등) + `../../scripts/eval-quality-sweep.ts` 상단 — 헤드리스 RFP fixture·실행 패턴

## 🎯 Scope
### CAN touch
- `src/lib/program-design/generate-plan.ts` (신규 — 엔진)
- `src/lib/program-design/plan-types.ts` (신규 — ProgramPlan·DecisionLog·Gate 타입)
- `src/lib/program-design/resolve-rules.ts` (신규 — 결정론적 규칙 해소)
- `scripts/_test-program-plan.ts` (신규 — 헤드리스 검증)
### MUST NOT touch
- `src/lib/curriculum-ai.ts`·`curriculum-rules.ts`·`curriculum/**` (기존 Deep — 보존)
- `src/lib/program-design/operating-format.ts`·`extraction-prompt.ts`·`vod-catalog.ts`·`design-rule.ts` (BR-1/BR-2 동결 — 읽기만)
- `data/program-design/**` (읽기만 — design-rules.json 포함, 쓰지 마라)
- `prisma/schema.prisma` · `src/lib/ai-fallback.ts` 시그니처 · Express/Deck 컴포넌트 · manifest

## 🛠 Tasks

### 1. 타입 (`plan-types.ts`)
- `OperatingType = 'T1'|'T2'|'T3'|'T4'|'T5'`
- `DecisionLogEntry { step: 'D0'..'D8', decision: string, rationale: string, evidence: { source, stat? }, ruleIds: string[], source: 'precedent'|'intent'|'goal'|'rfp'|'rule'|'human' }` — **각 결정에 출처+근거**(v1.2 §09 결정로그).
- `PlanGate { axis: string, question: string, options?: unknown[], recommended?: unknown, ruleId?: string, why: string }` — 사람에게 묻는 결정 게이트.
- `ProgramPlan { operatingType, decisionLog: DecisionLogEntry[], structure: SessionTable | NonSessionStructure, openGates: PlanGate[], meta }`
  - `SessionTable` (T1~T3): `{ kind:'sessions', sessions: PlanSession[] }` — 회차[{no,title,hours,format,kind:'theory'|'workshop'|'coaching'|'event'|'milestone', rationale}]
  - `NonSessionStructure` (T4/T5): `{ kind:'individual'|'event', stages: {label, content, rationale}[] }` — **회차표 아님**(v1.2 §09-B/C 형태)
- `PlanInput { rfp: RfpSlice, precedent?: PrecedentInput, intent?: IntentInput, decisions?: Record<string, unknown> }`
  - `precedent`/`intent` 는 선택 — 담당자 의도·이전 진행(자유 텍스트/구조). **있으면 1순위**.

### 2. 결정론적 규칙 해소 (`resolve-rules.ts`) — AI 없음, 테스트 가능
- `resolvePlan(input, approvedRules): { decided: DecisionLogEntry[], gates: PlanGate[], operatingType? }`
- **해소 우선순위(추록 3)**: 각 축마다 ① `input.intent`/`input.precedent` 에 값 있으면 그것(source='intent'/'precedent') → ② `rfp.parsed`/`input.decisions` 에 있으면 그것(source='rfp'/'human') → ③ 매칭되는 **approved** DesignRule 기본값(source='rule', ruleId 기록) → ④ 아무것도 없으면:
  - 규칙의 `decisionPolicy==='ask_human'` 이거나 **신호 모호**(아래) → `PlanGate` 로 적재(멈춤).
  - `decisionPolicy==='auto'/'auto_unless_conflict'` 이고 approved 기본값 있음 → 자동 채움.
- **운영유형(D1)**: A 규칙 decisionTree + RFP 신호(키워드 '경진대회/박람회/공모전'→T5, '소상공인/재창업/점포'→T4, 기간·예산·대상 시간구조)로 **명백하면 자동 선택+근거**, 모호하면 게이트. (사용자 원칙: 자동 가능하면 자동)
- **graceful (approved 0건)**: 매칭 approved 규칙이 없으면 그 축은 **게이트**로(추측 채움 금지). 즉 규칙 승인 전엔 게이트가 많고, 승인이 늘수록 자동이 늘어난다 — 정상 동작.
- `auto_unless_conflict`: 자동 채우되 RFP/목표와 **상충**하면(예: 회차 10 상한인데 RFP가 20회 명시) 규칙 무시하고 상위값 + `DecisionLogEntry` 에 충돌 메모.
- **하드코딩 금지**: 회차수·코칭수·Action Week·실습비율 등 **어떤 수치도 코드에 박지 마라**. 전부 규칙/입력에서. 규칙이 없으면 게이트.

### 3. AI 조립 (`generate-plan.ts`)
- `planProgram(input): Promise<ProgramPlan>` — 흐름:
  1. `loadDesignRules()` → `status==='approved'` 필터.
  2. `resolvePlan()` → decided + gates + operatingType.
  3. **openGates 있으면**: 구조 생성을 멈추고 `{ operatingType?, decisionLog: decided, openGates, structure: 빈 placeholder }` 반환 (턴 기반 — UI(BR-3b)가 게이트 응답을 `input.decisions` 로 다시 넣어 재호출). **게이트 남았는데 AI로 추측해 채우지 마라.**
  4. **게이트 0건이면**: `invokeAi`(생성=Pro 티어, `AI_TOKENS.LARGE`)로 구조 생성 —
     - T1~T3: 회차표. 흐름문법(C 규칙) 위치 준수(마인드셋 앞·코칭 후반·발표 끝·중간 50%). 회차수·코칭수는 **resolved 값**을 그대로 따름(AI가 바꾸지 않게 프롬프트에 고정).
     - T4: 개별 여정(진단방문·공통접점·개별컨설팅·AI코치) — 회차표 X (v1.2 §09-B).
     - T5: 행사 설계 단계 — 회차표 X (v1.2 §09-C).
  5. 각 구조 요소·결정에 **rationale + evidence** 부착 → §09 결정로그 완성.
- 프롬프트는 resolved 결정을 **제약으로 주입**(AI는 살을 붙일 뿐 핵심 수치를 못 바꿈). invokeAi 단일 진입점. safeParseJson(`src/lib/ai/parser.ts`) 사용.

### 4. 헤드리스 검증 (`scripts/_test-program-plan.ts`)
- fixture RFP 3종으로 `planProgram` 실행: **(A)** 청년 예비창업(→T3 회차표), **(B)** 소상공인 매출(→T4 회차표 없음), **(C)** 임직원 사내벤처(→T5/컴팩트). v1.2 §09 A/B/C 시나리오에 대응.
- 검증 출력: 운영유형 판별 결과, 게이트 목록(또는 자동 결정), 결정로그(각 항목 source·ruleId·근거), 구조 종류(sessions vs non-session). **B는 회차표가 아니어야 PASS.**
- approved 규칙 수에 따라 게이트/자동 비율이 바뀌는 걸 콘솔에 표시(graceful 증명). LLM 호출은 메인이 키로 직접 돌릴 수 있게, 결정론 부분(resolveRules)만이라도 LLM 없이 PASS 하게 분리.

## 🧪 Self-Verification (완료 선언 전)
- [ ] `npm run typecheck` · `npm run lint` · `npm run check:manifest` 통과
- [ ] `npx tsx scripts/_test-program-plan.ts` — **resolveRules(결정론) 부분 LLM 없이 PASS**: 3 fixture 운영유형 판별 정확(B→T4, C→T5/임직원 소수회차), 결정마다 source·근거 존재, **하드코딩 수치 0**(grep 으로 회차/코칭 매직넘버 없음 자기점검)
- [ ] approved 0건일 때 크래시 없이 게이트로 graceful, 규칙 일부 승인 시 자동 비율 증가 (콘솔로 증명)
- [ ] `B 시나리오(소상공인)` 결과 structure.kind !== 'sessions' (회차표 강요 안 함)
- [ ] (LLM 단계) 메인이 실행할 수 있게 분리 — 서브가 LLM E2E 를 자기 백그라운드로 돌려 결과 유실 금지. 결정론 PASS + LLM 단계는 "메인이 키로 실행 요망"으로 보고 가능.
- [ ] `git diff --name-only` ⊆ CAN-touch · 기존 curriculum-ai.ts 무수정

## 📤 Return Format (5섹션, 한국어)
**✅ 한 일** / **❌ 못한 일** / **🤔 결정**(ADR 후보만) / **🔬 검증**(체크리스트 실측 + 3 fixture 운영유형 판별 결과 + `git diff --stat`) / **⚠️ 위험**

## ⚠️ 주의
- **어떤 수치도 하드코딩 금지** — 회차·코칭·AW·실습% 전부 규칙/입력에서. 없으면 게이트. (사용자 핵심: 강제값 X, 유연한 기본값 + 모호하면 사람 위임)
- **게이트 남았는데 AI로 추측 채우지 마라** — 멈추고 반환(턴 기반).
- **T4/T5 에 회차표 강요 금지** — structure 분기.
- 기존 `curriculum-ai.ts` 강제 패턴(L213·L433 등)을 복붙하지 마라 — 반면교사다.
- DesignRule 은 **approved 만** 소비. 검수 전이라 0건이어도 graceful.
- 선례·담당자 의도가 입력에 있으면 **규칙보다 우선**(추록 3 해소 순서).
- 막히면 STOP·보고. ADR 직접 작성 금지(후보만).

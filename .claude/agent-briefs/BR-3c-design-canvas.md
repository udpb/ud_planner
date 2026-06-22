# Brief BR-3c — 프로그램 설계 캔버스 (재디자인 + 코치풀·자산·요소 통합, P2)

> **자급자족.** 서브는 본 파일 + `CLAUDE.md` + `AGENTS.md` + `docs/glossary.md` + `.claude/skills/ud-design-system/SKILL.md` 로 작업. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-3c-design-canvas` |
| Owner | 메인 세션 |
| 작성일 | 2026-06-22 |
| 상태 | 🔲 대기 |
| 의존 | BR-3b(program-design-flow.tsx 턴 UI) · 코치 추천(recommend-coaches API·AutoRecommendedPool) · 자산 추천 |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
② 프로그램 설계 화면을 **설계 캔버스**로 재디자인. 현 `program-design-flow.tsx`(BR-3b)의 **날코드 게이트(T1~T5)·밋밋한 폼**을 → (1) **읽을 수 있는 게이트**(운영유형 이름+설명+실측), (2) **시각적 결정로그·회차 타임라인**, (3) **코치풀 자동추천**(기존 컴포넌트 재사용), (4) **자산 자동인용**, (5) **기획요소**(선발·진단·연계) 칩으로. 메인 세션 목업 `design_stage_auto_intelligence` 가 기준.

> 핵심: **새 엔진 만들지 마라.** program-design 브레인·코치 추천·자산 추천은 다 있다 — **재사용 + 통합 배치 + 디자인킷**.

## 📋 Context (재사용 자산)
- **program-design 브레인**: `src/lib/program-design/{plan-types,generate-plan}.ts` → `ProgramPlan`(operatingType·decisionLog·openGates·structure). API `POST /api/projects/[id]/program-design`(BR-3b). UI `program-design/_components/program-design-flow.tsx`.
- **코치풀 추천**: `GET /api/projects/[id]/recommend-coaches` → {requiredN, recommendations[{name,organization,tier,matchScore,strengthOneLiner,...}]}. **컴포넌트 `src/components/projects/coaches/AutoRecommendedPool.tsx` 이미 존재 — 재사용.**
- **자산 자동인용**: `src/lib/express/auto-citations.ts`·`asset-recommender.ts` · `components/projects/matched-assets-panel.tsx`·`InlineCitations.tsx` — 재사용.
- 운영유형 T1~T5 이름·설명·실측: `docs/UD-Brain-CurriculumDesignLogic-v1.2.html §04` + `data/program-design/design-rules.json`(B 프로파일).

## ✅ Prerequisites
- [ ] `program-design-flow.tsx`·`plan-types.ts` 존재 (BR-3b/3a)
- [ ] `recommend-coaches` API·`AutoRecommendedPool.tsx` 존재
- [ ] `npm run dev` 가능 (UI 확인 — 단 로컬 DB drift로 인증 막히면 컴파일·구조까지만, 정직 보고)

## 📖 Read First
1. `CLAUDE.md`·`AGENTS.md`·`ud-design-system/SKILL.md` ⭐(디자인킷 — 새 코드 킷 토큰만)
2. `src/app/(dashboard)/projects/[id]/program-design/_components/program-design-flow.tsx` — 재디자인 대상(턴 루프 로직은 보존, UI만 교체)
3. `src/lib/program-design/plan-types.ts` — `ProgramPlan`·`PlanGate`·`SessionTable`/`NonSessionStructure`
4. `src/components/projects/coaches/AutoRecommendedPool.tsx` + `recommend-coaches/route.ts` — 코치풀 재사용
5. `src/components/projects/matched-assets-panel.tsx` · `express/InlineCitations.tsx` — 자산 인용 재사용
6. `data/program-design/design-rules.json`(B 프로파일 — 운영유형 이름·실측)

## 🎯 Scope
### CAN touch
- `src/app/(dashboard)/projects/[id]/program-design/_components/**` (flow 재디자인 + 하위 컴포넌트: 게이트카드·결정로그·타임라인·코치풀·자산·요소)
- `src/app/(dashboard)/projects/[id]/program-design/page.tsx` (필요 시 props 로드)
- (신규 하위 컴포넌트 파일들 — `_components/` 안)
### MUST NOT touch
- `src/lib/program-design/**` 엔진 (읽기·호출만 — 게이트/플랜 구조 그대로)
- `recommend-coaches`·자산 API·라이브러리 (호출만, 재구현 금지)
- `src/components/ui/**`(shadcn) · prisma · 다른 트랙 · manifest · impact/sroi(P1 영역)
- `git diff --name-only` ⊆ program-design 화면

## 🛠 Tasks (목업 `design_stage_auto_intelligence` 기준)
1. **읽을 수 있는 게이트** — `PlanGate.options`가 운영유형이면 T1~T5 날코드 대신 **이름(정규강좌형/몰입캠프형/장기여정형/개별밀착형/행사운영형) + 한줄 설명 + 실측 프로파일(기간·회차·코칭)**, 추천 유형 accent 강조 + 이유. (이름·설명은 design-rules.json B 프로파일/v1.2 §04에서 — 하드코딩 금지, 데이터에서)
2. **시각적 결정로그** — `decisionLog`를 D0~D8 순서로, 각 결정 + rationale + **source 배지**(의도/선례/RFP/규칙/사람) + conflictNote.
3. **회차 타임라인** — `structure.kind==='sessions'`면 회차를 kind별 색(이론/실습/코칭/발표) 타임라인. T4/T5(individual/event)는 **단계 리스트**(회차표 강요 금지).
4. **코치풀 패널** — `AutoRecommendedPool`(또는 recommend-coaches 호출) 임베드: 추천 코치 + matchScore + strengthOneLiner. "coach-finder 자동추천" 라벨.
5. **자산 인용 패널** — 자산 추천/매칭 컴포넌트 재사용해 근거 자산 칩.
6. **기획요소 칩** — 선발 설계(D2)·사전진단(커리큘럼)·사후연계(D7) 를 plan 요소로 표시(있으면).
7. 턴 루프(게이트 응답→재호출)·structure 분기 로직은 **BR-3b 그대로 보존** — UI만 교체.

## 🧪 Self-Verification
- [ ] `npm run typecheck`·`npm run lint`(신규0)·`npm run check:manifest` 통과
- [ ] `npm run dev` ② 화면 렌더 — 게이트가 **이름+설명**으로(날코드 X), 결정로그·타임라인·코치풀·자산 표시. (인증 막히면 컴파일·스냅샷까지, 정직 보고)
- [ ] 디자인킷 위반 0(`bg-primary`/`rounded-*`/폐기hex 0 — 새 코드 킷 토큰만). 목업 톤 일치
- [ ] T4/T5 시 회차표 아닌 단계 리스트 렌더 확인
- [ ] 엔진·API 재구현 0(호출만) · `git diff --name-only` ⊆ program-design 화면

## 📤 Return (5섹션, 한국어): ✅한일 / ❌못한일 / 🤔결정(ADR후보) / 🔬검증(실측+스냅샷+git diff --stat) / ⚠️위험

## ⚠️ 주의
- **엔진·추천 로직 재구현 금지** — program-design 브레인·코치 추천·자산 추천은 호출만.
- **운영유형 이름·실측 하드코딩 금지** — design-rules.json/v1.2에서.
- 턴 루프·structure 분기 보존(UI만 교체). T4/T5 회차표 강요 금지.
- 새 화면 디자인킷 토큰만(목업 톤). 커밋 금지(메인 검수).

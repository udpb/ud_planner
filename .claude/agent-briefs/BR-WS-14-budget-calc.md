# Brief BR-WS-14 — SI-budget-calc: 예산 적산 엔진 (budget-rules.json 기반 bottom-up)

> **자급자족.** 본 파일 + `CLAUDE.md` + `AGENTS.md` + `ud-design-system/SKILL.md` + [budget-rules.json](../../data/program-design/budget-rules.json) + [service-improvements-backlog.md](../../docs/architecture/service-improvements-backlog.md). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-14-budget-calc` (백로그 SI-budget-calc, 순서 8) · 2026-06-25 |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
워크스페이스 **예산 자동화 캔버스**를 placeholder에서 **진짜 적산**으로. `data/program-design/budget-rules.json`(2026 단가표 + 워터폴, 권위 데이터)을 읽어 **커리큘럼·코치에서 bottom-up 적산** → 워터폴로 총사업비·마진. **결정론적(AI 없음)**, PM 편집 가능.

> 원칙: budget-rules.json은 **데이터(읽기 전용)** — 단가·비율 하드코딩 금지. 산출은 **초안**, PM이 항목 금액 수정. 기존 `infer-budget.ts`(top-down 비율, AI)는 **건드리지 않음**(별개 — 향후 교차검증).

## 📋 재료 (전부 존재)
- **규칙 데이터** `data/program-design/budget-rules.json`: `waterfall`(vatRate .1/icRate .15/idcRate .015/drRate .835 + drSplitObserved) · `coachRates2026`(코칭/강의/운영 × 특별/메인/보조/교육생 × first1h·overPerH·perDay·perMonth) · `lectureConsultJudge2026`(특강 A/B/C·컨설팅·심사) · `designPrintPhoto2026` · `personnelRatesB2GB2B`(PC 인건비) · `acItemPatterns`(행사·운영 중앙단가) · `costingExamples`.
- **로드 패턴**: `src/lib/program-design/design-rule.ts`의 `fs.readFile(path.join(process.cwd(),'data/program-design/...'))` + `JSON.parse` 그대로.
- **커리큘럼 세션**: `src/lib/program-design/saved-plan.ts` `readSavedPlan(projectId)` → `structure.sessions`(PlanSession[] — no/title/kind/hours).
- **코치 수**: `prisma.project … coachAssignments` count (없으면 기본값). 채널: `project.projectType`(B2G/B2B). 기간: eduStartDate~eduEndDate → 개월.
- **워크스페이스**: `ProgramWorkspace.tsx` budget 단계 캔버스(현재 `BudgetSummaryCanvas` placeholder, BR-WS-7) · `load-workspace.ts` · `page.tsx`.

## 🎯 Scope
### CAN touch
- `src/lib/program-design/budget-calc.ts` (신규 — `loadBudgetRules()`·`calcBudget(input): BudgetResult` 순수 결정론)
- `src/app/api/projects/[id]/budget-calc/route.ts` (신규 — 입력 조립 + calcBudget. 인증 가드)
- `src/components/projects/workspace/BudgetCalcCanvas.tsx` (신규 — 적산 표시·PM 편집·경고)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (budget 캔버스 → BudgetCalcCanvas)
- `src/lib/projects/load-workspace.ts` (saved-plan 세션 + 코치수 + 기간 로드 → budget 입력)
- `src/app/(dashboard)/projects/[id]/page.tsx` (budget props 전달)
### MUST NOT touch
- `data/program-design/budget-rules.json`(읽기만) · `infer-budget.ts` · `plan-types`·`generate-plan`·`resolve-rules` · prisma 스키마 · `invokeAi`(이 엔진은 AI 불요) · 코치/임팩트 엔진 · `components/ui/**`

## 🛠 Tasks
1. **`budget-calc.ts`** — 타입 + `loadBudgetRules()`(fs read, 캐시) + `calcBudget(input)`:
   - **입력**: `{ totalBudget:number, channel:'B2G'|'B2B', sessions:{kind,hours,title}[], coachCount:number, durationMonths:number }`
   - **워터폴**: `VAT=round(R*vatRate/(1+vatRate))` · `R'=R−VAT` · `IC=R'*icRate` · `IDC=R'*idcRate` · `DR=R'−IC−IDC`.
   - **AC(실비) bottom-up 초안** (코치료는 coachRates2026 perDay 기준, 초안):
     - 세션 kind별: `coaching`→코칭 메인 perDay×coachCount · `workshop`/`theory`→강의 메인 perDay · `event`/`milestone`→acItemPatterns(성과공유회 2M·데모데이 1.2M 등 title 매칭, 없으면 성과공유회) · `prelearning`→0
     - 운영비 = `durationMonths × 운영.메인.perMonth × 0.5`(기본 0.5 FTE)
     - 홍보비 = acItemPatterns 홍보마케팅(2M, 1식) · 디자인비 = designPrintPhoto 키비주얼 기본패키지(1.2M, 1식)
     - `AC = Σ lines`
   - **PC(인건비) 초안** = `durationMonths × personnelRatesB2GB2B[channel] PM급 monthly × 0.3`(기본 투입률)
   - **OR(영업이익)** = `DR − PC − AC` · `marginRate = OR / R'`
   - **경고**: `AC+PC > DR`→적자/초과 · `marginRate<0.05`→마진 부족 · `marginRate>0.20`→재검토
   - **반환** `{ waterfall:{R,VAT,Rprime,IC,IDC,DR}, acLines:{label,amount,basis}[], pcLines:{label,amount,basis}[], ac, pc, or, marginRate, warnings:string[], source:'2026 단가표' }`
   - 모든 단가·비율은 **budget-rules.json에서** 읽음(하드코딩 0). 값 없으면 graceful 기본.
2. **route** — `requireProjectAccess`. project(총예산·채널·기간)·`readSavedPlan`(세션)·coachAssignments count 조립 → calcBudget → JSON.
3. **`BudgetCalcCanvas`** — 워터폴 요약(R→VAT→R'→IC/IDC→DR) + AC/PC 라인(금액 인라인 편집) + OR·마진율 + 경고 배지. "근거: 2026 단가표 + 유사 29건". 세션/코치 없으면 안내("커리큘럼·코치 먼저"). 디자인킷(틴트·radius 0·accent). 편집은 client state(이번엔 미저장 — 주석).
4. **배선** — load-workspace가 budget 입력(세션·코치수·기간) 조립 → page → ProgramWorkspace budget 캔버스를 `<BudgetCalcCanvas .../>`로.

## 🧪 Self-Verification (임시 tsx 단위 테스트로 적산 산식 증명 후 삭제)
- 예: R=3억·B2G·8세션(coaching4/theory3/event1)·코치4·5개월 → 워터폴 합 검증(VAT+R'=R, IC+IDC+DR=R'), AC/PC/OR 합 = DR, marginRate 산출. 경고 트리거(마진<5%) 케이스.
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ CAN touch · budget-rules.json·infer-budget·prisma·invokeAi 무변경
- [ ] 단가·비율 전부 budget-rules.json 출처(하드코딩 0) — 코드 확인
- [ ] ⚠️ 메인이 프리뷰+Chrome으로 예산 캔버스 적산·마진·경고 사후 검수 → **코드 ✓ + 단위테스트** 보증. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정(ADR후보 — 세션↔단가 매핑 정교화·Budget 저장)/🔬검증(`코드 ✓`+단위+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- **결정론(AI 없음).** budget-rules.json 읽기 전용·하드코딩 0. infer-budget 무변경.
- 산출은 **PM 편집 초안** — 세션↔단가 매핑은 합리적 기본값(완벽 불요, PM이 조정). 저장은 이번 범위 밖.
- 커밋 금지(메인 검수·프리뷰 검수).

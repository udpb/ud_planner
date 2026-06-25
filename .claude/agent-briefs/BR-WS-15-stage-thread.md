# Brief BR-WS-15 — SI-thread: 단계 간 라이브 연동 (커리큘럼 → 코치수 → 예산, 실시간)

> **자급자족.** 본 파일 + `CLAUDE.md` + `AGENTS.md` + `ud-design-system/SKILL.md` + [service-improvements-backlog.md](../../docs/architecture/service-improvements-backlog.md) + `docs/architecture/program-workspace-redesign-v1.md`(§10). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-15-stage-thread` (백로그 SI-thread, 순서 9) · 2026-06-25 |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
지금 각 단계 캔버스가 따로 놀아 **예산이 커리큘럼 회차를 못 받음**(라이브 검수: 예산 "0회차 → 마진 80.9% ⚠"). **워크스페이스 공유 상태(Live Plan)** 를 두고 **커리큘럼 변경 → 코치 필요수 + 예산 적산이 실시간 재계산**되게.

**흐름:** `② 커리큘럼(sessions 쓰기) → Live Plan ctx → coachCount=estimateRequiredCoaches(rfp,sessions) 파생 → ④ 코치 필요수 + ⑤ 예산 적산이 구독해 즉시 갱신.`

## 📋 재료 (전부 존재)
- **`estimateRequiredCoaches({rfp, curriculum})`** (`src/lib/coaches/required-count.ts`) — **순수 함수, client 가능.** 회차수+1:1/액션위크 → N. 그대로 사용(수정 금지).
- **`calcBudget(rules, input)`** (`src/lib/program-design/budget-calc.ts`, BR-WS-14) — 순수 적산. **단, `loadBudgetRules`가 같은 파일에 fs로 있어 client import 시 번들 깨질 수 있음** → 분리 필요(아래 Task1).
- **`ProgramDesignFlow`** 이미 `onSessionsChange(sessions|null)` 보고(BR-WS-6). → ctx로 연결.
- **`BudgetCalcCanvas`**(BR-WS-14) — 현재 API fetch. → ctx 읽어 client live 재계산.
- **`AutoRecommendedPool`** — 자체 API로 requiredN 산정·표시. → ctx의 coachCount를 override로 받게(라이트 additive prop).
- `load-workspace.ts`(rfpParsed 있음)·`ProgramWorkspace.tsx`·`page.tsx`.

## 🎯 Scope
### CAN touch
- `src/lib/program-design/budget-calc.ts` — **순수 `calcBudget`+타입만 남기고 client-safe화**(fs/server-only import 제거). `loadBudgetRules`(fs)는 `budget-rules-loader.ts`(신규, server)로 이동. budget-calc/route.ts·BudgetCalcCanvas의 import 갱신.
- `src/lib/program-design/budget-rules-loader.ts` (신규 — server fs 로드)
- `src/components/projects/workspace/WorkspacePlanContext.tsx` (신규 — Provider+hook: sessions/setSessions, rfp, totalBudget, channel, budgetRules, 파생 coachCount)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (Provider 설치 + ② onSessionsChange→ctx + ⑤/④에 ctx 전달)
- `src/components/projects/workspace/BudgetCalcCanvas.tsx` (ctx.sessions+coachCount+rules로 client live `calcBudget`. 세션 변하면 재계산.)
- `src/components/projects/coaches/AutoRecommendedPool.tsx` (optional `requiredCountOverride?:number` — 있으면 표시·poolSize 그걸로. additive, 기본 동작 보존)
- `src/lib/projects/load-workspace.ts` (budgetRules + rfpParsed 노출) · `src/app/(dashboard)/projects/[id]/page.tsx` (전달)
### MUST NOT touch
- `data/program-design/budget-rules.json`(읽기) · `required-count.ts` 로직 · `recommend-coaches` route 내부 · `infer-budget` · `plan-types`·`generate-plan`·`resolve-rules` · prisma 스키마 · `invokeAi` · `components/ui/**`

## 🛠 Tasks
1. **budget-calc client-safe 분리** — `budget-calc.ts`에서 fs/loadBudgetRules 제거 → `budget-rules-loader.ts`(server, `loadBudgetRules()`)로. `budget-calc.ts`는 순수 `calcBudget(rules,input)`+타입+`BudgetRules` 타입만(client import 안전). route·canvas import 경로 갱신. **계산 로직 동일.**
2. **`WorkspacePlanContext`** — `{ sessions: PlanSession[]|null, setSessions, rfp, totalBudget, channel, budgetRules }` + 파생 `coachCount = useMemo(estimateRequiredCoaches({rfp, curriculum: sessions ?? undefined}))`. Provider가 초기 sessions(load-workspace savedPlan)·rfp·rules·예산·채널을 받음.
3. **ProgramWorkspace 배선** — Provider로 감쌈. ② 캔버스 `ProgramDesignFlow`의 `onSessionsChange`→`ctx.setSessions`. ⑤ 예산=`<BudgetCalcCanvas/>`(ctx 구독). ④ 코치=`<AutoRecommendedPool requiredCountOverride={ctx.coachCount}/>`.
4. **BudgetCalcCanvas live** — ctx.{sessions, coachCount, totalBudget, channel, budgetRules}로 **client에서 calcBudget 즉시 호출**(useMemo). API fetch 경로 제거(또는 초기 fallback만). sessions 0이면 기존 안내. PM 라인 편집 유지.
5. **AutoRecommendedPool** — `requiredCountOverride` 있으면 그 값으로 requiredN·poolSize 표시(추천 fetch는 그대로, 카운트만 ctx 정합). 없으면 기존.
6. **load-workspace/page** — budgetRules(server 로드)·rfpParsed를 워크스페이스로. 디자인킷 유지.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ CAN touch
- [ ] **client 번들 안전**: budget-calc.ts에 fs/server-only import 없음(BudgetCalcCanvas가 client에서 calcBudget 호출 가능). loadBudgetRules는 server 파일에만.
- [ ] 로직 불변: `calcBudget`·`estimateRequiredCoaches` 계산 결과 동일(이동/분리만).
- [ ] 연동 경로(코드): ②onSessionsChange→ctx.setSessions→coachCount 재산정→④표시+⑤재적산.
- [ ] ⚠️ 메인이 docker 로컬/Vercel 프리뷰+Chrome으로 "회차 추가→코치수·예산 마진 즉시 변화" 사후 검수 → **코드 ✓** 보증. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정(ADR후보)/🔬검증(`코드 ✓`+연동 경로+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- `required-count`·`recommend-coaches`·`budget-rules.json` 로직 무변경(사용·이동만). budget-calc는 **분리만, 계산 동일**.
- AutoRecommendedPool은 **additive prop만**(기존 동작 보존). 커밋 금지(메인 검수·프리뷰 검수).

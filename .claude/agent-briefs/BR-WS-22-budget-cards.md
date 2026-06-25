# Brief BR-WS-22 — 예산 항목 카드 (대화 → 조정안 카드 → 클릭 시 적산 즉시 반영)

> **자급자족.** 본 파일 + `ProgramWorkspace.tsx`(design incomingOps 패턴=미러) + `BudgetCalcCanvas.tsx` + `src/lib/program-design/session-ops.ts`(op 모듈 스타일). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-22-budget-cards` · 2026-06-25 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 패턴 | BR-WS-6/17 대화→캔버스+카드 를 **예산 단계**로. design 의 `onSessionsChange`+`incomingOps` 미러. |

## 🎯 Mission
예산 단계 대화가 지금은 안내만. PM 이 "코칭료 줄여줘 / 운영비 좀 낮춰 / 마진 너무 높아" 하면 **구체 조정안 카드 2~3개** → 클릭 시 우측 적산 라인이 즉시 바뀌게(BR-WS-18 의 라인 편집 메커니즘 활용). ADR-030 관찰 분할(AC 60%·PC 8%·OR 16%)을 조정 근거로.

## 📋 현재 (정독)
- `BudgetCalcCanvas.tsx` — context(sessions·coachCount·totalBudget·channel·durationMonths·budgetRules)로 `calcBudget` client live(useMemo). **PM 라인 편집 = `acEdits`/`pcEdits` (label 키 → 금액 override) client state**(BR-WS-18). 결과 라인: `acLines`/`pcLines` 각 `{label, amount, basis}`.
- `ProgramWorkspace.tsx` — design 배선 미러 대상: `incomingOps` state + `handleOps`(opsSeq 단조증가) → ProgramDesignFlow. `onSessionsChange={setSessions}`(canvas→context 보고). budget stage 는 현재 `<BudgetCalcCanvas />`(props 없음). useWorkspacePlan() 으로 context 접근.
- `WorkspaceChat.tsx` — onOps 는 design 한정(`DesignOp = SessionOp|StageOp`). choices 카드 렌더 = **op 타입 무관 제네릭**(forward). budget stage 는 generic 응답(ops 없음).
- `assistant/route.ts` — `stageId==='design'` 만 ops/choices. 그 외(budget 포함) generic `{reply, action:null}`. **budget 분기 추가.**
- `WorkspacePlanContext.tsx` — sessions/stages/coachCount + budget 입력값 보유. budget 라인 보고용 필드 추가 가능.

## 🎯 Scope
### CAN touch
- **신규** `src/lib/program-design/budget-ops.ts` (BudgetOp 타입 + validateBudgetOps + applyBudgetOps — 순수, client+server safe, fs 금지)
- `src/app/api/projects/[id]/assistant/route.ts` (`handleBudget` 분기 추가 — design 핸들러 무변경)
- `src/components/projects/workspace/WorkspaceChat.tsx` (budget stage: budgetLines 동봉 + onOps 일반화 + 카드 forward)
- `src/components/projects/workspace/BudgetCalcCanvas.tsx` (현재 라인 context 보고 + incomingOps 수신 → acEdits/pcEdits 적용)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (budgetIncomingOps 배선 + 라인 chat 전달)
- `src/components/projects/workspace/WorkspacePlanContext.tsx` (budgetLines 보고/구독 필드)
### MUST NOT touch
- `budget-calc.ts`·`budget-rules.json`(BR-WS-18 완성, 무변경 — 단가·costingDefaults·워터폴) · session-ops·stage-ops(미러 스타일만) · planning-intent(BR-WS-21 별건) · prisma · `invokeAi` 시그 · `components/ui/**` · 다른 라우트
- OR 공식·적산 엔진 로직(라인 override 만, 엔진 재계산 아님)

## 🧩 BudgetOp 계약 (라인 override — BR-WS-18 acEdits/pcEdits 구동)
```ts
export type BudgetOp =
  | { op: 'setLine'; section: 'AC' | 'PC'; label: string; amount: number }   // 그 라벨 라인 금액 override
  | { op: 'resetLine'; section: 'AC' | 'PC'; label: string }                 // override 해제(기본 적산값 복귀)
```
- `validateBudgetOps(v)` = 불량 drop(안 던짐). `applyBudgetOps(edits, ops)` = `{ac:Record<label,number>, pc:Record<label,number>}` 새 맵 반환(setLine=설정, resetLine=삭제). label 은 현재 라인에 존재하는 것만 통과(환각 방지 — handleBudget 에서 knownLabels 필터).

## 🛠 Tasks
1. **budget-ops.ts 신설** — 위 계약. session-ops.ts 주석·스타일 미러. 순수 함수(엔진·fs 무관).
2. **handleBudget 분기(route)** — `stageId==='budget'` → body 의 현재 라인(`budgetLines:[{section,label,amount}]`) + marginRate + history + message 로 행동우선 프롬프트(되묻기 X). AI → `{reply, ops?, choices?}`(BudgetOp). validateBudgetOps + **knownLabels 필터**(현재 라인 라벨만). ops 있으면 choices 무시. ADR-030 관찰 분할을 근거 문구로(단정·강제 금지). design 핸들러·generic 경로 무변경.
3. **WorkspaceChat budget 전송+적용** — budget stage 일 때 body 에 `budgetLines`+`structure 불필요`. onOps 타입 일반화(`ChatOp = SessionOp|StageOp|BudgetOp`). budget stage 에서 onOps 주입(부모가 budget 적용 핸들러). 카드 렌더 무변경.
4. **BudgetCalcCanvas 보고+수신** — ① 현재 `acLines`/`pcLines`(label·amount, 편집 반영분)를 context 로 보고(`setBudgetLines`, design 의 onSessionsChange 미러). ② `incomingOps` prop 수신 → `applyBudgetOps` 로 acEdits/pcEdits 갱신(design 의 incomingOps useEffect·단조 id 가드 미러, 이중적용 방지).
5. **ProgramWorkspace 배선** — `budgetIncomingOps` state + `handleBudgetOps`(opsSeq 미러). budget stage: WorkspaceChat 에 `budgetLines`(context) 전달 + `onOps={handleBudgetOps}`; `<BudgetCalcCanvas incomingOps={budgetIncomingOps} />`. design 배선과 분리(서로 안 섞임).
6. **context** — `budgetLines: {section,label,amount}[]` + `setBudgetLines` (canvas 보고 → chat 구독). sessions 패턴 미러.
7. 디자인킷·이중적용 가드. 강제변경 금지(직접지시·카드클릭만).

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ CAN-touch(+신규 budget-ops)
- [ ] BudgetOp 검증·knownLabels 필터(환각 라벨 drop). applyBudgetOps 불변·라인 override 만(엔진 무변경).
- [ ] design 단계 회귀 없음(SessionOp/StageOp 경로 그대로). budget 카드 클릭 → acEdits/pcEdits 반영 → 마진 재계산.
- [ ] ⚠️ 메인이 프리뷰+Chrome 으로 budget 단계 "마진 낮춰줘/운영비 줄여줘"→카드→클릭→라인·마진 변화 사후 검수 → **코드 ✓**. 백그라운드 dev·커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- 라인 override 만(BR-WS-18 엔진·단가 무변경). design 경로 회귀 절대 금지(가장 큰 위험). budget-calc/rules·planning-intent 무관. 커밋은 메인.

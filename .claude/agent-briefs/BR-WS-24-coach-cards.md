# Brief BR-WS-24 — 코치 교체/추가 카드 (대화 → 후보 카드 → 클릭 = 배정/교체, Phase 2/2)

> **자급자족.** 본 파일 + `BR-WS-22-budget-cards.md`(가장 가까운 템플릿) + Phase 1 산출(`SelectedTeamPanel`·GET 로스터). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-24-coach-cards` · 2026-06-26 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 전제 | **BR-WS-23(Phase 1) 완료**(b0e43de) — 선발팀 로스터·패널·GET 존재. |
| 차이 | 코치 카드 apply = **서버 영속**(POST/DELETE coach-assignments) — budget/intent의 client override와 다름. |

## 🎯 Mission
코치 단계 대화가 안내만 한다. PM이 "코치 추천해줘 / 디지털 전문가 추가해줘 / 1번 코치 대신 다른 사람"이라 하면 **추천 풀 기반 후보 카드 2~3개** → 클릭 시 **배정/제거/교체**(서버) → 선발팀 패널 즉시 갱신. BR-WS-22(예산 카드)의 chat→context→카드→적용 패턴을 미러하되, apply는 기존 coach-assignments API 호출.

## 📋 현재 (정독)
- **Phase 1 산출**: `SelectedTeamPanel`(선발팀 표시·제거·GET 재fetch) · `GET /api/projects/[id]/coach-assignments`(로스터) · `ProgramWorkspace` 코치 단계 = SelectedTeamPanel + CoachAssign + AutoRecommendedPool(실 assignedCoachIds).
- `POST /api/coach-assignments` {projectId, coachId, role(AssignmentRole), sessions, hoursPerSession, agreedRate?, …} upsert. `DELETE ?id=`. (변경 금지 — 호출만.)
- `recommend-coaches` API → `recommendations:[{coachId,name,tier,coachRateMain,lectureRateMain,matchScore,strengthOneLiner}]`. AutoRecommendedPool이 이미 fetch해 표시 중.
- `assistant/route.ts` — design/budget 분기 有, **coach는 generic fallback**(ops 없음). handleBudget이 미러 템플릿(L 분기·knownLabels 필터·choices 검증).
- `WorkspaceChat.tsx` — budget stage가 `budgetLines` 동봉·`onOps` 일반화(`ChatOp=SessionOp|StageOp|BudgetOp`). coach 추가.
- `WorkspacePlanContext.tsx` — budgetLines 보고/구독 패턴(미러용).

## 🎯 Scope
### CAN touch
- **신규** `src/lib/coaches/coach-ops.ts` (CoachOp 타입 + validateCoachOps — 순수. apply는 async라 여기 없음, ProgramWorkspace가 API 호출)
- `src/app/api/projects/[id]/assistant/route.ts` (`handleCoach` 분기 — 풀·팀 기반 후보 카드)
- `src/components/projects/workspace/WorkspaceChat.tsx` (coach stage: pool+team 동봉, onOps에 CoachOp 포함)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (coachOps apply = POST/DELETE + 패널 재fetch, pool/team chat 전달)
- `src/components/projects/workspace/WorkspacePlanContext.tsx` (coachPool·coachTeam 보고/구독)
- `src/components/projects/coaches/AutoRecommendedPool.tsx` (**props만** — `onPoolLoaded?(pool)` 콜백 추가, 내부 로직 무변경)
- `src/components/projects/coaches/SelectedTeamPanel.tsx` (Phase 1 산출 — team 보고 + 외부 refresh 신호 수신)
### MUST NOT touch
- `prisma/schema.prisma` · `coach-assignments` route(POST/DELETE/GET — 호출만) · `recommend-coaches`·coaches 엔진 · session/stage/budget ops(미러만) · `coach-assign.tsx` 내부 · `components/ui/**` · planning-intent

## 🧩 CoachOp 계약 (서버 영속 — apply는 ProgramWorkspace가 API로)
```ts
export type CoachOp =
  | { op: 'assign'; coachId: string; coachName: string; role: string; agreedRate?: number }       // 풀에서 배정
  | { op: 'remove'; assignmentId: string; coachName: string }                                      // 선발팀에서 제거
  | { op: 'swap'; removeAssignmentId: string; addCoachId: string; addCoachName: string; role: string; agreedRate?: number }  // 교체
```
- `validateCoachOps(v)` = 불량 drop(안 던짐). 순수 검증만(필드·타입). **존재성(coachId∈pool, assignmentId∈team) 필터는 handleCoach가 knownIds로** (BR-WS-22 knownLabels 미러).
- apply 없음(순수 모듈) — ProgramWorkspace가 op별 fetch: assign→POST · remove→DELETE · swap→DELETE+POST. 각 후 로스터 재fetch.

## 🛠 Tasks
1. **coach-ops.ts 신설** — 위 계약 + validateCoachOps. session-ops 스타일.
2. **handleCoach 분기(route)** — `stageId==='coach'` → body `coachPool:[{coachId,name,coachRateMain,strengthOneLiner,matchScore}]` + `coachTeam:[{assignmentId,coachId,coachName,role}]` + requiredN + history + message. 행동우선 프롬프트(되묻기 X): "추천/추가" → assign 카드(풀 상위), "교체/대신" → swap 카드, "빼줘" → remove. AI → `{reply, ops?, choices?}`(CoachOp). **knownIds 필터**: assign/swap.addCoachId ∈ coachPool, remove/swap.removeAssignmentId ∈ coachTeam. role 기본 추론(첫 배정=MAIN_COACH, 추가=SUB_COACH 등 합리값). agreedRate 기본 = 풀의 coachRateMain. design/budget/generic 무변경.
3. **WorkspaceChat coach 전송+적용** — coach stage면 body에 coachPool+coachTeam 동봉(context). onOps 타입에 CoachOp 포함(`ChatOp` 확장). coach stage onOps 주입(부모 handleCoachOps). 카드 렌더 무변경(제네릭).
4. **AutoRecommendedPool onPoolLoaded** — 추천 fetch 완료 시 `onPoolLoaded?(pool)` 호출(props 추가, 내부 로직 무변경) → 부모가 context.setCoachPool.
5. **ProgramWorkspace handleCoachOps(async)** — op별: assign=POST coach-assignments · remove=DELETE · swap=DELETE then POST. 완료 후 **로스터 재fetch 신호**(SelectedTeamPanel refresh) + assignedCoachIds 동기화 + 토스트("N명 반영"). 실패 시 토스트 에러(롤백 불필요 — 서버가 진실). coachPool/coachTeam을 chat에 전달.
6. **context** — `coachPool`·`coachTeam` + setter(canvas 보고→chat 구독, budgetLines 미러). SelectedTeamPanel이 team 보고, AutoRecommendedPool이 pool 보고.
7. 이중적용 가드(카드 클릭 1회·잠금). 디자인킷.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ CAN-touch(+신규 coach-ops)
- [ ] CoachOp 검증·knownIds 필터(환각 coachId/assignmentId drop). apply=기존 API만(스키마·엔진 무변경).
- [ ] coach stage 카드 클릭 → POST/DELETE → 선발팀 패널·풀 회색처리 갱신. design/budget 회귀 없음.
- [ ] ⚠️ 메인이 프리뷰+Chrome으로 코치 단계 "코치 추천해줘"→카드→클릭→선발팀 반영 사후 검수 → **코드 ✓**. 백그라운드 dev·커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- apply는 **기존 coach-assignments API만**(스키마·POST/DELETE 무변경 — 호출만). design/budget/stage ops 경로 회귀 금지. recommend-coaches·엔진 무변경. 커밋은 메인.

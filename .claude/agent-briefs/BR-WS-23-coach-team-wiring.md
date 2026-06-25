# Brief BR-WS-23 — 코치 선발팀 배선 (기존 CoachAssignment를 워크스페이스에 노출, Phase 1/2)

> **자급자족.** 본 파일 + survey 사실(아래) + `ProgramWorkspace.tsx` + `load-workspace.ts`. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-23-coach-team-wiring` · 2026-06-26 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 핵심 | **새 모델 0 — 기존 `CoachAssignment` 재사용.** 스키마 변경 금지(마이그레이션 보류). 배선·표시만. |

## 🎯 Mission
코치 단계가 *추천 풀*만 보이고 **선발된 팀이 안 보인다**(배정해도 `assignedCoachIds={[]}` 하드코딩이라 화면 미반영). 기존 `CoachAssignment`(project↔coach·role·단가·confirmed)를 워크스페이스에 **로드·표시·제거**되게 배선한다. (교체/추가 **카드**는 Phase 2 BR-WS-24 — 본 브리프 범위 아님.)

## 📋 현재 (정독 — survey 확정 사실)
- `prisma/schema.prisma` L396~418 `CoachAssignment{ id, projectId, coachId, role(AssignmentRole), sessions, hoursPerSession, agreedRate, totalFee, netFee, confirmed, notes, coach, project }` · `@@unique([projectId,coachId,role])`. **이미 완전** — 변경 금지.
- `src/app/api/coach-assignments/route.ts` — **POST**(upsert by 3-key) · **DELETE**(`?id=`). **GET 없음**(추가 필요).
- `src/lib/projects/load-workspace.ts` L186~227 — `_count.coachAssignments`만 select(로스터 미로드). `WorkspaceData.hasCoach: boolean`.
- `ProgramWorkspace.tsx` L239~245 — `<AutoRecommendedPool projectId mode="inline" assignedCoachIds={[]} requiredCountOverride={coachCount} />`. **assignedCoachIds 하드코딩 빈 배열.**
- `AutoRecommendedPool.tsx` — 추천 풀 표시. `assignedCoachIds`로 이미 배정된 코치 회색처리(L303 `disabled`). 클릭 → inline 모드면 배정 모달(CoachAssign).
- `coach-assign.tsx` — 배정 모달(검색·pick·POST·router.refresh). 작동하나 워크스페이스가 로스터 재로드 안 함(갭).
- `recommend-coaches` API — 추천 엔진(matchScore·strengthOneLiner). Phase 2 카드 후보용(본 브리프 미사용).

## 🎯 Scope
### CAN touch
- **신규** `src/app/api/projects/[id]/coach-assignments/route.ts` (**GET** — 프로젝트 로스터 반환: id·role·coach{ id,name,tier,expertise,regions,coachRateMain,lectureRateMain }·단가·confirmed)
- `src/lib/projects/load-workspace.ts` (coachAssignments 로스터 select + `coachTeam` 반환·타입)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (코치 단계: 선발팀 패널 + 실제 assignedCoachIds 배선, client 로스터 state + 재fetch)
- **신규** `src/components/projects/coaches/SelectedTeamPanel.tsx` (선발팀 표시·제거 — client)
### MUST NOT touch
- `prisma/schema.prisma`(CoachAssignment·Coach 변경 금지) · `coach-assign.tsx`(모달 재사용만) · `AutoRecommendedPool.tsx` 내부 로직(props로만 — assignedCoachIds 실값 전달) · recommend-coaches·coaches 엔진 · assistant route(Phase 2) · session/stage/budget ops · `components/ui/**`
- 단가·역할 enum(`AssignmentRole`) 의미 변경

## 🧩 설계 결정 (선발팀 = CoachAssignment rows)
- **"선발팀" = 이 프로젝트의 `CoachAssignment` 행 집합.** 별도 플래그/모델 없음. `confirmed`는 표시만(PM 확정 뱃지) — 본 단계에선 안 건드림(읽기).
- **데이터 흐름**: SSR(load-workspace)로 초기 로스터 hydrate + client `SelectedTeamPanel`이 GET으로 재fetch(배정/제거 후 — router.refresh 의존 X, survey의 무한 빈배열 루프 회피).

## 🛠 Tasks
1. **GET 엔드포인트** — `GET /api/projects/[id]/coach-assignments`: `requireProjectAccess` → `prisma.coachAssignment.findMany({where:{projectId}, include:{coach:{select:{id,name,tier,expertise,regions,coachRateMain,lectureRateMain}}}})` → 정제 배열 반환. (Next 라우트 규약은 node_modules/next/dist/docs/ 확인.)
2. **load-workspace 로스터** — select에 `coachAssignments:{select:{id,role,sessions,agreedRate,totalFee,netFee,confirmed,coach:{select:{id,name,tier,...단가}}}}` 추가. `WorkspaceData.coachTeam: CoachTeamMember[]` 타입·반환. `hasCoach` 유지.
3. **SelectedTeamPanel(신규, client)** — 초기 로스터(prop) + GET 재fetch. 각 멤버: 이름·tier·역할(role 한글)·단가·confirmed 뱃지·**제거 버튼**(DELETE `/api/coach-assignments?id=` → 재fetch). 비었으면 "아직 선발된 코치가 없습니다 — 아래 추천에서 추가하세요" 안내. 디자인킷(accent #F05519·radius 0·틴트, 제거는 절제). 코치 수 대비 필요수(requiredCountOverride) 진척 표시(예: "3/5명").
4. **ProgramWorkspace 코치 단계 재배선** — client 로스터 state(초기=coachTeam prop). 코치 캔버스 = `<SelectedTeamPanel team=… onChange=재fetch />` + `<AutoRecommendedPool … assignedCoachIds={로스터 coachId들} onAssigned=재fetch />`(빈 배열 하드코딩 제거). 배정 모달 POST 후 로스터 재fetch로 패널 갱신. (AutoRecommendedPool에 onAssigned 콜백 없으면 props 추가 — 내부 로직 무변경, 콜백만.)
5. props 스레딩(page.tsx → ProgramWorkspace coachTeam). 기존 doneFlags/coachCount 유지.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ CAN-touch(+신규 2파일)
- [ ] **스키마 변경 0**(`git diff prisma/schema.prisma` 빈 출력). GET/findMany만.
- [ ] 로스터 로드→패널 표시, 제거 DELETE→재fetch 반영, assignedCoachIds 실값(풀 회색처리). 빈 팀 안내.
- [ ] ⚠️ 메인이 프리뷰+Chrome으로 "추천 풀에서 배정→선발팀 패널에 뜸→제거" 사후 검수 → **코드 ✓**. 백그라운드 dev·커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- **스키마 변경 절대 금지** — CoachAssignment 재사용. AutoRecommendedPool/coach-assign 내부 로직 무변경(props·콜백만). 배정/제거는 기존 API. Phase 2(카드)는 별건. 커밋은 메인.

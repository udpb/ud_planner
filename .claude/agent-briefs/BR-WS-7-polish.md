# Brief BR-WS-7 — 미세보정 (대화 연타 방지 · done 신호 · 예산 캔버스 실값)

> **자급자족.** 본 파일 + `CLAUDE.md` + `ud-design-system/SKILL.md` + `docs/architecture/program-workspace-redesign-v1.md`(§10). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-7-polish` · 작성 2026-06-23 · Owner 메인(위임) |
| 관련 | BR-WS-5/6(셸·대화) 라이브 검수에서 나온 후속 |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
프리뷰 라이브 검수에서 확인된 3개 미세보정:
1. **대화 연타/이중 전송 방지** — 전송 중 send 비활성 + Enter 무시. (검수 중 Enter+클릭으로 같은 메시지 2번 전송된 흔적.)
2. **코치/예산 done 신호 배선** — 상단 파이프라인 스텝퍼 체크가 실제 진행과 맞도록 `hasCoach`/`hasBudget` 를 server에서 판정.
3. **예산 자동화 캔버스 실값** — 현재 "준비 중" placeholder 를 **프로젝트 실제 예산 요약(총 예산·공급가·마진)** 으로 업그레이드(이미 로드된 값 사용, 새 데이터 조립 최소).

> 전부 소규모. 엔진·plan-types·invokeAi·스키마 무변경. 디자인킷 유지.

## 📋 현재
- `WorkspaceChat.tsx` — 전송: 입력 + send 버튼(aria "전송"). `loading`/`sending` state 있음(전송 중 표시). Enter=전송. **이중 전송 가드 보강 필요.**
- `workspace-stages.ts` — `computeWorkspaceDoneFlags(data)` 가 `hasCoach`/`hasBudget` 를 항상 false 로 둠(BR-WS-5 미배선). `WorkspaceData` 에 coach/budget 신호 없음.
- `load-workspace.ts` — `WorkspaceData` 조립. `prisma.project` 셀렉트. coachAssignments·budget 관계 미조회. (Project 모델: `coachAssignments CoachAssignment[]`, `budget Budget?`, `totalBudgetVat`, `supplyPrice` 존재.)
- `ProgramWorkspace.tsx` — budget 단계 캔버스 = "예산 자동화 — 자동 적산 (준비 중)" placeholder. project 예산 값은 page.tsx 가 가짐(헤더에 총 예산 표시 중).

## 🎯 Scope
### CAN touch
- `src/components/projects/workspace/WorkspaceChat.tsx` (이중 전송 가드)
- `src/lib/projects/load-workspace.ts` (coachAssignments count·budget 존재 조회 → `hasCoach`/`hasBudget` 파생)
- `src/components/projects/workspace/workspace-stages.ts` (`computeWorkspaceDoneFlags` 가 hasCoach/hasBudget 반영)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (budget 캔버스 placeholder → 실 예산 요약; project 예산 props 받기)
- `src/app/(dashboard)/projects/[id]/page.tsx` (budget 요약 props 전달 — 이미 가진 project 값)
### MUST NOT touch
- 엔진·`plan-types`·`program-design`·`impact`·`coaches` lib 내부 · prisma 스키마 · `invokeAi` · `components/ui/**` · `assistant/route.ts` · 단계 컴포넌트 내부 · 다른 라우트

## 🛠 Tasks
1. **이중 전송 가드(WorkspaceChat)** — `sending` 동안 send 버튼 `disabled` + Enter 핸들러 early-return. 전송 시작 즉시 입력 비우고 `sending=true`, 응답/에러 후 `false`. 빈/공백 메시지 전송 금지. (자연어 중복 전송 불가하게.)
2. **done 신호(load-workspace)** — `coachAssignments` count>0 → `hasCoach`, `budget` 존재(또는 supplyPrice/totalBudgetVat 채움 기준 — 명확한 쪽 택1·주석) → `hasBudget`. `WorkspaceData` 에 추가. prisma select 에 `_count: { select: { coachAssignments: true } }` + `budget: { select: { id: true } }` 정도(가벼운 조회).
3. **done 반영(workspace-stages)** — `computeWorkspaceDoneFlags` 가 `coach: data.hasCoach`, `budget: data.hasBudget` 사용. currentStage 자동판정도 자연히 개선.
4. **예산 캔버스 실값(ProgramWorkspace/page)** — budget 단계 = placeholder 대신 **간단 요약 카드**: 총 예산(totalBudgetVat)·공급가(supplyPrice)·마진(있으면 계산) + "상세 적산은 후속" 1줄. 값 없으면 "RFP/예산 정보 없음" 안내. (디자인킷 틴트 박스. 새 API·엔진 0.)
5. 디자인킷·접근성 유지.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과
- [ ] `git diff --name-only` ⊆ CAN touch. 스키마·엔진·invokeAi·ui 무변경.
- [ ] 이중 전송 코드 경로: sending 중 send/Enter 무효(코드로 증명).
- [ ] hasCoach/hasBudget 가 done 플래그·currentStage 에 반영.
- [ ] ⚠️ 메인이 Vercel 프리뷰+Chrome 사후 검수 → **코드 ✓**만 보증. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff --stat/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- 소규모 보정만. 스키마·엔진·assistant route 무변경. 새 API 0. 커밋 금지(메인 검수).

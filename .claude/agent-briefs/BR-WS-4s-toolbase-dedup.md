# Brief BR-WS-4s — ③토대잡기 중복 제거 (②기획의도와 이중 입력 해소, 표면+소량 배선)

> **자급자족.** 본 파일 + `CLAUDE.md` + `AGENTS.md` + `ud-design-system/SKILL.md` + `docs/architecture/program-workspace-redesign-v1.md`(§9·§10). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-4s-toolbase-dedup` |
| Owner | 메인 (위임) · 작성 2026-06-23 |
| 상태 | 🔲 대기 |
| 관련 | 재설계 §9(한 흐름) · BR-WS-3s(②표면) · BR-WS-4(intentContext) |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
**시각 검수(2026-06-23)에서 잡은 실제 중복:** ②기획의도 카드 바로 아래, `ProgramDesignFlow`의 "토대잡기"가 **"선례"·"담당자 운영 의도"를 textarea로 또 묻는다**(보이는 textarea 3개 = 목표·선례·의도). ②와 의미 중복 = 사용자가 의도를 두 번 입력. **§9의 "기획의도 → 커리큘럼 한 흐름"이 안 됨.**

**고친다:** 토대잡기를 **슬림화** — 선례·담당자의도 textarea **제거**, **목표 확인 + "기획 시작"만** 남김. 선례·의도 값은 이미 받고 있는 `intentContext`(②기획의도 strategicNotes 유래)에서 **엔진 호출에 silently** 넣는다. 결과: `②기획의도 → [기획 시작] → 커리큘럼`.

> 표면 + 소량 배선. **엔진(`planProgram`)·API·다른 로직 무변경.**

## 📋 현재 (정독)
- `…/program-design/_components/program-design-flow.tsx`:
  - 상태 `precedent`/`intent`는 `intentContext?.precedentPrefill`/`intentPrefill`로 **이미 prefill**(BR-WS-4).
  - 토대잡기(시작 전 화면)에 textarea 3개: **목표 확인(goalText)** · **선례(precedent)** · **담당자 운영 의도(intent)**.
  - `callEngine(nextDecisions)`가 `precedent: precedent.trim()? {summary:precedent.trim()}:undefined`, `intent: intent.trim()? {summary:intent.trim()}:undefined` 를 POST `/api/projects/[id]/program-design` 로 전송.
- ②기획의도(`PlanningIntent`)가 위에서 의도(목표해석/작년대비/차별점/리스크)를 이미 소유·표시. → 토대잡기의 선례/의도는 잉여.

## 🎯 Scope
### CAN touch
- `src/app/(dashboard)/projects/[id]/program-design/_components/program-design-flow.tsx` **단 하나.**
### MUST NOT touch
- `PlanningIntent.tsx`(②, BR-WS-3s 완료) · `structure-view.tsx` · `planning-intent.ts` · `program-design/route.ts` · `plan-types.ts` · `generate-plan.ts` · `plan-input.ts` · prisma · `invokeAi` · `components/ui/**` · 다른 라우트

## 🛠 Tasks
1. **토대잡기에서 선례·담당자 의도 textarea(+라벨) 제거.** "목표 확인·수정"(goalText) textarea + "기획 시작" 버튼만 남긴다. (RFP 미리채움 그리드는 유지.)
2. **선례·의도 값은 `intentContext`에서 직접 엔진으로** — `callEngine`이 `precedent`/`intent`를 로컬 state 대신 `intentContext?.precedentPrefill`/`intentPrefill`(있으면 `{summary}`)에서 구성. (state `precedent`/`intent` 제거 또는 미사용 정리.) **POST 바디 형태·URL·엔진 계약은 그대로** — 출처만 textarea→intentContext.
3. **상단 맥락 한 줄(선택)** — 토대잡기 위에 "선례·담당자 의도는 ②기획의도에서 가져옵니다" 류 한 줄 안내(읽기 전용, §9 원칙1). 과하지 않게 1줄.
4. 진행 중(턴) 화면·게이트·structure(커리큘럼)·코치풀·자산 패널은 **무변경**.
5. 디자인킷: radius 0·accent 1개·틴트 그리드. 점수/게이트 신설 금지.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과
- [ ] `git diff --name-only` = `program-design-flow.tsx` **단 1개**. 그 외 무변경.
- [ ] 시작 전 화면의 textarea가 **목표 1개로 축소**(선례·의도 textarea 사라짐). 엔진 POST는 여전히 precedent/intent를 intentContext에서 받아 보냄(빈 값이면 undefined — 기존과 동일).
- [ ] `callEngine`의 fetch URL·method·바디 키(intent/precedent/decisions/save) 형태 무변경(값 출처만 변경).
- [ ] ⚠️ 메인은 Vercel 프리뷰+Chrome으로 사후 시각검수 예정 → **코드 ✓**만 보증·정직 보고. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff --stat+callEngine 바디 무변경 증명/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- 한 파일만. 엔진·API·② 무변경. POST 바디 계약 보존(값 출처만 textarea→intentContext).
- 커밋 금지(메인 검수).

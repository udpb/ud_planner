# Brief BR-WS-4 — ③커리큘럼 PM 편집 캔버스 (재배치·저장·복원 + ②기획의도 소비)

> **자급자족.** 본 파일 + `CLAUDE.md` + `AGENTS.md` + `docs/glossary.md` + `ud-design-system/SKILL.md` + `docs/architecture/program-workspace-redesign-v1.md`(§5 ③, §3 원칙, §8). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-4-curriculum-editing` |
| Owner | 메인 세션 (위임) |
| 작성일 | 2026-06-22 |
| 상태 | 🔲 대기 |
| 관련 | 재설계 v1 §5 ③ · BR-WS-3(②기획의도, strategicNotes) · ADR-028(엔진) |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
피드백 ①("커리큘럼 재배치 등 PM이 직접 손보던 게 없어졌다")을 닫는다. 현재 ③커리큘럼(`ProgramDesignFlow`+`StructureView`)에는 **3개의 실제 결함**이 있다:
1. **PM 편집이 저장 안 됨** — `handleSave`가 `structureOverride`(PM 편집)를 안 보내고 엔진을 **재생성**해 그 결과를 저장. PM이 회차를 고쳐도 저장하면 날아감.
2. **저장본이 복원 안 됨** — 저장 파일(`data/program-design/plans/<id>.json`)을 `load-workspace`가 다시 안 읽어, 재진입하면 화면에서 사라짐.
3. **재배치 수단 부재** — 회차 순서변경·추가·삭제·종류변경 불가(인라인 텍스트 셀 편집만 있음).
+ **중복**: `ProgramDesignFlow` 토대잡기가 선례·담당자의도를 또 묻는다 → 방금 만든 ②기획의도(strategicNotes)와 겹침. **②를 소비**해 덕지덕지 제거.

> 원칙(§3·§8): PM이 주인 — AI 산출은 초안, **PM 편집이 진실**. 엔진(`planProgram`)·`plan-types.ts` 계약 **수정 금지**(reorder/add/delete는 기존 `PlanSession[]` 위에서). 디자인킷 260529.

## 📋 Context — 현재 구조 (정독 필수)
- **엔진 산출 타입** `src/lib/program-design/plan-types.ts` — `ProgramPlan{operatingType, decisionLog, openGates, structure, meta}`. `structure`는 `SessionTable{kind:'sessions', sessions:PlanSession[]}` (T1~T3) | `NonSessionStructure` (T4/T5) | `PendingStructure`. `PlanSession{no,title,hours,format,kind:'theory'|'workshop'|'coaching'|'event'|'milestone'|'prelearning',rationale}`. **이 파일 수정 금지(계약).**
- **캔버스** `…/program-design/_components/program-design-flow.tsx` — 턴 루프. `structureOverride`(client state)에 PM 편집 누적. `handleSave`가 결함1의 위치. 토대잡기(선례/의도 textarea)가 중복 위치.
- **구조 뷰** `…/_components/structure-view.tsx` — `SessionTimeline`(EditableCell로 no/title/format/hours 인라인 편집) + `StageList`(T4/T5). `onStructureChange(next)`로 상위에 반영. **여기에 재배치 UX 추가.**
- **저장 라우트** `src/app/api/projects/[id]/program-design/route.ts` — `save:true` 시 `planProgram` **재실행** 후 `savePlan`(파일). 결함1 수정 지점.
- **저장 위치** = `data/program-design/plans/<projectId>.json` (DB 아님 — 스키마 무관).
- **②기획의도** = `Project.strategicNotes`(BR-WS-3). `fromStrategicNotes`(`src/lib/program-design/planning-intent.ts`)로 카드화 가능. precedent/intent summary 로도 매핑 가능.
- **서버로드** `src/lib/projects/load-workspace.ts` — 이미 `strategicNotes` 읽음(BR-WS-3). 여기에 **저장된 플랜 파일 읽기** 추가.

## ✅ Prerequisites
- [ ] BR-WS-3 머지됨(strategicNotes 로드 존재) · 위 6개 파일 정독 · 재설계 §5 ③ 정독

## 📖 Read First
1. `CLAUDE.md`·`AGENTS.md`·`ud-design-system/SKILL.md`·`docs/architecture/program-workspace-redesign-v1.md`(§5 ③·§3·§8)
2. `src/lib/program-design/plan-types.ts` (계약 — 읽기만)
3. `…/program-design/_components/{program-design-flow,structure-view}.tsx`
4. `src/app/api/projects/[id]/program-design/route.ts` (저장 경로)
5. `src/lib/projects/load-workspace.ts` · `src/app/(dashboard)/projects/[id]/page.tsx` · `src/components/projects/workspace/ProgramWorkspace.tsx`
6. `src/lib/program-design/planning-intent.ts` (fromStrategicNotes — ② 소비)

## 🎯 Scope
### CAN touch
- `…/program-design/_components/structure-view.tsx` (재배치: 드래그 순서변경 + 회차 추가/삭제 + kind 드롭다운; 기존 인라인 편집 보존)
- `…/program-design/_components/program-design-flow.tsx` (① 결함 수정: 저장 시 편집 구조 전송 · ② initialPlan 복원 시작 · ③ strategicNotes 소비해 토대잡기 prefill + 상단 "기획의도" 맥락 띠)
- `src/app/api/projects/[id]/program-design/route.ts` (저장 시 PM 편집 구조 보존 — 재생성 결과로 덮지 않음)
- `src/lib/program-design/saved-plan.ts` (신규 — 저장 플랜 파일 read 헬퍼; 라우트의 savePlan과 경로 공유)
- `src/lib/projects/load-workspace.ts` (저장 플랜 읽어 `initialPlan` 노출 + strategicNotes를 designProps용으로 전달)
- `src/app/(dashboard)/projects/[id]/page.tsx` · `src/components/projects/workspace/ProgramWorkspace.tsx` (initialPlan·intent context 배선)
### MUST NOT touch
- `src/lib/program-design/plan-types.ts` (계약 — PlanSession에 필드 추가 금지) · `generate-plan.ts`(planProgram 엔진) · `plan-input.ts`
- `prisma/schema.prisma` · `invokeAi` 시그니처 · `components/ui/**` · manifest
- `gate-card.tsx`·`decision-log.tsx`·`planning-elements.tsx` 내부 로직 · 다른 라우트(express·v2·impact-forecast·brain)
- `planning-intent.ts`(import만) · BR-WS-3 산출물 로직

## 🛠 Tasks (순서)
1. **저장 결함 수정(결함1)** — `route.ts`: body에 `editedStructure?`(PlanStructure) 추가(zod). `save:true`면 `planProgram`은 호출하되(decisionLog/meta 최신화) **저장 직전 `plan.structure = editedStructure ?? plan.structure`** 로 PM 편집을 권위값으로 덮어 저장. (editedStructure 없으면 기존 동작.) `program-design-flow.handleSave`가 `editedStructure: effectiveStructure` 전송.
2. **복원(결함2)** — `saved-plan.ts`: `readSavedPlan(projectId): Promise<ProgramPlan|null>`(파일 없으면 null). `load-workspace`가 호출 → `WorkspaceData.savedPlan` 노출 + `hasDesign = hasDesign || !!savedPlan`. `page.tsx`→`designProps.initialPlan` 전달. `program-design-flow`: `initialPlan` 있으면 `started=true`·`plan=initialPlan`·구조 바로 편집 가능(턴 스킵, "토대 수정"으로 재생성 가능).
3. **재배치 UX(결함3)** — `structure-view.tsx` `SessionTimeline`: (a) 회차 **드래그 순서변경**(HTML5 draggable 또는 ↑↓ 버튼 — 둘 중 접근성 나은 쪽; 라이브러리 추가 금지), (b) 회차 **추가**(기본 PlanSession: kind 'workshop'·hours null·rationale '') / **삭제**(휴지통), (c) **kind 드롭다운**(6종) — 색 레일 자동 반영. 전부 `onStructureChange`로 상위 반영(저장은 Task1 경로로). StageList(T4/T5)도 단계 추가/삭제/순서변경 동일 패턴.
4. **②기획의도 소비(중복 제거)** — `program-design-flow`: props로 `intentContext`(strategicNotes 유래) 받아 ⓐ 캔버스 상단에 **"이 설계가 선 기획의도" 맥락 띠**(읽기 전용 요약, 재설계 §3 원칙1) ⓑ 토대잡기 precedent/intent textarea **prefill**(PM이 더 고칠 수 있게, 빈 강요 X). `load-workspace`/`page.tsx`가 strategicNotes→intentContext 매핑(`fromStrategicNotes` 또는 summary 필드).
5. **디자인킷**: radius 0·accent 1개·틴트박스 그리드·드래그 핸들은 lucide(GripVertical 등). 점수·게이트 신설 금지.

> 범위 밖(후속): 회차별 자산출처 칩(엔진이 회차-자산 링크를 안 줘서 별건)·대화형 디벨롭 바(BR-WS-5 공통). 이번엔 **재배치·저장·복원·② 소비**만.

## 🧪 Self-Verification
- [ ] `npm run typecheck`·`npm run lint`(신규0)·`check:manifest`·`build` 통과
- [ ] `git diff --name-only` ⊆ CAN touch. `plan-types.ts`·`generate-plan.ts`·`prisma`·`invokeAi` 무변경.
- [ ] **결함1 회귀 테스트(논리)**: 저장 body에 editedStructure 가면 그 구조가 파일에 쓰이는지 코드 경로로 보증. **결함2**: 저장 파일 있으면 load→initialPlan→화면 복원 경로 연결 확인.
- [ ] 재배치(순서/추가/삭제/kind)가 `onStructureChange`→`structureOverride`→저장까지 흐르는지.
- [ ] 라이브러리 추가 0(package.json 무변경). ⚠️ DB drift로 런타임 막히면 컴파일·구조까지 보증·정직 보고. 백그라운드 dev 금지.

## 📤 Return (5섹션, 한국어): ✅한일 / ❌못한일 / 🤔결정(ADR후보) / 🔬검증(빌드 실측+git diff --stat) / ⚠️위험

## ⚠️ 주의
- **plan-types.ts 계약 수정 금지** — 재배치는 기존 PlanSession[] 순서·길이 조작만.
- **PM 편집이 진실** — 저장이 엔진 재생성으로 PM 편집을 덮으면 안 됨(결함1의 핵심).
- 스키마 변경 0(저장은 기존 파일 경로). 라이브러리 추가 0. 커밋 금지(메인 검수).

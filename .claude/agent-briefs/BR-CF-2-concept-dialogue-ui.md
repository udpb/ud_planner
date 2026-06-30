# Brief BR-CF-2 — 컨셉 대화 UI + 맺힘 캔버스 (ADR-031 Wave 2)

> **자급자족.** 본 파일 + `docs/decisions/031-concept-first-program-design.md` + W1 산출(`concept-synth.ts`·`/api/projects/[id]/concept`) + 승인 목업(concept_derivation_via_chat). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-CF-2-concept-dialogue-ui` · 2026-06-27 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 전제 | **W1 완료**(`d045e6b`) — concept 엔진·라우트 라이브 검증됨. 본 웨이브=UI(좌 대화+우 캔버스). |

## 🎯 Mission
프로그램 기획(design) 단계가 **컨셉부터** 시작하게: 컨셉 미확정이면 **좌측 = 컨셉 대화**(W1 /concept step→cards→pick→다음 step→assemble), **우측 = 맺힘 캔버스**(win-theme·메시지3·근거·좁혀온 경로). PM이 "컨셉 확정"하면 저장(PUT) 후 기존 구조/커리큘럼(ProgramDesignFlow)로 진행. **승인 목업 그대로.**

## 📋 현재 (survey 확정)
- `/api/projects/[id]/concept` (W1): `POST {action:'step', picks}` → `{stepKey, question, cards:[{label,sub?,value}], done}` · `POST {action:'assemble', picks}` → `{concept: ConceptShape}` · `PUT {concept}` → strategicNotes.concept 저장. `ConceptShape={winTheme, keyMessages[3], differentiation, grounding[], derivationPath[], chosenAngle}` (`concept-synth.ts` export).
- `ProgramWorkspace.tsx` — design stage 캔버스 = `ProgramDesignFlow`; 좌측 = `WorkspaceChat`(design일 때 sessions/stages/onOps). useWorkspacePlan().
- `WorkspaceChat.tsx` — 카드 렌더·send 패턴(BR-WS-17/21) = 참조(컨셉 카드 UX 동형). **내부 변경 금지**(컨셉 단계는 별 컴포넌트로 격리 — 회귀 방지).
- `load-workspace.ts` — strategicNotes 로드(planningIntent). `strategicNotes.concept` 추출 추가.
- `page.tsx` — loadWorkspace → ProgramWorkspace props.
- `PlanningIntent.tsx`(기획의도, RFP 단계) — 'suggest' 카드 UX 참조.

## 🎯 Scope
### CAN touch
- **신규** `src/components/projects/workspace/ConceptCanvas.tsx` (우 — ConceptShape 렌더 + 좁혀온 경로 + "컨셉 확정" + maturing/empty 상태)
- **신규** `src/components/projects/workspace/ConceptChat.tsx` (좌 — 컨셉 대화: /concept step/assemble 호출, 카드 렌더·클릭, picks 누적, 자유입력, done→assemble, 확정→PUT)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (design 단계: 컨셉 미확정 → ConceptChat+ConceptCanvas / 확정 → 기존 WorkspaceChat+ProgramDesignFlow + 컨셉 요약 핀)
- `src/lib/projects/load-workspace.ts` (`savedConcept: ConceptShape|null` 추출·반환·타입)
- `src/app/(dashboard)/projects/[id]/page.tsx` (savedConcept 스레딩)
### MUST NOT touch
- `concept-synth.ts`·`/concept` route (W1 — 호출만) · `WorkspaceChat.tsx` 내부 · program-design 엔진·resolve-rules · assistant route · prisma · `components/ui/**` · W3(운영유형 게이트)·W4(메시지 관통)

## 🧩 흐름 계약
- **컨셉 단계 활성 = `savedConcept == null`.** 저장(PUT 성공) = 확정 → 단계 종료(ProgramDesignFlow). "컨셉 다시 잡기"로 재진입 가능(savedConcept 무시 토글, client).
- **ConceptChat**:
  1. 마운트 시 `POST step {picks:[]}` → 첫 질문+카드. AI 버블 + 카드 버튼 렌더(BR-WS-17 스타일).
  2. 카드 클릭 → picks 누적(`{stepKey,label,value}`) → "✓ 선택" + `POST step {picks}` → 다음 질문+카드. `done` 까지 반복.
  3. `done` → `POST assemble {picks}` → concept → **우 ConceptCanvas로 올림**(부모 state). 
  4. 자유입력(message)도 각 step에 동봉 가능(더 뾰족하게).
  - picks·concept는 부모(ProgramWorkspace)로 lift → ConceptCanvas가 읽음(맺힘 실시간).
- **ConceptCanvas**:
  - empty(picks 0): "왼쪽 대화로 컨셉을 잡아갑니다" 안내.
  - maturing(picks 있음): 좁혀온 경로(picks 라벨) 칩.
  - assembled(concept 있음): win-theme + 핵심메시지3 + 차별점 + 근거 칩 + 좁혀온 경로 (목업 그대로) + **"컨셉 확정 → 구조 잡기"** 버튼 → `PUT {concept}` → 성공 시 부모 onConfirmed → 단계 종료.
- 디자인킷(accent #F05519·radius 0·틴트). 강제 없음(클릭/입력만). 점수/SROI 단정 금지(W1 엔진이 이미 가드).

## 🛠 Tasks
1. **ConceptCanvas** — 위 3상태 렌더 + 확정 버튼(PUT, 로딩/실패 토스트). 목업(concept_derivation_via_chat 우측)과 항목 일치.
2. **ConceptChat** — step 루프(카드·picks·자유입력) + done→assemble. 카드 클릭 이중적용 가드. 로딩 표시. 부모로 onPicks/onConcept 콜백.
3. **ProgramWorkspace design 분기** — `savedConcept`(+client 재진입 토글)로: 미확정 → 좌 ConceptChat / 우 ConceptCanvas. 확정 → 기존(WorkspaceChat + ProgramDesignFlow) + 상단에 컨셉 win-theme 한 줄 핀(+"다시 잡기"). 다른 단계(rfp/coach/budget/sroi) 무변경.
4. **load-workspace + page** — `savedConcept` 추출(strategicNotes.concept, 읽기 가드)·반환·스레딩.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ CAN-touch(+신규 2)
- [ ] 스키마 변경 0. concept 라우트는 호출만(W1 무변경). WorkspaceChat 내부 무변경(회귀 방지).
- [ ] step 루프·카드 클릭→picks→다음 step, done→assemble→캔버스 맺힘, 확정→PUT→단계 종료. 다른 단계 회귀 없음.
- [ ] ⚠️ 메인이 프리뷰+Chrome으로 "design 진입→컨셉 대화 카드→확정→구조로" 사후 검수 → **코드 ✓**. 백그라운드 dev·커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- WorkspaceChat·엔진·라우트 내부 무변경(컨셉 단계 격리). 강제 변경 금지. W3/W4는 별건. 커밋은 메인.

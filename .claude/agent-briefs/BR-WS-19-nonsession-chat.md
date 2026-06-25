# Brief BR-WS-19 — #10 비회차 대화 편집 (T4 개별밀착·T5 행사 → 대화로 StageOp 반영)

> **자급자족.** 본 파일 + `docs/architecture/program-workspace-redesign-v1.md` + `src/lib/program-design/session-ops.ts`(미러 템플릿). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-19-nonsession-chat` · 2026-06-25 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 패턴 | **BR-WS-6/17의 SessionOp 흐름을 NonSessionStructure로 미러.** |

## 🎯 Mission
회차표(T1~T3)는 대화→캔버스 편집이 되지만(SessionOp), **비회차 운영유형 T4(개별밀착)·T5(행사)는 안 됨**(NonSessionStructure). 같은 'design' 단계인데 구조가 `stages[]`라 무시된다. **StageOp**를 신설해 대화로 stage를 추가/삭제/수정/재배치 → StageList 캔버스 즉시 반영.

## 📋 현재 (정독)
- **타입** `src/lib/program-design/plan-types.ts` — `NonSessionStage { label; content; rationale }` · `NonSessionStructure { kind: 'individual'|'event'; stages: NonSessionStage[] }`. (회차표는 `{ kind:'sessions'; sessions[] }`.)
- **미러 템플릿** `src/lib/program-design/session-ops.ts` — `SessionOp`(add/remove/edit/setKind/reorder) · `validateSessionOps(v):SessionOp[]`(불량 drop, 안 던짐) · `applySessionOps(structure, ops)`(structure.kind!=='sessions'면 그대로 반환, 순차·불변 적용).
- **T1~T3 흐름**: `WorkspaceChat.onOps` → `ProgramWorkspace.handleOps`(L161~164, `setIncomingOps({id,ops})`) → `ProgramDesignFlow`(`program-design/_components/program-design-flow.tsx` L252~262 useEffect: `applySessionOps(effectiveStructure, incomingOps.ops)` → `setStructureOverride`) → `StructureView`(`structure-view.tsx` L469: kind==='sessions'→SessionTimeline, else→**StageList** L344~463 — **이미 편집 가능**(재배치·추가·삭제·인라인), `onChange(next: NonSessionStage[])`).
- **route** `src/app/api/projects/[id]/assistant/route.ts` — `handleDesign(message, contextSummary, sessions, history)`(L238~342). **sessions 가정**, stages 모름. 클라가 sessions만 보냄.
- **chat** `WorkspaceChat.tsx` — body에 `{message, stage, contextSummary, sessions, history}`. onOps는 SessionOp[]. choices 카드 렌더는 **op 타입 무관 제네릭**(forward만).

## 🎯 Scope
### CAN touch
- **신규** `src/lib/program-design/stage-ops.ts` (StageOp 타입 + validateStageOps + applyStageOps — session-ops.ts 미러)
- `src/app/api/projects/[id]/assistant/route.ts` (handleDesign: structureKind 분기 → nonsession이면 stages 프롬프트·StageOp 검증·반환)
- `src/components/projects/workspace/WorkspaceChat.tsx` (body에 structureKind+stages 동봉, onOps 타입을 `SessionOp[] | StageOp[]`로 완화)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (현재 structureKind+stages를 chat에 전달)
- `src/app/(dashboard)/projects/[id]/program-design/_components/program-design-flow.tsx` (incomingOps 적용 시 kind 분기: sessions→applySessionOps / else→applyStageOps)
- (필요시) `src/components/projects/workspace/WorkspacePlanContext.tsx` (structureKind·stages 노출 — sessions 옆에)
### MUST NOT touch
- `session-ops.ts`(미러만, 변경 X) · `plan-types.ts` 타입 키 · `generate-plan`·`resolve-rules` 엔진 · `StageList` 편집 로직(이미 동작) · budget/coach 엔진 · prisma · `invokeAi` 시그 · `components/ui/**` · 다른 라우트

## 🧩 StageOp 계약 (session-ops 미러)
```ts
export type StageOp =
  | { op: 'add'; label?: string; content?: string; afterAt?: number }   // afterAt=1-based 위치 뒤(없으면 끝)
  | { op: 'remove'; at: number }                                         // at=1-based
  | { op: 'edit'; at: number; patch: { label?: string; content?: string; rationale?: string } }
  | { op: 'reorder'; at: number; direction: 'up' | 'down' }
```
- **참조는 1-based 위치 `at`**(stages엔 id 없음). 범위 밖 `at`은 조용히 skip(session-ops 동일 철학). `validateStageOps`=불량 op drop, 안 던짐. `applyStageOps(structure, ops)`=structure.kind==='sessions'면 그대로 반환, 아니면 순차·불변 적용 후 새 NonSessionStructure.
- (setKind 없음 — stage엔 kind 개념 없음.)

## 🛠 Tasks
1. **stage-ops.ts 신설** — 위 계약. session-ops.ts 구조·주석 스타일 미러. `applyStageOps`는 `NonSessionStructure` in/out.
2. **handleDesign 분기(route)** — body에서 `structureKind`('sessions'|'nonsession') + `stages`(nonsession일 때) 수신. nonsession이면: 프롬프트를 stages(label — content) 목록으로 구성(행동우선 프롬프트 정신 유지: 되묻기 X, 구체 ops/choices), AI 응답 → `validateStageOps` + 범위 밖 at drop → `{reply, ops, choices}`(ops=StageOp[]). sessions면 기존 경로 그대로.
3. **chat 전송(WorkspaceChat)** — 현재 structureKind+stages를 body에 동봉(props로 받음). onOps 타입 `SessionOp[] | StageOp[]`로 완화(choices 카드 렌더는 무변경 — 제네릭 forward).
4. **stages 스레딩(ProgramWorkspace + context)** — ProgramDesignFlow의 effectiveStructure(kind+stages)를 ProgramWorkspace→WorkspaceChat로 전달(sessions 스레딩과 동형). T4/T5에서 chat이 현재 stages를 알게.
5. **적용 분기(program-design-flow)** — incomingOps useEffect에서 `effectiveStructure.kind==='sessions' ? applySessionOps : applyStageOps`. setStructureOverride → StageList가 즉시 반영(StageList는 그대로).
6. 디자인킷·이중적용 가드(BR-WS-17 동일). 강제변경 금지(직접지시·카드클릭만).

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ CAN-touch
- [ ] StageOp 검증 경로(validateStageOps, 범위 밖 skip). applyStageOps 불변·sessions구조 무시.
- [ ] nonsession 프롬프트가 stages 목록 위에서 동작(되묻기 X). sessions 경로 회귀 없음(기존 SessionOp 그대로).
- [ ] ⚠️ 메인이 Vercel 프리뷰+Chrome으로 T4/T5 플랜에서 "단계 추가/수정해줘"→StageList 반영 사후 검수 → **코드 ✓**. 백그라운드 dev 금지. 커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- design 단계 내 분기만(다른 단계 무변경). session-ops·StageList·엔진 무변경(미러·사용만). 회차표 경로 회귀 절대 금지(가장 큰 위험). 커밋은 메인.

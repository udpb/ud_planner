# Brief BR-WS-6 — 대화 → 캔버스 직접 변경 (프로그램 기획: 자연어로 커리큘럼 변형)

> **자급자족.** 본 파일 + `CLAUDE.md` + `AGENTS.md` + `ud-design-system/SKILL.md` + `docs/architecture/program-workspace-redesign-v1.md`(§9·§10). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-6-chat-drives-canvas` |
| Owner | 메인 (위임) · 작성 2026-06-23 |
| 상태 | 🔲 대기 |
| 관련 | BR-WS-5(2-pane 셸·assistant route)·BR-WS-4(structure-view 편집 로직) |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
사용자 핵심 매직: **"코칭 비중 높여줘" / "4회차를 실습으로" / "마지막에 발표회 추가"** 처럼 **대화로 말하면 오른쪽 커리큘럼 캔버스가 실제로 바뀐다.** BR-WS-5에서 대화는 응답만 했다(action:null). 이번엔 **프로그램 기획 단계**에서 assistant가 자연어를 **세션 액션 배열**로 해석 → `ProgramDesignFlow`가 적용 → 캔버스 변형.

> 범위 = **프로그램 기획(커리큘럼) 단계만.** 다른 단계(기획의도·코치·예산·SROI)는 이번엔 대화 응답 유지(후속). 깊은 리팩터 금지 — ProgramDesignFlow에 **액션 인렛(additive props)**만 단다.

## 📋 현재 (정독)
- **커리큘럼 상태** = `ProgramDesignFlow`(`…/program-design/_components/program-design-flow.tsx`)의 `structureOverride`(client) ↔ `effectiveStructure = structureOverride ?? plan?.structure`. `기획 시작`(엔진) 후에만 존재. `SessionTable{kind:'sessions', sessions: PlanSession[]}`.
- **세션 편집 로직** = `structure-view.tsx`에 이미 있음(`moveItem`/추가/삭제/kind 변경, `onStructureChange`). **재사용.**
- `PlanSession{no,title,hours,format,kind:'theory'|'workshop'|'coaching'|'event'|'milestone'|'prelearning',rationale}`. `no`는 'W3','W4' 등 라벨. **plan-types.ts 계약 수정 금지.**
- **assistant route**(`api/projects/[id]/assistant/route.ts`, BR-WS-5) — 현재 {message,stage,contextSummary}→{reply, action:null}. **여기에 design 단계 액션 분류 추가.**
- **셸**(`ProgramWorkspace.tsx`) — 좌 `WorkspaceChat` / 우 캔버스. 대화 ↔ 캔버스 배선 지점.

## 🧩 액션 프로토콜 (이 브리프 핵심 계약)
assistant가 design 단계에서 반환:
```ts
// reply: 사람에게 보일 한국어 한두 줄. ops: 적용할 세션 변경(없으면 null=대화만).
{ reply: string, ops: SessionOp[] | null }
type SessionOp =
  | { op: 'add', title?: string, kind?: SessionKind, afterNo?: string }   // afterNo 뒤에(없으면 끝)
  | { op: 'remove', no: string }
  | { op: 'edit', no: string, patch: { title?: string, hours?: number|null, format?: string } }
  | { op: 'setKind', no: string, kind: SessionKind }
  | { op: 'reorder', no: string, direction: 'up' | 'down' }
type SessionKind = 'theory'|'workshop'|'coaching'|'event'|'milestone'|'prelearning'
```
- 매칭 근거: assistant에 **현재 세션 목록**(`[{no,title,kind}]`)을 context로 넘겨, `no`를 정확히 참조하게 한다.
- "코칭 비중 높여줘" → 이론/워크숍 일부를 `setKind:coaching` 여러 op. "4회차를 실습으로" → `setKind {no:'W4', kind:'workshop'}`. "발표회 추가" → `add {title:'성과 발표회', kind:'event'}`.
- 세션이 없으면(기획 시작 전) ops=null + reply="먼저 '기획 시작'으로 커리큘럼을 생성해 주세요."
- 모호하면 ops=null + 되묻는 reply (강제 변경 금지 — PM 확인 우선).

## 🎯 Scope
### CAN touch
- `src/app/api/projects/[id]/assistant/route.ts` (design 단계: 세션 목록 받아 invokeAi로 {reply, ops} 분류. 다른 단계는 기존 {reply, action:null} 유지. safeParseJson/responseSchema로 ops 검증)
- `src/components/projects/workspace/WorkspaceChat.tsx` (전송 시 현재 세션 목록 동봉 · 응답 ops 를 `onOps(ops)`로 상위 전달 · "✓ N개 변경 적용" 칩 표시)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (design 캔버스의 현재 세션을 chat에 제공 + chat의 ops를 ProgramDesignFlow로 전달 — 아래 인렛)
- `…/program-design/_components/program-design-flow.tsx` (**additive 인렛 2개**: `onSessionsChange?(sessions|null)` 보고 + `incomingOps?:{id,ops}` 적용. 내부 턴 루프·엔진·기존 동작 무변경)
- `src/lib/program-design/session-ops.ts` (신규 — `SessionOp` 타입 + `applySessionOps(structure, ops): PlanStructure` 순수함수. structure-view의 moveItem 패턴 재사용)
### MUST NOT touch
- `plan-types.ts`(계약) · `generate-plan.ts`(엔진) · `program-design/route.ts` · `structure-view.tsx` 내부(로직 참고만) · `PlanningIntent.tsx` · 코치/임팩트 컴포넌트 · prisma · `invokeAi` 시그 · `components/ui/**` · manifest · 다른 라우트

## 🛠 Tasks
1. **`session-ops.ts`** — `SessionOp` 타입 + `applySessionOps(structure: PlanStructure, ops: SessionOp[]): PlanStructure`. sessions 배열에만 적용(kind!=='sessions'면 그대로). add(기본 hours null·rationale ''·no 자동 'W{n}')·remove·edit·setKind·reorder. 불변(새 배열). 알 수 없는 no는 skip(throw 금지).
2. **assistant route(design 분기)** — body에 `sessions?: {no,title,kind}[]` 받음. invokeAi(Flash, responseSchema 또는 safeParseJson)로 `{reply, ops}` 산출. 프롬프트: 위 액션 프로토콜·세션 목록·"강제 금지/모호하면 되묻기/SROI·점수 판단 금지". ops 검증(허용 op·kind enum·no 존재) 후 반환. 다른 stage는 기존대로 `{reply, action:null}`(ops 미포함 OK).
3. **ProgramDesignFlow 인렛(additive)** — props 추가:
   - `onSessionsChange?` : `effectiveStructure` 변경 시 sessions(또는 null) 보고(useEffect).
   - `incomingOps?: {id:string, ops:SessionOp[]}` : id 변할 때 `setStructureOverride(applySessionOps(effectiveStructure, ops))`. (기획 시작 전 structure 없으면 무시.)
   기존 턴 루프·StructureView·저장 경로 **무변경**.
4. **ProgramWorkspace 배선** — design 단계일 때만: ProgramDesignFlow의 `onSessionsChange`→state `sessions` 보관 → `WorkspaceChat`에 `sessions` 전달. WorkspaceChat의 `onOps`→`{id:정확히-증가, ops}` state → ProgramDesignFlow `incomingOps`로 전달. (id는 카운터/길이 기반 — Date.now 금지, 단조 증가 카운터.)
5. **WorkspaceChat** — 전송 body에 `sessions`(design일 때) 동봉. 응답 `ops?.length`면 `onOps(ops)` 호출 + 메시지에 "✓ {n}개 변경을 캔버스에 적용했어요" 보조줄. 응답 reply는 그대로 표시.
6. 디자인킷·접근성 유지. invokeAi 단일 진입점. 외부 LLM 0.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과
- [ ] `git diff --name-only` ⊆ CAN touch. `plan-types`·엔진·structure-view·prisma·invokeAi 무변경.
- [ ] `applySessionOps` 단위 동작(코드/소규모 _test 또는 추론): add/remove/edit/setKind/reorder가 sessions에 정확히, 불변으로. 잘못된 no skip.
- [ ] assistant design 분기가 sessions 받아 ops JSON 반환(허용값 검증). 다른 stage 영향 0.
- [ ] 인렛이 additive — ProgramDesignFlow 기존 턴/저장 경로 무변경(코드로 증명).
- [ ] ⚠️ 메인이 Vercel 프리뷰+Chrome 사후 검수 → **코드 ✓**만 보증. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정(ADR후보)/🔬검증(`코드 ✓`+git diff --stat+applySessionOps 동작/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- 프로그램 기획(커리큘럼)만. 강제 변경 금지(모호→되묻기). plan-types 계약·엔진 무변경.
- 액션은 기존 편집 로직과 동일 결과여야(=PM이 손으로 한 것과 같은 structureOverride). 저장은 기존 경로(editedStructure) 그대로.
- 스키마 변경 0. 커밋 금지(메인 검수·프리뷰 검수).

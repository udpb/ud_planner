# Brief BR-WS-20 — 워크스페이스 대화 영속 (새로고침 유지, 마이그레이션 없이)

> **자급자족.** 본 파일 + `src/app/api/projects/[id]/planning-intent/route.ts`(저장 패턴 미러). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-20-chat-persistence` · 2026-06-25 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 제약 | **prisma 마이그레이션 보류(drift)** → 스키마 변경 0. 기존 미사용 Json 필드 재사용. |

## 🎯 Mission
WorkspaceChat 메시지가 client state라 새로고침하면 welcome으로 리셋된다. **프로젝트별 서버 저장 → 재진입 시 복원.** 스키마 변경 없이 `Project.expressTurnsCache`(Json?, 현재 미사용, "챗봇 마지막 N턴 캐시·이탈 후 재진입 회복용" 주석) 재사용.

## 📋 현재 (정독)
- `src/components/projects/workspace/WorkspaceChat.tsx` — `ChatMessage{id,role,text,choices?,choicePicked?}`. `useState(() => [welcomeFor(stage)])`(L108, lazy, 마운트 1회). `messagesRef`(L116, 최신 스냅샷). handleSend가 `/api/projects/[id]/assistant` POST 후 setMessages. **마운트 시 과거 메시지 로드 없음.**
- `src/app/api/projects/[id]/planning-intent/route.ts` — **미러 대상**: PUT 핸들러가 `requireProjectAccess` → `prisma.project.findUnique({select:{strategicNotes}})` 읽고 → merge → `prisma.project.update({data:{strategicNotes}})`. 패턴 그대로 복제.
- `src/lib/projects/load-workspace.ts` — `loadWorkspace(projectId)`가 페이지 로드 시 `prisma.project.findUnique({select})` 후 워크스페이스 데이터 조립(strategicNotes→planningIntentDraft 등). 여기에 `expressTurnsCache` select 추가 + 복원 메시지 반환.
- `prisma/schema.prisma` Project — `expressTurnsCache Json?`(미사용, 재사용 대상). **스키마 수정 금지**(필드 이미 존재, select/update만).
- `ProgramWorkspace.tsx` — loadWorkspace 결과를 받아 WorkspaceChat에 props 전달(조립 위치). page.tsx가 loadWorkspace 호출 후 ProgramWorkspace 렌더.

## 🎯 Scope
### CAN touch
- **신규** `src/app/api/projects/[id]/workspace-chat/route.ts` (PUT 저장 — planning-intent PUT 미러, expressTurnsCache write)
- `src/lib/projects/load-workspace.ts` (expressTurnsCache select + workspaceChatMessages 반환·검증)
- `src/components/projects/workspace/WorkspaceChat.tsx` (initialMessages prop로 복원 + 변경 시 autosave)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (loaded 메시지를 WorkspaceChat에 전달)
- (필요시) page.tsx 조립부 — loadWorkspace 결과 스레딩만
### MUST NOT touch
- `prisma/schema.prisma`(필드 추가·변경 금지 — 기존 expressTurnsCache 재사용) · `/api/.../assistant` route(BR-WS-19 완성, 무변경) · session-ops·stage-ops·엔진 · `invokeAi` · `components/ui/**` · Express 트랙 컴포넌트
- 다른 단계 카드/ops 로직(BR-WS-21 별건)

## 🧩 저장 형태 (expressTurnsCache)
- `expressTurnsCache = ChatMessage[]`(메시지 배열 직접). 읽기 시 **가드**: 배열 + 각 항목 `{id,role:'user'|'assistant',text:string}` 검증, 불량이면 빈 배열(throw 금지). choices/choicePicked는 있으면 보존.
- (Express 트랙은 ADR-029로 폐기 수순·이 필드 현재 미사용 — 충돌 위험 낮음. 단 읽기 가드로 방어.)

## 🛠 Tasks
1. **저장 route 신설** — `PUT /api/projects/[id]/workspace-chat`: `requireProjectAccess` → body `{messages: ChatMessage[]}` 검증(배열·항목 형태, 길이 컷 예: 최근 200개) → `prisma.project.update({where:{id}, data:{expressTurnsCache: messages}})`. planning-intent PUT의 인증·에러 처리 그대로. read-merge 불필요(이 필드는 워크스페이스 chat 전용 사용).
2. **load 복원** — `load-workspace.ts` select에 `expressTurnsCache: true` 추가. 반환 객체에 `workspaceChatMessages: ChatMessage[] | null`(가드 통과분, 없으면 null). 타입도 확장.
3. **WorkspaceChat 복원+autosave** — `initialMessages?: ChatMessage[]` prop 추가. lazy init: `initialMessages?.length ? initialMessages : [welcomeFor(stage)]`. **autosave**: 사용자/assistant 메시지가 추가돼 변경될 때 `PUT /workspace-chat`(debounce ~800ms 또는 send 완료 직후, messagesRef 사용, `.catch` 무음 — 실패해도 대화 끊기지 않게). **welcome만 있는 초기상태는 저장 금지**(dirty 가드 — 첫 사용자 전송 후부터). 이중 저장/마운트 시 저장 방지.
4. **스레딩(ProgramWorkspace/page)** — loadWorkspace의 `workspaceChatMessages`를 ProgramWorkspace→WorkspaceChat `initialMessages`로 전달.
5. 디자인킷 무관(로직만). 토스트 남발 금지(autosave 실패는 콘솔 warn).

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ CAN-touch(+신규 route)
- [ ] 스키마 변경 0(`git diff prisma/schema.prisma` 비어야 함). expressTurnsCache select/update만.
- [ ] 복원 경로(initialMessages) + autosave 경로(PUT) + 읽기 가드(불량 JSON → 빈 배열, throw X).
- [ ] welcome-only 저장 안 함(dirty 가드). 마운트 시 불필요 저장 없음.
- [ ] ⚠️ 메인이 프리뷰+Chrome으로 "대화 → 새로고침 → 복원" 사후 검수 → **코드 ✓**. 백그라운드 dev 금지. 커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- **스키마 변경 절대 금지**(마이그레이션 보류) — expressTurnsCache 재사용만. assistant route·BR-WS-19 무변경. 커밋은 메인.

# Brief BR-WS-17 — 대화 공동기획자화 (맥락 유지 + 행동 우선 + 카드 선택 → 즉시 반영)

> **자급자족.** 본 파일 + `ud-design-system/SKILL.md` + `docs/architecture/program-workspace-redesign-v1.md`(§10). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-17-chat-cards` · 2026-06-25 |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
사용자: **"채팅이 멍청하다 — 맥락 유지가 안 되고, 되묻기만 하고 캔버스에 반영이 안 된다. 필요하면 카드형 선택지를 채팅에 띄워 선택하면 우측에 반영되게."** (라이브 검수에서 "8회차로 줄여줘 → 너가 추천해줘" 에 브레인이 엉뚱한 '사전학습 추가'를 반복 추천하며 루프.)

**원인 3:** ① `handleDesign(message,...)` 가 **대화 history 미수신**(직전 맥락 모름). ② 프롬프트가 "모호하면 되묻기/함부로 바꾸지 마라" 과편향 → 행동 안 함. ③ **카드 선택지 없음**.

**고친다(프로그램 기획 design 단계):** ① 대화 history 전송·활용 → 맥락 유지. ② **행동 우선** 프롬프트 — "추천해줘/N회차로 줄여줘" → 되묻지 말고 **구체안**(ops 또는 choices). ③ assistant 가 `choices:[{label, ops}]` 반환 → 채팅에 **카드** → 클릭 시 **그 카드의 ops 를 캔버스에 즉시 적용**.

## 📋 현재 (정독)
- `src/app/api/projects/[id]/assistant/route.ts` `handleDesign(message, contextSummary, sessions)` — 프롬프트·`{reply, ops}` 반환. **history 인자 없음.** ops 검증 = `validateSessionOps`(session-ops.ts).
- `src/components/projects/workspace/WorkspaceChat.tsx` — `{message, stage, contextSummary, sessions}` 만 전송. 응답 `{reply, ops}` 처리(ops→onOps). 메시지는 텍스트 버블만(카드 X). `ChatMessage{id,role,text}`.

## 🎯 Scope
### CAN touch
- `src/app/api/projects/[id]/assistant/route.ts` (handleDesign: history 수신 + 행동우선 프롬프트 + choices 반환·검증)
- `src/components/projects/workspace/WorkspaceChat.tsx` (history 전송 + choices 카드 렌더 + 클릭→onOps 적용)
### MUST NOT touch
- `session-ops.ts`(validateSessionOps·applySessionOps 사용만) · `plan-types`·`generate-plan`·budget/coach 엔진 · prisma · `invokeAi` 시그 · `components/ui/**` · 다른 라우트/컴포넌트 · `WorkspacePlanContext`(이미 sessions 줌)

## 🧩 응답 계약 (design 단계)
```ts
{
  reply: string,
  ops?: SessionOp[] | null,        // 명확한 직접 지시 → 즉시 적용
  choices?: { label: string, sub?: string, ops: SessionOp[] }[]  // 결정 필요 → 카드(2~3개). 각 ops 는 그 안을 적용.
}
```
- 명확한 직접 지시("4회차 실습으로", "마지막에 발표회 추가") → `ops` 즉시 적용(기존).
- 결정·추천 요청("N회차로 줄여줘", "너가 추천해줘", "추천안 제안") → `choices` 2~3개(각각 구체 ops + label + sub 한 줄). **자유 텍스트로 되묻지 마라.**
- 정말 불가능할 때만 ops·choices 없이 reply 로 한 번 되물음(최소화).

## 🛠 Tasks
1. **history 전송(WorkspaceChat)** — 전송 body 에 `history: {role:'user'|'assistant', text}[]`(welcome 제외, 최근 8턴, 길이 컷). design 외 단계도 동봉 무방.
2. **handleDesign history 수신·활용** — body.history 받아 프롬프트에 "이전 대화:" 블록으로. 직전 맥락("8회차로 줄여줘") 위에서 다음("너가 추천해줘")을 해석.
3. **행동 우선 프롬프트 재작성** — 핵심 규칙:
   - PM 이 변경/추천을 원하면 **구체적으로 행동**: ops(직접) 또는 choices(2~3안). "균형 잡혀 있다" 같은 회피·무관 추천(사전학습 등) 금지 — **요청한 작업**(예: 회차 줄이기)에 답하라.
   - "N회차로 줄여줘" → 현재 회차 중 통합/제외할 **구체 안 2~3개**를 choices 로(각 ops: remove/edit). "늘려줘" → add 안.
   - "너가 추천해줘/추천안" → 직전 맥락의 작업에 대한 **구체 추천**(최선 1안 ops 또는 2~3 choices). 되묻기 금지.
   - no 는 현재 목록의 정확한 라벨만. 점수/합격 판정·SROI 단정 금지(유지).
4. **choices 검증(route)** — 각 choice.ops 를 `validateSessionOps`로 검증(불량 op drop, 빈 choice drop). label 문자열 필수.
5. **카드 렌더(WorkspaceChat)** — `ChatMessage` 에 optional `choices` 추가. assistant 메시지 아래 카드 버튼 렌더(label + sub). 클릭 → `onOps(choice.ops)` + "✓ {label} 적용" 확인 메시지 append + 그 메시지의 다른 카드 비활성(이미 선택). 서버 재호출 불필요(ops 사전계산).
6. 디자인킷(accent #F05519·radius 0·틴트). 이중적용 가드(한 번만).

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ 2파일
- [ ] history 가 body 로 전송되고 프롬프트에 들어감(맥락). choices 검증 경로(validateSessionOps).
- [ ] 카드 클릭 → onOps 적용(서버 재호출 X) + 확인 메시지 + 중복 적용 가드.
- [ ] ⚠️ 메인이 Vercel 프리뷰+Chrome 으로 "8회차로 줄여줘→카드→클릭→캔버스 8회차" 사후 검수 → **코드 ✓**. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- design 단계 한정(다른 단계 응답 형태 무변경). session-ops·엔진 무변경(검증·적용 함수 사용만). 강제 변경 금지(직접 지시·카드 클릭만 적용). 커밋 금지(메인 검수·프리뷰 검수).

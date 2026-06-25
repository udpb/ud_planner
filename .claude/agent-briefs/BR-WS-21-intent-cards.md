# Brief BR-WS-21 — 기획의도 채우기 카드 (대화 → 초안 후보 2~3개 → 클릭=즉시 입력)

> **자급자족.** 본 파일 + `src/components/projects/workspace/PlanningIntent.tsx` + `src/app/api/projects/[id]/planning-intent/route.ts`. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-21-intent-cards` · 2026-06-25 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 패턴 | BR-WS-17 카드 UX를 **②기획의도**로. 단 WorkspaceChat 아님 — PlanningIntent 자체 대화. |

## 🎯 Mission
사용자: *"필요하면 항상 카드형태로 채팅창에 나오게해서 선택하면 입력되도록."* 기획의도 카드의 "대화로 채우기"가 지금은 PM 입력 → AI **단일 값**으로 바로 덮는다. 이걸 **AI 초안 후보 2~3개 카드 → PM 클릭 → 그 항목 즉시 입력**으로 바꾼다(핵심 페인 "맥락없이 딱딱" 직결, PM 이 고른다).

## 📋 현재 (정독)
- `PlanningIntent.tsx` — 4+1 카드(goalInterpretation·yearOverYear·differentiation·risk·winStrategy). `IntentCardRow`의 대화 입력(L271~303): textarea + "→ 채우기" → `onChat(message)` → `handleChat`(L386~414)이 `POST planning-intent {action:'refine', field, pmMessage, currentDraft}` → `{value}` 단일 → `setField(key,{value,confidence:'high'})`. openKey 단일(한 번에 1개 대화).
- `planning-intent/route.ts` — POST actions: `'draft'`(→`{draft}`), `'refine'`(field·pmMessage·currentDraft→`{value}`). PUT(→strategicNotes 저장). **'refine' 미러해서 후보 생성 추가.** invokeAi(Flash) + safeParseJson.

## 🎯 Scope
### CAN touch
- `src/app/api/projects/[id]/planning-intent/route.ts` (신규 action `'suggest'` — 후보 2~3개 반환. 기존 draft/refine/PUT 무변경)
- `src/components/projects/workspace/PlanningIntent.tsx` (대화 제출 → suggest 호출 → 후보 카드 렌더 → 클릭=채움)
### MUST NOT touch
- `planning-intent.ts`(타입·toStrategicNotes 사용만) · WorkspaceChat·assistant route·session-ops·엔진 · prisma · `invokeAi` 시그 · `components/ui/**` · 다른 컴포넌트/라우트
- 기존 'draft'/'refine'/PUT 동작(회귀 금지 — refine 은 남겨두거나, UI 가 suggest 로 전환해도 route 의 refine 핸들러는 보존)

## 🧩 응답 계약 (신규 action 'suggest')
```ts
// 요청: { action:'suggest', field: IntentFieldKey, pmMessage?: string, currentDraft: PlanningIntentDraft }
// 응답: { candidates: string[] }   // 2~3개, 서로 다른 관점, 각 1~2문장(그 항목 값으로 바로 쓸 형태)
```
- pmMessage 있으면 그 힌트 반영, 없으면(빈 "대화로 채우기") RFP·currentDraft 맥락에서 AI 가 초안 후보.
- 후보는 **그 필드의 값으로 바로 들어갈 완성 문장**(라벨 아님). 점수·SROI 단정 금지(기존 규칙 유지).

## 🛠 Tasks
1. **route 'suggest' 핸들러** — refine 프롬프트 미러 + "**서로 다른 2~3개 후보**를 JSON `{candidates:[...]}` 로" 지시. 각 후보는 해당 field 메타(목표해석/작년대비/차별점/리스크/메인전략)에 맞는 완성 문장. safeParseJson, 검증(문자열 배열·빈 항목 drop·최대 3개). 기존 핸들러 분기 그대로 옆에 추가.
2. **PlanningIntent 후보 카드** — 대화 제출("→ 채우기") 시 `handleChat` 대신(또는 내부에서) `suggest` 호출 → 받은 후보를 **그 카드 아래 클릭 가능한 카드 2~3개**로 렌더. 클릭 → `setField(key,{value:후보,confidence:'high'})` + 대화 닫기(openKey=null) + 후보 초기화 + "✓ 채움" 토스트. 후보 상태는 openKey 필드 기준(부모 또는 행 state). busy 동안 로딩.
3. PM 이 후보가 맘에 안 들면 다시 입력해 재요청 가능(후보 갱신). 직접 편집·"고치기"·"AI 초안 다시"·확정 저장(PUT)은 **무변경**.
4. 디자인킷(accent #F05519·radius 0·틴트, 후보 카드 = 차분한 선택 버튼). 이중 적용 가드(클릭 한 번).

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ 2파일
- [ ] suggest 응답 검증(문자열 배열·빈 drop·최대 3). refine/draft/PUT 회귀 없음.
- [ ] 후보 클릭 → 필드 값 즉시 채워지고 confidence high, 대화 닫힘. 서버 재호출 없이 입력.
- [ ] ⚠️ 메인이 프리뷰+Chrome 으로 "대화로 채우기 → 후보 카드 → 클릭 → 항목 채워짐" 사후 검수 → **코드 ✓**. 백그라운드 dev 금지. 커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- planning-intent 표면 한정(WorkspaceChat·assistant 무관). 기존 action 회귀 금지. 강제 채움 금지(클릭만). 커밋은 메인.

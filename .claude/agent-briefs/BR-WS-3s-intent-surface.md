# Brief BR-WS-3s — ②기획의도 표면 정리 (폼 벽 → §9 클린, 로직 0 변경)

> **자급자족.** 본 파일 + `CLAUDE.md` + `AGENTS.md` + `ud-design-system/SKILL.md` + `docs/architecture/program-workspace-redesign-v1.md`(**§9 = 구속 스펙**, §10 일하는 방식). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-3s-intent-surface` |
| Owner | 메인 (위임) · 작성 2026-06-23 |
| 상태 | 🔲 대기 |
| 관련 | 재설계 §9(클린 ②)·§10 · BR-WS-3(로직, 건드리지 않음) |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
빌드된 ②기획의도가 **"폼 벽"**(스샷, 카드 4개의 textarea가 동시에 펼쳐짐)으로 어긋났다. **재설계 §9 클린 통합 화면 그대로 표면을 교체**한다. 이것은 **표면(JSX/스타일) 전용 작업** — **모든 로직·API·상태 함수는 그대로 재사용**(byte-동작 동일). 더 많은 게 아니라 **더 적고 차분하게**.

> §10 일하는 방식: 이 브리프는 "컴포넌트 구현해"가 아니라 **"§9 레이아웃을 그대로 재현해"**. 즉흥 0. 시각 확인은 사용자가 §9 목업 대비 yes/no.

## 🔴 폼 벽의 원인 (정확히 이것만 고친다)
`PlanningIntent.tsx`의 `IntentCardView`가 `const [chatOpen, setChatOpen] = useState(isLow)` — **low 카드는 마운트 즉시 대화 textarea를 연다**. low가 3~4개면 **textarea 4개가 동시에** = 벽.
→ **대화 열림 상태를 부모로 올려 "한 번에 1개만"** 으로 바꾼다(§9.2). 나머지는 전부 시각 정리.

## 📋 현재 상태 (정독)
- `src/components/projects/workspace/PlanningIntent.tsx` — ②카드. **로직 함수 보존 대상**: `generateDraft`·`handleEdit`·`handleChat`·`handleConfirm`·자동초안 `useEffect`·`setField`·fetch 3종(draft/refine PUT). **이 함수 시그니처·동작·fetch 바디 일절 변경 금지.** 바꾸는 건 **렌더(JSX)와 `IntentCardView`의 열림 상태 위치**뿐.
- `…/program-design/_components/program-design-flow.tsx` — `IntentBand`(②와 중복되는 의도 띠)를 렌더. ②(PlanningIntent)가 위에서 의도를 소유하므로 **이 IntentBand 표시는 제거**(prefill·엔진 호출 로직은 유지).
- `src/components/projects/workspace/workspace-stages.ts` — `WORKSPACE_STAGE_DESCRIPTIONS.design` 의 jargon 부제.
- `structure-view.tsx`(커리큘럼)는 **이미 §9.3에 부합**(틴트 그리드+재배치, BR-WS-4) → **건드리지 않는다.**

## 🎯 Scope
### CAN touch
- `src/components/projects/workspace/PlanningIntent.tsx` — **표면만** §9.2로 재현 + 대화 열림을 단일화.
- `…/program-design/_components/program-design-flow.tsx` — **중복 `IntentBand` 표시 제거만**(다른 로직·구조·토대잡기·게이트·structure 무변경).
- `src/components/projects/workspace/workspace-stages.ts` — `design` 부제 de-jargon.
### MUST NOT touch
- `src/lib/program-design/planning-intent.ts`(로직·타입 — import만) · `api/projects/[id]/planning-intent/route.ts` · `program-design/route.ts`
- `structure-view.tsx`(이미 §9.3) · `plan-types.ts` · `generate-plan.ts` · prisma · `invokeAi` · `components/ui/**` · manifest
- PlanningIntent의 **fetch 바디·상태 함수·자동초안 동작** (표면만)

## 🛠 Tasks — §9.2 그대로 재현
1. **대화 열림 단일화(핵심)** — `IntentCardView`의 `chatOpen` 로컬 state 제거. 부모 `PlanningIntent`에 `const [openKey, setOpenKey] = useState<IntentFieldKey|null>(null)`. 카드의 "대화로 채우기" → `setOpenKey(key)` (이미 열린 카드면 토글로 닫기). **동시에 최대 1개만 입력 표시.** 마운트 시 자동 열림 ❌ (기본 닫힘).
2. **카드를 §9.2 차분한 행으로** (보더 박스 4개 → **틴트 그리드 `gap:1px`** 한 덩어리):
   - **확정 카드**(high & 값 있음): `[✓ success 아이콘] [작은 라벨(kicker)] [한 줄 값(ink)] … [고치기(우측, 작은 muted 링크)]`. 박스 안 박스·hint 문단 제거(hint는 빼거나 placeholder로만).
   - **미확정 카드**(low/빈): `[accent ?] [라벨] [한 줄 hint(muted)] … [대화로 채우기(우측 accent 링크)]`. 클릭 시 그 행 아래에 **인라인 입력 1줄 + accent → 버튼**(textarea 큰 거 ❌, 한 줄 input 또는 작은 textarea rows=2). 제출 = 기존 `onChat`.
   - "직접 편집"(고치기)은 유지하되 작은 링크로. 편집 시 인라인.
   - 연어색 채움버튼·밑줄 잡다 링크·✓확정/?대화로 큰 뱃지 ❌. 강조는 accent, 확정 체크는 success.
3. **헤더·인트로 슬림화** — 부제 한 줄(`왜 이렇게 가는가`)만. 긴 설명 문단(418~422줄) → 1줄 이하 또는 제거. "AI 초안 다시" 버튼은 작게 우측 유지.
4. **확정 바 유지** — `기획의도 확정 → 커리큘럼 반영` 버튼·저장 표시는 동작 그대로, 톤만 차분히.
5. **program-design-flow** — 중복 `IntentBand` 렌더 **제거**(2곳: 시작 전·진행 중). prefill·엔진 호출은 유지.
6. **workspace-stages** — `design` 부제를 `왜 이렇게 가는가 → 무엇을 하는가` 류로 교체(D0~D8·게이트 jargon 제거).
7. 디자인킷: radius 0 · accent #F05519 1개 · 틴트 그리드(paper↔neutral 교차, gap 1px) · NanumHuman/Poppins.

## 🧪 Self-Verification
- [ ] `npm run typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과
- [ ] `git diff --name-only` ⊆ 3개 CAN-touch 파일. 보호파일(planning-intent.ts·route·structure-view·plan-types·prisma) 무변경.
- [ ] **로직 불변 증명**: `handleChat`/`handleConfirm`/`generateDraft`의 fetch URL·메서드·바디 diff = 0(표면만 바뀜).
- [ ] **폼 벽 제거 확인**: 마운트 시 열린 입력 0개, "대화로 채우기" 눌러야 1개만 열림.
- [ ] ⚠️ 메인 시각검증 불가(§10) → **코드 ✓만 보증**, 시각 yes/no는 사용자. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일 / ❌못한일 / 🤔결정 / 🔬검증(`코드 ✓` 항목 + git diff --stat + 로직 fetch diff=0 증명 / `시각 미확인`) / ⚠️위험

## ⚠️ 주의
- **표면 전용.** 로직·API·fetch·상태 함수 동작 변경 = STOP. (의심되면 보고.)
- §9가 진실 — 임의 디자인 추가 금지. 커밋 금지(메인 검수).

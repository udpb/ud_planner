# Brief BR-WS-9 — SI-greeting + SI-goal-dup (대화 greeting 단계 정합 · 목표 이중 노출 정리)

> **자급자족.** 본 파일 + `ud-design-system/SKILL.md` + [service-improvements-backlog.md](../../docs/architecture/service-improvements-backlog.md). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-9-ui-coherence` (백로그 SI-greeting 순서2 + SI-goal-dup 순서3) · 2026-06-23 |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission (UI 카피 정합 2건 — 로직 무변경)
라이브 검수 관찰:
1. **SI-greeting** — 대화 첫 인사가 *"…캔버스 직접 변경은 **곧 추가됩니다**."* 인데, **프로그램 기획 단계에선 이미 대화로 커리큘럼이 바뀝니다**(거짓 안내). → 단계 인지 인사로.
2. **SI-goal-dup** — '목표'가 ②기획의도 "목표 해석" + 토대잡기 "목표 확인·수정" **두 곳**에 보여 혼동. → 토대잡기 라벨을 **엔진 입력용 원목표**로 명확히 구분(둘은 별개 — 해석 vs 생성 입력).

## 📋 위치
- `src/components/projects/workspace/WorkspaceChat.tsx` — `WELCOME` 상수(~57~62줄) 정적 인사. `stage` prop 있음(`WorkspaceStageId`).
- `…/program-design/_components/program-design-flow.tsx` — 토대잡기의 `목표 확인 · 수정` 라벨 + goalText Textarea. (goalText는 `handleStart`→엔진 seed. **동작 유지**, 라벨만.)

## 🎯 Scope
### CAN touch
- `src/components/projects/workspace/WorkspaceChat.tsx` (인사 stage 인지)
- `…/program-design/_components/program-design-flow.tsx` (토대잡기 목표 라벨/도움말 문구만)
### MUST NOT touch
- 대화 전송 로직·assistant route·onOps · 엔진·plan-types·goalText 동작(handleStart seed)·invokeAi·스키마·다른 컴포넌트·ui 라이브러리

## 🛠 Tasks
1. **greeting stage 인지(WorkspaceChat)** — `WELCOME` 상수 → `welcomeFor(stage)` 헬퍼. 마운트 시 `stage`로 시드.
   - `design`(프로그램 기획): "…**이 단계에선 '회차를 추가·변경·재배치해줘'처럼 말하면 오른쪽 커리큘럼이 바로 바뀝니다.** 예: '마지막에 성과 발표회 추가해줘'."
   - 그 외 단계: "…현재 단계의 산출물을 같이 디벨롭해 봅시다. (이 단계는 안내·해석 중심이에요.)" — **"곧 추가됩니다" 거짓 문구 제거.**
   - 대화는 단계 넘어 이어지므로 인사는 마운트 1회면 충분(stage 바뀔 때 인사 재발급 안 함 — history 유지).
2. **목표 라벨 정리(program-design-flow)** — 토대잡기 "목표 확인 · 수정" 라벨/도움말을 **②기획의도와 구분**되게: 예) 라벨 "기획 시작 목표" + 도움말 "이 목표로 커리큘럼을 생성합니다 (RFP 원문 — ②기획의도의 '목표 해석'과는 별개로 엔진 입력값)". (Textarea·goalText 동작 그대로.)
3. 디자인킷 유지. 카피만.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과
- [ ] `git diff` = 2개 파일, **문자열/라벨 한정**(로직 라인 무변경 — diff로 증명). 전송·엔진·seed 동작 무변경.
- [ ] greeting이 design 단계에서 "곧 추가" 문구 없이 "대화로 바꿀 수 있다"로, 그 외엔 "안내·해석 중심".
- [ ] ⚠️ 메인이 Vercel 프리뷰+Chrome 사후 검수 → **코드 ✓**만 보증. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff 요지/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- 카피·라벨만. 로직·seed·전송·엔진 무변경. 커밋 금지(메인 검수).

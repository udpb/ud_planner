# ADR-018: Adaptive Stage Layout — UX v2 Shell

- **상태**: Accepted (사용자 승인, 2026-05-27)
- **결정일**: 2026-05-27
- **결정자**: udpb@udimpact.ai + AI Architect
- **관련**: ADR-015 (Wave V 5 Stage 통합), ADR-014 (Wave U UX 토큰), ADR-011 (Express 메인 패러다임)
- **승계**: ADR-015 의 "단일 shell 5 Stage 동일 레이아웃" 가정 폐기 → **Stage 마다 다른 적응형 레이아웃**.

---

## 배경

Wave V (ADR-015) 안착 후 운영 페이지 `/projects/[id]` 가 cluttered:
- OLD `PipelineNav` (6-step) + OLD `ScoreBar` + OLD `PlanningScorecard` + NEW `StageShell` (5 Stage) 4 progress widget 동시 출력
- 사용자 풀테스트: "어디 봐야 할지 모름. 너무 복잡함."

### 사용자 직접 피드백 (2026-05-27)
> "UI/UX 너무 복잡한데? 심플하게 직관적이게 다시."

### 외부 벤치마킹 (ActionAI Boost v-07 mockup)
- 3-column shell (sidebar 240px + canvas 1024 + dock 320)
- 단일 진행도 (사이드바 Stage 진행만)
- AI Tutor 도크 (slide-open)
- 카드 hierarchy 확고

→ **본질 문제**: ActionAI = 학습 플랫폼 (선형 모듈), UD-Planner = 작업 워크플로우 (AI 협력 결정). **본질이 다르니 화면 풍경도 달라야**.

---

## 결정

**UD-Planner UX v2 — Adaptive Stage Layout** 채택.

### 1. 공통 4 요소 (모든 Stage 항상 보임)

| 요소 | 위치 | 크기 | 책임 |
|---|---|---|---|
| **TopBar** | 상단 sticky | 44px | 프로젝트 switcher + Stage chips + Brain toggle + 사용자 |
| **StageSidebar** | 좌 슬림 | 56px | 5 Stage 점프 (S1~S5) + 홈/메뉴 |
| **NowBar** | 하단 sticky | 64px | 단일 다음 액션 CTA |
| **BrainDock** | 우 slide-open | 320px (closed 0) | Brain Panel + AI 채팅 (토글) |

### 2. Stage별 메인 캔버스 (적응형)

각 Stage 본질에 맞는 다른 레이아웃 적용:

| Stage | 본질 | 화면 모드 | 핵심 컴포넌트 |
|---|---|---|---|
| **S1 RFP** | 업로드 + 분석 대기 | **Hero center** | 큰 dropzone + 분석 결과 카드 |
| **S2 1차본** | AI 와 대화하며 결정 | **Chat-canvas-dock** | 좌 챗봇 + 우 7섹션 미리보기 |
| **S3 검수** | 체크 + diff | **Checklist + Diff** | Inspector 7 lens + 자산 추천 inline diff |
| **S4 정밀** | 4 도메인 다중 편집 | **Workspace tabs** | [커리큘럼] [코치] [예산] [제안서] |
| **S5 승인** | 요약 + 결단 | **Summary page** | 큰 승인 버튼 + 사회적 가치 forecast |

### 3. 진행도 단일화 (Single Source of Truth)

- **TopBar** 의 Stage chips + 진행도 bar = 유일한 진행도 표시
- StageSidebar 의 5 Stage = 점프용 (보조)
- **제거**: PipelineNav (6-step), ScoreBar, PlanningScorecard (모두 OLD)

### 4. NowBar — 단일 CTA 원칙

- 항상 보임. **다음 액션 1개** (max 2 옵션) 명확.
- Stage 자동 전환의 단일 진실.
- PRD-v8.0 NowBar 의 발전형.

### 5. BrainDock — Toggle 도크

- 기본 closed (메인 영역 최대 확보).
- 🧠 토글 → 우 슬라이드 320px.
- 내용: 자산 매칭 chip · 유사 사업 · AI 채팅 · inline citation copy.
- ActionAI v-07 Tutor Drawer 와 같은 패턴.

### 6. StageSidebar — Stage 점프

- 점프 가능: 완료 + 현재 + 다음 stage (앞당기기 방지)
- ⬇ 추후 (Wave V3): "비활성 stage 1줄 sticky" 도 고려

---

## 디자인 토큰 (Wave U 와 동일)

- **Action Orange** `#F05519` — CTA, active stage, 진행도 bar
- **Charcoal** `#373938` — StageSidebar 배경, 다크 영역
- **Beige** `#F5F0EB` — 카드/배경 강조
- **Cyan** `#06A9D0` — 보조 강조 (Brain 등)
- **Green** `#10B981` — 완료/통과
- **Red** `#EF4444` — 경고

폰트: Nanum Gothic (한글 친화)
카드: `rounded-xl 14px` · `ring hairline` · `hover scale-1.02`

---

## 컴포넌트 인벤토리

### 신규 (4개 shell)
- `src/components/shell/TopBar.tsx`
- `src/components/shell/StageSidebar.tsx`
- `src/components/shell/NowBar.tsx`
- `src/components/shell/BrainDock.tsx`

### 재배치 (기존)
- `BrainPanel` (W31) → BrainDock 안 콘텐츠로 흡수
- `StageShell` (Wave V) → S2 1차본 mode 시 사용

### 제거 (page.tsx)
- `PipelineNav` (6-step)
- `ScoreBar`
- `PlanningScorecard`

---

## 구현 PR 계획

| PR | 작업 | 시간 |
|---|---|---|
| **#1** ⭐ | 4개 shell 컴포넌트 + ADR-018 (이 문서) | 4h |
| **#2** | S1 Hero center | 2h |
| **#3** | S2 Chat-canvas-dock | 3h |
| **#4** | S3 Checklist + Diff + S4 4탭 워크스페이스 | 5h |
| **#5** | S5 Summary + OLD widget 제거 + 최종 인테그레이션 | 3h |

총 ~17h. 각 PR ActionAI 스타일 (1 commit, 한 줄 메시지).

---

## 영향 & 회귀

- `/projects/[id]` 페이지 layout 전면 재구성 → V3 flag ON 유지 (회귀 0 기존 6-step 모드 보존)
- 새 layout 활성화는 **Wave V2 flag** 도입 검토 (gradual rollout)
- 또는 직접 적용 — V3 ON 이면 새 layout, V3 OFF 면 기존 (선택)

---

## 폐기 항목

- ADR-015 "단일 shell 5 Stage 동일 레이아웃" 가정 (Stage 마다 다른 레이아웃)
- Wave V F0 의 PipelineNav 잔존 (제거)
- ScoreBar / PlanningScorecard 중복 진행도 (TopBar 로 통합)

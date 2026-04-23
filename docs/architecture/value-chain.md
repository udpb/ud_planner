# Impact Value Chain v1.0 — 아키텍처 스펙

> 근거: [ADR-008](../decisions/008-impact-value-chain.md)
> 관련: [ADR-001 파이프라인 재순서](../decisions/001-pipeline-reorder.md) · [data-contract.md](data-contract.md) · [quality-gates.md](quality-gates.md)
> 최종: 2026-04-23

---

## 개요

**Impact Value Chain** 은 언더독스 교육 사업 설계의 **논리 골격**을 5단계로 정식화한 의미 레이어다. UI 스텝(6개)과는 독립된 **공정 레이어**로, 각 UI 스텝과 각 산출물이 어느 논리 단계에 속하는지 태그한다.

```
  ① Impact  →  ② Input  →  ③ Output  →  ④ Activity  →  ⑤ Outcome
  (의도)        (자원)       (산출물/RFP)   (커리큘럼)       (SROI)
     ▲                                                      │
     └──────── 루프: SROI 축 3방향 얼라인 검증 ──────────────┘
```

## 단계 정의

### ① Impact — 사업의 의도와 Before/After

- **본질 질문**: *"이 사업이 왜 존재해야 하는가? 지금 상태와 목표 상태의 차이는?"*
- **핵심 산출물**: 의도 선언문 · Before 현황 데이터 · After 목표 상태 · 배점 기준 대비 정렬
- **측정 가능 여부**: 정성 우위 (숫자는 씨앗 수준)
- **UI 스텝 매핑**: Step 1 RFP+기획방향 (Impact 탭)
- **색상 코드**: Action Orange `#F05519`

### ② Input — 자원 (예산·기관 자산·UD 에셋)

- **본질 질문**: *"어떤 자원을 쓸 수 있는가?"*
- **핵심 산출물**: 예산 구조 · 기관 보유 자산 · UD 내부 에셋(IMPACT 모듈·코치·SROI 프록시 DB)·외부 파트너
- **측정 가능 여부**: 정량 (원·명·건수)
- **UI 스텝 매핑**: Step 1(기관 자산) · Step 3(코치) · Step 4(예산)
- **색상 코드**: Dark Gray `#373938`

### ③ Output — 산출물 + RFP

- **본질 질문**: *"무엇을 납품할 것인가?"*
- **핵심 산출물**: RFP 요구사항 · 결과물 목록 · 평가 지표 · 최종 제안서
- **측정 가능 여부**: 정량 + 정성 혼합
- **UI 스텝 매핑**: Step 1(RFP 분석) · Step 6(제안서 생성)
- **색상 코드**: Cyan `#06A9D0`

### ④ Activity — 실행 (커리큘럼·코칭)

- **본질 질문**: *"어떻게 실행할 것인가?"*
- **핵심 산출물**: 회차별 세션 · 트랙 구성 · 코치 배정 · Action Week · IMPACT 모듈 매핑
- **측정 가능 여부**: 정량 (회차 · 시간)
- **UI 스텝 매핑**: Step 2(커리큘럼) · Step 3(코치)
- **색상 코드**: Orange 80% `#F48053`

### ⑤ Outcome — SROI Forecast (정량 기대효과)

- **본질 질문**: *"얼마나 사회적 가치를 만들 것인가?"*
- **핵심 산출물**: **SROI 비율 (예: 1 : 3.2)** · 프록시 매핑 · 화폐 환산 근거 · 벤치마크 대비 위치 · Logic Model Outcome 층
- **측정 가능 여부**: 완전 정량
- **UI 스텝 매핑**: Step 5 임팩트 + SROI Forecast
- **색상 코드**: Action Orange `#F05519` (진하게, 수렴 느낌)

---

## 루프: SROI 축 3방향 얼라인

⑤ SROI 숫자가 확정되는 순간 자동으로 3방향 검증이 트리거된다.

```
⑤ SROI (예: 1:3.2)
    │
    ├─▶ ① Impact: "이 비율이 의도한 Impact 를 대표하는가? 평가위원을 설득할 수준인가?"
    ├─▶ ② Input: "이 예산·자산으로 이 SROI 가 정말 달성 가능한가? 자원 대비 과다 약속인가?"
    └─▶ ④ Activity: "이 커리큘럼·코칭으로 이 Outcome 을 만들 수 있는가? Activity 강도가 맞나?"
```

- 각 방향은 **Alignment Check** 카드로 표시
- 불일치 신호 시 해당 스텝으로 **복귀 CTA** (블록하지 않음)
- 기본 임계:
  - Impact 방향: SROI 비율 < 1.5 면 경고 (1원 투입 1.5원 미만은 평가위원 설득 약함)
  - Input 방향: SROI 비율 > 7 면 경고 (과다 약속 의심, 벤치마크 대비 +2σ)
  - Activity 방향: Outcome 지표 ↔ Activity 매핑 밀도 체크 (Activity 1회당 Outcome 기여 정량화)

---

## 타입 스펙 (구현 계약)

```ts
// src/lib/value-chain.ts (Wave 1 에서 신규)

export type ValueChainStage = 'impact' | 'input' | 'output' | 'activity' | 'outcome'

export interface ValueChainStageSpec {
  key: ValueChainStage
  order: 1 | 2 | 3 | 4 | 5
  koLabel: string        // '① Impact'
  enLabel: string        // 'Impact'
  description: string    // 'Intent + Before/After'
  colorToken: string     // CSS var: --vc-impact
  colorHex: string       // '#F05519'
  uiSteps: StepKey[]     // ['rfp']
}

export const VALUE_CHAIN_STAGES: Record<ValueChainStage, ValueChainStageSpec>

/** UI 스텝 → 주 논리 단계 매핑 (1:N 가능) */
export const STEP_TO_STAGES: Record<StepKey, ValueChainStage[]>
// {
//   rfp: ['impact', 'input', 'output'],  // Step 1 이 3 단계를 건드림
//   curriculum: ['activity'],
//   coaches: ['activity', 'input'],
//   budget: ['input'],
//   impact: ['outcome'],
//   proposal: ['output'],
// }

/** 스테이지별 리서치 태깅 */
export interface StageTaggedResearch extends ResearchRequest {
  primaryStage: ValueChainStage
  linkedStages?: ValueChainStage[]  // "씨앗/수확" 구조의 연결
}
```

## PipelineContext 메타 확장

```ts
// src/lib/pipeline-context.ts 에 추가

export interface PipelineContext {
  // ... 기존 슬라이스들
  valueChainState: {
    currentStage: ValueChainStage           // 현재 활성 단계 (UI 스텝 기반 자동 계산)
    completedStages: ValueChainStage[]      // 완료된 단계들
    sroiForecast: SROIForecast | null       // ⑤ Outcome 의 핵심 산출물
    loopChecks: LoopAlignmentChecks | null  // SROI 확정 후 3방향 체크 결과
  }
}

export interface SROIForecast {
  ratio: number                      // 3.2 (1:3.2)
  totalValue: number                 // 원
  breakdown: Array<{
    outcome: string                  // 'ACT-PRENEURSHIP 점수 상승'
    proxy: string                    // '창업교육 SROI 프록시 (한국사회가치평가 2023)'
    perUnitValue: number             // 인당 가치
    units: number                    // 참여자 수
    subtotal: number                 // 소계
  }>
  confidence: 'low' | 'medium' | 'high'
}

export interface LoopAlignmentChecks {
  impactDirection: AlignmentCheck    // ⑤→①
  inputDirection: AlignmentCheck     // ⑤→②
  activityDirection: AlignmentCheck  // ⑤→④
}

export interface AlignmentCheck {
  status: 'ok' | 'warn' | 'mismatch'
  signal: string                     // '1.3 — 평가위원 설득 약함'
  fixHint: string                    // 'Outcome 추가 or Input 축소 검토'
  returnTo: StepKey                  // 'rfp' (복귀 CTA 목적지)
}
```

---

## UI 통합

### pm-guide 우측 패널 상단 — Value Chain 다이어그램

- 상시 고정 (스텝 전환 시 하이라이트만 변경)
- 5단계 가로 플로우 + 현재 활성 단계 Action Orange 하이라이트
- 완료 단계는 체크 아이콘
- 루프 화살표 (⑤ → ①) 점선 + SROI 숫자 있을 때만 실선

### Step 1 (RFP) — 3 탭 분리

```
[ ① Impact 의도 ]  [ ② Input 자산 ]  [ ③ Output RFP ]
```

- Impact 탭: 의도 선언 · Before 현황 · Logic Model 씨앗
- Input 탭: 기관 자산 · UD 에셋 매칭 · 외부 파트너 후보
- Output 탭: RFP 파싱 결과 · 평가 기준 · 요구 산출물

### Step 5 (임팩트 + SROI Forecast) — 재구성

- 기존: 임팩트 모듈 + Logic Model
- 추가: **SROI Forecast 섹션** (Step 4 에서 이동)
  - 프록시 매핑 테이블
  - 화폐 환산 계산기
  - 벤치마크 대비 비교
  - **루프 Alignment Check 카드 3개** (SROI 숫자 확정 후 자동 표시)

### Step 4 (예산 설계) — 개칭

- 기존: "예산 + SROI"
- 변경: **"예산 설계"** (② Input 에만 집중)
- SROI 섹션은 Step 5 로 이동 안내 링크만 남김

---

## 리서치 재분배 (ADR-007 갱신)

| 기존 위치 | 기존 ID | → 이동 | 신규 ID | 비고 |
|---|---|---|---|---|
| impact | `imp-outcome-indicators` | → rfp | `rfp-outcome-indicators` | 🌱 씨앗 — Step 5 에서 수확 |
| impact | `imp-diagnostic-tools` | → curriculum | `cur-diagnostic-tools` | 🌱 씨앗 — Step 5 에서 수확 |
| impact | `imp-sroi-proxy` | 유지 | `imp-sroi-proxy` | 🌾 수확 |
| — | — | 신규 | `imp-outcome-benchmark` | 🌾 수확 — 유사 사업 SROI 벤치마크 |

리서치 카드에 **단계 뱃지** (① Impact · ④ Activity 등) + **씨앗/수확 링크** (🌱 Step 1 → 🌾 Step 5) 표시.

최종 분포: rfp 5 · curriculum 5 · coaches 3 · budget 3 · impact 2 · proposal 4 = **총 22**.

---

## 품질 게이트 연동

[quality-gates.md](quality-gates.md) 의 4계층과 연결:

- **Gate 1 구조**: 각 UI 스텝 필수 슬라이스 체크 — 변경 없음
- **Gate 2 룰**: Value Chain 단계별 최소 산출물 체크 (예: ⑤ Outcome 단계에 SROI 비율 숫자 필수)
- **Gate 3 AI**: 당선 패턴 대비 — 변경 없음
- **Gate 4 사람**: **새 추가 — 루프 Alignment Check 3방향** (⑤→① / ⑤→② / ⑤→④)

---

## 마이그레이션 경로

1. **무중단** — PipelineContext 에 `valueChainState` 추가는 optional 필드. 기존 프로젝트는 런타임에 자동 도출 (UI 스텝 기반).
2. **SROI 데이터 이동** — 스키마 변경 없음. 기존 예산 관련 SROI 필드는 그대로 두고 UI 라우팅만 Step 5 로 변경.
3. **기존 리서치** — `imp-*` 2개가 이동하면서 ID 가 `rfp-*` / `cur-*` 로 변경됨. 기존 projectResearch JSON 에 저장된 ID 는 resolver 에서 자동 매핑 (하위 호환).

---

## 변경 이력

- 2026-04-23 — v1.0 초안 (ADR-008 채택 동시 생성)

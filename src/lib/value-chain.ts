/**
 * Impact Value Chain v1.0 — 의미 레이어 (UI 스텝과 직교)
 *
 * 근거: ADR-008 (docs/decisions/008-impact-value-chain.md)
 *       스펙:  docs/architecture/value-chain.md
 *
 * 파이프라인에는 UI 6 스텝(공정 레이어) 과는 독립된 의미 레이어가 있다:
 *   ① Impact  →  ② Input  →  ③ Output  →  ④ Activity  →  ⑤ Outcome
 *      ▲                                                        │
 *      └────── 루프: SROI 축 3방향 얼라인 검증 ──────────────────┘
 *
 * ⑤ Outcome = SROI Forecast (수렴점이자 루프 출발점).
 *
 * 이 모듈은:
 *  - 5단계 스펙 상수 (VALUE_CHAIN_STAGES)
 *  - UI 스텝 ↔ 논리 단계 매핑 (STEP_TO_STAGES, STAGE_TO_STEPS)
 *  - 헬퍼 (getPrimaryStage, getStageColor, isOutcomeStage)
 * 만 제공한다. 런타임 얼라인 체크는 `loop-alignment.ts` 에서 분리.
 */

import type { StepKey } from '@/modules/pm-guide/types'

// ═════════════════════════════════════════════════════════════
// 1. 5단계 타입
// ═════════════════════════════════════════════════════════════

export type ValueChainStage =
  | 'impact'
  | 'input'
  | 'output'
  | 'activity'
  | 'outcome'

export type ValueChainOrder = 1 | 2 | 3 | 4 | 5

export interface ValueChainStageSpec {
  key: ValueChainStage
  order: ValueChainOrder
  /** 번호 라벨 (예: "① Impact") — UI 표시용 */
  numberedLabel: string
  /** 한국어 이름 (짧게) */
  koLabel: string
  /** 한국어 이름 (풀게) */
  koLabelLong: string
  /** 영문 이름 */
  enLabel: string
  /** 한 줄 설명 */
  description: string
  /** 본질 질문 — pm-guide 툴팁에 노출 */
  essentialQuestion: string
  /** 색상 토큰 (CSS var) */
  colorToken: string
  /** 색상 hex — 다이어그램 인라인 스타일용 */
  colorHex: string
  /** 이 단계를 건드리는 UI 스텝들 (다-대-다) */
  uiSteps: StepKey[]
}

// ═════════════════════════════════════════════════════════════
// 2. 5단계 스펙 (SSoT)
// ═════════════════════════════════════════════════════════════

export const VALUE_CHAIN_STAGES: Record<ValueChainStage, ValueChainStageSpec> = {
  impact: {
    key: 'impact',
    order: 1,
    numberedLabel: '① Impact',
    koLabel: '임팩트',
    koLabelLong: '임팩트 — 의도 · Before/After',
    enLabel: 'Impact',
    description: '사업 의도와 Before/After 의 차이',
    essentialQuestion:
      '이 사업이 왜 존재해야 하는가? 지금 상태와 목표 상태의 차이는?',
    colorToken: '--vc-impact',
    colorHex: '#F05519', // Action Orange
    uiSteps: ['rfp'],
  },
  input: {
    key: 'input',
    order: 2,
    numberedLabel: '② Input',
    koLabel: '자원',
    koLabelLong: '자원 — 예산 · 기관 자산 · UD 에셋',
    enLabel: 'Input',
    description: '사용 가능한 자원 (예산·기관 자산·UD 에셋·외부 파트너)',
    essentialQuestion: '어떤 자원을 쓸 수 있는가?',
    colorToken: '--vc-input',
    colorHex: '#373938', // Dark Gray
    uiSteps: ['rfp', 'coaches', 'budget'],
  },
  output: {
    key: 'output',
    order: 3,
    numberedLabel: '③ Output',
    koLabel: '산출물',
    koLabelLong: '산출물 — RFP 요구 · 결과물 · 제안서',
    enLabel: 'Output',
    description: 'RFP 요구 산출물 + 최종 제안서',
    essentialQuestion: '무엇을 납품할 것인가?',
    colorToken: '--vc-output',
    colorHex: '#06A9D0', // Cyan
    uiSteps: ['rfp', 'proposal'],
  },
  activity: {
    key: 'activity',
    order: 4,
    numberedLabel: '④ Activity',
    koLabel: '실행',
    koLabelLong: '실행 — 커리큘럼 · 코칭',
    enLabel: 'Activity',
    description: '실제 실행 체 (커리큘럼 · 코칭 · Action Week)',
    essentialQuestion: '어떻게 실행할 것인가?',
    colorToken: '--vc-activity',
    colorHex: '#F48053', // Orange 80%
    uiSteps: ['curriculum', 'coaches'],
  },
  outcome: {
    key: 'outcome',
    order: 5,
    numberedLabel: '⑤ Outcome',
    koLabel: 'SROI',
    koLabelLong: 'Outcome — SROI Forecast (수렴점)',
    enLabel: 'Outcome',
    description: 'SROI Forecast — 정량 기대효과의 최종 형태. 루프 수렴점.',
    essentialQuestion: '얼마나 사회적 가치를 만들 것인가? (SROI 비율)',
    colorToken: '--vc-outcome',
    colorHex: '#F05519', // Action Orange (진하게, 수렴 느낌)
    uiSteps: ['impact'], // 단수 UI 스텝만 ⑤ Outcome 담당
  },
}

/** 순서대로 정렬된 5단계 스펙 배열 (UI 다이어그램 렌더링용) */
export const VALUE_CHAIN_STAGES_ORDERED: ValueChainStageSpec[] = [
  VALUE_CHAIN_STAGES.impact,
  VALUE_CHAIN_STAGES.input,
  VALUE_CHAIN_STAGES.output,
  VALUE_CHAIN_STAGES.activity,
  VALUE_CHAIN_STAGES.outcome,
]

// ═════════════════════════════════════════════════════════════
// 3. UI 스텝 ↔ 논리 단계 매핑
// ═════════════════════════════════════════════════════════════

/**
 * UI 스텝이 건드리는 논리 단계들 (순서는 우선순위 — 첫 번째가 primary).
 *
 * Step 1 RFP 는 ① Impact · ② Input · ③ Output 3 개를 건드리므로
 *   Step 1 의 탭 분리 후에는 탭별로 단일 단계 표시.
 */
export const STEP_TO_STAGES: Record<StepKey, ValueChainStage[]> = {
  rfp: ['impact', 'input', 'output'],
  curriculum: ['activity'],
  coaches: ['activity', 'input'],
  budget: ['input'],
  impact: ['outcome'],
  proposal: ['output'],
}

/** 역방향 매핑 (논리 단계 → 그 단계를 담는 UI 스텝들) */
export const STAGE_TO_STEPS: Record<ValueChainStage, StepKey[]> = (() => {
  const map: Record<ValueChainStage, StepKey[]> = {
    impact: [],
    input: [],
    output: [],
    activity: [],
    outcome: [],
  }
  for (const [step, stages] of Object.entries(STEP_TO_STAGES) as Array<
    [StepKey, ValueChainStage[]]
  >) {
    for (const stage of stages) {
      map[stage].push(step)
    }
  }
  return map
})()

// ═════════════════════════════════════════════════════════════
// 4. 헬퍼
// ═════════════════════════════════════════════════════════════

/**
 * 해당 UI 스텝의 주(primary) 논리 단계.
 * Step 1(rfp) 처럼 3개를 건드리는 경우에도 첫 번째가 "대표".
 */
export function getPrimaryStage(step: StepKey): ValueChainStage {
  return STEP_TO_STAGES[step][0]
}

/** 해당 단계의 UI 색상 hex (다이어그램 · 뱃지용) */
export function getStageColor(stage: ValueChainStage): string {
  return VALUE_CHAIN_STAGES[stage].colorHex
}

/** ⑤ Outcome 단계인지 — 루프 Gate 트리거 조건 */
export function isOutcomeStage(stage: ValueChainStage): boolean {
  return stage === 'outcome'
}

/** 다음 단계 반환 (⑤ Outcome 이후는 null — 루프는 별도 트리거) */
export function getNextStage(stage: ValueChainStage): ValueChainStage | null {
  const current = VALUE_CHAIN_STAGES[stage]
  const next = VALUE_CHAIN_STAGES_ORDERED.find((s) => s.order === current.order + 1)
  return next?.key ?? null
}

// ═════════════════════════════════════════════════════════════
// 5. 루프 얼라인 타입 (구현은 loop-alignment.ts)
// ═════════════════════════════════════════════════════════════

export type AlignmentStatus = 'ok' | 'warn' | 'mismatch'

/**
 * SROI 축 단일 방향 체크 결과.
 * ⑤ → ① / ⑤ → ② / ⑤ → ④ 3방향 각각 독립.
 */
export interface AlignmentCheck {
  /** 체크 대상 방향 (⑤ → target) */
  targetStage: Extract<ValueChainStage, 'impact' | 'input' | 'activity'>
  status: AlignmentStatus
  /** 신호 메시지 (예: "SROI 1.3 — 평가위원 설득 약함") */
  signal: string
  /** PM 에게 보여줄 수정 힌트 */
  fixHint: string
  /** 복귀 CTA 목적지 UI 스텝 */
  returnTo: StepKey
  /** 내부 수치 (디버그·로깅용) */
  debugMetrics?: Record<string, number | string>
}

/** SROI 숫자 확정 시점에 계산되는 3방향 얼라인 체크 결과 */
export interface LoopAlignmentChecks {
  /** SROI 비율 (축 수치) */
  sroiRatio: number
  /** 계산 시각 (ISO) */
  computedAt: string
  /** ⑤ → ① Impact 방향 */
  impactDirection: AlignmentCheck
  /** ⑤ → ② Input 방향 */
  inputDirection: AlignmentCheck
  /** ⑤ → ④ Activity 방향 */
  activityDirection: AlignmentCheck
  /** 전체 상태 (3개 중 최악) */
  overallStatus: AlignmentStatus
}

// ═════════════════════════════════════════════════════════════
// 6. PipelineContext 에 주입될 메타 슬라이스
// ═════════════════════════════════════════════════════════════

/**
 * `PipelineContext.valueChainState` 로 노출되는 Value Chain 상태.
 * UI 스텝 기반으로 자동 도출되며, loopChecks 는 SROI 숫자가 있을 때만 계산.
 */
export interface ValueChainState {
  /** 현재 활성 단계 (UI 스텝 → primary stage) */
  currentStage: ValueChainStage
  /** 완료된 단계들 (데이터 존재 여부로 판단) */
  completedStages: ValueChainStage[]
  /** SROI 수치 여부 — false 면 loopChecks 는 null */
  hasSroi: boolean
  /** 루프 얼라인 체크 — SROI 있을 때만 */
  loopChecks: LoopAlignmentChecks | null
}

// ═════════════════════════════════════════════════════════════
// 7. ValueChainState 계산 헬퍼
// ═════════════════════════════════════════════════════════════

/**
 * 컨텍스트 형상 검사에 필요한 최소 입력 (PipelineContext 직접 의존 회피).
 */
export interface ValueChainInputs {
  /** RFP 파싱 & 기획방향 존재 (의도 씨앗) */
  hasIntent: boolean
  /** 예산 구조표 존재 */
  hasBudget: boolean
  /** 코치 배정 존재 */
  hasCoaches: boolean
  /** 커리큘럼 세션 ≥1 */
  hasCurriculum: boolean
  /** Logic Model outcome layer 비어있지 않음 */
  hasOutcomeDraft: boolean
  /** SROI 비율 계산 완료 */
  hasSroi: boolean
  /** 제안서 섹션 존재 */
  hasProposalSections: boolean
}

/**
 * 주어진 데이터 형상 + 현재 UI 스텝에서 Value Chain 상태를 도출한다.
 * `loopChecks` 는 이 함수에서 만들지 않는다 — `loop-alignment.ts` 에서 별도 계산 후 주입.
 *
 * @param inputs  각 슬라이스 존재 여부 (PipelineContext 에서 유도)
 * @param currentStep  현재 활성 UI 스텝 (없으면 impact 로 기본값 — 안전한 기본)
 */
export function computeValueChainState(
  inputs: ValueChainInputs,
  currentStep?: StepKey,
): ValueChainState {
  const step = currentStep ?? 'rfp'
  const currentStage = getPrimaryStage(step)

  const completedStages: ValueChainStage[] = []

  // ① Impact — RFP + 기획 방향(의도)이 확정되면 완료
  if (inputs.hasIntent) completedStages.push('impact')

  // ② Input — 예산 또는 코치 둘 중 하나만 있어도 "자원 정리 착수" 로 간주
  if (inputs.hasBudget || inputs.hasCoaches) completedStages.push('input')

  // ③ Output — RFP 파싱(요구 산출물) 파악이 되었으면 partial 완료
  // 제안서까지 생성되면 full 완료지만, 단계 배지에서는 둘 다 "완료" 로 표기
  if (inputs.hasIntent || inputs.hasProposalSections) completedStages.push('output')

  // ④ Activity — 커리큘럼이 있으면 완료
  if (inputs.hasCurriculum) completedStages.push('activity')

  // ⑤ Outcome — Logic Model outcome 초안 + SROI 모두 있어야 "수렴" 완료
  if (inputs.hasOutcomeDraft && inputs.hasSroi) completedStages.push('outcome')

  return {
    currentStage,
    completedStages,
    hasSroi: inputs.hasSroi,
    loopChecks: null, // loop-alignment.ts 에서 이후 주입
  }
}

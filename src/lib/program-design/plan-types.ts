/**
 * BR-3a — 프로그램 기획 엔진 타입 (ProgramPlan · DecisionLog · Gate)
 *
 * 정본: docs/UD-Brain-CurriculumDesignLogic-v1.2.html
 *   §04 운영유형 T1~T5 · §05 흐름문법 · §08 D0~D8 · §09 출력 형태(결정로그 + 회차표/구조).
 * 계약: docs/decisions/028-program-design-grammar.md 추록 3 (DesignRule·해소 우선순위).
 *
 * ⚠️ 이건 "프로그램 기획"을 짓는 엔진의 타입이지 제안서 생성기가 아니다.
 *    Express 7섹션 schema(`src/lib/express/schema.ts`)와 무관 — 독립 레이어.
 *
 * 핵심 불변식 (브리프 BR-3a):
 *   - 운영유형(T1~T5)이 첫 분기. **T4 개별밀착 · T5 행사운영에는 회차표(SessionTable)를 만들지 않는다**
 *     (structure 가 NonSessionStructure 로 분기 — v1.2 §09-B/C).
 *   - 어떤 수치도 하드코딩하지 않는다 — 전부 DesignRule(approved) 또는 입력에서.
 *   - 결정마다 출처(source)+근거(rationale·evidence) 가 붙는다 (v1.2 §09 결정로그).
 *   - 모호하면 멈춘다 — PlanGate 로 적재, 추측 채움 금지 (턴 기반).
 */

import type { RfpSlice } from '@/lib/pipeline-context'
import type { ConceptShape } from '@/lib/program-design/concept-synth'

// ─────────────────────────────────────────────────────────────────
// 운영 유형 (v1.2 §04) — 회차표보다 먼저 정하는 첫 분기
// ─────────────────────────────────────────────────────────────────

/**
 * 운영 유형 5종 (v1.2 §04).
 *   - T1 정규 강좌형 (매주 만남)
 *   - T2 몰입 캠프형 (며칠 몰아치기 — 청년·청소년 전용)
 *   - T3 장기 여정형 (킥오프+정기+행사 조합 — 지향 모델)
 *   - T4 개별 밀착형 (정기 회차표 없음 — 소상공인·재창업)
 *   - T5 행사 운영형 (교육 회차 최소 — 경진대회·박람회 대행)
 */
export type OperatingType = 'T1' | 'T2' | 'T3' | 'T4' | 'T5'

export const OPERATING_TYPES: readonly OperatingType[] = [
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
] as const

/** 회차표(SessionTable)를 만드는 유형 — T1~T3 만. T4/T5 는 NonSessionStructure. */
export const SESSION_TABLE_TYPES: readonly OperatingType[] = ['T1', 'T2', 'T3'] as const

/** 이 운영 유형이 회차표를 쓰는가? (v1.2 §09 — T4/T5 는 false) */
export function usesSessionTable(t: OperatingType): boolean {
  return SESSION_TABLE_TYPES.includes(t)
}

// ─────────────────────────────────────────────────────────────────
// 결정 출처 (해소 우선순위, 추록 3)
// ─────────────────────────────────────────────────────────────────

/**
 * 결정 출처 — 어디서 이 값이 나왔는지 (해소 우선순위, 추록 3).
 *   precedent / intent : ① 담당자 의도 + 선례 (최우선 토대)
 *   goal / rfp / human : ② 클라이언트 목표 · RFP 명시 · 사람 게이트 응답
 *   rule               : ③ approved DesignRule 기본값 (빈칸만 채움)
 */
export type DecisionSource =
  | 'precedent'
  | 'intent'
  | 'goal'
  | 'rfp'
  | 'human'
  | 'rule'

/** 결정 단계 — v1.2 §08 D0~D8. */
export type DecisionStep =
  | 'D0' // 목표 (성공 지표 정의)
  | 'D1' // 운영 유형 선택 (회차표보다 먼저)
  | 'D2' // 사전학습 / 선발
  | 'D3' // 킥오프
  | 'D4' // 본체 (퀘스트·세션)
  | 'D5' // 코칭
  | 'D6' // 특강·옵션 레이어
  | 'D7' // 발표·행사·연계
  | 'D8' // 검수 게이트

/**
 * 결정 로그 1건 — 각 결정에 출처+근거 (v1.2 §09 결정로그).
 * **근거 없는 결정 금지** — rationale 필수, evidence.source 필수.
 */
export interface DecisionLogEntry {
  step: DecisionStep
  /** 축 경로 또는 결정 대상 (예: 'operatingType', 'cadence.totalSessions'). */
  axis: string
  /** 무엇으로 정했는지 (한국어 한 줄). */
  decision: string
  /** 왜 그렇게 정했는지 (v1.2 로직 또는 입력 근거). */
  rationale: string
  /** 근거 출처 (규칙 evidence 또는 입력 인용). */
  evidence: { source: string; stat?: string; n?: number }
  /** 이 결정에 기여한 DesignRule id 목록 (rule source 일 때). */
  ruleIds: string[]
  /** 해소 우선순위상의 출처. */
  source: DecisionSource
  /**
   * auto_unless_conflict 규칙이 상위값과 충돌해 양보한 경우의 메모 (있으면).
   * 예: "규칙 회차 상한 10이지만 RFP가 20회 명시 → 규칙 무시, RFP 채택".
   */
  conflictNote?: string
}

// ─────────────────────────────────────────────────────────────────
// 결정 게이트 (턴 기반 — 모호하면 멈춤)
// ─────────────────────────────────────────────────────────────────

/**
 * 사람에게 묻는 결정 게이트 — 모호하거나 approved 규칙이 없는 축.
 * UI(BR-3b)가 응답을 `input.decisions[axis]` 로 다시 넣어 재호출한다 (턴 기반).
 *
 * **게이트가 남았는데 AI로 추측해 채우지 않는다** — 멈추고 반환.
 */
export interface PlanGate {
  /** 결정 축 (decisions 키와 일치 — 응답이 이 키로 들어온다). */
  axis: string
  /** 결정 단계 (D0~D8) — UI 정렬·맥락용. */
  step: DecisionStep
  /** 사람에게 보일 질문. */
  question: string
  /** 선택지 (있으면 — discriminator·set 등). */
  options?: unknown[]
  /** 권장 기본값 (규칙에서 — 있으면 미리보기). */
  recommended?: unknown
  /** 이 게이트를 띄운 규칙 id (있으면). */
  ruleId?: string
  /** 왜 사람에게 묻는지 (모호/규칙없음/ask_human/충돌). */
  why: string
  /** 게이트 사유 유형 — UI 분류·정렬용. */
  reason: 'ask_human' | 'no_approved_rule' | 'ambiguous_signal' | 'conflict'
}

// ─────────────────────────────────────────────────────────────────
// 구조 (운영유형 분기 — v1.2 §09)
// ─────────────────────────────────────────────────────────────────

/** 회차 1건 (T1~T3 회차표). 수치는 전부 resolved 값 — 하드코딩 아님. */
export interface PlanSession {
  /** 회차/주차 라벨 (예: 'W1', 'W4', '세션 1'). */
  no: string
  title: string
  /** 시간(h) — resolved hoursPerSession 등에서. 모르면 null (추측 금지). */
  hours: number | null
  /** 진행 형식 (예: '오프라인 3h', '온라인', '합숙'). */
  format: string
  /** 회차 종류 (흐름문법 C 규칙 배치 검증용). */
  kind: 'theory' | 'workshop' | 'coaching' | 'event' | 'milestone' | 'prelearning'
  /** 이 회차가 왜 여기에 있는지 (흐름문법 근거 등). */
  rationale: string
}

/** T1~T3 — 회차표 구조. */
export interface SessionTable {
  kind: 'sessions'
  sessions: PlanSession[]
}

/** 비회차 단계 1건 (T4 개별 여정 / T5 행사 설계). */
export interface NonSessionStage {
  label: string
  content: string
  rationale: string
}

/**
 * T4/T5 — 회차표가 **아닌** 구조 (v1.2 §09-B/C).
 *   - individual : 개별 여정 (진단방문·공통접점·개별컨설팅·AI코치)
 *   - event      : 행사 설계 단계
 */
export interface NonSessionStructure {
  kind: 'individual' | 'event'
  stages: NonSessionStage[]
}

/** 구조 미정 (게이트 남아 구조 생성을 멈춘 placeholder). */
export interface PendingStructure {
  kind: 'pending'
  /** 왜 비었는지 (게이트 N건 미해소 등). */
  note: string
}

export type PlanStructure = SessionTable | NonSessionStructure | PendingStructure

// ─────────────────────────────────────────────────────────────────
// 입력 (PlanInput)
// ─────────────────────────────────────────────────────────────────

/**
 * 선례 — 이전 진행(결과보고서·과거 제안서). 있으면 해소 우선순위 1순위.
 * 자유 텍스트 + 축별 구조값(있으면) 모두 허용.
 */
export interface PrecedentInput {
  /** 자유 텍스트 요약 (작년엔 어떻게 했는지 등). */
  summary?: string
  /** 축별 명시값 (예: { operatingType: 'T3', 'cadence.totalSessions': 10 }). */
  decisions?: Record<string, unknown>
}

/**
 * 담당자 운영 의도 — 담당자가 원하는 운영 방식. 있으면 해소 우선순위 1순위.
 */
export interface IntentInput {
  summary?: string
  decisions?: Record<string, unknown>
}

/**
 * 엔진 입력. precedent/intent 는 선택 — 있으면 규칙보다 우선 (추록 3).
 */
export interface PlanInput {
  rfp: RfpSlice
  /** 선례 (이전 진행) — 있으면 1순위. */
  precedent?: PrecedentInput
  /** 담당자 운영 의도 — 있으면 1순위. */
  intent?: IntentInput
  /**
   * ADR-031 W4 — 프로그램 컨셉(strategicNotes.concept). **결정·수치에는 영향 없음**(엔진 로직 무변경).
   * 회차/단계 rationale 프롬프트에 컨셉 블록을 주입해 메시지를 일관 관통시키는 컨텍스트 전용.
   * 부재 시 블록 생략(graceful).
   */
  concept?: ConceptShape
  /**
   * 사람 게이트 응답 + RFP 외 명시 결정 (턴 기반 재호출 시 누적).
   * axis → 값. resolvePlan 이 이 값을 source='human'(게이트 응답)으로 채택.
   */
  decisions?: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────
// 산출 (ProgramPlan)
// ─────────────────────────────────────────────────────────────────

export interface ProgramPlanMeta {
  /** 소비한 approved 규칙 수 (graceful 증명 — 0이면 게이트가 많아진다). */
  approvedRuleCount: number
  /** 전체 로드된 규칙 수 (approved + draft + rejected). */
  totalRuleCount: number
  /** 구조 생성(AI)이 실행됐는지. 게이트가 남으면 false. */
  structureGenerated: boolean
  /** AI 조립에 쓰인 모델 (있으면). */
  model?: string
  /** 생성 시각 (ISO). */
  generatedAt: string
}

/**
 * 프로그램 기획 1차안.
 *   - operatingType : 운영 유형 (미정이면 undefined — 게이트로 남음)
 *   - decisionLog   : 자동 해소된 결정들 (각 출처·근거)
 *   - openGates     : 사람에게 물어야 하는 결정들 (남아 있으면 구조 생성 중단)
 *   - structure     : 회차표(T1~T3) | 비회차(T4/T5) | pending(게이트 남음)
 */
export interface ProgramPlan {
  operatingType?: OperatingType
  decisionLog: DecisionLogEntry[]
  openGates: PlanGate[]
  structure: PlanStructure
  meta: ProgramPlanMeta
}

/** resolvePlan 의 결정론 산출 (AI 없음). */
export interface ResolveResult {
  decided: DecisionLogEntry[]
  gates: PlanGate[]
  operatingType?: OperatingType
}

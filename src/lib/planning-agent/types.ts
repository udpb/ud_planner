/**
 * Planning Agent — Core Types (v2: 채널 인식)
 *
 * 설계 철학:
 * 1. 사업 채널(bid/lead/renewal)이 전체 워크플로우를 결정
 * 2. 각 채널은 다른 입력 형태를 받고, 다른 전처리를 거침
 * 3. PlanningIntent는 모든 채널의 산출물 (공통 슬롯 + 채널별 컨텍스트)
 * 4. 수동 입력 단계(renewal의 Phase 1)는 텔레메트리를 남겨 향후 자동화 설계에 활용
 */

import type { RfpParsed } from '@/lib/claude'

// ═════════════════════════════════════════
// CHANNEL & MODE
// ═════════════════════════════════════════

/**
 * 사업 발굴 채널. 각 채널은 Agent의 입력 형태와 초기 플로우를 결정한다.
 */
export type ProjectChannel = 'bid' | 'lead' | 'renewal'

export const CHANNEL_LABELS: Record<ProjectChannel, string> = {
  bid: '나라장터 입찰',
  lead: 'B2B 영업 리드',
  renewal: '연속 사업',
}

/**
 * 채널 소스 — 각 채널 내에서 더 구체적인 발견 경로.
 */
export type ChannelSource =
  // bid 채널
  | 'nara_bot'           // 봇 데일리 스크리닝
  | 'nara_manual'        // 수동 검색
  | 'bid_tip_off'        // 내부 정보 / 업계 귀띔
  // lead 채널
  | 'outbound_search'    // 우리가 영업 검색해서 발굴
  | 'outbound_call'      // 콜드 콜
  | 'outbound_email'     // 콜드 이메일
  | 'inbound_referral'   // 지인/파트너 추천
  | 'inbound_web'        // 웹 문의
  | 'inbound_event'      // 행사/세미나 후 접촉
  // renewal 채널
  | 'renewal_same_client' // 같은 고객사의 내년도 사업
  | 'renewal_extension'   // 기존 사업의 확장판
  // 기타
  | 'unknown'

/**
 * 채널 메타데이터 — 모든 Intent에 공통으로 포함.
 */
export interface ChannelMeta {
  type: ProjectChannel
  source: ChannelSource
  sourceDetail?: string       // 자유 텍스트 추가 설명
  discoveredAt: string        // ISO
  assignedPm?: string         // PM 이름/ID
  botTags?: string[]          // 봇 스크리닝 태그 (예: ["실적 확인 필요", "유디·뉴키즈·에프랩"])
}

// ═════════════════════════════════════════
// CHANNEL-SPECIFIC CONTEXTS
// ═════════════════════════════════════════

// ─────────────────────────────────────────
// [A] 입찰 모드 컨텍스트
// ─────────────────────────────────────────

/**
 * Agent가 RFP 분석 후 생성하는 "담당자 확인 포인트".
 * PM이 발주기관에 전화할 때 체크리스트로 사용.
 * 강제 아님 — 공개 입찰이면 스킵 가능.
 */
export interface VerificationPoint {
  id: string
  category:
    | '평가배점'       // 배점 해석
    | '대상'           // 참여자 기준
    | '예산'           // 금액/지급 방식
    | '운영'           // 교육 형식
    | '평가위원'       // 심사 구조
    | '일정'           // 일정 관련
    | '경쟁'           // 경쟁 상황
    | '과거이력'       // 전년도 수주 이력
  priority: 'high' | 'medium' | 'low'
  /** 담당자에게 물을 질문 */
  question: string
  /** 왜 이걸 물어봐야 하는지 (Agent의 판단 근거) */
  rationale: string
  /** Agent의 예상 답변 (선택 — 실제 답변과 비교용) */
  expectedAnswer?: string
  /** 처리 상태 */
  status: 'pending' | 'answered' | 'skipped' | 'no_response'
  /** PM이 통화 후 입력한 실제 답변 */
  actualAnswer?: string
  /** 답변 기록 시각 */
  answeredAt?: string
}

export interface BidContext {
  /** 파싱된 RFP 정보 */
  rfpFacts: RfpParsed
  /** RFP 원본 텍스트 */
  rfpRawText?: string
  /** Agent가 생성한 담당자 확인 포인트 (선택) */
  verificationChecklist: VerificationPoint[]
  /** 담당자 통화 완료 여부 */
  phoneCallCompleted: boolean
  /** 통화 결과 전체 요약 (PM 자유 입력) */
  callSummary?: string
}

// ─────────────────────────────────────────
// [B] B2B 리드 모드 컨텍스트
// ─────────────────────────────────────────

/**
 * 영업 리드 폼 기반 구조화 데이터.
 * 필드는 고정 — 모두 스크린샷의 폼 기반.
 */
export interface LeadContact {
  name: string
  email: string
  phone: string
  department: string
  position: string
}

export interface LeadContext {
  clientName: string
  clientType: '기관' | '기업' | '재단' | '정부' | '대학' | '기타'
  country: string
  contact: LeadContact

  /** 언더독스를 알게 된 경로 */
  awarenessChannel: string
  /** 경로 상세 (자유 텍스트 — "넥스트로컬 운영사로 인지하여 서치 후 전화" 등) */
  awarenessDetail: string

  /** 사업/교육 목적 (KPI) */
  objectives: string
  /** 희망 인원수 (미확정 시 null) */
  desiredHeadcount: number | null
  /** 사업 기간 (자유 텍스트 — "2026.7.2~7.4 3일간" 등 비정형 허용) */
  projectPeriodText: string
  /** 예산 규모 (VAT 제외) */
  budgetExcludingVat: number | null
  /** 지급 형태/증빙 */
  paymentTerms: string

  /** Follow Up 예상 과업 내용 */
  expectedTasks: string

  /**
   * 비정형 히스토리 누적 — 여러 번 소통한 경우 여기에 계속 붙임.
   * 미팅 노트, 통화 요약, 이메일 교환, PM 메모 등 자유 형식.
   */
  interactionHistory: string
}

// ─────────────────────────────────────────
// [C] 연속 사업 모드 컨텍스트
// ─────────────────────────────────────────

/**
 * 작년 사업의 정량 실적.
 * Phase 1: PM 수동 입력.
 * Phase 2+: DB 매칭.
 * Phase 4+: 크롤링.
 */
export interface PreviousProjectResults {
  applicantCount?: number           // 지원자 수
  enrolledCount?: number            // 참여 확정 수
  completedCount?: number           // 수료자 수
  completionRate?: number           // 수료율 (%)
  satisfactionAvg?: number          // 만족도 평균 (5점 만점)
  startupConversionCount?: number   // 창업 전환 수
  investmentCount?: number          // 투자 유치 건수
  revenueGeneratedCount?: number    // 매출 발생 팀 수
  /** 추가 KPI (자유 키-값) */
  additionalKPIs?: Record<string, string | number>
  /** 정량화 안 되는 결과 메모 */
  freeFormNotes?: string
}

/**
 * 작년 사업의 질적 레슨런드.
 * 제안서 작성에 직접 반영되는 핵심 자산.
 */
export interface LessonsLearned {
  /** 잘 된 점 (올해도 유지할 요소) */
  whatWorked: string[]
  /** 아쉬웠던 점 */
  whatDidntWork: string[]
  /** 근본 원인 분석 (선택) */
  rootCauses?: string[]
  /** 올해 개선안 */
  improvementsThisYear: string[]
}

/**
 * Phase 1에서는 수동 입력 → 텔레메트리 수집 → Phase 2+에서 자동화 설계에 활용.
 */
export interface RenewalInputTelemetry {
  /** 입력 방식 — Phase 1에서는 'manual' */
  inputMethod: 'manual' | 'db_match' | 'crawled' | 'hybrid'
  /** 입력 시작/종료 시각 */
  inputStartedAt: string
  inputCompletedAt?: string
  /** 각 필드에 걸린 시간 (ms) — 어떤 필드가 답변하기 어려웠는지 파악 */
  fieldDurationMs?: Record<string, number>
  /** 채워진 필드 수 */
  fieldsFilledCount: number
  /** 건너뛴 필드 수 */
  fieldsSkippedCount: number
  /** 자유 텍스트 필드의 문자 수 — 어디에 가장 많이 썼는지 */
  freeFormCharCounts?: Record<string, number>
  /** PM이 사용한 키워드 패턴 — 나중에 크롤러가 찾아야 할 것 힌트 */
  commonKeywords?: string[]
  /** PM이 "이건 자료 있었으면 좋았을 것" 등 피드백 */
  userNotes?: string
}

export interface RenewalContext {
  previousProjectName: string
  previousProjectYear: number
  previousBudget?: number
  previousClient: string              // 같은 클라이언트인지 다른지 판단용
  isSameClient: boolean

  /** 정량 실적 */
  previousResults: PreviousProjectResults
  /** 질적 레슨런드 */
  lessonsLearned: LessonsLearned
  /** 올해 버전의 제안서에서 강조할 "연속성 메시지" (자유 텍스트) */
  continuityStrategy?: string
  /** 클라이언트가 올해 특별히 요구한 변경사항 */
  clientChangeRequests: string[]

  /** 텔레메트리 (Phase 1 수동 입력 학습용) */
  _telemetry: RenewalInputTelemetry
}

// ═════════════════════════════════════════
// STRATEGIC CONTEXT (공통 슬롯)
// ═════════════════════════════════════════

/**
 * 모든 채널이 공통으로 채우는 전략적 맥락.
 * 이게 제안서의 핵심 메시지를 결정.
 *
 * 슬롯 수를 8→7로 정리:
 * - 기존 whyUs + internalAdvantage 합침 → participationDecision
 * - competitorWeakness, mustNotFail, clientHiddenWants 유지
 * - riskFactors, decisionMakers, pastSimilarProjects 유지
 */
export type StrategicSlot =
  | 'participationDecision'  // 왜 이 사업에 들어가는가 + 이길 수 있다고 본 구체적 경쟁력
  | 'clientHiddenWants'      // 발주기관/고객이 진짜 원하는 것 (명시되지 않은)
  | 'mustNotFail'            // 절대 실패하면 안 되는 지점
  | 'competitorWeakness'     // 경쟁사 + 그들의 약점
  | 'riskFactors'            // 외적/내적 위험 요소
  | 'decisionMakers'         // 의사결정자 / 선정 패턴
  | 'pastSimilarProjects'    // 과거 비슷한 사업 경험 (renewal 모드면 자동)

export const STRATEGIC_SLOTS: StrategicSlot[] = [
  'participationDecision',
  'clientHiddenWants',
  'mustNotFail',
  'competitorWeakness',
  'riskFactors',
  'decisionMakers',
  'pastSimilarProjects',
]

/**
 * 각 슬롯의 실제 값.
 * 대부분 자유 텍스트. riskFactors만 배열 (복수 위험).
 */
export interface StrategicContext {
  participationDecision: string
  clientHiddenWants: string
  mustNotFail: string
  competitorWeakness: string
  riskFactors: string[]
  decisionMakers: string
  pastSimilarProjects: string
}

// ═════════════════════════════════════════
// DERIVED STRATEGY (Agent가 종합 후 도출)
// ═════════════════════════════════════════

export interface DerivedStrategy {
  // ── 기존 필드 (호환성 유지) ──
  keyMessages: string[]
  differentiators: string[]
  coachProfile: string
  sectionVBonus: string[]
  riskMitigation: string[]

  // ── NEW: RFP 심층 분석 ──
  rfpAnalysis?: {
    evalCriteriaStrategy: Array<{
      item: string
      score: number
      pageAllocation: string
      emphasis: string
      evidenceNeeded: string
    }>
    clientIntentInference: string
    hiddenRequirements: string[]
    clarificationNeeded: string[]
  }

  // ── NEW: 전략적 포지셔닝 ──
  positioning?: {
    oneLiner: string
    whyUnderdogs: string
    competitiveMap: string
  }

  // ── NEW: 커리큘럼 설계 방향 ──
  curriculumDirection?: {
    designPrinciple: string
    impactEmphasis: string[]
    weeklyOutline: Array<{
      week: string
      focus: string
      keyActivity: string
    }>
    formatMix: string
  }

  // ── NEW: 평가 전략 ──
  evalStrategy?: {
    pageDistribution: Array<{
      section: string
      pages: string
      reason: string
    }>
    presentationTips: string[]
  }

  // ── NEW: 예산 가이드라인 ──
  budgetGuideline?: {
    overallApproach: string
    majorCategories: Array<{
      category: string
      allocation: string
      rationale: string
    }>
  }

  // ── NEW: 리스크 매트릭스 ──
  riskMatrix?: Array<{
    risk: string
    probability: 'high' | 'medium' | 'low'
    impact: 'high' | 'medium' | 'low'
    mitigation: string
    owner: string
  }>
}

// ═════════════════════════════════════════
// INTENT METADATA
// ═════════════════════════════════════════

export interface IntentMetadata {
  /** 0-100 완전성 점수 */
  completeness: number
  /** 신뢰도 */
  confidence: 'low' | 'medium' | 'high'
  /** 지금까지 진행한 턴 수 */
  turnsCompleted: number
  /** 아직 못 채운 슬롯 */
  unfilledSlots: StrategicSlot[]
  /** 시각 */
  startedAt: string
  updatedAt: string
  /** 완료 여부 */
  isComplete: boolean
}

// ═════════════════════════════════════════
// PLANNING INTENT (Agent 메인 산출물)
// ═════════════════════════════════════════

export interface PlanningIntent {
  /** 채널 메타 */
  channel: ChannelMeta

  /** 채널별 컨텍스트 (하나만 채워짐) */
  bidContext?: BidContext
  leadContext?: LeadContext
  renewalContext?: RenewalContext

  /** 공통 전략 슬롯 */
  strategicContext: StrategicContext

  /** Agent가 종합 후 도출한 전략 (인터뷰 완료 전에는 null) */
  derivedStrategy: DerivedStrategy | null

  /** 메타데이터 */
  metadata: IntentMetadata
}

/**
 * 인터뷰 진행 중에는 strategicContext 일부가 비어있을 수 있음.
 */
export interface PartialPlanningIntent {
  channel: ChannelMeta
  bidContext?: BidContext
  leadContext?: LeadContext
  renewalContext?: RenewalContext
  strategicContext: Partial<StrategicContext>
  derivedStrategy: DerivedStrategy | null
  metadata: IntentMetadata
}

// ═════════════════════════════════════════
// QUESTION (Agent가 던지는 질문)
// ═════════════════════════════════════════

export interface Question {
  id: string
  slot: StrategicSlot
  /** 우선순위: core(반드시) / optional(여유 있을 때) */
  priority: 'core' | 'optional'
  /** 채널별 프레이밍 — 같은 슬롯이라도 채널에 따라 질문 문장이 달라짐 */
  prompt: {
    bid: string
    lead: string
    renewal: string
  }
  /** 답변 예시 — 채널별로 맞춤 예시 */
  examples: {
    bid: string[]
    lead: string[]
    renewal: string[]
  }
  /** 이 질문이 왜 중요한지 (PM에게 보여줄 수 있음) */
  rationale: string
  /** 답변 길이 가이드 */
  lengthGuide: string
  /** 답변 품질 체크 힌트 — Agent가 답변 평가 시 참고 */
  qualityHints?: string[]
}

// ═════════════════════════════════════════
// AGENT STATE (대화 상태)
// ═════════════════════════════════════════

export type MessageRole = 'agent' | 'user' | 'system'

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: string
  questionId?: string
  filledSlots?: StrategicSlot[]
}

export type AgentStatus =
  | 'idle'              // 시작 전
  | 'preprocessing'     // 채널 전처리 중 (RFP 파싱, 리드 폼 파싱 등)
  | 'interviewing'      // 질문-답변 진행
  | 'synthesizing'      // derivedStrategy 생성 중
  | 'completed'         // 완료
  | 'paused'            // 일시 중단

export interface AgentState {
  sessionId: string
  projectId?: string
  intent: PartialPlanningIntent
  history: Message[]
  status: AgentStatus
  /** 현재 PM에게 물어보고 있는 질문 */
  currentQuestion: Question | null
  /** 이미 물어본 질문 ID들 (중복 방지) */
  askedQuestionIds: string[]
  /** 질문별 재질문 횟수 — 1번 재질문 후엔 그대로 받아들이기 */
  followupCountByQuestion: Record<string, number>
  createdAt: string
  updatedAt: string
}

// ═════════════════════════════════════════
// AGENT TURN (입력/출력)
// ═════════════════════════════════════════

/**
 * runAgentTurn()의 입력. 3가지 시나리오:
 * 1. 새 세션 시작: state 없이 channelInput 전달 → 채널 전처리 → 첫 질문
 * 2. 사용자 답변: state + userMessage → 답변 추출 → 다음 질문 or 종료
 * 3. 질문 스킵: state + skipCurrentQuestion → 다음 질문
 */
export type ChannelInput =
  | { channel: 'bid'; rfpText: string; meta: Partial<ChannelMeta> }
  | { channel: 'lead'; leadData: Omit<LeadContext, 'interactionHistory'> & { interactionHistory?: string }; meta: Partial<ChannelMeta> }
  | { channel: 'renewal'; renewalData: Omit<RenewalContext, '_telemetry'>; meta: Partial<ChannelMeta> }

export interface AgentTurnInput {
  state?: AgentState
  channelInput?: ChannelInput     // 새 세션 시작 시 필수
  userMessage?: string            // 사용자 답변
  skipCurrentQuestion?: boolean   // 건너뛰기
  projectId?: string
}

export interface AgentTurnOutput {
  state: AgentState
  agentMessage: Message
  isComplete: boolean
  finalIntent?: PlanningIntent    // 완료 시에만
}

// ═════════════════════════════════════════
// SLOT EXTRACTION (답변 → 슬롯 값)
// ═════════════════════════════════════════

export interface SlotExtraction {
  /** 질문한 슬롯에 대한 주요 답변 */
  primarySlot: StrategicSlot
  primaryValue: string
  /** 한 답변으로 부수적으로 채워진 다른 슬롯들 */
  secondarySlots: Array<{
    slot: StrategicSlot
    value: string
    confidence: 'low' | 'medium' | 'high'
  }>
  /** 답변 품질 평가 */
  quality: {
    isSpecific: boolean
    isActionable: boolean
    hasSubstance: boolean         // 실질 내용 vs 회피/모호함
    needsFollowup: boolean
    followupSuggestion?: string   // 어떻게 다시 물을지
    /** 답변에 의미있는 정보가 있지만, 더 파면 가치가 있는 포인트가 있는가? */
    worthDigging?: boolean
    /** worthDigging=true일 때, 구체적으로 어떤 각도로 파고들지 */
    deepFollowupQuestion?: string
  }
}

// ═════════════════════════════════════════
// TOOLS (Agent가 사용 가능한 도구)
// ═════════════════════════════════════════

export type ToolName =
  | 'analyzeRfpCompleteness'
  | 'generateVerificationChecklist'  // bid 모드 전용
  | 'parseLeadForm'                   // lead 모드 전용
  | 'loadPreviousProject'             // renewal 모드 전용 (Phase 1: manual)
  | 'suggestNextQuestion'
  | 'evaluateAnswer'
  | 'synthesizeStrategy'

export interface ToolCall {
  name: ToolName
  input: Record<string, unknown>
}

export interface ToolResult {
  name: ToolName
  output: unknown
  error?: string
}

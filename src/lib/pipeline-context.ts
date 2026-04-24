/**
 * PipelineContext — 파이프라인 6단계 산출물의 단일 계약 객체
 *
 * 설계 원칙 (docs/architecture/data-contract.md 참조):
 * - 모듈 간 직접 호출 금지 → PipelineContext 슬라이스를 통한 간접 연결
 * - 한 번 생산된 정보는 다시 묻지 않는다 (manifest.reads / writes 로 경계 선언)
 * - DB 저장은 슬라이스별 분산 (Project, CurriculumItem[], CoachAssignment[] 등)
 *   → buildPipelineContext()가 런타임에 조립
 *
 * NOTE: data-contract.md §3 의 신규 Project 필드
 *       (proposalBackground / proposalConcept / keyPlanningPoints / evalStrategy /
 *        designRationale / measurementPlan / predictedScore)
 *       는 아직 schema.prisma 에 추가되지 않았다.
 *       타입에는 선언하되 런타임에서는 undefined 로 처리한다 (다른 Phase 가 마이그레이션).
 */

import { prisma } from '@/lib/prisma'

import type { ProgramProfile } from '@/lib/program-profile'

import type {
  ValueChainState,
  LoopAlignmentChecks,
} from '@/lib/value-chain'

import type {
  RfpParsed,
  LogicModel,
  LogicModelItem,
  CurriculumSession as ClaudeCurriculumSession,
  ExternalResearch,
  StrategicNotes,
} from '@/lib/claude'

import type {
  RuleValidationResult,
  RuleViolation,
} from '@/lib/curriculum-rules'

// ─────────────────────────────────────────
// SSoT 재수출 (다른 모듈은 여기서 import 해도 OK)
// ─────────────────────────────────────────

export type {
  RfpParsed,
  LogicModel,
  LogicModelItem,
  ExternalResearch,
  StrategicNotes,
  RuleValidationResult,
  RuleViolation,
  ValueChainState,
  LoopAlignmentChecks,
}

/**
 * 커리큘럼 세션 단일 정의 — claude.ts 의 CurriculumSession 을 SSoT 로 사용.
 * (LLM 응답 / DB CurriculumItem / 슬라이스 모두 같은 모양)
 */
export type CurriculumSession = ClaudeCurriculumSession

/**
 * 외부 LLM 리서치 항목 (PipelineContext.research[]).
 * 기존 ExternalResearch 와 동일 모양 — 명시성 위해 alias.
 */
export type ResearchItem = ExternalResearch

// ═════════════════════════════════════════
// 1. 슬라이스 하위 타입 (data-contract.md §1.2)
// ═════════════════════════════════════════

// ───── RFP 슬라이스 하위 ─────

/**
 * 제안서 섹션 키 — EvalStrategy 및 pm-guide 매핑 기준.
 * (data-contract.md §1.2 EvalStrategy / eval-strategy.ts SECTION_KEYWORDS 와 일치)
 */
export type ProposalSectionKey =
  | 'proposal-background'
  | 'org-team'
  | 'curriculum'
  | 'coaches'
  | 'budget'
  | 'impact'
  | 'other'

/**
 * 평가 전략 — 최고배점·섹션매핑·가중치·가이드.
 * Step 1D 에서 PM 이 평가표를 분석한 결과.
 *
 * (data-contract.md §1.2 EvalStrategy 기준, 2026-04-15 SSoT 정비 반영)
 * - topItems: 상위 3 항목을 섹션 매핑·weight·guidance 와 함께
 * - sectionWeights: 섹션별 총 점수 비중
 * - overallGuidance: PM 에게 보여줄 다줄 가이드 메시지
 * - criteria/topItem/summary: 하위호환용 optional 필드 (축약 뷰가 필요할 때만)
 */
export interface EvalStrategy {
  /** 최고 배점 상위 N 항목 (기본 3) */
  topItems: Array<{
    name: string
    points: number
    section: ProposalSectionKey
    /** 전체 대비 가중치 (0~1) */
    weight: number
    /** PM 에게 보여줄 한 줄 가이드 */
    guidance: string
  }>
  /** 섹션별 총 가중치 (모든 섹션 키 포함, 0~1) */
  sectionWeights: Record<ProposalSectionKey, number>
  /** 전체 가이드 메시지 2~4개 */
  overallGuidance: string[]

  // ── 하위호환 (optional) ─────────────────────────
  /** 전체 항목 상세 (topItems 보다 포괄적이어야 할 때) */
  criteria?: Array<{
    item: string
    score: number
    section: string
    weight: number
    emphasis?: string
  }>
  /** 최고배점 항목명 축약 (topItems[0].name 과 동일할 수 있음) */
  topItem?: string
  /** overallGuidance 를 한 줄로 축약한 것 */
  summary?: string
}

/**
 * 유사 프로젝트 — past-projects 자산에서 매칭된 결과.
 * (data-contract.md §1.2 + Phase A 실용 필드 결합, 2026-04-15 SSoT 정비 반영)
 */
export interface SimilarProject {
  projectId: string
  name: string
  client: string | null
  /** 유사도 점수 (0~1) */
  similarity: number
  /** 매칭 사유 (한국어 스니펫) */
  matchReasons: string[]

  // ── data-contract.md §1.2 필드 ─────────────────
  /** 예산 (supplyPrice 기준, KRW) */
  budget?: number | null
  /** 수주 여부 (Project.isBidWon / status 에서 유도) */
  won?: boolean | null
  /** 핵심 전략 요약 (Project.proposalConcept 이 있으면 그 값) */
  keyStrategy?: string | null

  // ── Phase A 실용 필드 (유지) ─────────────────
  /** Project.isBidWon 원본 값 */
  isBidWon?: boolean | null
  /** 기술평가 점수 (과거 프로젝트 실측) */
  techEvalScore?: number | null
}

// ───── Curriculum 슬라이스 하위 ─────

/**
 * 트랙 — 커리큘럼이 여러 트랙(예: 초급/중급, A팀/B팀) 으로 분기될 때.
 */
export interface Track {
  id: string
  name: string
  description?: string
  /** 이 트랙에 속한 sessionNo 목록 */
  sessionNos?: number[]
}

// ───── Coaches 슬라이스 하위 ─────

/**
 * 코치 배정 (PipelineContext 표현 — DB CoachAssignment 와 매핑).
 */
export interface CoachAssignmentSlice {
  id: string
  coachId: string
  coachName?: string
  role: string                  // AssignmentRole enum 값 (MAIN_COACH 등)
  sessions: number
  hoursPerSession: number
  totalHours?: number | null
  agreedRate?: number | null
  totalFee?: number | null
  confirmed: boolean
  notes?: string | null
}

// ───── Budget 슬라이스 하위 ─────

/**
 * 예산 구조표 — Budget + BudgetItem[] 을 슬라이스용으로 압축.
 */
export interface BudgetStructure {
  pcTotal: number
  acTotal: number
  margin: number
  marginRate: number
  items: Array<{
    id: string
    wbsCode: string
    type: 'PC' | 'AC'
    category: string
    name: string
    unit?: string | null
    unitPrice: number
    quantity: number
    amount: number
    notes?: string | null
  }>
}

/**
 * SROI 예측 — Project.sroiForecast JSON 의 정형화된 모양.
 * 실제 계산 로직은 budget-sroi 모듈에서 정의. 여기서는 "어떤 모양인지"만 선언.
 */
export interface SroiForecast {
  /** 총 SROI 가치 (KRW) */
  totalValueKrw: number
  /** SROI 비율 (총가치 / 투입예산) */
  ratio: number
  /** 임팩트 유형별 분해 */
  breakdown?: Array<{
    impactType: string
    subType?: string
    proxyKrw: number
    quantity: number
    contributionKrw: number
  }>
  /** 가정·근거 */
  assumptions?: string[]
  /** 기준 국가 (Project.sroiCountry) */
  country?: string
}

/**
 * 벤치마크 — 유사 사업의 예산·SROI 비교 결과.
 */
export interface BenchmarkResult {
  /** 비교 대상 프로젝트 수 */
  comparedCount: number
  /** 평균 단가 (인당 KRW 등) */
  averageUnitCost?: number
  /** 우리 사업의 단가 */
  ourUnitCost?: number
  /** 평균 SROI 비율 */
  averageSroiRatio?: number
  /** 권고 / 코멘트 */
  comments?: string[]
}

/**
 * 예산 룰 엔진 경고 (cost-standards 자산 + budget-sroi 룰).
 */
export interface BudgetWarning {
  ruleId: string
  severity: 'BLOCK' | 'WARN' | 'SUGGEST'
  message: string
  affectedItems?: string[]   // BudgetItem.wbsCode 또는 id
}

// ───── Impact 슬라이스 하위 ─────

/**
 * 측정 계획 항목 — Project.measurementPlan JSON 배열 요소.
 */
export interface MeasurementItem {
  /** 어느 Logic Model 항목에 대한 측정인지 (LogicModelItem.id) */
  logicModelItemId: string
  /** 측정 지표명 */
  indicator: string
  /** 측정 방법 (설문/관찰/시스템 데이터 등) */
  method: string
  /** 측정 시점 (사전/사후/추적) */
  timing: 'PRE' | 'POST' | 'FOLLOWUP' | 'ONGOING'
  /** 목표값 */
  target?: string | number
  /** 단위 */
  unit?: string
  /** 책임자 */
  owner?: string
  /** 비고 */
  notes?: string
}

// ───── Proposal 슬라이스 하위 ─────

/**
 * 제안서 섹션 (PipelineContext 표현 — DB ProposalSection 과 매핑).
 */
export interface ProposalSectionSlice {
  id: string
  sectionNo: number
  title: string
  content: string
  version: number
  isApproved: boolean
}

/**
 * 점수 시뮬레이션 — predicted-score 모듈 산출물.
 */
export interface ScoreSimulationResult {
  totalScore: number
  maxScore: number
  items: Array<{
    sectionNo?: number
    item: string
    expectedScore: number
    maxScore: number
    feedback?: string
    priority?: 'high' | 'medium' | 'low'
  }>
  overallFeedback?: string
  topPriority?: string
  /** 시뮬 시각 */
  simulatedAt?: string
}

/**
 * 제안서 수정 이력 — 한 줄짜리 변경 로그.
 */
export interface RevisionEntry {
  sectionNo: number
  version: number
  changedBy: string         // userId 또는 "system"
  changedAt: string         // ISO
  summary?: string          // 무엇을 바꿨는지
  diffSize?: number         // 변경 글자수 (대략)
}

// ═════════════════════════════════════════
// 2. 슬라이스 정의 (data-contract.md §1.2)
// ═════════════════════════════════════════

/**
 * Step 1: RFP + 기획 방향.
 * (Step 1A 파싱 / 1B 제안배경 / 1C 핵심포인트 / 1D 평가전략 통합)
 */
export interface RfpSlice {
  parsed: RfpParsed
  /** 제안배경 초안 (Step 1B) — 스키마 확장 전까지 undefined 가능 */
  proposalBackground?: string
  /** 한 줄 컨셉 (Step 1B) — 스키마 확장 전까지 undefined 가능 */
  proposalConcept?: string
  /** 핵심 기획 포인트 3개 (Step 1C) — 스키마 확장 전까지 undefined 가능 */
  keyPlanningPoints?: string[]
  /** 평가 전략 (Step 1D) — 스키마 확장 전까지 undefined 가능 */
  evalStrategy?: EvalStrategy
  /** 유사 프로젝트 top N — past-projects 자산이 채움 */
  similarProjects?: SimilarProject[]
  /** PM 확정 시각 (미확정이면 undefined) */
  confirmedAt?: string
}

/**
 * Planning Agent 산출물 — 전략 슬라이스.
 * PlanningIntentRecord.intentJson 에서 derive.
 */
export interface StrategySlice {
  whyUs: string
  clientHiddenWants: string
  mustNotFail: string
  competitorWeakness: string
  internalAdvantage: string
  riskFactors: string[]
  decisionMakers: string
  /** 제안서에 주입될 키 메시지 (DerivedStrategy.keyMessages) */
  derivedKeyMessages: string[]
  /** 0-100 */
  completeness: number
  confidence: 'low' | 'medium' | 'high'
}

export interface CurriculumSlice {
  tracks: Track[]
  sessions: CurriculumSession[]
  /** 설계근거 — 스키마 확장 전까지 undefined 가능 */
  designRationale?: string
  /** sessionId → moduleId (impact-modules 자산) */
  impactModuleMapping: Record<string, string>
  /** curriculum-rules 검증 결과 */
  ruleValidation: RuleValidationResult
  confirmedAt?: string
}

export interface CoachesSlice {
  assignments: CoachAssignmentSlice[]
  /** sessionNo → coachId[] */
  sessionCoachMap: Record<number, string[]>
  totalFee: number
  /** coachId → 추천 사유 (coach-matching 산출) */
  recommendationReasons: Record<string, string>
}

export interface BudgetSlice {
  structure: BudgetStructure
  marginRate: number
  sroiForecast?: SroiForecast
  benchmark?: BenchmarkResult
  /** 룰 엔진 경고 */
  warnings: BudgetWarning[]
}

export interface ImpactSlice {
  goal: string
  logicModel: LogicModel
  /** 스키마 확장 전까지 빈 배열 */
  measurementPlan: MeasurementItem[]
  /** 자동 추출 표시 — 커리큘럼/예산이 이미 있으면 true */
  autoExtracted: {
    activities: boolean   // true = 커리큘럼에서 자동 추출
    inputs: boolean       // true = 코치+예산에서 자동 추출
  }
}

export interface ProposalSlice {
  /** 7개 섹션 */
  sections: ProposalSectionSlice[]
  /** 섹션별 예상 점수 (있는 경우) */
  scoreSimulation?: ScoreSimulationResult
  /** 수정 이력 — 스키마 확장 전까지 빈 배열 */
  revisionHistory: RevisionEntry[]
}

// ═════════════════════════════════════════
// 3. PipelineContext 최상위 (data-contract.md §1.1)
// ═════════════════════════════════════════

export interface PipelineContextMeta {
  projectType: 'B2G' | 'B2B'
  channelType: 'bid' | 'renewal' | 'lead'
  /** 예측 점수 — 스키마 확장 전까지 undefined */
  predictedScore?: number
  /**
   * ProgramProfile (Phase E · ADR-006) — 11축 스펙트럼 프로파일.
   * Project.programProfile JSON 에서 derive. 누락 시 legacy channelType 경로로 폴백.
   */
  programProfile?: ProgramProfile
  /** 마지막 업데이트 시각 (Project.updatedAt) */
  lastUpdatedAt: string
  /** 마지막 업데이트한 사용자 (userId 또는 "system") */
  lastUpdatedBy: string
  /** 마지막 업데이트한 모듈 manifest.name */
  lastUpdatedModule: string
}

export interface PipelineContext {
  projectId: string
  /** 낙관적 락 — 동시 수정 충돌 감지용. 현재는 0 고정 (Phase B+ 에서 도입) */
  version: number

  // Step 1
  rfp?: RfpSlice
  strategy?: StrategySlice
  research?: ResearchItem[]

  // Step 2
  curriculum?: CurriculumSlice

  // Step 3
  coaches?: CoachesSlice

  // Step 4 (2026-04-23 개칭: "예산 설계" — ② Input 만)
  budget?: BudgetSlice

  // Step 5 (2026-04-23 재구성: "임팩트 + SROI Forecast" — ⑤ Outcome 수렴)
  impact?: ImpactSlice

  // Step 6
  proposal?: ProposalSlice

  meta: PipelineContextMeta

  /**
   * Impact Value Chain 상태 (ADR-008, 2026-04-23).
   * 5단계 논리 레이어(① Impact → ② Input → ③ Output → ④ Activity → ⑤ Outcome)
   * + 루프 얼라인 체크 결과.
   *
   * buildPipelineContext() 는 이 필드를 채우지 않는다.
   * UI/호출자가 `computeValueChainState(ctx, currentStep?)` 헬퍼로 필요한 시점에 도출.
   * 이유: currentStage 는 "현재 활성 UI 스텝" 에 따라 바뀌므로 컨텍스트 조립 시점에는 모름.
   */
  valueChainState?: ValueChainState

  /**
   * Asset Registry (ADR-009, 2026-04-24) — 이 프로젝트에 투입할 UD 자산 ID 목록.
   * matchAssetsToRfp 결과 중 PM 이 Step 1 에서 승인한 자산들.
   * Step 6 제안서 AI 가 이 ID 로 narrativeSnippet 을 조회해 섹션에 주입.
   * Phase H (ADR-010) 이후 자산 정의는 Prisma.ContentAsset 테이블에 저장되며
   * `getAllAssets()` / `findAssetById()` 로 런타임 조회.
   */
  acceptedAssetIds?: string[]
}

// ═════════════════════════════════════════
// 4. 조합 헬퍼 — buildPipelineContext()
// ═════════════════════════════════════════

/**
 * Project 단일 조회 후 관계 테이블을 병렬 조회하여
 * PipelineContext 객체로 조립한다.
 *
 * @param projectId  프로젝트 id
 * @param options.viewerId  요청 세션의 userId (meta.lastUpdatedBy 에 반영). 없으면 "system".
 * @throws Error  프로젝트가 없으면 예외.
 */
export async function buildPipelineContext(
  projectId: string,
  options: { viewerId?: string } = {},
): Promise<PipelineContext> {
  // 프로젝트 + 관계 병렬 조회
  const [project, curriculum, coachAssignments, budget, proposalSections, planningIntent] =
    await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.curriculumItem.findMany({
        where: { projectId },
        orderBy: { order: 'asc' },
      }),
      prisma.coachAssignment.findMany({
        where: { projectId },
        include: { coach: { select: { id: true, name: true } } },
      }),
      prisma.budget.findUnique({
        where: { projectId },
        include: { items: { orderBy: { wbsCode: 'asc' } } },
      }),
      prisma.proposalSection.findMany({
        where: { projectId },
        orderBy: [{ sectionNo: 'asc' }, { version: 'desc' }],
      }),
      // PlanningIntentRecord — projectId 인덱스로 최신 1건
      prisma.planningIntentRecord.findFirst({
        where: { projectId },
        orderBy: { updatedAt: 'desc' },
      }),
    ])

  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }

  // ── meta ──
  // projectType 은 Project.projectType (B2G | B2B)
  // channelType 은 PlanningIntentRecord 또는 AgentSession 에서 derive — 없으면 기본 "bid"
  const channelType = derivePlanningChannel(planningIntent) ?? 'bid'

  // ProgramProfile (Phase E) — Project.programProfile JSON 에서 derive.
  // 누락 시 undefined → resolvePmGuide 등이 legacy channelType 경로로 폴백.
  const programProfile: ProgramProfile | undefined = project.programProfile
    ? (project.programProfile as unknown as ProgramProfile)
    : undefined

  const meta: PipelineContextMeta = {
    projectType: project.projectType,
    channelType,
    predictedScore: undefined, // 스키마 확장 전까지 undefined
    programProfile,
    lastUpdatedAt: project.updatedAt.toISOString(),
    lastUpdatedBy: options.viewerId ?? 'system',
    lastUpdatedModule: 'unknown',
  }

  // ── rfp slice ──
  const rfp: RfpSlice | undefined = project.rfpParsed
    ? {
        parsed: project.rfpParsed as unknown as RfpParsed,
        proposalBackground: undefined,
        proposalConcept: undefined,
        keyPlanningPoints: undefined,
        evalStrategy: undefined,
        similarProjects: undefined,
        confirmedAt: undefined,
      }
    : undefined

  // ── strategy slice ──
  const strategy = derivePlanningStrategy(planningIntent)

  // ── research ──
  const research: ResearchItem[] | undefined = project.externalResearch
    ? (project.externalResearch as unknown as ResearchItem[])
    : undefined

  // ── curriculum slice ──
  const curriculumSlice: CurriculumSlice | undefined =
    curriculum.length > 0
      ? {
          tracks: deriveCurriculumTracks(curriculum),
          sessions: curriculum.map(toCurriculumSession),
          designRationale: undefined,
          impactModuleMapping: deriveImpactModuleMapping(curriculum),
          ruleValidation: { passed: true, violations: [] },
          confirmedAt: undefined,
        }
      : undefined

  // ── coaches slice ──
  const coachesSlice: CoachesSlice | undefined =
    coachAssignments.length > 0
      ? {
          assignments: coachAssignments.map((a) => ({
            id: a.id,
            coachId: a.coachId,
            coachName: a.coach?.name ?? undefined,
            role: a.role,
            sessions: a.sessions,
            hoursPerSession: a.hoursPerSession,
            totalHours: a.totalHours,
            agreedRate: a.agreedRate,
            totalFee: a.totalFee,
            confirmed: a.confirmed,
            notes: a.notes,
          })),
          sessionCoachMap: deriveSessionCoachMap(curriculum),
          totalFee: coachAssignments.reduce((sum, a) => sum + (a.totalFee ?? 0), 0),
          recommendationReasons: {},
        }
      : undefined

  // ── budget slice ──
  const budgetSlice: BudgetSlice | undefined = budget
    ? {
        structure: {
          pcTotal: budget.pcTotal,
          acTotal: budget.acTotal,
          margin: budget.margin,
          marginRate: budget.marginRate,
          items: budget.items.map((item) => ({
            id: item.id,
            wbsCode: item.wbsCode,
            type: item.type,
            category: item.category,
            name: item.name,
            unit: item.unit,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            amount: item.amount,
            notes: item.notes,
          })),
        },
        marginRate: budget.marginRate,
        sroiForecast: project.sroiForecast
          ? (project.sroiForecast as unknown as SroiForecast)
          : undefined,
        benchmark: undefined,
        warnings: [],
      }
    : undefined

  // ── impact slice ──
  const impactSlice: ImpactSlice | undefined = (project.logicModel || project.impactGoal)
    ? {
        goal: project.impactGoal ?? '',
        logicModel: (project.logicModel as unknown as LogicModel) ?? {
          impactGoal: project.impactGoal ?? '',
          impact: [],
          outcome: [],
          output: [],
          activity: [],
          input: [],
          externalInsights: [],
        },
        measurementPlan: [],
        autoExtracted: {
          activities: curriculum.length > 0,
          inputs: coachAssignments.length > 0 || !!budget,
        },
      }
    : undefined

  // ── proposal slice ──
  // 같은 sectionNo 의 최신 version 1개씩만 노출
  const latestSections = pickLatestSections(proposalSections)
  const proposalSlice: ProposalSlice | undefined =
    latestSections.length > 0
      ? {
          sections: latestSections.map((s) => ({
            id: s.id,
            sectionNo: s.sectionNo,
            title: s.title,
            content: s.content,
            version: s.version,
            isApproved: s.isApproved,
          })),
          scoreSimulation: undefined,
          revisionHistory: [],
        }
      : undefined

  // ── Asset Registry (Phase G · ADR-009) ──
  // Project.acceptedAssetIds 는 Wave G2 에서 추가된 JSON 배열 컬럼.
  // PM 이 Step 1 매칭 자산 패널에서 승인한 자산 ID 들.
  const acceptedAssetIds: string[] | undefined = Array.isArray(project.acceptedAssetIds)
    ? (project.acceptedAssetIds as string[])
    : undefined

  return {
    projectId: project.id,
    version: 0,
    rfp,
    strategy,
    research,
    curriculum: curriculumSlice,
    coaches: coachesSlice,
    budget: budgetSlice,
    impact: impactSlice,
    proposal: proposalSlice,
    meta,
    acceptedAssetIds,
  }
}

// ═════════════════════════════════════════
// 5. 내부 헬퍼
// ═════════════════════════════════════════

/** PlanningIntentRecord.intentJson 에서 channel.type 추출 */
function derivePlanningChannel(
  record: { intentJson: unknown } | null,
): 'bid' | 'lead' | 'renewal' | undefined {
  if (!record?.intentJson) return undefined
  const intent = record.intentJson as { channel?: { type?: string } }
  const t = intent?.channel?.type
  if (t === 'bid' || t === 'lead' || t === 'renewal') return t
  return undefined
}

/** PlanningIntentRecord 에서 StrategySlice 추출 */
function derivePlanningStrategy(
  record:
    | {
        intentJson: unknown
        completeness: number
        confidence: string
      }
    | null,
): StrategySlice | undefined {
  if (!record?.intentJson) return undefined

  const intent = record.intentJson as {
    strategicContext?: {
      participationDecision?: string
      clientHiddenWants?: string
      mustNotFail?: string
      competitorWeakness?: string
      internalAdvantage?: string
      riskFactors?: string[]
      decisionMakers?: string
    }
    derivedStrategy?: {
      keyMessages?: string[]
    } | null
  }

  const sc = intent.strategicContext ?? {}
  const ds = intent.derivedStrategy ?? null

  const confidence: StrategySlice['confidence'] =
    record.confidence === 'high' || record.confidence === 'medium' ? record.confidence : 'low'

  return {
    whyUs: sc.participationDecision ?? '',
    clientHiddenWants: sc.clientHiddenWants ?? '',
    mustNotFail: sc.mustNotFail ?? '',
    competitorWeakness: sc.competitorWeakness ?? '',
    internalAdvantage: sc.internalAdvantage ?? '',
    riskFactors: sc.riskFactors ?? [],
    decisionMakers: sc.decisionMakers ?? '',
    derivedKeyMessages: ds?.keyMessages ?? [],
    completeness: record.completeness ?? 0,
    confidence,
  }
}

/** CurriculumItem[] → 트랙 목록 derive (track 컬럼 distinct) */
function deriveCurriculumTracks(
  items: Array<{ track: string | null; sessionNo: number }>,
): Track[] {
  const map = new Map<string, number[]>()
  for (const item of items) {
    const key = item.track ?? '_default'
    const arr = map.get(key) ?? []
    arr.push(item.sessionNo)
    map.set(key, arr)
  }
  return Array.from(map.entries()).map(([name, sessionNos]) => ({
    id: name,
    name: name === '_default' ? '기본 트랙' : name,
    sessionNos,
  }))
}

/** CurriculumItem → CurriculumSession (PipelineContext 표현) */
function toCurriculumSession(
  item: {
    id: string
    sessionNo: number
    title: string
    durationHours: number
    lectureMinutes: number
    practiceMinutes: number
    isTheory: boolean
    isActionWeek: boolean
    isCoaching1on1: boolean
    impactModuleCode: string | null
    notes: string | null
  },
): CurriculumSession {
  return {
    sessionNo: item.sessionNo,
    title: item.title,
    category: '',           // DB 에는 별도 컬럼 없음 — module 조회 시 보강 가능
    method: '',             // 동상
    durationHours: item.durationHours,
    lectureMinutes: item.lectureMinutes,
    practiceMinutes: item.practiceMinutes,
    isTheory: item.isTheory,
    isActionWeek: item.isActionWeek,
    isCoaching1on1: item.isCoaching1on1,
    objectives: [],
    recommendedExpertise: [],
    notes: item.notes ?? '',
    impactModuleCode: item.impactModuleCode,
  }
}

/** sessionId → moduleId 매핑 */
function deriveImpactModuleMapping(
  items: Array<{ id: string; impactModuleCode: string | null }>,
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const item of items) {
    if (item.impactModuleCode) {
      map[item.id] = item.impactModuleCode
    }
  }
  return map
}

/** sessionNo → coachId[] 매핑 (CurriculumItem.assignedCoachId 기반) */
function deriveSessionCoachMap(
  items: Array<{ sessionNo: number; assignedCoachId: string | null }>,
): Record<number, string[]> {
  const map: Record<number, string[]> = {}
  for (const item of items) {
    if (item.assignedCoachId) {
      const arr = map[item.sessionNo] ?? []
      if (!arr.includes(item.assignedCoachId)) arr.push(item.assignedCoachId)
      map[item.sessionNo] = arr
    }
  }
  return map
}

/** 같은 sectionNo 안에서는 가장 높은 version 만 노출 */
function pickLatestSections<
  T extends { sectionNo: number; version: number },
>(sections: T[]): T[] {
  const map = new Map<number, T>()
  for (const s of sections) {
    const prev = map.get(s.sectionNo)
    if (!prev || s.version > prev.version) {
      map.set(s.sectionNo, s)
    }
  }
  return Array.from(map.values()).sort((a, b) => a.sectionNo - b.sectionNo)
}

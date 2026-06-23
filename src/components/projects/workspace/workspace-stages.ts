/**
 * Workspace Stage Mapping — 전폭 2-pane 워크스페이스 5단계 (ADR-029, BR-WS-5)
 *
 * `/projects/[id]` = 단일 정본 워크스페이스. 상단 고정 파이프라인 스텝퍼 5단계:
 *   rfp    — RFP 분석      (StageS1 + PlanningIntent = 발주처 의도)
 *   design — 프로그램 기획  (ProgramDesignFlow) ⭐ spine
 *   coach  — 코치 매칭      (AutoRecommendedPool, mode="inline")
 *   budget — 예산 자동화    (placeholder — 캔버스 컴포넌트 미연결, 보고)
 *   sroi   — SROI 예측      (ImpactForecastClient)
 *
 * BR-WS-5 (2026-06-23): 옛 3단계 세로 아코디언(rfp·design·impact)을 5단계 파이프라인
 * 스텝퍼 + 전폭 2-pane(좌 대화·우 캔버스)으로 교체. impact → sroi 로 개칭 + coach·budget
 * 단계 신설. done 판정·current 자동 판정·query 매핑은 5단계로 확장하되 server/client 양쪽
 * import 가능(React 의존성 X).
 *
 * 디자인킷 토큰: 라벨은 단순 IA 라벨이라 하드코딩 OK (가변 프롬프트·가중치 아님).
 */

export type WorkspaceStageId = 'rfp' | 'design' | 'coach' | 'budget' | 'sroi'

export const WORKSPACE_STAGE_IDS: readonly WorkspaceStageId[] = [
  'rfp',
  'design',
  'coach',
  'budget',
  'sroi',
] as const

export const WORKSPACE_STAGE_LABELS: Record<WorkspaceStageId, string> = {
  rfp: 'RFP 분석',
  design: '프로그램 기획',
  coach: '코치 매칭',
  budget: '예산 자동화',
  sroi: 'SROI 예측',
}

/** Stage 별 한 줄 설명 (캔버스 헤더 보조 텍스트) */
export const WORKSPACE_STAGE_DESCRIPTIONS: Record<WorkspaceStageId, string> = {
  rfp: 'RFP 업로드 + AI 자동 분석 (사업명·발주·예산·평가배점·키워드) + 발주처 의도',
  design: '왜 이렇게 가는가 → 무엇을 하는가, 한 흐름으로 (기획의도 + 커리큘럼)',
  coach: '커리큘럼에 맞춰 715명 풀에서 5축 자동 추천 (PM 교체)',
  budget: '커리큘럼 + 코치 위에서 자동 적산 (강사·운영·자산·기획 → 총사업비·마진)',
  sroi: 'forecast 렌즈 + 공식 임팩트 리포트 (impact-measurement 핸드오프)',
}

// ─────────────────────────────────────────
// 1. done 판정 (server 데이터로 일괄 산정)
// ─────────────────────────────────────────

export interface WorkspaceStageInput {
  /** RFP 업로드 + 파싱 완료 여부 (project.rfpParsed) */
  hasRfp: boolean
  /** 프로그램 기획 진행 여부 (program-design plan 시드 또는 programProfile 존재) */
  hasDesign: boolean
  /** 코치 배정 있음 여부 (배정 코치 1명 이상) */
  hasCoach: boolean
  /** 예산 산정 있음 여부 (예산 항목/요약 존재) */
  hasBudget: boolean
  /** 사전 임팩트 forecast 존재 여부 (project.impactForecast) */
  hasImpact: boolean
}

/**
 * 5 stage 의 done flag 일괄 판정.
 *   rfp    — RFP 파싱 완료
 *   design — 설계 진행(플랜/프로파일) 있음
 *   coach  — 코치 배정 있음
 *   budget — 예산 산정 있음
 *   sroi   — forecast 있음
 */
export function computeWorkspaceDoneFlags(
  input: WorkspaceStageInput,
): Record<WorkspaceStageId, boolean> {
  return {
    rfp: input.hasRfp,
    design: input.hasDesign,
    coach: input.hasCoach,
    budget: input.hasBudget,
    sroi: input.hasImpact,
  }
}

/**
 * 현재 활성 stage 1개 결정 (auto). PM 의 수동 선택은 별도 layer(client state).
 *
 * 룰 (위에서 아래로 첫 미완료):
 *   1. !hasRfp     → rfp
 *   2. !hasDesign  → design
 *   3. !hasCoach   → coach
 *   4. !hasBudget  → budget
 *   5. (else)      → sroi
 */
export function computeWorkspaceCurrentStage(
  input: WorkspaceStageInput,
): WorkspaceStageId {
  if (!input.hasRfp) return 'rfp'
  if (!input.hasDesign) return 'design'
  if (!input.hasCoach) return 'coach'
  if (!input.hasBudget) return 'budget'
  return 'sroi'
}

// ─────────────────────────────────────────
// 2. Stage 별 1줄 sticky 요약 (스텝퍼 보조 — 옵션)
// ─────────────────────────────────────────

export interface WorkspaceSummaryInput {
  rfpParsed?: {
    totalBudgetVat?: number | null
    projectType?: 'B2G' | 'B2B'
    evalCriteria?: Array<{ item?: string; score?: number }>
  } | null
  /** 설계 진행 여부 */
  hasDesign?: boolean
  /** 코치 배정 있음 여부 */
  hasCoach?: boolean
  /** 예산 산정 있음 여부 */
  hasBudget?: boolean
  /** 사회적 가치 (억원) */
  socialValueEok?: number
}

/** stage 의 1줄 sticky 요약 텍스트. 데이터 없으면 안내 문구. */
export function workspaceStageSummary(
  stageId: WorkspaceStageId,
  input: WorkspaceSummaryInput,
): string {
  switch (stageId) {
    case 'rfp': {
      if (!input.rfpParsed) return 'RFP 업로드 안 됨'
      const parts: string[] = ['RFP ✓']
      if (input.rfpParsed.totalBudgetVat != null) {
        const m = Math.round(input.rfpParsed.totalBudgetVat / 1_000_000)
        parts.push(`${m.toLocaleString()}M`)
      }
      if (input.rfpParsed.projectType) parts.push(input.rfpParsed.projectType)
      const evalCount = input.rfpParsed.evalCriteria?.length ?? 0
      if (evalCount > 0) parts.push(`평가배점 ${evalCount}개`)
      return parts.join(' · ')
    }
    case 'design':
      return input.hasDesign ? '프로그램 기획 진행 중' : '기획 미시작'
    case 'coach':
      return input.hasCoach ? '코치 배정됨' : '코치 미배정'
    case 'budget':
      return input.hasBudget ? '예산 산정됨' : '예산 미산정'
    case 'sroi':
      return input.socialValueEok != null
        ? `SROI ${input.socialValueEok.toFixed(1)}억`
        : '임팩트 미산정'
  }
}

// ─────────────────────────────────────────
// 3. ?step= / ?stage= query → 5 stage 매핑 (회귀 가드)
// ─────────────────────────────────────────

/**
 * 외부 링크(옛 ?step= · 새 ?stage=)를 5 stage 로 매핑해 진입 시 1회 선택.
 *
 *   rfp                       → rfp
 *   design | curriculum       → design
 *   coaches | coach           → coach
 *   budget                    → budget
 *   proposal                  → design  (제안서는 설계 spine 으로 흡수)
 *   impact | sroi             → sroi
 *   알 수 없음                 → null (자동 판정에 맡김)
 */
export function mapQueryToWorkspaceStage(
  q: string | undefined,
): WorkspaceStageId | null {
  switch (q) {
    case 'rfp':
      return 'rfp'
    case 'design':
    case 'curriculum':
    case 'proposal':
      return 'design'
    case 'coach':
    case 'coaches':
      return 'coach'
    case 'budget':
      return 'budget'
    case 'impact':
    case 'sroi':
      return 'sroi'
    default:
      return null
  }
}

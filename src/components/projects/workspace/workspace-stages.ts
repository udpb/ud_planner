/**
 * Workspace Stage Mapping — 정본 3단계 워크스페이스 (ADR-029, BR-WS-1)
 *
 * `/projects/[id]` = 단일 정본 워크스페이스 3단계:
 *   rfp    — ① RFP 분석 (StepRfp / StageS1)
 *   design — ② 프로그램 설계 (P2 설계 캔버스 = ProgramDesignFlow) ⭐ spine
 *   impact — ③ 임팩트 (P1 볼트인 = ForecastClient)
 *
 * 옛 5 Stage(S1~S5, ADR-015/018) 와 옛 6 step(rfp~proposal, ADR-001) 의 진입/네비
 * 패러다임을 ADR-029 가 대체 — 이 모듈은 그 3단계의 pure 매핑(라벨·설명·done 판정)이다.
 * server / client 양쪽에서 import 가능 (React 의존성 X).
 *
 * 디자인킷 토큰: 라벨은 단순 IA 라벨이라 하드코딩 OK (가변 프롬프트·가중치 아님).
 */

export type WorkspaceStageId = 'rfp' | 'design' | 'impact'

export const WORKSPACE_STAGE_IDS: readonly WorkspaceStageId[] = [
  'rfp',
  'design',
  'impact',
] as const

export const WORKSPACE_STAGE_LABELS: Record<WorkspaceStageId, string> = {
  rfp: 'RFP 분석',
  design: '프로그램 설계',
  impact: '임팩트',
}

/** Stage 별 한 줄 설명 (펼침 시 헤더 보조 텍스트) */
export const WORKSPACE_STAGE_DESCRIPTIONS: Record<WorkspaceStageId, string> = {
  rfp: 'RFP 업로드 + AI 자동 분석 (사업명·발주·예산·평가배점·키워드) · Brain 매칭 · 자산 자동매칭',
  design: '왜 이렇게 가는가 → 무엇을 하는가, 한 흐름으로 (기획의도 + 커리큘럼)',
  impact: 'forecast 렌즈 + 공식 임팩트 리포트 (impact-measurement 핸드오프)',
}

// ─────────────────────────────────────────
// 1. done 판정 (server 데이터로 일괄 산정)
// ─────────────────────────────────────────

export interface WorkspaceStageInput {
  /** RFP 업로드 + 파싱 완료 여부 (project.rfpParsed) */
  hasRfp: boolean
  /** 프로그램 설계 진행 여부 (program-design plan 시드 또는 programProfile 존재) */
  hasDesign: boolean
  /** 사전 임팩트 forecast 존재 여부 (project.impactForecast) */
  hasImpact: boolean
}

/**
 * 3 stage 의 done flag 일괄 판정.
 *   rfp    — RFP 파싱 완료
 *   design — 설계 진행(플랜/프로파일) 있음
 *   impact — forecast 있음
 */
export function computeWorkspaceDoneFlags(
  input: WorkspaceStageInput,
): Record<WorkspaceStageId, boolean> {
  return {
    rfp: input.hasRfp,
    design: input.hasDesign,
    impact: input.hasImpact,
  }
}

/**
 * 현재 활성 stage 1개 결정 (auto). PM 의 manualOverride 는 별도 layer.
 *
 * 룰 (위에서 아래로 첫 매치):
 *   1. !hasRfp     → rfp
 *   2. !hasDesign  → design
 *   3. (else)      → impact
 */
export function computeWorkspaceCurrentStage(
  input: WorkspaceStageInput,
): WorkspaceStageId {
  if (!input.hasRfp) return 'rfp'
  if (!input.hasDesign) return 'design'
  return 'impact'
}

// ─────────────────────────────────────────
// 2. Stage 별 1줄 sticky 요약 (접힘 상태)
// ─────────────────────────────────────────

export interface WorkspaceSummaryInput {
  rfpParsed?: {
    totalBudgetVat?: number | null
    projectType?: 'B2G' | 'B2B'
    evalCriteria?: Array<{ item?: string; score?: number }>
  } | null
  /** 설계 진행 여부 */
  hasDesign?: boolean
  /** 사회적 가치 (억원) */
  socialValueEok?: number
}

/** 접힌 stage 카드의 1줄 sticky 요약 텍스트. 데이터 없으면 안내 문구. */
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
      return input.hasDesign ? '프로그램 설계 진행 중' : '설계 미시작'
    case 'impact':
      return input.socialValueEok != null
        ? `SROI ${input.socialValueEok.toFixed(1)}억`
        : '임팩트 미산정'
  }
}

// ─────────────────────────────────────────
// 3. ?step= / ?stage= query → 3 stage 매핑 (회귀 가드)
// ─────────────────────────────────────────

/**
 * 외부 링크(옛 ?step= · 새 ?stage=)를 3 stage 로 매핑해 mount 시 1회 펼침.
 *
 *   rfp                                → rfp
 *   design | curriculum | coaches      → design  (설계 spine 으로 흡수)
 *   budget | proposal                  → design
 *   impact                             → impact
 *   알 수 없음                          → null (자동 판정에 맡김)
 */
export function mapQueryToWorkspaceStage(
  q: string | undefined,
): WorkspaceStageId | null {
  switch (q) {
    case 'rfp':
      return 'rfp'
    case 'design':
    case 'curriculum':
    case 'coaches':
    case 'budget':
    case 'proposal':
      return 'design'
    case 'impact':
      return 'impact'
    default:
      return null
  }
}

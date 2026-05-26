/**
 * Stage Mapping — Wave V / F0 (ADR-015, 2026-05-20)
 *
 * 5 Stage Progressive Disclosure 의 pure 함수 모음.
 * server / client 양쪽에서 import 가능 (React 의존성 X).
 *
 * 5 Stage 정의 (ADR-015 §2):
 *   S1 — RFP 분석
 *   S2 — 1차본 작성 (ExpressShell)
 *   S3 — 검수 (Inspector 7 렌즈)
 *   S4 — 정밀 편집 (커리큘럼·코치·예산·제안서)
 *   S5 — 최종 승인·제출
 */

export type StageId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5'

export const STAGE_IDS: readonly StageId[] = ['S1', 'S2', 'S3', 'S4', 'S5'] as const

export const STAGE_LABELS: Record<StageId, string> = {
  S1: 'RFP 분석',
  S2: '1차본 작성',
  S3: '검수',
  S4: '정밀 편집',
  S5: '최종 승인·제출',
}

/** Stage 별 한 줄 설명 (펼침 시 헤더 보조 텍스트) */
export const STAGE_DESCRIPTIONS: Record<StageId, string> = {
  S1: 'RFP 업로드 + AI 자동 분석 (사업명·발주·예산·평가배점·키워드)',
  S2: '챗봇으로 의도·차별화·7섹션 1차본 작성 (Express)',
  S3: '평가위원 7 렌즈 자동 검수 + 약점 lens 자산 추천',
  S4: '커리큘럼·코치·예산·제안서 정밀 편집',
  S5: '발주처 템플릿 다운로드 + 임팩트 forecast 확정',
}

// ─────────────────────────────────────────
// 1. 현재 활성 Stage 판정
// ─────────────────────────────────────────

export interface StageDecisionInput {
  /** RFP 업로드 + 파싱 완료 여부 */
  hasRfp: boolean
  /** Express 1차본 승인 (expressDraft.meta.isCompleted) */
  isExpressCompleted: boolean
  /**
   * 검수 통과 여부. F0 에선 server 가 알 수 없음 (ExpressShell client state).
   * - undefined: 모름 (server 판정 시) → isExpressCompleted 면 S3 활성으로 간주.
   * - true: 통과.
   * - false: 실행했지만 critical 이슈 있음.
   */
  inspectorPassed?: boolean
  /** Project.proposalSections.length */
  proposalSectionsCount: number
  /** Project.status (DRAFT / PROPOSAL / SUBMITTED / IN_PROGRESS / COMPLETED / LOST) */
  projectStatus: string
}

/**
 * 현재 활성 Stage 1개 결정 (auto). PM 의 manualOverride 는 별도 layer.
 *
 * 룰 우선순위 (위에서 아래로 첫 매치):
 *   1. !hasRfp                             → S1
 *   2. !isExpressCompleted                 → S2
 *   3. inspectorPassed !== true            → S3
 *   4. proposalSectionsCount < 7           → S4
 *   5. (else — 7섹션 완성)                  → S5
 */
export function computeCurrentStage(input: StageDecisionInput): StageId {
  if (!input.hasRfp) return 'S1'
  if (!input.isExpressCompleted) return 'S2'
  if (input.inspectorPassed !== true) return 'S3'
  if (input.proposalSectionsCount < 7) return 'S4'
  return 'S5'
}

// ─────────────────────────────────────────
// 2. Stage 별 1줄 sticky 요약 (접힘 상태)
// ─────────────────────────────────────────

export interface StageSummaryInput {
  /** RFP 파싱 결과 (없으면 RFP 미업로드) */
  rfpParsed?: {
    projectName?: string
    client?: string
    totalBudgetVat?: number | null
    projectType?: 'B2G' | 'B2B'
    evalCriteria?: Array<{ item?: string; score?: number }>
  } | null
  /** Express draft 진행률 0~100 */
  draftProgressOverall?: number
  /** Inspector 점수 + critical 갯수 */
  inspectorScore?: number
  inspectorCriticalCount?: number
  /** 정밀 편집 4 영역 */
  curriculumCount?: number
  coachAssignmentCount?: number
  budgetMarginRate?: number | null
  proposalSectionsCount?: number
  /** 사회적 가치 (억원) */
  socialValueEok?: number
}

/**
 * 접힌 stage 카드의 1줄 sticky 요약 텍스트.
 * ADR-015 §2 의 예시 패턴을 따름. 데이터 없으면 "—" 또는 "미설정".
 */
export function stageSummary(stageId: StageId, input: StageSummaryInput): string {
  switch (stageId) {
    case 'S1': {
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
    case 'S2': {
      const p = input.draftProgressOverall ?? 0
      return p > 0 ? `1차본 ${p}% 진행 중` : '1차본 미작성'
    }
    case 'S3': {
      if (input.inspectorScore == null) return '검수 실행 안 됨'
      const critical = input.inspectorCriticalCount ?? 0
      return `검수 ${input.inspectorScore}점 · critical ${critical}건`
    }
    case 'S4': {
      const parts: string[] = []
      if ((input.curriculumCount ?? 0) > 0) parts.push(`${input.curriculumCount}회차`)
      if ((input.coachAssignmentCount ?? 0) > 0) {
        parts.push(`${input.coachAssignmentCount} 코치`)
      }
      if (input.budgetMarginRate != null) {
        parts.push(`마진 ${input.budgetMarginRate.toFixed(0)}%`)
      }
      if ((input.proposalSectionsCount ?? 0) > 0) {
        parts.push(`${input.proposalSectionsCount}/7 섹션`)
      }
      return parts.length > 0 ? parts.join(' · ') : '정밀 편집 미작성'
    }
    case 'S5': {
      const parts: string[] = []
      if ((input.proposalSectionsCount ?? 0) >= 7) parts.push('✓ 1차본 완성')
      if (input.socialValueEok != null) {
        parts.push(`SROI ${input.socialValueEok.toFixed(1)}억`)
      }
      return parts.length > 0 ? parts.join(' · ') : '제출 대기'
    }
  }
}

// ─────────────────────────────────────────
// 3. 기존 ?step= query → Stage 매핑 (회귀 가드)
// ─────────────────────────────────────────

/**
 * 기존 Deep pipeline 의 ?step=xxx URL 을 5 Stage 로 매핑.
 *
 * 외부 컴포넌트 (planning-scorecard, loop-alignment-cards, ExpressShell 의
 * handoff redirect, step-* 내부 링크) 가 `?step=` 으로 점프 → V3 환경에서도
 * 해당 stage 카드가 펼쳐지도록.
 *
 * 매핑:
 *   rfp        → S1
 *   curriculum → S4 (정밀 편집의 일부)
 *   coaches    → S4
 *   budget     → S4
 *   impact     → S5 (사회적 가치 forecast / SROI 가 S5 의 핵심)
 *   proposal   → S4 (제안서 7섹션 편집)
 *
 * 알 수 없는 step → null (Stage 매핑 안 함, computeCurrentStage 의 자동 판정에 맡김).
 */
export function mapStepQueryToStage(step: string | undefined): StageId | null {
  switch (step) {
    case 'rfp':
      return 'S1'
    case 'curriculum':
    case 'coaches':
    case 'budget':
    case 'proposal':
      return 'S4'
    case 'impact':
      return 'S5'
    default:
      return null
  }
}

// ─────────────────────────────────────────
// 4. 5 stage 의 done flag 일괄 판정 (server-side helper)
// ─────────────────────────────────────────
//
// 2026-05-22 fix: 기존 StageShell.tsx ('use client') 에 있던 정의를 본 모듈로
// 이동. Next.js 가 'use client' 모듈의 모든 export 를 client-only 로 격리하기
// 때문에 server component (page.tsx) 가 같이 import 하면 runtime 에러
// ("client function from the server").

/**
 * Project 데이터로 5 stage 의 done flag 일괄 판정.
 * page.tsx 가 호출 후 StageShell 의 doneFlags 로 전달.
 */
export function computeStageDoneFlags(input: {
  hasRfp: boolean
  isExpressCompleted: boolean
  inspectorPassed?: boolean
  proposalSectionsCount: number
}): Record<StageId, boolean> {
  return {
    S1: input.hasRfp,
    S2: input.isExpressCompleted,
    S3: input.inspectorPassed === true,
    S4: input.proposalSectionsCount >= 7,
    S5: false, // S5 는 PM 제출/사후 단계 — F0 에선 done 판정 X
  }
}

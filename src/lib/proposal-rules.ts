/**
 * 제안서 ProgramProfile 검증 헬퍼 — Gate 3 결과 가공.
 *
 * 2026-05-03 (Phase 2 단순화):
 *   - validateProposalRules / RULES / DEFAULT_* / ProposalRuleInput 등 미사용 제거
 *     (PROP-001~006 룰 엔진은 호출자 0개로 dead code 였음)
 *   - runPhaseEGates 래퍼 제거 (program-profile-panel 이 validateProfile 직접 호출)
 *   - 본 파일은 ProfileIssue 를 UI shape 로 변환하는 두 가지 헬퍼만 유지.
 *
 * 사용처:
 *   - src/components/projects/program-profile-panel.tsx
 */

import type { ProfileIssue } from '@/lib/program-profile'

/**
 * ProfileIssue[] 안에 severity='blocker' 가 하나라도 있으면 true.
 *
 * 제안서 생성 라우트에서
 *   `if (hasBlocker(issues)) throw new Error('…')`
 * 형태로 생성 중단 여부를 판단하는 용도.
 */
export function hasBlocker(issues: ProfileIssue[]): boolean {
  return issues.some((i) => i.severity === 'blocker')
}

/**
 * Step 6 (제안서) UI 에서 바로 렌더링할 수 있는 shape 로 변환.
 *
 * 제1원칙(RFP·클라이언트 요구에 맞춘 설득력 + 언더독스 차별화) 에 따라
 * 네 가지 레이어를 함께 전달한다:
 *   - title           한 줄 제목 ("왜 문제인지")
 *   - body            왜 지금 이 문제가 프로젝트를 위협하는가
 *   - scoringImpact   RFP 의 어떤 배점 항목이 위협받는가
 *   - differentiationLoss  어떤 언더독스 차별화를 놓치는가
 *   - fixHint         구체적 해결 경로 (언더독스 자산 활용 포함)
 *   - severity        'block' | 'warn'
 */
export function formatIssueForUI(issue: ProfileIssue): {
  title: string
  body: string
  scoringImpact?: string
  differentiationLoss?: string
  fixHint?: string
  severity: 'block' | 'warn'
} {
  const severity: 'block' | 'warn' = issue.severity === 'blocker' ? 'block' : 'warn'

  // 코드별 한국어 제목. 나머지는 code 를 그대로 타이틀로.
  const TITLE_BY_CODE: Record<string, string> = {
    'renewal-context-missing': '연속사업 컨텍스트 누락',
    'renewal-lessons-empty': '작년 레슨런 보강 필요',
    'renewal-improvement-missing': '개선 영역 추가 필요',
    'methodology-mismatch': '방법론 · 대상 단계 불일치',
    'geography-global-no-support': '글로벌 지원 구조 누락',
  }

  return {
    title: TITLE_BY_CODE[issue.code] ?? issue.code,
    body: issue.message,
    scoringImpact: issue.scoringImpact,
    differentiationLoss: issue.differentiationLoss,
    fixHint: issue.fixHint,
    severity,
  }
}

/**
 * 커리큘럼 설계 규칙 검증 엔진 (PRD F4.1)
 * R-001 ~ R-004: 이론 비율, Action Week, 이론 연속, 코칭 전 실습 검증
 */

export interface RuleViolation {
  ruleId: string
  ruleName: string
  action: 'BLOCK' | 'WARN' | 'SUGGEST'
  message: string
  affectedSessions?: number[]
}

export interface RuleValidationResult {
  passed: boolean
  violations: RuleViolation[]
}

interface SessionInput {
  sessionNo: number
  isTheory: boolean
  isActionWeek: boolean
  category?: string
  method?: string
}

interface DesignRule {
  id: string
  name: string
  action: 'BLOCK' | 'WARN' | 'SUGGEST'
  check: (sessions: SessionInput[]) => RuleViolation | null
}

const RULES: DesignRule[] = [
  {
    id: 'R-001',
    name: '이론 비율 30% 초과 금지',
    action: 'BLOCK',
    check(sessions) {
      if (sessions.length === 0) return null
      const theoryCount = sessions.filter((s) => s.isTheory).length
      const ratio = Math.round((theoryCount / sessions.length) * 100)
      if (ratio > 30) {
        return {
          ruleId: 'R-001',
          ruleName: this.name,
          action: 'BLOCK',
          message: `이론 세션 비율이 ${ratio}%입니다. 30% 이하로 조정해주세요. (${theoryCount}/${sessions.length}개)`,
          affectedSessions: sessions.filter((s) => s.isTheory).map((s) => s.sessionNo),
        }
      }
      return null
    },
  },
  {
    id: 'R-002',
    name: 'Action Week 필수',
    action: 'BLOCK',
    check(sessions) {
      if (sessions.length === 0) return null
      const hasActionWeek = sessions.some((s) => s.isActionWeek)
      if (!hasActionWeek) {
        return {
          ruleId: 'R-002',
          ruleName: this.name,
          action: 'BLOCK',
          message: 'Action Week(실전 실행 주간)가 포함되어야 합니다. 최소 1개의 Action Week 세션을 추가해주세요.',
        }
      }
      return null
    },
  },
  {
    id: 'R-003',
    name: '이론 3연속 금지',
    action: 'WARN',
    check(sessions) {
      const sorted = [...sessions].sort((a, b) => a.sessionNo - b.sessionNo)
      for (let i = 0; i <= sorted.length - 3; i++) {
        if (sorted[i].isTheory && sorted[i + 1].isTheory && sorted[i + 2].isTheory) {
          const affected = [sorted[i].sessionNo, sorted[i + 1].sessionNo, sorted[i + 2].sessionNo]
          return {
            ruleId: 'R-003',
            ruleName: this.name,
            action: 'WARN',
            message: `${affected[0]}~${affected[2]}회차에 이론 강의가 3회 연속됩니다. Action Week 또는 실습 세션 삽입을 권장합니다.`,
            affectedSessions: affected,
          }
        }
      }
      return null
    },
  },
  {
    id: 'R-004',
    name: '코칭 세션 전에 워크숍/실습 권장',
    action: 'SUGGEST',
    check(sessions) {
      const sorted = [...sessions].sort((a, b) => a.sessionNo - b.sessionNo)
      for (let i = 1; i < sorted.length; i++) {
        const curr = sorted[i]
        const prev = sorted[i - 1]
        const isMentoring = curr.category === 'MENTORING' || curr.method === 'MENTORING'
        if (isMentoring && prev.isTheory) {
          return {
            ruleId: 'R-004',
            ruleName: this.name,
            action: 'SUGGEST',
            message: `${curr.sessionNo}회차 코칭/멘토링 세션 직전(${prev.sessionNo}회차)이 이론 세션입니다. 실습/워크숍 세션을 먼저 배치하면 코칭 효과가 높아집니다.`,
            affectedSessions: [prev.sessionNo, curr.sessionNo],
          }
        }
      }
      return null
    },
  },
]

/**
 * 커리큘럼 세션 목록에 대해 전체 규칙을 검증합니다.
 * @returns passed=false면 BLOCK 위반 존재, violations에 상세 내역
 */
export function validateCurriculumRules(sessions: SessionInput[]): RuleValidationResult {
  const violations: RuleViolation[] = []

  for (const rule of RULES) {
    const violation = rule.check(sessions)
    if (violation) {
      violations.push(violation)
    }
  }

  const hasBlock = violations.some((v) => v.action === 'BLOCK')

  return {
    passed: !hasBlock,
    violations,
  }
}

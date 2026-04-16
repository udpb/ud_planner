/**
 * 예산 룰 엔진 — Gate 2 결정론적 검증 (docs/architecture/quality-gates.md §1).
 *
 * curriculum-rules.ts 와 동일 패턴:
 *   - 고유 Rule ID (BUD-NNN)
 *   - action: 'BLOCK' | 'WARN' | 'SUGGEST'
 *   - 순수 함수 (side effect 없음, DB/AI 접근 없음)
 *
 * 룰 목록:
 *   BUD-001 직접비(AC) 비율 < 70% → WARN (B2G 기준)
 *   BUD-002 마진 < 10% → WARN (수익성 경고)
 *   BUD-003 마진 > 20% → WARN (감액 위험 / 고마진 정당화 필요)
 *   BUD-004 AC 총액 > RFP 예산 → BLOCK
 *   BUD-005 코치 단가 시장가 ±20% 벗어남 → SUGGEST
 *
 * 사용처 (Phase D 연결 계획):
 *   - POST /api/budget 저장 전 검증 훅
 *   - Step 4 UI 에서 실시간 경고 배지
 *   - BudgetSlice.warnings 에 결과 주입
 *
 * NOTE: BudgetWarning (pipeline-context.ts) 과 RuleValidationResult (curriculum-rules.ts)
 *       두 모양을 모두 지원하기 위해 반환 타입은 RuleValidationResult 로 통일.
 *       호출측에서 slice.warnings 에 넣을 때는 toBudgetWarnings() 헬퍼로 변환한다.
 */

import type { BudgetSlice, BudgetWarning } from '@/lib/pipeline-context'

// ─────────────────────────────────────────
// 공통 타입 (curriculum-rules.ts 와 동일 shape, 추후 rule-engine-types.ts 로 추출 가능)
// ─────────────────────────────────────────

export interface BudgetRuleViolation {
  ruleId: string
  ruleName: string
  action: 'BLOCK' | 'WARN' | 'SUGGEST'
  message: string
  /** BudgetItem.wbsCode 또는 id */
  affectedItems?: string[]
}

export interface BudgetRuleValidationResult {
  passed: boolean
  violations: BudgetRuleViolation[]
}

// ─────────────────────────────────────────
// Rule Input
// ─────────────────────────────────────────

export interface BudgetRuleInput {
  budget: BudgetSlice
  /** RFP 에서 파싱된 총예산 (BUD-004 용). 없으면 스킵. */
  rfpBudget?: number | null
  /** 프로젝트 타입. B2G 에서만 BUD-001 체크 (default B2G). */
  projectType?: 'B2G' | 'B2B'
  /** 시장가 범위 (BUD-005 용, cost-standards 자산에서 주입 예정). 없으면 스킵. */
  marketRateRange?: { min: number; max: number }
  /** 코치 사례비 평균 (BUD-005 용). 없으면 BudgetItem 에서 "코치" 포함 항목 평균 사용. */
  coachAverageRate?: number
}

// ─────────────────────────────────────────
// Rule 정의
// ─────────────────────────────────────────

interface BudgetDesignRule {
  id: string
  name: string
  action: 'BLOCK' | 'WARN' | 'SUGGEST'
  check: (input: BudgetRuleInput) => BudgetRuleViolation | null
}

const RULES: BudgetDesignRule[] = [
  {
    id: 'BUD-001',
    name: '직접비 비율 70% 이상 (B2G)',
    action: 'WARN',
    check(input) {
      const projectType = input.projectType ?? 'B2G'
      if (projectType !== 'B2G') return null

      const { structure } = input.budget
      const total = structure.acTotal + structure.pcTotal
      if (total <= 0) return null

      const acRatio = structure.acTotal / total
      if (acRatio < 0.7) {
        const percent = Math.round(acRatio * 100)
        return {
          ruleId: 'BUD-001',
          ruleName: this.name,
          action: 'WARN',
          message: `직접비(AC) 비율이 ${percent}% 입니다. B2G 사업은 직접비 70% 이상이 권장됩니다.`,
        }
      }
      return null
    },
  },
  {
    id: 'BUD-002',
    name: '마진 10% 미만 (수익성 경고)',
    action: 'WARN',
    check(input) {
      const rate = input.budget.marginRate
      if (typeof rate !== 'number') return null
      if (rate < 0.1) {
        const percent = Math.round(rate * 100)
        return {
          ruleId: 'BUD-002',
          ruleName: this.name,
          action: 'WARN',
          message: `마진율이 ${percent}% 입니다. 10% 미만은 수익성 위험이 있으므로 구조 재검토를 권장합니다.`,
        }
      }
      return null
    },
  },
  {
    id: 'BUD-003',
    name: '마진 20% 초과 (감액 위험)',
    action: 'WARN',
    check(input) {
      const rate = input.budget.marginRate
      if (typeof rate !== 'number') return null
      if (rate > 0.2) {
        const percent = Math.round(rate * 100)
        return {
          ruleId: 'BUD-003',
          ruleName: this.name,
          action: 'WARN',
          message: `마진율이 ${percent}% 입니다. 20% 초과는 발주처 감액 위험이 있으므로 고마진 정당화 근거가 필요합니다.`,
        }
      }
      return null
    },
  },
  {
    id: 'BUD-004',
    name: 'AC 총액이 RFP 예산 초과',
    action: 'BLOCK',
    check(input) {
      if (input.rfpBudget == null) return null
      const acTotal = input.budget.structure.acTotal
      if (acTotal > input.rfpBudget) {
        const diff = acTotal - input.rfpBudget
        return {
          ruleId: 'BUD-004',
          ruleName: this.name,
          action: 'BLOCK',
          message: `직접비 총액(${acTotal.toLocaleString()}원)이 RFP 예산(${input.rfpBudget.toLocaleString()}원)을 ${diff.toLocaleString()}원 초과합니다.`,
        }
      }
      return null
    },
  },
  {
    id: 'BUD-005',
    name: '코치 단가 시장가 ±20% 벗어남',
    action: 'SUGGEST',
    check(input) {
      if (!input.marketRateRange) return null

      // coachAverageRate 우선, 없으면 BudgetItem 에서 "코치" / "사례비" 포함 항목 평균
      let avg = input.coachAverageRate
      if (avg == null) {
        const coachItems = input.budget.structure.items.filter((item) => {
          const keyword = `${item.category} ${item.name}`
          return /코치|멘토|강사|사례비/.test(keyword)
        })
        if (coachItems.length === 0) return null
        const sum = coachItems.reduce((acc, item) => acc + item.unitPrice, 0)
        avg = sum / coachItems.length
      }

      const { min, max } = input.marketRateRange
      const lowerBound = min * 0.8
      const upperBound = max * 1.2

      if (avg < lowerBound || avg > upperBound) {
        return {
          ruleId: 'BUD-005',
          ruleName: this.name,
          action: 'SUGGEST',
          message: `코치 평균 단가(${Math.round(avg).toLocaleString()}원)가 시장가 범위(${min.toLocaleString()}~${max.toLocaleString()}원) ±20% 를 벗어납니다. 근거 자료 보강을 권장합니다.`,
          affectedItems: input.budget.structure.items
            .filter((item) => /코치|멘토|강사|사례비/.test(`${item.category} ${item.name}`))
            .map((item) => item.wbsCode),
        }
      }
      return null
    },
  },
]

// ─────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────

/**
 * 예산에 대해 BUD-001~005 룰을 전부 돌린다.
 *
 * @returns passed=false 면 BLOCK 위반 1개 이상. violations 에 상세.
 */
export function validateBudgetRules(input: BudgetRuleInput): BudgetRuleValidationResult {
  const violations: BudgetRuleViolation[] = []

  for (const rule of RULES) {
    const violation = rule.check(input)
    if (violation) violations.push(violation)
  }

  const hasBlock = violations.some((v) => v.action === 'BLOCK')

  return {
    passed: !hasBlock,
    violations,
  }
}

/**
 * validateBudgetRules 결과를 BudgetSlice.warnings (BudgetWarning[]) 모양으로 변환.
 * Phase D 에서 POST /api/budget 응답 시 slice.warnings 에 바로 주입하기 위한 헬퍼.
 */
export function toBudgetWarnings(result: BudgetRuleValidationResult): BudgetWarning[] {
  return result.violations.map((v) => ({
    ruleId: v.ruleId,
    severity: v.action,
    message: v.message,
    affectedItems: v.affectedItems,
  }))
}

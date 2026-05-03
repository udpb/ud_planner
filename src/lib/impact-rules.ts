/**
 * 임팩트 룰 엔진 — Gate 2 결정론적 검증 (docs/architecture/quality-gates.md §1).
 *
 * curriculum-rules.ts 와 동일 패턴:
 *   - 고유 Rule ID (IMP-NNN)
 *   - action: 'BLOCK' | 'WARN' | 'SUGGEST'
 *   - 순수 함수 (side effect 없음, DB/AI 접근 없음)
 *
 * 룰 목록:
 *   IMP-001 Activity 개수가 커리큘럼 세션 수와 극단 괴리 → WARN
 *           (ADR-004: sessionsToActivities 결과여야 함)
 *   IMP-002 Outcome 에 SROI 프록시 매핑 없음 → SUGGEST
 *   IMP-003 측정 도구 미지정 Outcome (measurementPlan 부재) → WARN
 *   IMP-004 Impact 가 Impact Goal 과 관련 없음 (키워드 매칭) → SUGGEST
 *   IMP-005 Logic Model 5계층 (Input→Activity→Output→Outcome→Impact) 중 빈 계층 → WARN
 *
 * 사용처 (Phase D 연결 계획):
 *   - POST /api/impact 저장 전 검증 훅
 *   - Step 5 UI 에서 실시간 경고 배지
 *   - sroi-proxy 자산이 준비되면 IMP-002 availableSroiProxies 주입
 */

import type { ImpactSlice } from '@/lib/pipeline-context'
import type { LogicModelItem } from '@/lib/ai/logic-model'

// ─────────────────────────────────────────
// 공통 타입 (curriculum-rules.ts 와 동일 shape)
// ─────────────────────────────────────────

export interface ImpactRuleViolation {
  ruleId: string
  ruleName: string
  action: 'BLOCK' | 'WARN' | 'SUGGEST'
  message: string
  /** LogicModelItem.id 또는 계층명 */
  affectedItems?: string[]
}

export interface ImpactRuleValidationResult {
  passed: boolean
  violations: ImpactRuleViolation[]
}

// ─────────────────────────────────────────
// Rule Input
// ─────────────────────────────────────────

export interface ImpactRuleInput {
  impact: ImpactSlice
  /** 커리큘럼 세션 수 — IMP-001 검증용. 없으면 스킵. */
  curriculumSessionCount?: number
  /** SROI 프록시 키 목록 (sroi-proxy 자산 연결 시 주입, Phase D/E). 없으면 IMP-002 완화. */
  availableSroiProxies?: string[]
}

// ─────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────

/** 간이 한국어 키워드 추출 (공백/구두점 분리, 2글자 이상) */
function extractKeywords(text: string): string[] {
  if (!text) return []
  return text
    .split(/[\s,.\-·:;()\[\]{}"'/]+/u)
    .filter((w) => w.length >= 2)
    .map((w) => w.toLowerCase())
}

/** 두 문자열이 키워드 하나라도 공유하면 true */
function sharesKeyword(a: string, b: string): boolean {
  const ka = new Set(extractKeywords(a))
  if (ka.size === 0) return true // 비어있으면 검사 스킵
  for (const word of extractKeywords(b)) {
    if (ka.has(word)) return true
  }
  return false
}

// ─────────────────────────────────────────
// Rule 정의
// ─────────────────────────────────────────

interface ImpactDesignRule {
  id: string
  name: string
  action: 'BLOCK' | 'WARN' | 'SUGGEST'
  check: (input: ImpactRuleInput) => ImpactRuleViolation | null
}

const RULES: ImpactDesignRule[] = [
  {
    id: 'IMP-001',
    name: 'Activity - 커리큘럼 세션 1:1 대응',
    action: 'WARN',
    check(input) {
      if (input.curriculumSessionCount == null) return null
      const activityCount = input.impact.logicModel.activity.length
      if (activityCount === 0 || input.curriculumSessionCount === 0) return null

      // 세션 3배 이상 or 1/3 이하면 "극단 괴리" 로 판정
      const ratio = activityCount / input.curriculumSessionCount
      if (ratio < 1 / 3 || ratio > 3) {
        return {
          ruleId: 'IMP-001',
          ruleName: this.name,
          action: 'WARN',
          message: `Activity 수(${activityCount})와 커리큘럼 세션 수(${input.curriculumSessionCount})가 극단적으로 괴리됩니다. sessionsToActivities 로 재생성하여 정합성을 확보하세요.`,
        }
      }
      return null
    },
  },
  {
    id: 'IMP-002',
    name: 'Outcome SROI 프록시 매핑 누락',
    action: 'SUGGEST',
    check(input) {
      const outcomes = input.impact.logicModel.outcome
      if (outcomes.length === 0) return null

      const missing: LogicModelItem[] = outcomes.filter((o) => !o.sroiProxy || o.sroiProxy.trim() === '')
      if (missing.length === 0) return null

      // availableSroiProxies 가 주어졌다면 "잘못된 키" 까지 잡을 수 있으나,
      // 현재는 "비어있는 프록시" 만 SUGGEST.
      return {
        ruleId: 'IMP-002',
        ruleName: this.name,
        action: 'SUGGEST',
        message: `${missing.length}개 Outcome 에 SROI 프록시가 매핑되지 않았습니다. sroi-proxy 자산에서 적절한 항목을 선택하여 정량 가치를 산출하세요.`,
        affectedItems: missing.map((o) => o.id),
      }
    },
  },
  {
    id: 'IMP-003',
    name: '측정 도구 미지정 Outcome',
    action: 'WARN',
    check(input) {
      const outcomes = input.impact.logicModel.outcome
      if (outcomes.length === 0) return null

      const measuredItemIds = new Set(
        input.impact.measurementPlan.map((m) => m.logicModelItemId),
      )

      const unmeasured = outcomes.filter((o) => !measuredItemIds.has(o.id))
      if (unmeasured.length === 0) return null

      return {
        ruleId: 'IMP-003',
        ruleName: this.name,
        action: 'WARN',
        message: `${unmeasured.length}개 Outcome 에 측정 도구(measurementPlan)가 지정되지 않았습니다. 평가위원은 "어떻게 측정하나?" 를 반드시 묻습니다.`,
        affectedItems: unmeasured.map((o) => o.id),
      }
    },
  },
  {
    id: 'IMP-004',
    name: 'Impact 가 Impact Goal 과 무관',
    action: 'SUGGEST',
    check(input) {
      const goal = input.impact.goal || input.impact.logicModel.impactGoal
      if (!goal || goal.trim() === '') return null
      const impacts = input.impact.logicModel.impact
      if (impacts.length === 0) return null

      const unrelated = impacts.filter((item) => !sharesKeyword(goal, item.text))
      if (unrelated.length === 0) return null

      // 전체가 무관이어야 유의미한 SUGGEST (일부만 다르면 다양성으로 해석 가능)
      if (unrelated.length < impacts.length) return null

      return {
        ruleId: 'IMP-004',
        ruleName: this.name,
        action: 'SUGGEST',
        message: `Impact 항목들이 Impact Goal 과 키워드 접점이 없습니다. Goal 재확인 또는 Impact 표현을 Goal 에 맞춰 정렬하세요.`,
        affectedItems: unrelated.map((i) => i.id),
      }
    },
  },
  {
    id: 'IMP-005',
    name: 'Logic Model 5계층 중 빈 계층 존재',
    action: 'WARN',
    check(input) {
      const lm = input.impact.logicModel
      const layers: Array<{ key: keyof Pick<typeof lm, 'input' | 'activity' | 'output' | 'outcome' | 'impact'>; label: string }> = [
        { key: 'input', label: 'Input' },
        { key: 'activity', label: 'Activity' },
        { key: 'output', label: 'Output' },
        { key: 'outcome', label: 'Outcome' },
        { key: 'impact', label: 'Impact' },
      ]

      const empty = layers.filter((layer) => lm[layer.key].length === 0)
      if (empty.length === 0) return null

      return {
        ruleId: 'IMP-005',
        ruleName: this.name,
        action: 'WARN',
        message: `Logic Model 에 빈 계층이 있습니다: ${empty.map((l) => l.label).join(', ')}. 5계층(Input→Activity→Output→Outcome→Impact) 모두 채워야 논리 연결이 완성됩니다.`,
        affectedItems: empty.map((l) => l.label),
      }
    },
  },
]

// ─────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────

/**
 * 임팩트 슬라이스에 대해 IMP-001~005 룰을 전부 돌린다.
 *
 * @returns passed=false 면 BLOCK 위반 1개 이상. 현재 IMP 는 BLOCK 없으므로 항상 passed=true.
 */
export function validateImpactRules(input: ImpactRuleInput): ImpactRuleValidationResult {
  const violations: ImpactRuleViolation[] = []

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

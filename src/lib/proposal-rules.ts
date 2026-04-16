/**
 * 제안서 룰 엔진 — Gate 2 결정론적 검증 (docs/architecture/quality-gates.md §1).
 *
 * curriculum-rules.ts 와 동일 패턴:
 *   - 고유 Rule ID (PROP-NNN)
 *   - action: 'BLOCK' | 'WARN' | 'SUGGEST'
 *   - 순수 함수 (side effect 없음, DB/AI 접근 없음)
 *
 * 룰 목록:
 *   PROP-001 7개 섹션 모두 존재 → BLOCK (미완)
 *   PROP-002 섹션별 최소 분량 미달 → WARN
 *   PROP-003 ChannelPreset.avoidMessages 포함 → WARN (Phase D 본격, 자산 없으면 스킵)
 *   PROP-004 strategy.derivedKeyMessages 미반영 섹션 → SUGGEST (Phase D 본격, 키 없으면 스킵)
 *   PROP-005 브랜드 씨앗 키워드 0회 등장 → WARN
 *   PROP-006 금지 표현 (SKILL §11) 포함 → WARN
 *
 * Phase 연결:
 *   - Phase C (현재): PROP-001, 002, 005, 006 본격 가동
 *   - Phase D: PROP-003 (ChannelPreset 생성 후), PROP-004 (strategy 슬라이스 연동 후)
 *   - Phase D5: Gate 3 AI 검증 (당선 패턴 대조) 와 결합
 */

import type { ProposalSlice } from '@/lib/pipeline-context'

// ─────────────────────────────────────────
// 공통 타입 (curriculum-rules.ts 와 동일 shape)
// ─────────────────────────────────────────

export interface ProposalRuleViolation {
  ruleId: string
  ruleName: string
  action: 'BLOCK' | 'WARN' | 'SUGGEST'
  message: string
  /** sectionNo 또는 섹션 id 배열 */
  affectedItems?: Array<string | number>
}

export interface ProposalRuleValidationResult {
  passed: boolean
  violations: ProposalRuleViolation[]
}

// ─────────────────────────────────────────
// 기본값 상수 (Export)
// ─────────────────────────────────────────

/**
 * 제안서 섹션별 최소 글자수 (PROP-002).
 * 기준: 과거 수주 제안서 분석 (session_20260406.md 제안서 패턴 기준, 여유있게 설정).
 * 7개 섹션 순서: 1 사업배경 / 2 조직팀 / 3 커리큘럼 / 4 코치진 / 5 예산 / 6 임팩트 / 7 기타
 */
export const DEFAULT_MIN_CHARS: Record<number, number> = {
  1: 800,
  2: 800,
  3: 1000,
  4: 700,
  5: 700,
  6: 700,
  7: 500,
}

/**
 * 금지 표현 — SKILL §11 (언더독스 브랜드 가이드) 에서 도출.
 * - "AI 코치 상품/서비스": 우리는 "AI 를 활용한 코칭 지원" 이지 AI 자체를 코치로 팔지 않음.
 * - "약자" 단독 사용: Underdog 재정의 안에서만 써야 하므로 문맥 판단 필요
 *   → 단순 포함 체크로는 오탐 가능 → DEFAULT 에는 넣지 않음. 호출측에서 journey 기록용으로만 추가 주입.
 */
export const DEFAULT_FORBIDDEN_PHRASES: string[] = [
  'AI 코치 상품',
  'AI 코치 서비스',
]

/**
 * 필수 브랜드 씨앗 — 제안서 전체에서 최소 1회 이상 등장해야 하는 키워드 (PROP-005).
 * 출처: ud_proposal_patterns (수주 2건 공통 씨앗), ud_education_methodology.
 */
export const DEFAULT_BRAND_SEEDS: string[] = [
  'Action Week',
  '4중 지원',
  'IMPACT',
  'ACT-PRENEUR',
  '실행 보장',
  '정량',
]

// ─────────────────────────────────────────
// Rule Input
// ─────────────────────────────────────────

export interface ProposalRuleInput {
  proposal: ProposalSlice
  /** 섹션별 최소 분량 override. 미지정 시 DEFAULT_MIN_CHARS 사용. */
  minCharsPerSection?: Record<number, number>
  /** 금지 표현 리스트 override. 미지정 시 DEFAULT_FORBIDDEN_PHRASES 사용. */
  forbiddenPhrases?: string[]
  /** 필수 브랜드 씨앗 override. 미지정 시 DEFAULT_BRAND_SEEDS 사용. */
  requiredBrandSeeds?: string[]
  /** Phase D: ChannelPreset.avoidMessages 주입용. 없으면 PROP-003 스킵. */
  channelAvoidMessages?: string[]
  /** Phase D: Strategy.derivedKeyMessages 주입용. 없으면 PROP-004 스킵. */
  requiredKeyMessages?: string[]
}

// ─────────────────────────────────────────
// Rule 정의
// ─────────────────────────────────────────

interface ProposalDesignRule {
  id: string
  name: string
  action: 'BLOCK' | 'WARN' | 'SUGGEST'
  check: (input: ProposalRuleInput) => ProposalRuleViolation | null
}

const EXPECTED_SECTION_NOS: number[] = [1, 2, 3, 4, 5, 6, 7]

const RULES: ProposalDesignRule[] = [
  {
    id: 'PROP-001',
    name: '7개 섹션 모두 존재',
    action: 'BLOCK',
    check(input) {
      const presentNos = new Set(input.proposal.sections.map((s) => s.sectionNo))
      const missing = EXPECTED_SECTION_NOS.filter((n) => !presentNos.has(n))
      if (missing.length === 0) return null

      return {
        ruleId: 'PROP-001',
        ruleName: this.name,
        action: 'BLOCK',
        message: `제안서 섹션 ${missing.join(', ')} 번이 누락되었습니다. 7개 섹션(1 사업배경 / 2 조직 / 3 커리큘럼 / 4 코치 / 5 예산 / 6 임팩트 / 7 기타) 모두 생성되어야 합니다.`,
        affectedItems: missing,
      }
    },
  },
  {
    id: 'PROP-002',
    name: '섹션별 최소 분량 미달',
    action: 'WARN',
    check(input) {
      const minMap = input.minCharsPerSection ?? DEFAULT_MIN_CHARS
      const shortSections: number[] = []

      for (const section of input.proposal.sections) {
        const min = minMap[section.sectionNo]
        if (typeof min !== 'number') continue
        const len = section.content?.length ?? 0
        if (len < min) shortSections.push(section.sectionNo)
      }

      if (shortSections.length === 0) return null

      return {
        ruleId: 'PROP-002',
        ruleName: this.name,
        action: 'WARN',
        message: `섹션 ${shortSections.join(', ')} 번이 권장 분량(${Object.entries(minMap)
          .filter(([no]) => shortSections.includes(Number(no)))
          .map(([no, m]) => `§${no}:${m}자`)
          .join(' / ')}) 에 미달합니다.`,
        affectedItems: shortSections,
      }
    },
  },
  {
    id: 'PROP-003',
    name: 'ChannelPreset.avoidMessages 포함',
    action: 'WARN',
    check(input) {
      // Phase D stub — ChannelPreset 자산 연결 전까지 입력 없으면 스킵
      const avoid = input.channelAvoidMessages
      if (!avoid || avoid.length === 0) return null

      const hits: Array<{ sectionNo: number; phrase: string }> = []
      for (const section of input.proposal.sections) {
        const content = section.content ?? ''
        for (const phrase of avoid) {
          if (phrase && content.includes(phrase)) {
            hits.push({ sectionNo: section.sectionNo, phrase })
          }
        }
      }

      if (hits.length === 0) return null

      return {
        ruleId: 'PROP-003',
        ruleName: this.name,
        action: 'WARN',
        message: `발주처 유형에서 기피되는 표현이 발견되었습니다: ${hits.map((h) => `§${h.sectionNo}"${h.phrase}"`).join(', ')}.`,
        affectedItems: Array.from(new Set(hits.map((h) => h.sectionNo))),
      }
    },
  },
  {
    id: 'PROP-004',
    name: '키 메시지 미반영 섹션',
    action: 'SUGGEST',
    check(input) {
      // Phase D stub — Strategy.derivedKeyMessages 연결 전까지 입력 없으면 스킵
      const keys = input.requiredKeyMessages
      if (!keys || keys.length === 0) return null

      // 전 섹션 본문을 합쳐서 각 키 메시지가 1회 이상 등장하는지 체크
      const fullText = input.proposal.sections.map((s) => s.content ?? '').join('\n')
      const missing = keys.filter((k) => k && !fullText.includes(k))
      if (missing.length === 0) return null

      return {
        ruleId: 'PROP-004',
        ruleName: this.name,
        action: 'SUGGEST',
        message: `전략 슬라이스의 키 메시지 ${missing.length}개가 제안서 어느 섹션에도 반영되지 않았습니다: ${missing.map((m) => `"${m}"`).join(', ')}.`,
      }
    },
  },
  {
    id: 'PROP-005',
    name: '브랜드 씨앗 키워드 누락',
    action: 'WARN',
    check(input) {
      const seeds = input.requiredBrandSeeds ?? DEFAULT_BRAND_SEEDS
      if (seeds.length === 0) return null

      const fullText = input.proposal.sections.map((s) => s.content ?? '').join('\n')
      if (fullText.length === 0) return null

      const missing = seeds.filter((seed) => seed && !fullText.includes(seed))
      if (missing.length === 0) return null

      // 전부 누락이면 WARN (일부 누락은 다양성으로 허용할 수도 있으나 일단 전체 체크)
      // 절반 이상 누락이면 경고 가치 있음
      if (missing.length < Math.ceil(seeds.length / 2)) return null

      return {
        ruleId: 'PROP-005',
        ruleName: this.name,
        action: 'WARN',
        message: `언더독스 브랜드 씨앗이 대부분 누락되었습니다 (${missing.length}/${seeds.length}개): ${missing.join(', ')}. Action Week · 4중 지원 · IMPACT 등 차별화 키워드를 섹션에 반영하세요.`,
      }
    },
  },
  {
    id: 'PROP-006',
    name: '금지 표현 포함 (SKILL §11)',
    action: 'WARN',
    check(input) {
      const forbidden = input.forbiddenPhrases ?? DEFAULT_FORBIDDEN_PHRASES
      if (forbidden.length === 0) return null

      const hits: Array<{ sectionNo: number; phrase: string }> = []
      for (const section of input.proposal.sections) {
        const content = section.content ?? ''
        for (const phrase of forbidden) {
          if (phrase && content.includes(phrase)) {
            hits.push({ sectionNo: section.sectionNo, phrase })
          }
        }
      }

      if (hits.length === 0) return null

      return {
        ruleId: 'PROP-006',
        ruleName: this.name,
        action: 'WARN',
        message: `브랜드 가이드 위반 표현이 발견되었습니다: ${hits.map((h) => `§${h.sectionNo}"${h.phrase}"`).join(', ')}. SKILL §11 참조.`,
        affectedItems: Array.from(new Set(hits.map((h) => h.sectionNo))),
      }
    },
  },
]

// ─────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────

/**
 * 제안서 슬라이스에 대해 PROP-001~006 룰을 전부 돌린다.
 *
 * @returns passed=false 면 BLOCK 위반 1개 이상 (PROP-001 섹션 누락).
 */
export function validateProposalRules(input: ProposalRuleInput): ProposalRuleValidationResult {
  const violations: ProposalRuleViolation[] = []

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

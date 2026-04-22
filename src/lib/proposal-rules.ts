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
import {
  validateProfile,
  type ProfileIssue,
  type ProgramProfile,
  type RenewalContext,
} from '@/lib/program-profile'

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

// ─────────────────────────────────────────
// Phase E — ProgramProfile Gate 3 통합
// ─────────────────────────────────────────
//
// validateProfile() (src/lib/program-profile.ts) 를 Gate 3 파이프라인에 연결.
// 제안서 생성 전 호출해 블로커 이슈가 있으면 생성을 중단시키는 용도.
//
// 관리하는 룰 코드 (validateProfile 에서 나오는 것을 그대로 노출):
//   - renewal-context-missing           (blocker)
//   - renewal-lessons-empty             (warning)
//   - renewal-improvement-missing       (warning)
//   - methodology-mismatch              (warning)
//   - geography-global-no-support       (warning)
//
// 설계 결정: `validateProposalSection()` / `validateProposalRules()` 같은
// **섹션 단위** 룰 엔진과는 분리된 별도 함수로 노출한다.
//   - 프로파일 검증은 제안서 콘텐츠가 아니라 프로젝트 **전제 조건** 검증이므로,
//     섹션 생성 시마다 돌리는 것이 아니라 "생성 시작 직전" 한 번만 호출해야 한다.
//   - 따라서 외부 호출자 (예: /api/projects/[id]/proposal/generate) 가 먼저
//     `runPhaseEGates(project)` 를 돌리고, `hasBlocker()` 가 true 면 abort,
//     false 면 이후 `validateProposalRules()` 로 섹션 단위 검증을 진행하는
//     2-단계 흐름을 권장한다.
//   - 기존 `validateProposalRules()` 내부에서 자동 호출하지 않음 — 기존 호출자
//     (curriculum 등 중간 스텝) 에서도 의도치 않게 프로파일 검증이 돌면
//     false positive 경고가 쏟아지기 때문.

/**
 * Prisma 의 `Project` 모델 중 Phase E gate 에 필요한 필드만 추출한 shape.
 * `project.programProfile` / `project.renewalContext` 는 Json 컬럼이므로
 * 호출측에서 `as ProgramProfile | null` / `as RenewalContext | null` 로 캐스팅
 * 된 값이 들어온다고 가정한다.
 */
export interface PhaseEGateProjectInput {
  programProfile: ProgramProfile | null
  renewalContext: RenewalContext | null
}

/**
 * ProgramProfile · RenewalContext 를 기반으로 Phase E Gate 3 룰을 돌린다.
 *
 * - `programProfile` 이 null 이면 "아직 프로파일 작성 전" 으로 간주, 빈 배열 반환.
 *   → 경고/블로커 없음. 프로파일을 만들기 전에는 해당 룰이 적용되지 않는다.
 * - `programProfile` 이 있으면 `validateProfile()` 을 그대로 호출.
 *   → `channel.isRenewal && !renewalContext` 일 때만 블로커가 발생.
 */
export function runPhaseEGates(project: PhaseEGateProjectInput): ProfileIssue[] {
  const profile = project.programProfile as ProgramProfile | null
  if (!profile) return []

  const renewal = project.renewalContext as RenewalContext | null
  return validateProfile(profile, renewal)
}

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

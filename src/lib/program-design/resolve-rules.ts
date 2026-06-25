/**
 * BR-3a — 결정론적 규칙 해소 (AI 없음, 테스트 가능)
 *
 * `resolvePlan(input, approvedRules)` 가 각 결정 축을 **해소 우선순위**(추록 3)대로 채운다:
 *   ① input.intent / input.precedent (담당자 의도·선례) — source='intent'/'precedent'
 *   ② rfp.parsed / input.decisions (목표·RFP·사람 게이트 응답) — source='rfp'/'goal'/'human'
 *   ③ 매칭되는 approved DesignRule 기본값 — source='rule', ruleId 기록
 *   ④ 아무것도 없으면 → PlanGate (멈춤, 추측 채움 금지)
 *
 * 핵심 불변식:
 *   - **하드코딩 수치 0** — 회차·코칭·Action Week·실습% 등 어떤 수치도 이 파일에 박지 않는다.
 *     모든 값은 규칙(approved) 또는 입력에서 온다. 없으면 게이트.
 *   - **운영유형(D1)이 첫 분기** — RFP 신호가 명백하면 자동 선택, 모호하면 게이트.
 *   - **approved 0건 graceful** — 매칭 규칙이 없는 축은 게이트로. 크래시 없음.
 *   - 운영유형 키워드 신호는 v1.2 §04 디스크리미네이터의 **분류 어휘**일 뿐 수치가 아니다.
 *
 * Source 정본: docs/decisions/028-program-design-grammar.md 추록 3 ·
 *              docs/UD-Brain-CurriculumDesignLogic-v1.2.html §04·§08·§09.
 */

import type { DesignRule } from '@/lib/program-design/design-rule'

import type {
  DecisionLogEntry,
  DecisionStep,
  OperatingType,
  PlanGate,
  PlanInput,
  ResolveResult,
} from '@/lib/program-design/plan-types'
import { OPERATING_TYPES } from '@/lib/program-design/plan-types'

// ─────────────────────────────────────────────────────────────────
// 운영 유형 판별 어휘 (v1.2 §04 디스크리미네이터의 분류 신호)
//
// ⚠️ 이건 수치 하드코딩이 아니라 **분류 어휘**다. 규칙 A 의 decisionTree 가
//    "행사 본체 → T5", "개별 사업체 → T4" 라고 말하는 그 자연어 분기를 RFP
//    텍스트에서 탐지하기 위한 키워드 사전. 어떤 회차수·코칭수도 여기 없다.
// ─────────────────────────────────────────────────────────────────

/**
 * T5 강한 행사 신호 — 사업의 산출물 자체가 행사 운영(대행). 자동 T5.
 * (교육 마일스톤으로 오해될 여지 없음 — 본체가 행사 운영 그 자체.)
 */
const T5_STRONG = [
  '운영 대행',
  '운영대행',
  '행사 운영',
  '행사운영',
  '대행 용역',
  '행사 대행',
] as const

/**
 * T5 약한 행사어 — 행사어지만 교육 프로그램의 **마일스톤**일 수 있음.
 * 교육 신호와 공존하면 충돌 → 게이트(PM 결정). 단독이면 순수 행사 → T5.
 */
const T5_WEAK_EVENT = [
  '데모데이',
  '경진대회',
  '공모전',
  '박람회',
  '페스티벌',
  '컨퍼런스',
  '해커톤',
] as const

/**
 * 교육 신호 — 본체가 교육/육성인 코호트임을 시사. 약한 행사어와 공존하면
 * "행사 본체인가 / 교육의 마일스톤인가" 충돌 → 게이트로 위임.
 */
const EDUCATION_SIGNALS = [
  '교육',
  '육성',
  '양성',
  '과정',
  '커리큘럼',
  '역량',
  '캠프',
  '부트캠프',
  '아카데미',
  '코칭',
  '멘토링',
  '교육생',
  '수강',
  '워크숍',
  '강좌',
] as const

/** T4 개별 밀착형 신호 — 개별 사업체 단위(정기 모임 부적합). */
const T4_INDIVIDUAL_KEYWORDS = [
  '소상공인',
  '상인',
  '점포',
  '재창업',
  '자영업',
  '전통시장',
  '소공인',
  '후속 보육',
  '후속보육',
] as const

/** 운영 유형 판별 신호 탐지 결과. */
interface OperatingTypeSignal {
  type: OperatingType
  why: string
  evidence: string
}

/**
 * RFP 신호로 운영 유형이 **명백한지** 판별 (v1.2 §04 우선순위 — 행사? → 개별?).
 * 명백하면 그 유형 반환, 모호하면 null (→ 게이트).
 *
 * ⚠️ 명백한 T5/T4 신호만 자동. T1/T2/T3 구분(압축/동행/시간구조)은 신호가
 *    충분히 결정적이지 않은 경우가 많아 **게이트로 위임**한다 (추측 금지 — 사용자
 *    원칙 "자동 가능하면 자동, 모호하면 물음"의 보수적 적용).
 */
function detectOperatingType(input: PlanInput): OperatingTypeSignal | null {
  const haystack = buildSignalText(input)

  // 1순위 — 본체가 행사 운영 대행인가? (강한 신호 → 자동 T5)
  const strongHit = T5_STRONG.find((k) => haystack.includes(k))
  if (strongHit) {
    return {
      type: 'T5',
      why: `RFP 신호 "${strongHit}" — 사업의 산출물 자체가 행사 운영(대행). 본체가 교육이 아니라 행사 설계. v1.2 §04: 회차표를 강요하면 안 됨.`,
      evidence: strongHit,
    }
  }

  // 2순위 — 약한 행사어(데모데이·경진대회 등). 교육의 마일스톤일 수 있다.
  const weakHit = T5_WEAK_EVENT.find((k) => haystack.includes(k))
  if (weakHit) {
    const eduHit = EDUCATION_SIGNALS.find((k) => haystack.includes(k))
    if (eduHit) {
      // 행사어 + 교육 신호 공존 → 충돌. 오분류 대신 사람에게 위임(게이트).
      return null
    }
    // 교육 신호 전무 → 순수 행사 → 자동 T5.
    return {
      type: 'T5',
      why: `RFP 신호 "${weakHit}" — 교육 신호가 없어 행사 본체로 판별. v1.2 §04: 회차표를 강요하면 안 됨.`,
      evidence: weakHit,
    }
  }

  // 3순위 — 개별 사업체 단위인가? (T4)
  const t4hit = T4_INDIVIDUAL_KEYWORDS.find((k) => haystack.includes(k))
  if (t4hit) {
    return {
      type: 'T4',
      why: `RFP 신호 "${t4hit}" — 팀(코호트)이 아니라 개별 사업체 단위. v1.2 §04+§09-B: 정기 회차표 없는 게 정답.`,
      evidence: t4hit,
    }
  }

  // T1/T2/T3 은 신호만으로 결정하지 않는다 — 모호 → 게이트.
  return null
}

/** 운영 유형 신호 탐지용 텍스트 결합 (RFP 핵심 필드). */
function buildSignalText(input: PlanInput): string {
  const p = input.rfp.parsed
  const parts: string[] = [
    p.projectName ?? '',
    p.summary ?? '',
    p.targetAudience ?? '',
    ...(p.objectives ?? []),
    ...(p.deliverables ?? []),
    ...(p.keywords ?? []),
    ...(p.targetStage ?? []),
  ]
  return parts.join(' ')
}

// ─────────────────────────────────────────────────────────────────
// 입력 우선순위 해소 (① 의도·선례 → ② 목표·RFP·사람 → ③ 규칙)
// ─────────────────────────────────────────────────────────────────

/** 한 축에 대해 상위(①②) 입력에 값이 있으면 그 출처와 값을 반환. */
function resolveFromInputs(
  input: PlanInput,
  axis: string,
): { value: unknown; source: DecisionLogEntry['source']; note: string } | null {
  // ① 담당자 의도
  if (input.intent?.decisions && axis in input.intent.decisions) {
    return {
      value: input.intent.decisions[axis],
      source: 'intent',
      note: '담당자 운영 의도에서 명시',
    }
  }
  // ① 선례
  if (input.precedent?.decisions && axis in input.precedent.decisions) {
    return {
      value: input.precedent.decisions[axis],
      source: 'precedent',
      note: '이전 진행(선례)에서 명시',
    }
  }
  // ② 사람 게이트 응답 / RFP 외 명시 결정
  if (input.decisions && axis in input.decisions) {
    return {
      value: input.decisions[axis],
      source: 'human',
      note: '사람 결정(게이트 응답 또는 명시 입력)',
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────
// 규칙 매칭 (condition.dimension/match 평가)
// ─────────────────────────────────────────────────────────────────

/** 규칙 condition 이 현재 컨텍스트에 발동하는가? */
function ruleMatches(
  rule: DesignRule,
  ctx: { operatingType?: OperatingType; demographics: string[] },
): boolean {
  const { dimension, match } = rule.condition
  if (dimension === 'always') return true

  // operatingType 축 — 결정된 유형과 비교.
  if (dimension === 'operatingType') {
    if (!ctx.operatingType) return false
    return matchValue(match, ctx.operatingType)
  }

  // demographic 축 — RFP 대상에서 추출한 인구통계와 비교.
  if (dimension === 'demographic') {
    return ctx.demographics.some((d) => matchValue(match, d, true))
  }

  // channel / targetStage / budgetBand / goalType — 이 결정론 단계에서는
  // 신뢰할 추출이 없으면 매칭하지 않는다 (게이트로 위임). 추측 금지.
  return false
}

/** match(string|string[]) 와 후보값 비교. partial=true 면 부분 포함도 허용(인구통계). */
function matchValue(
  match: string | string[] | undefined,
  candidate: string,
  partial = false,
): boolean {
  if (match === undefined) return true
  const arr = Array.isArray(match) ? match : [match]
  return arr.some((m) =>
    partial ? candidate.includes(m) || m.includes(candidate) : candidate === m,
  )
}

/** RFP 대상에서 인구통계 토큰 추출 (규칙 F demographic 매칭용 — 분류 어휘). */
function extractDemographics(input: PlanInput): string[] {
  const text = [
    input.rfp.parsed.targetAudience ?? '',
    ...(input.rfp.parsed.targetStage ?? []),
    ...(input.rfp.parsed.keywords ?? []),
  ].join(' ')
  const DEMO_TOKENS = [
    '청년',
    '대학생',
    '청소년',
    '소상공인',
    '상인',
    '임직원',
    '시니어',
    '재창업',
  ]
  return DEMO_TOKENS.filter((d) => text.includes(d))
}

// ─────────────────────────────────────────────────────────────────
// D1 운영 유형 해소
// ─────────────────────────────────────────────────────────────────

function resolveOperatingType(
  input: PlanInput,
  approvedRules: DesignRule[],
): { decided?: DecisionLogEntry; gate?: PlanGate; operatingType?: OperatingType } {
  const axis = 'operatingType'
  const discriminatorRule = approvedRules.find(
    (r) => r.ruleType === 'A_operatingType',
  )
  const profileRules = approvedRules.filter((r) => r.ruleType === 'B_typeProfile')

  // ① 의도/선례 / ② 사람·RFP 명시
  const fromInput = resolveFromInputs(input, axis)
  if (fromInput && isOperatingType(fromInput.value)) {
    return {
      operatingType: fromInput.value,
      decided: {
        step: 'D1',
        axis,
        decision: `운영 유형 = ${fromInput.value}`,
        rationale: `${fromInput.note} — 회차표보다 먼저 정하는 첫 분기.`,
        evidence: { source: fromInput.source },
        ruleIds: [],
        source: fromInput.source,
      },
    }
  }

  // 운영 유형은 approved 규칙 없이도 RFP 신호가 명백하면 자동 (v1.2 §04 분류 어휘).
  // 단 결정 로그의 근거(evidence)는 A 규칙(approved)이 있으면 그걸 인용, 없으면 v1.2 직접.
  const signal = detectOperatingType(input)
  if (signal) {
    const ruleIds = discriminatorRule ? [discriminatorRule.id] : []
    return {
      operatingType: signal.type,
      decided: {
        step: 'D1',
        axis,
        decision: `운영 유형 = ${signal.type}`,
        rationale: signal.why,
        evidence: discriminatorRule
          ? {
              source: discriminatorRule.evidence.source,
              stat: discriminatorRule.evidence.stat,
              n: discriminatorRule.evidence.n,
            }
          : { source: 'v1.2:§04', stat: `자동 판별 신호 "${signal.evidence}"` },
        ruleIds,
        source: 'rfp',
      },
    }
  }

  // 모호 → 게이트. (approved 규칙 유무와 무관하게 신호가 약하면 사람에게.)
  const options = profileRules.length
    ? profileRules.map((r) => ({ type: typeFromCondition(r), label: r.title, ruleId: r.id }))
    : OPERATING_TYPES.map((t) => ({ type: t }))
  return {
    gate: {
      axis,
      step: 'D1',
      question:
        '운영 유형을 결정해주세요 (회차표보다 먼저). 교육이 본체인가/행사가 본체인가 → 팀인가/개별 사업체인가 → 압축인가/동행인가 → 대상이 시간을 통으로 낼 수 있는가.',
      options,
      ruleId: discriminatorRule?.id,
      why: discriminatorRule
        ? 'RFP 신호가 행사(T5)·개별(T4)로 명백하지 않아 자동 판별 보류 — v1.2 §04 판별 순서를 사람이 확정.'
        : 'A_operatingType 디스크리미네이터 규칙이 아직 승인되지 않았고 RFP 신호도 모호 — 사람이 결정.',
      reason: discriminatorRule ? 'ambiguous_signal' : 'no_approved_rule',
    },
  }
}

function isOperatingType(v: unknown): v is OperatingType {
  return typeof v === 'string' && (OPERATING_TYPES as readonly string[]).includes(v)
}

/** B_typeProfile 규칙 condition.match 에서 운영 유형 추출 (게이트 옵션 라벨용). */
function typeFromCondition(r: DesignRule): OperatingType | undefined {
  const m = r.condition.match
  const v = Array.isArray(m) ? m[0] : m
  return isOperatingType(v) ? v : undefined
}

// ─────────────────────────────────────────────────────────────────
// 비-D1 축 규칙 해소 (B~G 그룹) — 입력 우선, 없으면 규칙, 없으면 게이트
// ─────────────────────────────────────────────────────────────────

/** ruleType → 결정 단계(D0~D8) 매핑 (로그·게이트 정렬용). */
const RULE_TYPE_TO_STEP: Record<DesignRule['ruleType'], DecisionStep> = {
  A_operatingType: 'D1',
  B_typeProfile: 'D1',
  C_flowGrammar: 'D4',
  D_budgetStructure: 'D4',
  E_immersionSet: 'D2',
  F_audienceDefault: 'D2',
  G_inputGate: 'D2',
  Z_meta: 'D0',
}

/**
 * 한 규칙을 해소한다:
 *   - 상위 입력(①②)에 같은 축 값 있으면 그것 채택 (규칙 무시 — 덮어쓰지 않음).
 *   - 없으면 decisionPolicy 에 따라:
 *       auto / auto_unless_conflict → 자동 채움 (source='rule').
 *       ask_human                  → 게이트.
 */
function resolveRuleAxis(
  rule: DesignRule,
  input: PlanInput,
): { decided?: DecisionLogEntry; gate?: PlanGate } {
  const axis = rule.recommend.target
  const step = RULE_TYPE_TO_STEP[rule.ruleType]

  // 상위 입력이 정했으면 그것 (규칙은 빈칸만 채운다 — 추록 3).
  const fromInput = resolveFromInputs(input, axis)
  if (fromInput) {
    return {
      decided: {
        step,
        axis,
        decision: `${axis} = ${stringifyValue(fromInput.value)}`,
        rationale: `${fromInput.note} — 규칙(${rule.id})보다 우선(해소 우선순위).`,
        evidence: { source: fromInput.source },
        ruleIds: [rule.id],
        source: fromInput.source,
      },
    }
  }

  // ask_human → 항상 게이트 (상위에서 안 풀렸으므로).
  if (rule.decisionPolicy === 'ask_human') {
    return {
      gate: {
        axis,
        step,
        question: gateQuestion(rule),
        options: gateOptions(rule),
        recommended: rule.recommend.value,
        ruleId: rule.id,
        why: `${rule.title} — ask_human 정책: 상위(선례·의도·RFP)에서 안 풀려 사람에게 위임. ${rule.rationale}`,
        reason: 'ask_human',
      },
    }
  }

  // auto / auto_unless_conflict → 자동 채움.
  // ⚠️ 충돌 감지(auto_unless_conflict)는 신뢰할 상위 명시값이 있을 때만 의미가 있는데,
  //    여기까지 왔다는 건 상위에 값이 없다는 뜻 → 충돌 대상 없음 → 그대로 기본값 채움.
  return {
    decided: {
      step,
      axis,
      decision: `${axis} = ${stringifyValue(rule.recommend.value)} (기본값)`,
      rationale: `${rule.title} — ${rule.rationale}`,
      evidence: {
        source: rule.evidence.source,
        stat: rule.evidence.stat,
        n: rule.evidence.n,
      },
      ruleIds: [rule.id],
      source: 'rule',
    },
  }
}

function gateQuestion(rule: DesignRule): string {
  return `${rule.title} — 어떻게 할까요?`
}

/** 규칙 value 에서 사람에게 보일 선택지 추출 (set/discriminator/options 형태). */
function gateOptions(rule: DesignRule): unknown[] | undefined {
  const v = rule.recommend.value
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>
    if (Array.isArray(obj.options)) return obj.options
    if (Array.isArray((obj as { decisionTree?: unknown }).decisionTree)) {
      return (obj as { decisionTree: unknown[] }).decisionTree
    }
  }
  return undefined
}

/** 결정 로그 표시용 값 직렬화 (객체는 축약). */
function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return '(미정)'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    const s = JSON.stringify(v)
    return s.length > 160 ? s.slice(0, 157) + '…' : s
  } catch {
    return '(복합값)'
  }
}

// ─────────────────────────────────────────────────────────────────
// resolvePlan — 결정론 진입점
// ─────────────────────────────────────────────────────────────────

/**
 * 입력 + approved 규칙 → 결정/게이트/운영유형 (AI 없음, 순수 함수).
 *
 * graceful: approvedRules 가 비어 있으면 D1 은 RFP 신호로 자동 가능하지만(규칙 무관),
 *           나머지 축은 채울 규칙이 없으므로 결정 로그가 거의 비고 — 게이트도 D1 외에는
 *           띄울 규칙조차 없다(어떤 축이 필요한지 규칙이 정의). 즉 규칙 승인 전에는
 *           "운영유형만 자동/게이트, 나머지는 규칙 승인 후 등장" — 정상 동작.
 */
export function resolvePlan(
  input: PlanInput,
  approvedRules: DesignRule[],
): ResolveResult {
  const decided: DecisionLogEntry[] = []
  const gates: PlanGate[] = []

  // ── D1: 운영 유형 (첫 분기) ──
  const op = resolveOperatingType(input, approvedRules)
  if (op.decided) decided.push(op.decided)
  if (op.gate) gates.push(op.gate)
  const operatingType = op.operatingType

  // ── 비-D1 축: condition 이 발동하는 approved 규칙만 ──
  const demographics = extractDemographics(input)
  const ctx = { operatingType, demographics }

  // A·B(운영유형) 외 그룹만 (운영유형은 위에서 처리).
  const otherRules = approvedRules.filter(
    (r) => r.ruleType !== 'A_operatingType' && r.ruleType !== 'B_typeProfile',
  )

  // 같은 축을 여러 규칙이 건드릴 수 있으므로, 축당 한 번만 해소(첫 발동 규칙).
  const handledAxes = new Set<string>()
  for (const rule of otherRules) {
    if (!ruleMatches(rule, ctx)) continue
    const axis = rule.recommend.target
    if (handledAxes.has(axis)) continue
    handledAxes.add(axis)

    const res = resolveRuleAxis(rule, input)
    if (res.decided) decided.push(res.decided)
    if (res.gate) gates.push(res.gate)
  }

  return { decided, gates, operatingType }
}

/**
 * logic-model-builder — ADR-004 Activity-Session 매핑 구현 (stateless).
 *
 * 책임:
 *   1. `sessionsToActivities()` — 커리큘럼 세션을 결정론적 규칙으로 Activity 에 그룹핑.
 *      (Action Week / 1:1 코칭 / 이론 / 워크숍-IMPACT단계별)
 *   2. `deriveInputs()`       — 코치·예산·인프라 Input 자동 유도 (미배정 시 fallback).
 *   3. `buildLogicModel()`    — 위 결정론 결과에 AI 로 생성된 Output/Outcome/Impact 합성.
 *
 * AI 역할 축소:
 *   - Activity / Input 은 AI 가 생성·수정하지 않음. 프롬프트에 "확정됨"으로 주입.
 *   - AI 는 각 Activity 에 대한 Output, 전체 Outcome 2~4개, 최종 Impact 1~2개만 생성.
 *   - 검증에서 Activity 원본 보존 여부 체크, 깨지면 재시도.
 *
 * DB 저장 ❌ — PM 이 확정한 뒤 별도 API 가 담당.
 *
 * 관련 문서:
 *   - ADR-004: `docs/decisions/004-activity-session-mapping.md`
 *   - ADR-001: `docs/decisions/001-pipeline-reorder.md`
 *   - 데이터 계약: `docs/architecture/data-contract.md` §1.2 ImpactSlice
 *
 * 관련 모듈:
 *   - `src/lib/claude.ts`       — LogicModel / LogicModelItem 타입 · CLAUDE_MODEL · anthropic
 *   - `src/lib/pipeline-context.ts` — RfpSlice / CurriculumSlice / CoachesSlice / BudgetSlice
 *   - `src/lib/ud-brand.ts`     — IMPACT_STAGE_OVERVIEW (단계명 풀 네임 해석용)
 */

import {
  anthropic,
  CLAUDE_MODEL,
  formatExternalResearch,
  type ExternalResearch,
  type LogicModel,
  type LogicModelItem,
} from '@/lib/claude'
import type {
  BudgetSlice,
  CoachesSlice,
  CurriculumSession,
  CurriculumSlice,
  RfpSlice,
} from '@/lib/pipeline-context'
import { IMPACT_STAGE_OVERVIEW } from '@/lib/ud-brand'

// ═════════════════════════════════════════════════════════════════
// 1. 공개 타입
// ═════════════════════════════════════════════════════════════════

export type ActivityType = 'ACTION_WEEK' | 'COACHING' | 'THEORY' | 'WORKSHOP'

/** 결정론적으로 추출된 Activity 초안 (AI 가 수정하지 않음) */
export interface ActivityDraft {
  type: ActivityType
  title: string
  /** 이 Activity 가 덮는 원본 sessionNo 들 */
  sourceSessionNos: number[]
  /** 규칙 기반 Output 후보 — AI 가 보강 가능 */
  defaultOutputs: string[]
}

export type InputType = 'HUMAN' | 'FINANCIAL' | 'INFRASTRUCTURE'

export interface InputDraft {
  type: InputType
  title: string
  detail: string
}

export interface BuildLogicModelInput {
  rfp: RfpSlice
  /** 필수 — 커리큘럼 확정이 선행되어야 함 (ADR-001) */
  curriculum: CurriculumSlice
  /** optional — 있으면 Input 이 구체화됨 */
  coaches?: CoachesSlice
  /** optional — 있으면 Input 이 구체화됨 */
  budget?: BudgetSlice
  /** PM 이 확정한 Impact Goal (Step 5 UI 입력값) */
  impactGoal: string
  /**
   * optional — PM 이 pm-guide 우측 패널에서 수집한 티키타카 리서치 답변들.
   * formatExternalResearch() 로 프롬프트에 주입돼 Outcome/Impact 품질을 높인다.
   * Step 5 ResearchRequests (imp-outcome-indicators · imp-diagnostic-tools 등) 가
   * 이 경로를 통해 Logic Model 생성에 직접 영향.
   */
  externalResearch?: ExternalResearch[]
}

export type BuildLogicModelResult =
  | { ok: true; data: LogicModel }
  | { ok: false; error: string; raw?: string }

// ═════════════════════════════════════════════════════════════════
// 2. sessionsToActivities — ADR-004 결정론 알고리즘
// ═════════════════════════════════════════════════════════════════

/**
 * 커리큘럼 세션을 Activity 로 그룹핑 (순수 함수, AI 호출 없음).
 *
 * 규칙 (ADR-004 Option B):
 *   1. `isActionWeek=true` 세션 전체 → "실전 실행 주간" Activity 1개
 *   2. `isCoaching1on1=true && !isActionWeek` 세션 전체 → "개별 멘토링" Activity 1개
 *   3. `isTheory=true && !Action Week && !Coaching` 세션 전체 → "이론 교육" Activity 1개
 *   4. 나머지 워크숍/실습 → IMPACT 단계(I/M/P/A/C/T) 매핑이 있으면 단계별,
 *      없으면 순서 근접성으로 3개씩 묶어 여러 Activity.
 *
 * 결과: 일반적으로 15 세션 → 4~7 Activity (ADR-004 기대값).
 */
export function sessionsToActivities(
  sessions: CurriculumSession[],
): ActivityDraft[] {
  const activities: ActivityDraft[] = []

  // 1. Action Week 통합
  const awSessions = sessions.filter((s) => s.isActionWeek)
  if (awSessions.length > 0) {
    activities.push({
      type: 'ACTION_WEEK',
      title: `실전 실행 주간 (${awSessions.length}회차)`,
      sourceSessionNos: awSessions.map((s) => s.sessionNo),
      defaultOutputs: ['실행 계획서', '중간 점검 보고서', '최종 실행 결과물'],
    })
  }

  // 2. 1:1 코칭 통합 (Action Week 와 중복 제외)
  const coachingSessions = sessions.filter(
    (s) => s.isCoaching1on1 && !s.isActionWeek,
  )
  if (coachingSessions.length > 0) {
    activities.push({
      type: 'COACHING',
      title: `개별 멘토링 (${coachingSessions.length}회)`,
      sourceSessionNos: coachingSessions.map((s) => s.sessionNo),
      defaultOutputs: ['코칭 일지', '실행 피드백', '개선 계획'],
    })
  }

  // 3. 이론 통합 (Action Week / 코칭 제외)
  const theorySessions = sessions.filter(
    (s) => s.isTheory && !s.isActionWeek && !s.isCoaching1on1,
  )
  if (theorySessions.length > 0) {
    activities.push({
      type: 'THEORY',
      title: `이론 교육 (${theorySessions.length}회)`,
      sourceSessionNos: theorySessions.map((s) => s.sessionNo),
      defaultOutputs: theorySessions.map((s) => s.title),
    })
  }

  // 4. 워크숍/실습 — IMPACT 단계별 or 순서 근접성으로 그룹핑
  const workshopSessions = sessions.filter(
    (s) => !s.isTheory && !s.isActionWeek && !s.isCoaching1on1,
  )
  const grouped = groupWorkshopSessions(workshopSessions)
  for (const group of grouped) {
    activities.push({
      type: 'WORKSHOP',
      title: deriveGroupTitle(group),
      sourceSessionNos: group.map((s) => s.sessionNo),
      defaultOutputs: group.map((s) => `${s.title} 산출물`),
    })
  }

  return activities
}

/**
 * 워크숍 세션 그룹핑:
 *   1) `impactModuleCode` 첫 글자(I/M/P/A/C/T) 로 분류.
 *   2) 해당 글자가 있는 세션들은 단계별 그룹으로 묶되, 단계별 최대 4개 초과 시 4개 단위로 분할.
 *   3) `impactModuleCode` 없는 세션들은 원래 세션 순서대로 3개씩 묶음.
 *
 * 결과는 sessionNo 오름차순으로 안정 정렬.
 */
function groupWorkshopSessions(
  sessions: CurriculumSession[],
): CurriculumSession[][] {
  if (sessions.length === 0) return []

  const stageGroups = new Map<string, CurriculumSession[]>()
  const unmapped: CurriculumSession[] = []

  for (const s of sessions) {
    const code = s.impactModuleCode
    const stage =
      code && typeof code === 'string' && code.length > 0
        ? code.charAt(0).toUpperCase()
        : ''
    if (stage && 'IMPACT'.includes(stage)) {
      const arr = stageGroups.get(stage) ?? []
      arr.push(s)
      stageGroups.set(stage, arr)
    } else {
      unmapped.push(s)
    }
  }

  const result: CurriculumSession[][] = []

  // IMPACT 순서대로 돌기 (I → M → P → A → C → T)
  const STAGE_ORDER = ['I', 'M', 'P', 'A', 'C', 'T']
  for (const stage of STAGE_ORDER) {
    const arr = stageGroups.get(stage)
    if (!arr || arr.length === 0) continue
    arr.sort((a, b) => a.sessionNo - b.sessionNo)
    // 각 단계 그룹은 최대 4개 → 넘으면 4개 단위로 쪼갬
    for (let i = 0; i < arr.length; i += 4) {
      result.push(arr.slice(i, i + 4))
    }
  }

  // 매핑 없는 세션들 → sessionNo 순서로 3개씩 묶기
  if (unmapped.length > 0) {
    unmapped.sort((a, b) => a.sessionNo - b.sessionNo)
    for (let i = 0; i < unmapped.length; i += 3) {
      result.push(unmapped.slice(i, i + 3))
    }
  }

  return result
}

/** 그룹 하나에 붙일 Activity 타이틀 — IMPACT 단계이면 단계명, 아니면 "{첫 제목} 외 N회차". */
function deriveGroupTitle(group: CurriculumSession[]): string {
  if (group.length === 0) return '워크숍'

  // 같은 IMPACT 단계(첫 글자 동일)인지 확인
  const firstStage = firstImpactStage(group[0])
  const allSameStage =
    firstStage !== null &&
    group.every((s) => firstImpactStage(s) === firstStage)

  if (allSameStage && firstStage) {
    const info = IMPACT_STAGE_OVERVIEW.find((x) => x.code === firstStage)
    const name = info?.name ?? firstStage
    return `${firstStage} (${name}) 단계 워크숍 (${group.length}회차)`
  }

  const head = group[0].title || `세션 ${group[0].sessionNo}`
  if (group.length === 1) return head
  return `${head} 외 ${group.length - 1}회차`
}

function firstImpactStage(s: CurriculumSession): string | null {
  const code = s.impactModuleCode
  if (!code || typeof code !== 'string' || code.length === 0) return null
  const ch = code.charAt(0).toUpperCase()
  return 'IMPACT'.includes(ch) ? ch : null
}

// ═════════════════════════════════════════════════════════════════
// 3. deriveInputs — 코치·예산·인프라 고정 템플릿
// ═════════════════════════════════════════════════════════════════

/**
 * 코치/예산 슬라이스가 있으면 실측값으로, 없으면 fallback 메시지로 Input 생성.
 * 인프라 항목은 항상 고정 문구.
 */
export function deriveInputs(
  coaches?: CoachesSlice,
  budget?: BudgetSlice,
): InputDraft[] {
  const inputs: InputDraft[] = []

  if (coaches && coaches.assignments.length > 0) {
    inputs.push({
      type: 'HUMAN',
      title: `코치진 ${coaches.assignments.length}명`,
      detail:
        coaches.totalFee > 0
          ? `총 사례비 ${coaches.totalFee.toLocaleString()}원`
          : '코치 배정 확정',
    })
  } else {
    inputs.push({
      type: 'HUMAN',
      title: '코치진 (미배정)',
      detail: 'Step 3 코치 매칭 완료 후 자동 반영',
    })
  }

  if (budget) {
    inputs.push({
      type: 'FINANCIAL',
      title: `사업 예산 ${budget.structure.acTotal.toLocaleString()}원`,
      detail: `마진 ${budget.marginRate}%`,
    })
  } else {
    inputs.push({
      type: 'FINANCIAL',
      title: '사업 예산 (미확정)',
      detail: 'Step 4 예산 확정 후 자동 반영',
    })
  }

  // 인프라는 항상 고정
  inputs.push({
    type: 'INFRASTRUCTURE',
    title: '교육 인프라',
    detail: '온·오프라인 교육장, 언더베이스 LMS, EduBot AI 도우미',
  })

  return inputs
}

// ═════════════════════════════════════════════════════════════════
// 4. 프롬프트 조립
// ═════════════════════════════════════════════════════════════════

/**
 * AI 에 주입할 Activity 리스트 직렬화.
 * AI 가 "Activity 는 수정 금지" 인식하도록 괄호 강조 + sessionNos 포함.
 */
function serializeActivitiesForPrompt(activities: ActivityDraft[]): string {
  if (activities.length === 0) {
    return '(Activity 없음 — 커리큘럼 세션이 비어있음)'
  }
  return activities
    .map((a, i) => {
      const sn = a.sourceSessionNos.length > 0 ? a.sourceSessionNos.join(',') : '-'
      const outs =
        a.defaultOutputs.length > 0
          ? ` · 기본 Output 후보: ${a.defaultOutputs.join(' / ')}`
          : ''
      return `  ${i + 1}. [${a.type}] ${a.title} (sessionNos: ${sn})${outs}`
    })
    .join('\n')
}

function serializeInputsForPrompt(inputs: InputDraft[]): string {
  return inputs
    .map((inp, i) => `  ${i + 1}. [${inp.type}] ${inp.title} — ${inp.detail}`)
    .join('\n')
}

function serializeRfpSummary(rfp: RfpSlice): string {
  const p = rfp.parsed
  const lines: string[] = []
  if (p.projectName) lines.push(`  - 사업명: ${p.projectName}`)
  if (p.client) lines.push(`  - 발주기관: ${p.client}`)
  if (p.targetAudience) {
    lines.push(
      `  - 대상: ${p.targetAudience}${p.targetCount ? ` / ${p.targetCount}명` : ''}`,
    )
  }
  if (p.targetStage?.length) lines.push(`  - 창업 단계: ${p.targetStage.join(', ')}`)
  if (p.objectives?.length) lines.push(`  - 사업 목표: ${p.objectives.join(' · ')}`)
  if (p.summary) lines.push(`  - 요약: ${p.summary}`)
  return lines.length > 0 ? lines.join('\n') : '  (RFP 정보 부족)'
}

/** Logic Model 생성용 프롬프트 — Activity/Input 은 고정 주입, AI 는 Output/Outcome/Impact 만. */
export function buildLogicModelPrompt(args: {
  rfp: RfpSlice
  impactGoal: string
  activities: ActivityDraft[]
  inputs: InputDraft[]
  reinforced?: boolean
  externalResearch?: ExternalResearch[]
}): string {
  const { rfp, impactGoal, activities, inputs, reinforced, externalResearch } = args

  const activityBlock = serializeActivitiesForPrompt(activities)
  const inputBlock = serializeInputsForPrompt(inputs)
  const rfpBlock = serializeRfpSummary(rfp)
  // PM 티키타카 리서치 — Step 5 ResearchRequestsCard 답변이 여기로 흘러옴
  const researchBlock =
    externalResearch && externalResearch.length > 0
      ? formatExternalResearch(externalResearch)
      : ''

  const reinforceNote = reinforced
    ? `\n[재시도 — 더 엄격하게]\n이전 응답에서 Activity 개수/이름이 변경되었거나 필수 필드가 누락되었습니다.\n❌ Activity 의 type·title·sourceSessionNos 는 한 글자도 바꾸지 마세요.\n❌ Activity 개수를 늘리거나 줄이지 마세요.\n❌ Input 도 수정 금지. 오직 activityOutputs / outcome / impact 만 생성.\nJSON 형식을 엄격히 지키세요.\n`
    : ''

  return `당신은 소셜임팩트 전문가이자 교육 프로그램 설계 컨설턴트입니다.
커리큘럼·코치·예산이 이미 확정된 상태에서 Logic Model 을 완성하세요.
${reinforceNote}
[언더독스 실행 철학]
"해보기 전엔 아무것도 모른다" — Outcome 은 반드시 "실행 경험"을 핵심 변화로 서술하세요.
참여자가 교실 안에서 배운 것이 아니라 현장에서 해본 것이 Outcome 입니다.

[PM 이 확정한 Impact Goal — 그대로 사용]
"${impactGoal}"

[RFP 핵심 정보]
${rfpBlock}
${researchBlock}
═══════════════════════════════════════
[고정된 Activity — 절대 수정 금지]
═══════════════════════════════════════
다음 Activity 들은 이미 커리큘럼에서 결정론적으로 자동 추출되었습니다.
❌ 이 Activity 를 바꾸거나 줄이거나 합치거나 새로 만들지 마세요.
❌ title, type, sourceSessionNos 를 변경하지 마세요.
⭕ 각 Activity 에 대한 Output 을 activityOutputs[] 에 생성하고,
   전체 Outcome 2~4개 / 최종 Impact 1~2개 만 생성하세요.

${activityBlock}

═══════════════════════════════════════
[고정된 Input — 절대 수정 금지]
═══════════════════════════════════════
❌ Input 도 수정하지 마세요. 아래 리스트를 그대로 사용하세요.

${inputBlock}

═══════════════════════════════════════
[출력 스펙]
═══════════════════════════════════════

응답은 반드시 아래 JSON 형식만 반환하세요 (마크다운 코드블록 / 주석 / 설명 금지).

{
  "activityOutputs": [
    {
      "activityIndex": 0,
      "outputs": [
        { "text": "Activity 0 에서 나오는 구체 산출물 1", "sroiProxy": "선택" },
        { "text": "산출물 2", "sroiProxy": "선택" }
      ]
    }
    // Activity 개수만큼 엔트리 (위에 나열된 순서대로 0, 1, 2, ...)
  ],
  "outcome": [
    { "text": "참여자 변화 1 (실행 경험 기반)", "sroiProxy": "교육훈련 임팩트", "estimatedValue": "인당 추정가치", "linkedTo": ["OP-1"] }
    // 2~4개
  ],
  "impact": [
    { "text": "최종 사회적 변화 1", "sroiProxy": "사회 가치 유형", "estimatedValue": "추정 가치" }
    // 1~2개
  ],
  "externalInsights": []
}

[작성 원칙]
1. activityOutputs 는 고정 Activity 순서대로 반드시 모두 포함 (개수 == ${activities.length}).
2. Outcome 은 정확히 2~4개 (${impactGoal.slice(0, 30)}... 달성에 직결되도록).
3. Impact 는 정확히 1~2개 (Outcome 의 누적이 만드는 사회 수준 변화).
4. outcome.linkedTo 는 activityOutputs 의 output 을 가리키는 관습적 참조 ("OP-1", "OP-2" 등 자유).
5. 모호 어휘("많은","다양한") 금지 → 정량 지표 선호.
6. externalInsights 는 빈 배열로 둘 것.

JSON 으로만 응답하세요.`
}

// ═════════════════════════════════════════════════════════════════
// 5. safeParseJson — claude.ts 비공개 함수 동등 구현
// ═════════════════════════════════════════════════════════════════

/**
 * Claude 응답에서 JSON 을 안전하게 추출·파싱.
 * (claude.ts 의 비공개 safeParseJson 동등 구현 — 브리프: claude.ts 수정 금지)
 */
function parseLogicModelJson(raw: string): unknown {
  let s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (objStart === -1 || end === -1 || end <= objStart) {
    throw new Error(
      `[logic-model-builder] AI 응답에서 JSON 을 찾을 수 없습니다. 응답 일부: ${s.slice(0, 200)}`,
    )
  }
  s = s.slice(objStart, end + 1)
  try {
    return JSON.parse(s)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`[logic-model-builder] JSON 파싱 실패: ${msg} (길이: ${s.length})`)
  }
}

// ═════════════════════════════════════════════════════════════════
// 6. AI 응답 검증 + 조립
// ═════════════════════════════════════════════════════════════════

interface RawActivityOutput {
  activityIndex?: number
  outputs?: Array<{ text?: string; sroiProxy?: string; estimatedValue?: string }>
}

interface RawLogicItem {
  text?: string
  sroiProxy?: string
  estimatedValue?: string
  linkedTo?: string[]
}

interface RawLogicResponse {
  activityOutputs?: RawActivityOutput[]
  outcome?: RawLogicItem[]
  impact?: RawLogicItem[]
  externalInsights?: LogicModel['externalInsights']
}

/** AI 응답이 최소 품질/구조 기준을 만족하는지 검증. 문제 있으면 에러 메시지 반환. */
function validateLogicResponse(
  raw: unknown,
  expectedActivityCount: number,
): { ok: true; data: RawLogicResponse } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: '응답이 객체가 아님' }
  }
  const r = raw as RawLogicResponse

  if (!Array.isArray(r.activityOutputs)) {
    return { ok: false, error: 'activityOutputs 가 배열이 아님' }
  }
  if (r.activityOutputs.length !== expectedActivityCount) {
    return {
      ok: false,
      error: `activityOutputs 개수 불일치 (기대 ${expectedActivityCount}, 실제 ${r.activityOutputs.length})`,
    }
  }
  for (let i = 0; i < r.activityOutputs.length; i++) {
    const ao = r.activityOutputs[i]
    if (!ao || !Array.isArray(ao.outputs) || ao.outputs.length === 0) {
      return { ok: false, error: `activityOutputs[${i}].outputs 비어있음` }
    }
    for (let j = 0; j < ao.outputs.length; j++) {
      const out = ao.outputs[j]
      if (!out || typeof out.text !== 'string' || out.text.trim().length === 0) {
        return { ok: false, error: `activityOutputs[${i}].outputs[${j}].text 누락` }
      }
    }
  }

  if (!Array.isArray(r.outcome) || r.outcome.length < 2 || r.outcome.length > 4) {
    return { ok: false, error: `outcome 은 2~4개여야 함 (실제 ${r.outcome?.length ?? 0})` }
  }
  for (let i = 0; i < r.outcome.length; i++) {
    const o = r.outcome[i]
    if (!o || typeof o.text !== 'string' || o.text.trim().length === 0) {
      return { ok: false, error: `outcome[${i}].text 누락` }
    }
  }

  if (!Array.isArray(r.impact) || r.impact.length < 1 || r.impact.length > 2) {
    return { ok: false, error: `impact 는 1~2개여야 함 (실제 ${r.impact?.length ?? 0})` }
  }
  for (let i = 0; i < r.impact.length; i++) {
    const im = r.impact[i]
    if (!im || typeof im.text !== 'string' || im.text.trim().length === 0) {
      return { ok: false, error: `impact[${i}].text 누락` }
    }
  }

  return { ok: true, data: r }
}

/**
 * 결정론적 Activity/Input + AI Output/Outcome/Impact 를 LogicModel 구조로 조립.
 * ID 는 본 모듈에서 부여 (AC-1, IN-1, OP-1, OC-1, IM-1).
 */
function assembleLogicModel(
  impactGoal: string,
  activities: ActivityDraft[],
  inputs: InputDraft[],
  ai: RawLogicResponse,
): LogicModel {
  // Activity 항목 (결정론)
  const activityItems: LogicModelItem[] = activities.map((a, i) => ({
    id: `AC-${i + 1}`,
    text: a.title,
    linkedTo: [`IN-1`],
  }))

  // Input 항목 (결정론)
  const inputItems: LogicModelItem[] = inputs.map((inp, i) => ({
    id: `IN-${i + 1}`,
    text: `${inp.title} — ${inp.detail}`,
  }))

  // Output 항목 (AI) — 순서를 activity 순서대로 평탄화
  const outputItems: LogicModelItem[] = []
  let opCounter = 1
  const outputIdsPerActivity: string[][] = activities.map(() => [])

  for (const ao of ai.activityOutputs ?? []) {
    const idx = typeof ao.activityIndex === 'number' ? ao.activityIndex : -1
    const outs = ao.outputs ?? []
    for (const out of outs) {
      const id = `OP-${opCounter++}`
      const item: LogicModelItem = {
        id,
        text: (out.text ?? '').trim(),
        linkedTo:
          idx >= 0 && idx < activities.length ? [`AC-${idx + 1}`] : undefined,
      }
      if (out.sroiProxy) item.sroiProxy = out.sroiProxy
      if (out.estimatedValue) item.estimatedValue = out.estimatedValue
      outputItems.push(item)
      if (idx >= 0 && idx < outputIdsPerActivity.length) {
        outputIdsPerActivity[idx].push(id)
      }
    }
  }

  // Outcome 항목 (AI) — linkedTo 는 AI 가 제공한 값을 신뢰, 없으면 모든 output 연결
  const outcomeItems: LogicModelItem[] = (ai.outcome ?? []).map((o, i) => {
    const item: LogicModelItem = {
      id: `OC-${i + 1}`,
      text: (o.text ?? '').trim(),
    }
    if (o.sroiProxy) item.sroiProxy = o.sroiProxy
    if (o.estimatedValue) item.estimatedValue = o.estimatedValue
    if (Array.isArray(o.linkedTo) && o.linkedTo.length > 0) {
      // AI 가 준 linkedTo 중 실제로 존재하는 OP-id 만 남기기
      const validOpIds = new Set(outputItems.map((x) => x.id))
      const filtered = o.linkedTo.filter((x) => validOpIds.has(x))
      item.linkedTo = filtered.length > 0 ? filtered : outputItems.map((x) => x.id)
    } else {
      item.linkedTo = outputItems.map((x) => x.id)
    }
    return item
  })

  // Impact 항목 (AI)
  const impactItems: LogicModelItem[] = (ai.impact ?? []).map((im, i) => {
    const item: LogicModelItem = {
      id: `IM-${i + 1}`,
      text: (im.text ?? '').trim(),
      linkedTo: outcomeItems.map((x) => x.id),
    }
    if (im.sroiProxy) item.sroiProxy = im.sroiProxy
    if (im.estimatedValue) item.estimatedValue = im.estimatedValue
    return item
  })

  return {
    impactGoal,
    impact: impactItems,
    outcome: outcomeItems,
    output: outputItems,
    activity: activityItems,
    input: inputItems,
    externalInsights: Array.isArray(ai.externalInsights) ? ai.externalInsights : [],
  }
}

// ═════════════════════════════════════════════════════════════════
// 7. buildLogicModel — 메인 진입점 (Claude 호출 + 재시도 1회)
// ═════════════════════════════════════════════════════════════════

/**
 * Activity/Input 은 결정론적으로 추출하고 AI 로 Output/Outcome/Impact 만 생성.
 * 실패 시 1 회 재시도 (프롬프트 강화). 최종 실패하면 ok:false 반환.
 */
export async function buildLogicModel(
  input: BuildLogicModelInput,
): Promise<BuildLogicModelResult> {
  const { rfp, curriculum, coaches, budget, impactGoal, externalResearch } = input

  if (!impactGoal || impactGoal.trim().length < 5) {
    return { ok: false, error: 'impactGoal 이 비어있거나 너무 짧음' }
  }
  if (!curriculum || !curriculum.sessions || curriculum.sessions.length === 0) {
    return { ok: false, error: 'curriculum.sessions 가 비어있음 — Step 2 먼저 완료' }
  }

  // 1. 결정론적 Activity / Input 생성
  const activities = sessionsToActivities(curriculum.sessions)
  const inputs = deriveInputs(coaches, budget)

  if (activities.length === 0) {
    return {
      ok: false,
      error: 'Activity 추출 결과 0 개 — 세션이 전부 필터링됨',
    }
  }

  // 2. AI 호출 (재시도 1회 — 두 번째 시도는 프롬프트 강화)
  let lastError = 'Unknown error'
  let lastRaw = ''

  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = buildLogicModelPrompt({
      rfp,
      impactGoal,
      activities,
      inputs,
      reinforced: attempt === 2,
      externalResearch,
    })

    try {
      const msg = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      })

      const block = msg.content[0]
      const raw =
        block && 'text' in block ? (block as { text: string }).text.trim() : ''
      lastRaw = raw

      const parsed = parseLogicModelJson(raw)
      const validated = validateLogicResponse(parsed, activities.length)
      if (!validated.ok) {
        lastError = `검증 실패: ${validated.error}`
        continue
      }

      const logicModel = assembleLogicModel(
        impactGoal,
        activities,
        inputs,
        validated.data,
      )

      return { ok: true, data: logicModel }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  return { ok: false, error: lastError, raw: lastRaw }
}

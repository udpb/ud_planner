/**
 * BR-3a — 프로그램 기획 엔진 (AI 조립)
 *
 * `planProgram(input)` 흐름:
 *   1. loadDesignRules() → status==='approved' 필터.
 *   2. resolvePlan() → decided + gates + operatingType (결정론, AI 없음).
 *   3. openGates 남으면 → 구조 생성 멈추고 pending 반환 (턴 기반 — 게이트 응답을
 *      input.decisions 로 다시 넣어 재호출). **게이트 남았는데 AI로 추측 채우지 않는다.**
 *   4. 게이트 0건이면 → invokeAi(생성 티어)로 구조 생성:
 *        T1~T3 → 회차표(SessionTable), 흐름문법(C) 배치 준수.
 *        T4    → 개별 여정(NonSessionStructure individual) — 회차표 X (v1.2 §09-B).
 *        T5    → 행사 설계 단계(NonSessionStructure event) — 회차표 X (v1.2 §09-C).
 *
 * 핵심 불변식:
 *   - resolved 결정을 **제약으로 주입** — AI는 살을 붙일 뿐 핵심 수치를 못 바꾼다.
 *   - 어떤 수치도 이 파일에 하드코딩하지 않는다 — 전부 resolved 결정에서.
 *   - invokeAi 단일 진입점 · safeParseJson.
 *   - T4/T5 는 회차표 프롬프트 자체를 보내지 않는다 (structure 분기).
 *
 * 반면교사: src/lib/curriculum-ai.ts (실습 60%/Action Week 2~3회/1:1 코칭 강제 — L213·L233·L433).
 *           이 엔진에서는 **절대 재현하지 않는다**.
 */

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'

import { loadDesignRules } from '@/lib/program-design/design-rule'
import { resolvePlan } from '@/lib/program-design/resolve-rules'
import type {
  DecisionLogEntry,
  NonSessionStructure,
  OperatingType,
  PlanInput,
  PlanStructure,
  ProgramPlan,
  SessionTable,
} from '@/lib/program-design/plan-types'
import { usesSessionTable } from '@/lib/program-design/plan-types'

// ─────────────────────────────────────────────────────────────────
// planProgram — 엔진 진입점
// ─────────────────────────────────────────────────────────────────

export async function planProgram(input: PlanInput): Promise<ProgramPlan> {
  // 1) approved 규칙만 로드 (검수 전이면 0건일 수 있음 — graceful).
  const ruleSet = await loadDesignRules()
  const allRules = ruleSet.rules
  const approvedRules = allRules.filter((r) => r.status === 'approved')

  // 2) 결정론 해소 (AI 없음).
  const { decided, gates, operatingType } = resolvePlan(input, approvedRules)

  const baseMeta = {
    approvedRuleCount: approvedRules.length,
    totalRuleCount: allRules.length,
    generatedAt: new Date().toISOString(),
  }

  // 3) 게이트 남으면 멈춤 (턴 기반 — 추측 채움 금지).
  if (gates.length > 0) {
    return {
      operatingType,
      decisionLog: decided,
      openGates: gates,
      structure: {
        kind: 'pending',
        note: `미해소 결정 게이트 ${gates.length}건 — 사람 응답 후 input.decisions 로 재호출.`,
      },
      meta: { ...baseMeta, structureGenerated: false },
    }
  }

  // 운영 유형이 없으면(게이트도 없는데 — 이론상 도달 안 함) 안전하게 pending.
  if (!operatingType) {
    return {
      operatingType: undefined,
      decisionLog: decided,
      openGates: [
        {
          axis: 'operatingType',
          step: 'D1',
          question: '운영 유형을 결정해주세요 (회차표보다 먼저).',
          why: '운영 유형이 미해소 — 구조를 만들 수 없음.',
          reason: 'no_approved_rule',
        },
      ],
      structure: { kind: 'pending', note: '운영 유형 미해소.' },
      meta: { ...baseMeta, structureGenerated: false },
    }
  }

  // 4) 게이트 0건 + 운영유형 확정 → AI 구조 생성.
  const { structure, model } = await generateStructure(input, operatingType, decided)

  return {
    operatingType,
    decisionLog: decided,
    openGates: [],
    structure,
    meta: { ...baseMeta, structureGenerated: true, model },
  }
}

// ─────────────────────────────────────────────────────────────────
// 구조 생성 — 운영 유형 분기 (T1~T3 회차표 vs T4/T5 비회차)
// ─────────────────────────────────────────────────────────────────

async function generateStructure(
  input: PlanInput,
  operatingType: OperatingType,
  decided: DecisionLogEntry[],
): Promise<{ structure: PlanStructure; model?: string }> {
  const constraints = serializeConstraints(input, operatingType, decided)

  if (usesSessionTable(operatingType)) {
    return generateSessionTable(operatingType, constraints)
  }
  return generateNonSessionStructure(operatingType, constraints)
}

/**
 * resolved 결정을 AI 프롬프트 제약으로 직렬화.
 * **AI는 이 값들을 바꾸지 못한다** — 핵심 수치(회차·코칭 등)는 여기 고정.
 */
function serializeConstraints(
  input: PlanInput,
  operatingType: OperatingType,
  decided: DecisionLogEntry[],
): string {
  const p = input.rfp.parsed
  const lines: string[] = []

  lines.push('[RFP 핵심]')
  lines.push(`- 사업명: ${p.projectName ?? '(미상)'}`)
  lines.push(`- 발주: ${p.client ?? '(미상)'}`)
  lines.push(`- 대상: ${p.targetAudience ?? '(미상)'}${p.targetCount ? ` / ${p.targetCount}명` : ''}`)
  if (p.eduStartDate || p.eduEndDate) {
    lines.push(`- 교육 기간: ${p.eduStartDate ?? '?'} ~ ${p.eduEndDate ?? '?'}`)
  }
  if (p.objectives?.length) lines.push(`- 목표: ${p.objectives.join(' / ')}`)
  if (p.deliverables?.length) lines.push(`- 산출물: ${p.deliverables.join(' / ')}`)

  // 선례·의도 (있으면 — 최우선 토대)
  if (input.intent?.summary) lines.push(`\n[담당자 운영 의도]\n- ${input.intent.summary}`)
  if (input.precedent?.summary) lines.push(`\n[이전 진행(선례)]\n- ${input.precedent.summary}`)

  // ⭐ resolved 결정 = 고정 제약. AI는 이 수치를 바꾸지 못한다.
  lines.push('\n[확정된 설계 결정 — 절대 변경 금지, 이 값들을 그대로 구조에 반영]')
  lines.push(`- 운영 유형: ${operatingType}`)
  for (const d of decided) {
    if (d.axis === 'operatingType') continue
    lines.push(`- ${d.axis}: ${d.decision} (근거: ${d.evidence.source})`)
  }

  return lines.join('\n')
}

// ── T1~T3: 회차표 ──

async function generateSessionTable(
  operatingType: OperatingType,
  constraints: string,
): Promise<{ structure: SessionTable; model?: string }> {
  const prompt = `당신은 언더독스의 프로그램 기획 전문가입니다. 아래 확정 결정 위에서 **회차표(주차별 흐름)** 를 설계하세요.

${constraints}

[흐름 문법 — 배치 규칙 (v1.2 §05, 위반 금지)]
- 마인드셋·이론(theory)은 **전반**(전체의 앞 1/3)에 배치.
- 코칭(coaching)은 **후반**(실행이 시작된 뒤, 0.66 이후)에 배치.
- 발표·행사(event/milestone)는 **종반**에 — 중간 발표는 약 50% 지점, 최종 발표는 마지막.

[엄수 사항]
- 위 "확정된 설계 결정"의 회차수·코칭수 등 **수치를 절대 바꾸지 마세요**. 그 수치에 맞춰 살만 붙입니다.
- 확정 결정에 없는 수치는 **임의로 만들지 말고** rationale 에 "추정"이라고 표기하거나 hours 를 null 로 두세요.
- 운영 유형 ${operatingType} 의 성격에 맞게 (정규강좌=매주 / 몰입캠프=몰아치기 / 장기여정=킥오프+퀘스트+발표 조합).

[rationale 작성 지침]
- rationale 은 이 회차가 **이 사업의 목표·참여자에게 왜 필요한지**를 발주처가 읽는 제안서 언어로 한 문장.
- 사업 맥락·참여자·기대효과 중심의 자연스러운 한국어로 쓰세요.
- **내부 엔진 코드·약어를 절대 쓰지 마세요**: 운영유형 코드(T1~T5 등), 문서 조항 번호(§ 표기·"v1.2" 등 버전·조항 인용), "흐름 문법", 영문 회차 종류 코드(theory·coaching·milestone 등), "1/3 지점"·"0.66 이후" 같은 배치 비율 표현 등. 이런 내부 용어 대신 그 의도를 사업·참여자 맥락의 말로 풀어 쓰세요.

아래 JSON 형식만 반환 (마크다운 코드블록 없이):
{
  "kind": "sessions",
  "sessions": [
    {
      "no": "W1",
      "title": "회차 제목",
      "hours": 3 또는 null,
      "format": "오프라인 3h / 온라인 / 합숙 등",
      "kind": "theory" | "workshop" | "coaching" | "event" | "milestone" | "prelearning",
      "rationale": "이 회차가 이 사업의 목표·참여자에게 왜 필요한지 (제안서 언어 한 문장, 내부 코드·약어 금지)"
    }
  ]
}`

  const result = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.LARGE,
    temperature: 0.4,
    label: 'program-plan.session-table',
  })

  const parsed = safeParseJson<SessionTable>(result.raw, 'program-plan.session-table')
  const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : []
  return {
    structure: { kind: 'sessions', sessions },
    model: result.model,
  }
}

// ── T4/T5: 비회차 구조 (회차표 아님) ──

async function generateNonSessionStructure(
  operatingType: OperatingType,
  constraints: string,
): Promise<{ structure: NonSessionStructure; model?: string }> {
  const isEvent = operatingType === 'T5'
  const kind: NonSessionStructure['kind'] = isEvent ? 'event' : 'individual'

  const shape = isEvent
    ? `행사 운영형 — 본체가 커리큘럼이 아니라 **행사 설계**입니다 (경진대회·박람회·공모전 운영 대행).
**절대 주차별 회차표를 만들지 마세요.** 행사 준비·운영·사후의 단계(stage)로 설계하세요.`
    : `개별 밀착형 — 팀이 아니라 **개별 사업체 단위**입니다 (소상공인·재창업).
**절대 주차별 회차표를 만들지 마세요** — 점포/사업체마다 일정이 제각각이라 정기 모임은 인풋 낭비입니다.
진단 방문 → 공통 접점(최소) → 개별 컨설팅 → AI코치 상시 의 단계(stage)로 설계하세요.`

  const prompt = `당신은 언더독스의 프로그램 기획 전문가입니다. 아래 확정 결정 위에서 **단계(stage) 구조** 를 설계하세요.

${constraints}

[운영 유형 구조 지침]
${shape}

[엄수 사항]
- 위 "확정된 설계 결정"의 수치를 절대 바꾸지 마세요.
- 회차표(주차별 표)를 만들지 마세요 — 단계(stage) 목록입니다.
- 확정 결정에 없는 수치는 임의 생성 금지 — rationale 에 근거만.

[rationale 작성 지침]
- rationale 은 이 단계가 **이 사업의 목표·참여자에게 왜 필요한지**를 발주처가 읽는 제안서 언어로 한 문장.
- 사업 맥락·참여자·기대효과 중심의 자연스러운 한국어로 쓰세요.
- **내부 엔진 코드·약어를 절대 쓰지 마세요**: 운영유형 코드(T1~T5 등), 문서 조항 번호(§ 표기·"v1.2" 등 버전·조항 인용·지침 번호), "흐름 문법" 같은 표현은 rationale 에 그대로 옮기지 말고, 그 의도를 사업·참여자 맥락의 말로 풀어 쓰세요.

아래 JSON 형식만 반환 (마크다운 코드블록 없이):
{
  "kind": "${kind}",
  "stages": [
    { "label": "단계 라벨 (예: 진단 방문)", "content": "이 단계에서 하는 일", "rationale": "이 단계가 이 사업의 목표·참여자에게 왜 필요한지 (제안서 언어 한 문장, 내부 코드·약어 금지)" }
  ]
}`

  const result = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.LARGE,
    temperature: 0.4,
    label: 'program-plan.non-session',
  })

  const parsed = safeParseJson<NonSessionStructure>(result.raw, 'program-plan.non-session')
  const stages = Array.isArray(parsed.stages) ? parsed.stages : []
  return {
    // kind 는 운영유형이 결정 — AI가 바꾸지 못하게 우리가 고정.
    structure: { kind, stages },
    model: result.model,
  }
}

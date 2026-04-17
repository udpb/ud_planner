/**
 * Gate 3c: 논리 체인 검증
 *
 * RFP 목표 -> 제안컨셉 -> 핵심포인트 -> 커리큘럼 -> Activity -> Outcome -> Impact
 * 각 단계의 인과 연결을 점검하고, 끊기는 지점을 식별한다.
 *
 * Ch.3 SS3.7 함정 1 ("그래서?" 테스트) 반영:
 *   각 단계가 "그래서 무엇이 달라지는가?" 에 답하는지 확인.
 *
 * safeParseJson 은 B1 패턴대로 본 모듈에 국지 복제.
 */

import { anthropic, CLAUDE_MODEL } from '@/lib/claude'
import type { PipelineContext } from '@/lib/pipeline-context'
import type { ProposalSectionNo } from '@/lib/proposal-ai'
import type { LogicChainResult } from './types'

// ─────────────────────────────────────────
// 국지 safeParseJson (B1 패턴)
// ─────────────────────────────────────────

function safeParseJson<T>(raw: string): T {
  const s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  let start: number, end: number
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    start = arrStart; end = s.lastIndexOf(']')
  } else {
    start = objStart; end = s.lastIndexOf('}')
  }
  if (start === -1 || end === -1 || end <= start) throw new Error('JSON not found in AI response')
  return JSON.parse(s.slice(start, end + 1)) as T
}

// ─────────────────────────────────────────
// PipelineContext 요약 빌더
// ─────────────────────────────────────────

function buildContextSummary(context: PipelineContext): string {
  const lines: string[] = []

  // RFP 목표
  const rfp = context.rfp?.parsed
  if (rfp) {
    lines.push('[1. RFP 목표]')
    lines.push(`사업명: ${rfp.projectName ?? '(미기재)'}`)
    if (rfp.objectives?.length) {
      lines.push(`목표: ${rfp.objectives.join(' / ')}`)
    }
    if (rfp.summary) lines.push(`요약: ${rfp.summary}`)
  } else {
    lines.push('[1. RFP 목표] (미파싱)')
  }

  // 제안 컨셉 + 핵심 기획 포인트
  lines.push('')
  lines.push('[2. 제안 컨셉]')
  lines.push(context.rfp?.proposalConcept ?? '(미확정)')
  if (context.rfp?.keyPlanningPoints?.length) {
    lines.push('핵심 기획 포인트:')
    context.rfp.keyPlanningPoints.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`))
  }

  // 전략
  if (context.strategy) {
    lines.push('')
    lines.push('[3. 전략]')
    if (context.strategy.whyUs) lines.push(`Why Us: ${context.strategy.whyUs}`)
    if (context.strategy.mustNotFail) lines.push(`Must-Not-Fail: ${context.strategy.mustNotFail}`)
    if (context.strategy.derivedKeyMessages.length > 0) {
      lines.push(`키 메시지: ${context.strategy.derivedKeyMessages.join(' / ')}`)
    }
  }

  // 커리큘럼
  if (context.curriculum?.sessions?.length) {
    lines.push('')
    lines.push(`[4. 커리큘럼] (${context.curriculum.sessions.length}회차)`)
    const preview = context.curriculum.sessions.slice(0, 8)
    for (const s of preview) {
      const tag = s.isActionWeek ? '[AW]' : s.isTheory ? '[이론]' : '[실습]'
      lines.push(`  ${s.sessionNo}. ${tag} ${s.title}`)
    }
    if (context.curriculum.sessions.length > 8) {
      lines.push(`  ... 외 ${context.curriculum.sessions.length - 8}회차`)
    }
  }

  // 임팩트 (Logic Model)
  if (context.impact?.logicModel) {
    const lm = context.impact.logicModel
    lines.push('')
    lines.push('[5. Logic Model]')
    lines.push(`임팩트 목표: ${lm.impactGoal}`)
    if (lm.outcome?.length) {
      lines.push(`Outcome: ${lm.outcome.map((o) => o.text).join(' / ')}`)
    }
    if (lm.output?.length) {
      lines.push(`Output: ${lm.output.map((o) => o.text).join(' / ')}`)
    }
    if (lm.activity?.length) {
      lines.push(`Activity: ${lm.activity.map((a) => a.text).join(' / ')}`)
    }
  }

  // 코치 배정
  if (context.coaches?.assignments?.length) {
    lines.push('')
    lines.push(`[6. 코치] ${context.coaches.assignments.length}명 배정`)
  }

  // 예산
  if (context.budget?.structure) {
    lines.push('')
    lines.push(`[7. 예산] PC ${(context.budget.structure.pcTotal / 10000).toFixed(0)}만원 / 마진 ${context.budget.marginRate.toFixed(1)}%`)
  }

  return lines.join('\n')
}

// ─────────────────────────────────────────
// 메인 함수
// ─────────────────────────────────────────

export async function validateLogicChain(
  sectionNo: ProposalSectionNo,
  context: PipelineContext,
): Promise<LogicChainResult> {
  const contextSummary = buildContextSummary(context)

  // 컨텍스트가 거의 비어있으면 검증 불가
  if (contextSummary.length < 100) {
    return {
      passed: false,
      breakpoints: ['파이프라인 데이터가 부족하여 논리 체인 검증을 수행할 수 없습니다.'],
    }
  }

  // Claude 프롬프트 (~800 토큰)
  const prompt = `당신은 교육 사업 제안서의 논리적 정합성을 검증하는 전문가입니다.

아래 파이프라인 컨텍스트에서 각 단계 간 인과 관계를 점검하세요.

${contextSummary}

검증 기준 (각 단계마다 "그래서?" 테스트 적용):
1. RFP 목표 -> 제안 컨셉: 목표가 컨셉에 반영되었는가?
2. 제안 컨셉 -> 핵심 기획 포인트: 컨셉이 포인트로 구체화되었는가?
3. 핵심 포인트 -> 커리큘럼: 포인트가 세션 설계에 실현되었는가?
4. 커리큘럼 -> Activity: 세션이 Logic Model Activity 와 연결되는가?
5. Activity -> Output -> Outcome: 활동이 산출·성과로 이어지는가?
6. Outcome -> Impact: 성과가 임팩트 목표와 정렬되는가?

"그래서?" 테스트: 각 단계에서 "그래서 무엇이 달라지는가?" 에 명확히 답할 수 있어야 통과.
정보가 부족한 단계는 "데이터 부족" 으로 표시하되 끊김으로 분류하지 마세요.

현재 분석 대상 섹션: ${sectionNo}번

반드시 아래 JSON만 반환하세요:
{
  "passed": true 또는 false,
  "breakpoints": ["끊긴 연결 설명 1", "끊긴 연결 설명 2"]
}
breakpoints 가 비어있으면 passed 는 true 입니다.`

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const block = msg.content[0]
  const raw = block.type === 'text' ? block.text : ''

  const parsed = safeParseJson<{
    passed: boolean
    breakpoints: string[]
  }>(raw)

  const breakpoints = (parsed.breakpoints ?? []).map(String)

  return {
    passed: breakpoints.length === 0 ? true : (parsed.passed ?? false),
    breakpoints,
  }
}

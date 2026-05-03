/**
 * 임팩트 목표 제안 — Phase 2.1 단순화 (claude.ts 에서 분리, 2026-05-03)
 *
 * RFP 요약 + 목표 + 대상 → 임팩트 목표 1 문장 + 근거 + 추가 질문.
 * 기획자 확인용 1차 제안 (확정 시 buildLogicModel 으로 진행).
 */

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'

export interface ImpactGoalSuggestion {
  /** AI가 제안하는 임팩트 목표 문장 */
  suggestedGoal: string
  /** 왜 이 목표를 제안하는지 근거 */
  rationale: string
  /** 추가로 확인이 필요한 질문들 */
  clarifyingQuestions: string[]
}

export async function suggestImpactGoal(
  rfpSummary: string,
  objectives: string[],
  targetAudience: string,
  targetCount: number | null,
): Promise<ImpactGoalSuggestion> {
  const result = await invokeAi({
    prompt: `당신은 소셜임팩트 전문가이자 교육 기획자입니다.
아래 RFP 정보를 바탕으로 "이 사업이 궁극적으로 만들고자 하는 사회적 변화"를 한 문장으로 제안하고,
기획자가 검토·수정할 수 있도록 도와주세요.

사업 개요: ${rfpSummary}
목표: ${objectives.join(', ')}
대상: ${targetAudience}${targetCount ? ` (${targetCount}명)` : ''}

원칙:
- "[참여 대상]의 [구체적 역량/상태 변화]로 인해 [사회/생태계 수준 변화]가 가능해진다" 형식
- 활동이 아닌 변화(변화된 상태)를 서술
- 측정 가능한 수준으로 구체적으로

반드시 아래 JSON만 반환하세요:
{
  "suggestedGoal": "임팩트 목표 한 문장",
  "rationale": "이 목표를 제안한 근거 (2~3문장)",
  "clarifyingQuestions": ["정보 부족 시 기획자에게 물어볼 질문 1", "질문 2"]
}`,
    maxTokens: AI_TOKENS.STANDARD,
    temperature: 0.4,
    label: 'suggest-impact-goal',
  })

  const raw = result.raw.trim()
  return safeParseJson<ImpactGoalSuggestion>(raw, 'suggestImpactGoal')
}

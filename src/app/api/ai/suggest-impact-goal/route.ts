import { NextRequest, NextResponse } from 'next/server'
import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJsonExternal as safeParseJson, JsonParseError } from '@/lib/claude'
import { AI_TOKENS } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface GoalCandidate {
  goal: string
  rationale: string
  focus: string // "역량 강화" | "생태계 구축" | "경제적 가치" 등 — 어떤 관점의 임팩트인지
  sroiHint: string // "교육 임팩트 중심으로 SROI 0.3~0.5 예상" 같은 힌트
}

export async function POST(req: NextRequest) {
  try {
    const { summary, objectives, targetAudience, targetCount, evalCriteria } = await req.json()

    if (!summary || !objectives?.length) {
      return NextResponse.json({ error: '사업 요약과 목표가 필요합니다.' }, { status: 400 })
    }

    // 평가 배점 정보를 포함하여 더 맞춤화된 목표 제안
    const evalContext = evalCriteria?.length > 0
      ? `\n\n평가 배점 (제안서 심사 기준):\n${evalCriteria.map((e: any) => `- ${e.item}: ${e.score}점`).join('\n')}`
      : ''

    const prompt = `당신은 소셜임팩트 전문가이자 교육 기획자입니다.
아래 RFP 정보를 바탕으로 3가지 서로 다른 관점의 임팩트 목표를 제안하세요.
각 목표는 서로 다른 임팩트 접근 방식을 반영해야 합니다.

사업 개요: ${summary}
목표: ${objectives.join(', ')}
대상: ${targetAudience ?? ''}${targetCount ? ` (${targetCount}명)` : ''}${evalContext}

작성 원칙:
- "[참여 대상]의 [구체적 역량/상태 변화]로 인해 [사회/생태계 수준 변화]가 가능해진다" 형식
- 활동이 아닌 변화(변화된 상태)를 서술
- 측정 가능한 수준으로 구체적으로

3가지 서로 다른 관점:
1. 역량 강화 중심 — 참여자의 역량 변화에 초점
2. 경제/생태계 기여 중심 — 사회/경제적 파급 효과에 초점
3. 평가 배점 최적화 — 제안서 평가에서 높은 점수를 받을 수 있는 방향

반드시 아래 JSON만 반환하세요. trailing comma 없이, 모든 따옴표 정확히 닫고, 추가 설명 없이 JSON 만:
{
  "candidates": [
    {
      "goal": "임팩트 목표 문장",
      "rationale": "이 목표를 제안한 근거 (1~2문장)",
      "focus": "역량 강화",
      "sroiHint": "교육/코칭 임팩트 중심으로 SROI 산출 시 유리 (예상 0.3~0.5)"
    },
    {
      "goal": "임팩트 목표 문장",
      "rationale": "근거",
      "focus": "경제/생태계 기여",
      "sroiHint": "투자유치/매출 임팩트로 SROI 수치 극대화 가능 (예상 0.5~1.0)"
    },
    {
      "goal": "임팩트 목표 문장",
      "rationale": "근거",
      "focus": "평가 최적화",
      "sroiHint": "SROI 힌트"
    }
  ],
  "clarifyingQuestions": ["기획자에게 물어볼 질문 1", "질문 2"]
}`

    // L1 (2026-04-27): Gemini 우선 + Claude fallback. JSON 파싱 실패 시 1회 재시도.
    let result: { candidates: GoalCandidate[]; clarifyingQuestions: string[] } | null = null
    let lastError: any = null
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try {
        const r = await invokeAi({
          prompt,
          maxTokens: AI_TOKENS.STANDARD,
          temperature: 0.4,
          label: `suggest-impact-goal (attempt ${attempt + 1})`,
        })
        result = safeParseJson<{ candidates: GoalCandidate[]; clarifyingQuestions: string[] }>(
          r.raw,
          'suggest-impact-goal',
        )
      } catch (e: any) {
        lastError = e
        if (e instanceof JsonParseError && attempt === 0) {
          console.warn('[suggest-impact-goal] JSON 파싱 실패 → 재시도')
          continue
        }
        throw e
      }
    }
    if (!result) throw lastError

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('Impact goal suggestion error:', err)
    return NextResponse.json({ error: err.message ?? '제안 실패' }, { status: 500 })
  }
}

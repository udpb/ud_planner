import { NextRequest, NextResponse } from 'next/server'
import { anthropic, CLAUDE_MODEL } from '@/lib/claude'

interface GoalCandidate {
  goal: string
  rationale: string
  focus: string // "역량 강화" | "생태계 구축" | "경제적 가치" 등 — 어떤 관점의 임팩트인지
  sroiHint: string // "교육 임팩트 중심으로 SROI 0.3~0.5 예상" 같은 힌트
}

function safeParseJson<T>(raw: string): T {
  let s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  let start: number, end: number
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    start = arrStart; end = s.lastIndexOf(']')
  } else {
    start = objStart; end = s.lastIndexOf('}')
  }
  if (start === -1 || end === -1 || end <= start) throw new Error('JSON not found')
  return JSON.parse(s.slice(start, end + 1))
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

    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `당신은 소셜임팩트 전문가이자 교육 기획자입니다.
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

반드시 아래 JSON만 반환하세요:
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
}`,
        },
      ],
    })

    const raw = (msg.content[0] as any).text.trim()
    const result = safeParseJson<{ candidates: GoalCandidate[]; clarifyingQuestions: string[] }>(raw)

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('Impact goal suggestion error:', err)
    return NextResponse.json({ error: err.message ?? '제안 실패' }, { status: 500 })
  }
}

/**
 * Gate 3b: 평가위원 시뮬레이션
 *
 * ChannelPreset.evaluatorProfile + RFP.evalCriteria 를 주입하여
 * Claude 가 해당 발주처의 평가위원 관점으로 채점·감점·예상 질문을 생성한다.
 *
 * safeParseJson 은 B1 패턴대로 본 모듈에 국지 복제.
 */

import { invokeAi } from '@/lib/ai-fallback'
import type { PipelineContext } from '@/lib/pipeline-context'
import type { ProposalSectionNo } from '@/lib/proposal-ai'
import type { EvaluatorSimulationResult } from './types'

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
// evaluatorProfile 조회
// ─────────────────────────────────────────

async function resolveEvaluatorProfile(context: PipelineContext): Promise<string> {
  const channel = context.meta.projectType === 'B2B' ? 'B2B'
    : context.meta.channelType === 'renewal' ? 'renewal'
    : 'B2G'

  try {
    const { getChannelPreset } = await import('@/lib/channel-presets')
    const preset = await getChannelPreset(channel)
    if (preset?.evaluatorProfile) return preset.evaluatorProfile
  } catch {
    // DB 접근 실패 — fallback
  }

  // 하드코딩 fallback
  if (channel === 'B2B') {
    return '기업 교육 담당자. ROI 중심 평가. 실행 가능성과 성과 측정 방법을 중시합니다.'
  }
  if (channel === 'renewal') {
    return '기존 사업 담당자. 전년 성과 대비 개선을 중시합니다.'
  }
  return '공공기관 평가위원. 사업 목표 적합성, 운영 체계의 안정성, 정량 성과를 중시합니다.'
}

// ─────────────────────────────────────────
// 평가배점 직렬화
// ─────────────────────────────────────────

function serializeEvalCriteria(context: PipelineContext): string {
  const es = context.rfp?.evalStrategy
  if (!es || es.topItems.length === 0) {
    return '(평가배점 정보 없음 — 일반적인 교육사업 평가 기준으로 채점하세요)'
  }

  const totalMax = es.topItems.reduce((s, it) => s + it.points, 0)
  const lines = es.topItems.map(
    (it) => `  - ${it.name}: ${it.points}점 (${Math.round(it.weight * 100)}%)`,
  )
  return `[평가배점] (총 ${totalMax}점)\n${lines.join('\n')}`
}

// ─────────────────────────────────────────
// 메인 함수
// ─────────────────────────────────────────

export async function simulateEvaluator(
  sectionNo: ProposalSectionNo,
  sectionContent: string,
  context: PipelineContext,
): Promise<EvaluatorSimulationResult> {
  const evaluatorProfile = await resolveEvaluatorProfile(context)
  const evalBlock = serializeEvalCriteria(context)

  // 해당 섹션의 maxScore 산출
  const es = context.rfp?.evalStrategy
  const relevantItems = es?.topItems ?? []
  const sectionMaxScore = relevantItems.reduce((s, it) => s + it.points, 0)
  const maxScore = sectionMaxScore > 0 ? sectionMaxScore : 100

  // Claude 프롬프트 (~600 토큰)
  const prompt = `당신은 다음과 같은 평가위원입니다:
"${evaluatorProfile}"

아래 제안서 섹션(${sectionNo}번)을 채점하고, 감점 사유와 심사 시 예상되는 질문을 작성하세요.

${evalBlock}

[제안서 섹션 ${sectionNo}번 내용]
${sectionContent.slice(0, 2500)}

채점 기준:
1. 사업 이해도 및 목표 적합성
2. 실행 가능성 (구체적 방법론·일정)
3. 전문성 및 경험 (정량 근거)
4. 차별화 요소
5. 논리적 일관성

반드시 아래 JSON만 반환하세요:
{
  "expectedScore": 예상 점수(숫자),
  "maxScore": ${maxScore},
  "deductionReasons": ["감점 사유 1", "감점 사유 2"],
  "likelyQuestions": ["예상 질문 1", "예상 질문 2", "예상 질문 3"]
}`

  const result = await invokeAi({
    prompt,
    maxTokens: 1024,
    temperature: 0.3,
    label: 'gate3-evaluator-simulation',
  })

  const raw = result.raw

  const parsed = safeParseJson<{
    expectedScore: number
    maxScore: number
    deductionReasons: string[]
    likelyQuestions: string[]
  }>(raw)

  return {
    expectedScore: Math.max(0, parsed.expectedScore ?? 0),
    maxScore: parsed.maxScore ?? maxScore,
    deductionReasons: (parsed.deductionReasons ?? []).map(String),
    likelyQuestions: (parsed.likelyQuestions ?? []).map(String).slice(0, 5),
  }
}

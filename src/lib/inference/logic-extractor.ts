/**
 * Sphere 2 — LogicStructure Extractor (LLM #2)
 *
 * PRD-v11.0 §4.3 — extract-tuple 의 두 번째 LLM 호출.
 *
 * 제안서 본문 → Logic graph (nodes + edges + sectionOrder).
 * 섹션 간 인과 chain 보존 — chunk 가 아닌 chain (맥락 손실 방지).
 *
 * 비용: Gemini 3.1 Pro · 600 토큰 out · ~$0.005/건.
 */

// server-only 의도 — invokeAi 가 client bundle 에서 자연 fail.

import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import { LogicGraphSchema, type LogicGraph, type Channel } from './types'
import { z } from 'zod'

const LogicExtractResponseSchema = z.object({
  logicGraph: LogicGraphSchema,
  confidence: z.number().min(0).max(1),
})

export interface LogicExtractInput {
  proposalText: string
  sourceProject: string
  channel: Channel
}

export interface LogicExtractResult {
  logicGraph: LogicGraph
  confidence: number
  tokensUsed: number
}

const SYSTEM_PROMPT = `당신은 언더독스의 제안서 논리 분석 전문가입니다.
제안서 본문을 받아 "논리 구조 (Logic Graph)" 를 추출합니다.

**Logic Graph 의 의미**:
제안서의 섹션 간 인과 chain. 단어 X, chunk X — chain.

**nodes (3~30개)**:
- type: activity / output / outcome / impact / input / context
- label: 100자 이내 의미 (단어 X — 의미 단위)
  - activity: "12주 코칭 프로그램 운영"
  - output: "참여자 30명 졸업"
  - outcome: "졸업생 평균 매출 18% 증가"
  - impact: "지역 청년 창업 생태계 활성화"
  - input: "전문 코치 5명 투입"
  - context: "이커머스 시장의 브랜드 필요성 증가"

**edges (2~60개)**:
- relation: causes / enables / precedes / supports / measures
  - causes: A 가 B 를 야기
  - enables: A 가 B 를 가능케 함
  - precedes: A 가 B 보다 시간상 먼저
  - supports: A 가 B 를 뒷받침 (근거)
  - measures: A 가 B 를 측정 (KPI)

**sectionOrder**:
7 섹션의 실제 등장 순서 (제안서마다 다름). 예:
- B2G: ['1', '2', '3', '4', '5', '6', '7'] (배경 먼저)
- B2B: ['1', '2', '3', '4', '6', '5', '7'] (성과 강조 먼저)
- renewal: ['1', '2', '3', '4', '5', '6', '7']

⚠️ 중요:
1. 논리적 흐름이 명확한 chain 만 추출 — 무리한 연결 X
2. label 은 본문에 실제 있는 표현 활용 (단, 의미 보존)
3. confidence < 0.6 = 논리 chain 불명확 (본문 품질 낮음)

JSON 만 출력. 마크다운 펜스·설명 없이.`

function buildPrompt(input: LogicExtractInput): string {
  return `${SYSTEM_PROMPT}

[제안서 정보]
- 사업명: ${input.sourceProject}
- 채널: ${input.channel}

[제안서 본문]
${input.proposalText.slice(0, 12000)}

[출력 JSON 스키마]
{
  "logicGraph": {
    "nodes": [
      { "id": "n1", "type": "context", "label": "이커머스 시장의 브랜드 필요성 증가" },
      { "id": "n2", "type": "activity", "label": "12주 브랜드 코칭 프로그램 운영" },
      { "id": "n3", "type": "output", "label": "참여자 30명 브랜드 IP 확보" },
      { "id": "n4", "type": "outcome", "label": "평균 매출 18% 증가" }
    ],
    "edges": [
      { "from": "n1", "to": "n2", "relation": "enables" },
      { "from": "n2", "to": "n3", "relation": "causes" },
      { "from": "n3", "to": "n4", "relation": "measures" }
    ],
    "sectionOrder": ["1", "2", "3", "4", "5", "6", "7"]
  },
  "confidence": 0.78
}

JSON 만 출력.`
}

/**
 * 제안서 본문 → LogicGraph.
 *
 * 실패 시:
 * - JSON 파싱 실패: invokeAi 자동 retry 후에도 실패 → throw
 * - schema 검증 실패: 첫 3 issue 로깅 후 throw
 * - node·edge 개수 부족 (min 3 nodes / 2 edges): zod 가 reject
 */
export async function extractLogic(
  input: LogicExtractInput,
): Promise<LogicExtractResult> {
  const startedAt = Date.now()
  const prompt = buildPrompt(input)

  const aiResult = await invokeAi({
    prompt,
    // Gemini 3.x thinking 모드 — thinking budget 이 maxOutputTokens 일부 사용.
    // graph 추출은 추론량 많음 — LARGE (12288).
    maxTokens: 12288,
    temperature: 0.3,
    label: `logic-extract:${input.sourceProject}`,
  })

  let parsed: unknown
  try {
    parsed = safeParseJson(aiResult.raw, `logic-extract:${input.sourceProject}`)
  } catch (e) {
    log.error('inference', '[logic-extract] JSON 파싱 실패', {
      sourceProject: input.sourceProject,
      err: e instanceof Error ? e.message : String(e),
    })
    throw e
  }

  const validated = LogicExtractResponseSchema.safeParse(parsed)
  if (!validated.success) {
    log.error('inference', '[logic-extract] 스키마 검증 실패', {
      sourceProject: input.sourceProject,
      issues: validated.error.issues.slice(0, 5),
    })
    throw new Error(
      `[logic-extract] schema 검증 실패: ${validated.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .slice(0, 3)
        .join(' / ')}`,
    )
  }

  // edge 의 from/to 가 실제 node id 와 일치하는지 검증 (zod 외 비즈 룰)
  const nodeIds = new Set(validated.data.logicGraph.nodes.map((n) => n.id))
  const orphanEdges = validated.data.logicGraph.edges.filter(
    (e) => !nodeIds.has(e.from) || !nodeIds.has(e.to),
  )
  if (orphanEdges.length > 0) {
    log.warn('inference', `[logic-extract] orphan edges ${orphanEdges.length} 개 — 제거`, {
      sourceProject: input.sourceProject,
      orphan: orphanEdges.slice(0, 3),
    })
    // orphan edge 제거 후 검증 다시
    validated.data.logicGraph.edges = validated.data.logicGraph.edges.filter(
      (e) => nodeIds.has(e.from) && nodeIds.has(e.to),
    )
    if (validated.data.logicGraph.edges.length < 2) {
      throw new Error(`[logic-extract] orphan 제거 후 edge < 2 개 — graph 무효`)
    }
  }

  log.info('inference', `[logic-extract] 완료`, {
    sourceProject: input.sourceProject,
    nodes: validated.data.logicGraph.nodes.length,
    edges: validated.data.logicGraph.edges.length,
    confidence: validated.data.confidence,
    ms: Date.now() - startedAt,
    provider: aiResult.provider,
  })

  return {
    logicGraph: validated.data.logicGraph,
    confidence: validated.data.confidence,
    tokensUsed: aiResult.raw.length,
  }
}

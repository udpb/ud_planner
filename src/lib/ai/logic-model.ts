/**
 * Logic Model 빌더 — Phase 2.1 단순화 (claude.ts 에서 분리, 2026-05-03)
 *
 * 확정된 임팩트 목표 + RFP 요약 + 외부 리서치 → Logic Model 5계층 역추적 생성.
 * (Impact ← Outcome ← Output ← Activity ← Input + externalInsights)
 */

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import {
  formatExternalResearch,
  type ExternalResearch,
} from '@/lib/ai/research'

/** Logic Model 항목 — ID와 SROI 힌트를 포함한 구조화된 형태 */
export interface LogicModelItem {
  id: string           // 예: "OC-1", "AC-2"
  text: string         // 항목 내용
  sroiProxy?: string   // SROI 프록시 유형 (예: "교육훈련 임팩트", "고용 창출")
  estimatedValue?: string // 추정 임팩트 가치 (예: "인당 3.2M원")
  linkedTo?: string[]  // 연결된 상위/하위 항목 ID (예: outcome의 경우 어떤 output에서 오는지)
}

export interface LogicModel {
  impactGoal: string
  impact: LogicModelItem[]
  outcome: LogicModelItem[]
  output: LogicModelItem[]
  activity: LogicModelItem[]
  input: LogicModelItem[]
  /** LLM이 추가로 제안하는 외부 인사이트 */
  externalInsights: Array<{
    type: 'trend' | 'benchmark' | 'tip'
    source: string      // 어디서 온 인사이트인지 (예: "OECD 청년 창업 교육 가이드라인")
    message: string
    relevantLayer: 'impact' | 'outcome' | 'output' | 'activity' | 'input'
  }>
}

// 하위 호환: 기존 string[] 형식을 새 형식으로 변환
function normalizeLogicModelLayer(items: any[], prefix: string): LogicModelItem[] {
  if (!items?.length) return []
  // 이미 새 형식이면 그대로
  if (typeof items[0] === 'object' && items[0].id) return items as LogicModelItem[]
  // 기존 string[] 형식 → 변환
  return items.map((item: any, i: number) => ({
    id: `${prefix}-${i + 1}`,
    text: typeof item === 'string' ? item : (item as any).text ?? '',
  }))
}

export function normalizeLogicModel(raw: any): LogicModel {
  return {
    impactGoal: raw.impactGoal ?? '',
    impact: normalizeLogicModelLayer(raw.impact, 'IM'),
    outcome: normalizeLogicModelLayer(raw.outcome, 'OC'),
    output: normalizeLogicModelLayer(raw.output, 'OP'),
    activity: normalizeLogicModelLayer(raw.activity, 'AC'),
    input: normalizeLogicModelLayer(raw.input, 'IN'),
    externalInsights: raw.externalInsights ?? [],
  }
}

/**
 * 기획자가 확인/편집한 impactGoal을 받아 역추적으로 Logic Model을 생성.
 *
 * 티키타카 모드: externalResearch가 제공되면 PM이 수집한 리서치를 주입하고,
 * LLM에게 외부 인사이트 생성을 요청하지 않음 → 토큰 절약 + 품질 향상.
 */
export async function buildLogicModel(
  rfpSummary: string,
  objectives: string[],
  confirmedImpactGoal: string,
  externalResearch?: ExternalResearch[],
): Promise<LogicModel> {
  const hasResearch = externalResearch && externalResearch.length > 0
  const researchContext = hasResearch ? formatExternalResearch(externalResearch) : ''

  // 리서치 유무에 따라 프롬프트 분기 → 토큰 절약
  const insightInstruction = hasResearch
    ? `6. 위 [PM이 수집한 외부 리서치]를 Logic Model 설계에 반드시 반영하세요. externalInsights는 빈 배열로 두세요 (이미 PM이 수집 완료).`
    : `6. externalInsights에 이 Logic Model을 더 강화할 수 있는 외부 트렌드/벤치마크/운영 팁을 3~5개 추가하세요.`

  const result = await invokeAi({
    prompt: `당신은 소셜임팩트 전문가이자 교육 프로그램 설계 컨설턴트입니다.
기획자가 확정한 임팩트 목표를 기준으로 역추적하여 Logic Model을 생성하세요.
${researchContext}
[확정된 임팩트 목표]
"${confirmedImpactGoal}"

사업 개요: ${rfpSummary}
추가 목표: ${objectives.join(', ')}

역추적 원칙:
1. impactGoal은 반드시 위 확정 목표 문장을 그대로 사용
2. 각 계층의 항목에 고유 ID를 부여하세요 (IM-1, OC-1, OP-1, AC-1, IN-1 형식)
3. outcome/output 항목에는 SROI 프록시 유형과 추정 임팩트 가치를 포함하세요
4. linkedTo로 항목 간 인과관계를 연결하세요 (예: OC-1은 OP-1, OP-2에서 도출)
5. activity에 Action Week를 반드시 포함하세요
${insightInstruction}

반드시 아래 JSON만 반환하세요:
{
  "impactGoal": "${confirmedImpactGoal}",
  "impact": [
    {"id": "IM-1", "text": "장기적 사회변화", "sroiProxy": "사회적 가치 유형", "estimatedValue": "추정 가치"}
  ],
  "outcome": [
    {"id": "OC-1", "text": "참여자 변화", "sroiProxy": "프록시 유형", "estimatedValue": "인당 추정 가치", "linkedTo": ["OP-1", "OP-2"]}
  ],
  "output": [
    {"id": "OP-1", "text": "직접 산출물+수치", "linkedTo": ["AC-1", "AC-2"]}
  ],
  "activity": [
    {"id": "AC-1", "text": "핵심 활동", "linkedTo": ["IN-1"]},
    {"id": "AC-3", "text": "Action Week: 실전 실행 주간", "linkedTo": ["IN-1", "IN-2"]}
  ],
  "input": [
    {"id": "IN-1", "text": "필요 자원"}
  ],
  "externalInsights": []
}`,
    maxTokens: AI_TOKENS.LARGE,
    temperature: 0.4,
    label: 'logic-model-builder',
  })

  const raw = result.raw.trim()
  const parsed = safeParseJson<any>(raw, 'buildLogicModel')
  return normalizeLogicModel(parsed)
}

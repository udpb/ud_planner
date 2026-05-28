/**
 * Deep Research — Phase I3 (2026-05-28)
 *
 * RFP 도메인 + 키워드 → 외부 자료 자동 조사.
 *
 * 전략:
 *   1. Gemini 1 호출 — RFP 키워드 보고 "어떤 통계/정책/시장 자료가 필요한지"
 *      추론 + 자료별 핵심 사실 1줄 + 출처 추정 (LLM 의 학습 데이터 기반)
 *   2. 결과 → evidenceRefs 자동 누적
 *      각 항목: { topic, source, summary, fetchedVia: 'auto-research', capturedAt }
 *   3. sections.1 본문에 자동 inline citation [근거: 출처 | YYYY.MM] 박음
 *
 * 한계:
 *   - LLM 학습 데이터 기준 (실시간 X) — 출처는 "추정"
 *   - hallucination 위험: "확신 없으면 비워두기" 지시
 *   - 향후 (Wave V): Bizinfo · 통계청 API 직접 호출로 진짜 fact
 *
 * 단순 fact 인용보다 *어떤 자료가 필요한지 + 어떤 인사이트인지* 가 더 가치.
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { z } from 'zod'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ExternalEvidence } from './schema'

export interface DeepResearchInput {
  rfp: RfpParsed
  channel: 'B2G' | 'B2B' | 'renewal'
  /** 자료 한도 (default 5) */
  limit?: number
}

const EvidenceItemSchema = z.object({
  topic: z.string().min(2).max(80),
  source: z.string().min(2).max(200),
  summary: z.string().min(20).max(400),
  /** 추정 발행 시점 — YYYY.MM 형식 */
  publishedAt: z.string().max(20).optional(),
  /** 관련도 점수 0~1 */
  relevance: z.number().min(0).max(1).optional(),
  /** 어느 sections.N 에 자연스럽게 인용 가능한지 */
  applicableSection: z.string().max(2).optional(),
  /** lowConfidence — AI 가 출처 확신 없을 때 */
  lowConfidence: z.boolean().optional(),
})

const ResearchResultSchema = z.object({
  evidence: z.array(EvidenceItemSchema).max(10),
  /** 도메인 통찰 1줄 — sections.1 헤드라인용 */
  domainInsight: z.string().max(300).optional(),
})

export type ResearchedEvidence = z.infer<typeof EvidenceItemSchema>

export interface DeepResearchOutput {
  evidence: ResearchedEvidence[]
  domainInsight: string | null
  /** evidenceRefs 호환 형식 — draft.evidenceRefs 에 바로 push 가능 */
  evidenceRefs: ExternalEvidence[]
}

export async function fetchExternalEvidence(
  input: DeepResearchInput,
): Promise<DeepResearchOutput> {
  const { rfp, channel, limit = 5 } = input
  const keywords = (rfp.keywords ?? []).slice(0, 8)

  const prompt = `
당신은 한국 정부·기업 사업 제안서의 시장·통계 자료를 조사하는 리서치 에이전트입니다.
RFP 도메인을 보고 본 사업 제안서 작성에 인용 가치 있는 외부 자료 ${limit}건을 추정합니다.

[본 사업]
사업명: ${rfp.projectName ?? '(미상)'}
발주처: ${rfp.client ?? '(미상)'}
채널: ${channel}
대상: ${rfp.targetAudience ?? '(미상)'}
키워드: ${keywords.join(' · ')}
요약: ${rfp.summary ?? '(미상)'}

──────────────────────────────
[조사 지침]

1. **자료 유형 분배** (총 ${limit}건):
   - 시장·산업 통계 (통계청·중기부·산업연구원 등) 1~2건
   - 정책 자료 (정부 정책·계획·로드맵) 1~2건
   - 산업 동향 (시장 규모·성장률) 1건
   - 대상 집단 통계 (창업자 생존율·교육 효과 등) 1건

2. **항목별 필수 정보**:
   - topic: 자료의 핵심 주제 한 줄 (예: "청년 창업 5년 생존율")
   - source: 출처 (예: "통계청 기업생멸행정통계 2023.12")
   - summary: 본 사업에 어떻게 인용 가능한지 1~2 문장 (정량 수치 포함 권장)
   - publishedAt: 추정 발행 시점 (YYYY.MM)
   - relevance: 0~1 (1 = 매우 관련)
   - applicableSection: 1~7 중 어디에 인용 가능 (대부분 "1")
   - lowConfidence: true 면 AI 가 출처 확신 X

3. **출처 진실성** ⭐ 매우 중요:
   - 확신 있는 자료만 (통계청·중기부·산업연구원·창업진흥원 등)
   - 모르는 경우 lowConfidence=true + summary 에 "정확 출처 확인 필요" 명시
   - hallucination 금지 — 가짜 통계 만들지 말 것

4. **domainInsight**:
   - 본 사업 도메인의 가장 핵심 통찰 1줄 (200자 이내)
   - sections.1 (제안 배경) 헤드라인으로 활용 가능
   - 예: "딥테크 스타트업 5년 생존율 33.8% — 시장 진입 단계 병목 극복이 핵심"

[출력 JSON]
{
  "evidence": [
    {
      "topic": "...",
      "source": "...",
      "summary": "...",
      "publishedAt": "2024.10",
      "relevance": 0.92,
      "applicableSection": "1",
      "lowConfidence": false
    }
  ],
  "domainInsight": "본 사업 도메인의 핵심 통찰 한 줄"
}

JSON 만. 설명·마크다운 펜스·trailing comma 없이.
  `.trim()

  try {
    const r = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.3, // 보수적 — hallucination 최소화
      label: 'deep-research',
    })
    const raw = safeParseJson<unknown>(r.raw, 'deep-research')
    const validated = ResearchResultSchema.safeParse(raw)
    if (!validated.success) {
      console.warn('[deep-research] zod 검증 실패:', validated.error.issues[0]?.message)
      return { evidence: [], domainInsight: null, evidenceRefs: [] }
    }
    const evidence = validated.data.evidence
    const evidenceRefs: ExternalEvidence[] = evidence.map((e) => ({
      topic: e.topic,
      source: e.source + (e.publishedAt ? ` | ${e.publishedAt}` : ''),
      summary: e.summary,
      fetchedVia: 'auto-research' as const,
      capturedAt: new Date().toISOString(),
    }))
    return {
      evidence,
      domainInsight: validated.data.domainInsight ?? null,
      evidenceRefs,
    }
  } catch (err) {
    console.warn('[deep-research] 실패 → empty:', err)
    return { evidence: [], domainInsight: null, evidenceRefs: [] }
  }
}

/**
 * domainInsight + evidence 를 sections.1 prompt 에 자연스럽게 주입할 형식.
 * buildTurnPrompt 또는 produceUltimateDraft 에서 호출.
 *
 * K4 fix (2026-05-29):
 *   - lowConfidence 항목은 ⚠ 마크 + "본문 인용 비권장 — PM 검증 필요" 안내
 *   - 고신뢰 자료만 본문 인용 권장
 */
export function formatResearchForPrompt(output: DeepResearchOutput): string {
  if (output.evidence.length === 0 && !output.domainInsight) return ''
  const parts: string[] = []
  if (output.domainInsight) {
    parts.push(`도메인 핵심 통찰: ${output.domainInsight}`)
  }
  if (output.evidence.length > 0) {
    const trustworthy = output.evidence.filter((e) => !e.lowConfidence)
    const lowConf = output.evidence.filter((e) => e.lowConfidence)

    if (trustworthy.length > 0) {
      parts.push(
        `\n외부 자료 ${trustworthy.length}건 (✓ 신뢰 — sections 본문에 inline citation 권장):`,
      )
      for (const e of trustworthy) {
        parts.push(`- ${e.topic} (${e.source}${e.publishedAt ? ` | ${e.publishedAt}` : ''}): ${e.summary}`)
      }
    }
    if (lowConf.length > 0) {
      parts.push(
        `\n⚠ 저신뢰 자료 ${lowConf.length}건 (출처 미확정 — 본문 인용 금지 · PM 검증 후 사용):`,
      )
      for (const e of lowConf) {
        parts.push(`- ${e.topic} (${e.source ?? '미상'}): ${e.summary}`)
      }
    }
  }
  return parts.join('\n')
}

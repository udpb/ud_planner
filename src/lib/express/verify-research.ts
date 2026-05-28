/**
 * Verify Research — Phase L4 (2026-05-29)
 *
 * deep-research.ts 출력에 대한 2차 fact-check.
 *
 * 한계 진단 (K4 에서 발견):
 *   - fetchExternalEvidence 는 한 LLM 호출로 "출처를 추정" — 출처가 진짜인지 미확인
 *   - lowConfidence flag 존재하나 LLM 이 거의 항상 trusted 표시 (자기 출력 자신감 과대)
 *   - 결과: 가짜 출처가 본문에 인용될 위험
 *
 * L4 전략:
 *   1차 LLM (deep-research) — 출처 생성·추정 (creative mode, temp 0.3)
 *   2차 LLM (verify-research) — "skeptical reviewer" 페르소나로 각 source 검증 (temp 0.1)
 *     · "이 publication 이 실재하는가? 가능성 있게 만들었는가?"
 *     · 결과: verified / uncertain / fabricated 셋 중 하나
 *
 * 2차 LLM 이 자기 출력 아니라서 더 비판적. 한 번 더 비용 들지만 hallucination 줄임.
 *
 * 미래 (Wave V): WebSearch / WebFetch 로 진짜 도메인 검증 (kostat.go.kr 등).
 *   현재는 LLM 만 — 서버에서 web search 직접 호출 가능한 인프라 없음.
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { z } from 'zod'
import type { DeepResearchOutput, ResearchedEvidence } from './deep-research'

const VerificationItemSchema = z.object({
  index: z.number().int().min(0),
  status: z.enum(['verified', 'uncertain', 'fabricated']),
  reason: z.string().min(10).max(300),
})

const VerificationResultSchema = z.object({
  verifications: z.array(VerificationItemSchema).max(15),
  /** 전체적으로 본 자료 풀이 신뢰할 만한가 */
  overallTrustworthy: z.boolean(),
  overallReason: z.string().max(300).optional(),
})

export interface VerifiedEvidence extends ResearchedEvidence {
  /** L4 검증 상태 */
  verificationStatus?: 'verified' | 'uncertain' | 'fabricated'
  /** L4 검증 사유 */
  verificationReason?: string
}

export interface VerifiedResearchOutput {
  evidence: VerifiedEvidence[]
  domainInsight: string | null
  evidenceRefs: DeepResearchOutput['evidenceRefs']
  verification: {
    overallTrustworthy: boolean
    overallReason: string | null
    verifiedCount: number
    uncertainCount: number
    fabricatedCount: number
  }
}

export async function verifyExternalEvidence(
  research: DeepResearchOutput,
): Promise<VerifiedResearchOutput> {
  if (research.evidence.length === 0) {
    return {
      evidence: [],
      domainInsight: research.domainInsight,
      evidenceRefs: research.evidenceRefs,
      verification: {
        overallTrustworthy: true,
        overallReason: null,
        verifiedCount: 0,
        uncertainCount: 0,
        fabricatedCount: 0,
      },
    }
  }

  const evidenceList = research.evidence
    .map((e, i) => `[${i}] topic: ${e.topic}\n     source: ${e.source}${e.publishedAt ? ` (${e.publishedAt})` : ''}\n     summary: ${e.summary}`)
    .join('\n\n')

  const prompt = `
당신은 한국 정부·기업 사업 제안서의 출처 검증을 담당하는 **회의적 검수자(skeptical reviewer)** 입니다.
다른 AI 가 생성한 외부 자료 ${research.evidence.length}건의 출처가 진짜 실재하는지 검증합니다.

[검증 규칙 — 매우 엄격하게]

1. **verified** — 출처가 다음 중 하나에 해당하면 verified:
   - 통계청·중소벤처기업부·산업연구원·창업진흥원·한국무역협회·한국개발연구원·국가과학기술자문회의 등 **실재 정부·공공 기관**
   - 그 기관이 **연례 정기 발행하는 통계·조사** (예: "기업생멸행정통계", "벤처기업정밀실태조사")
   - 출판 시점이 과거 5년 이내 (~2021) 로 명시되어 있고 합리적

2. **uncertain** — 다음에 해당:
   - 기관명은 실재하지만 specific 한 publication title 이 generic·gulp 일 때
   - "○○년 ○○ 보고서" 같이 너무 일반적
   - 출처가 민간 reports 인데 그 회사가 확실히 그 시점에 발행했는지 모를 때

3. **fabricated** — 다음에 해당:
   - 기관명이 실재하지 않음 (가공된 이름)
   - publication title 이 너무 구체적이지만 검색에 안 나옴
   - 통계 수치가 너무 구체적이라 만들어낸 것 같음 (예: "정확히 33.8%")

⚠ 중요: 확실하지 않으면 **uncertain** 또는 **fabricated** 로 분류. verified 는 매우 확실할 때만.

[검증 대상]
${evidenceList}

[출력 JSON]
{
  "verifications": [
    { "index": 0, "status": "verified", "reason": "통계청의 정기 발행 통계로 실재함" },
    { "index": 1, "status": "uncertain", "reason": "기관은 실재하나 specific publication title 검색 어려움" },
    ...
  ],
  "overallTrustworthy": true,
  "overallReason": "다수 자료가 실재 기관 출처 — 본문 인용 안전"
}

JSON 만. 모든 ${research.evidence.length}건 검증 필수.
`.trim()

  let verifications: z.infer<typeof VerificationItemSchema>[] = []
  let overallTrustworthy = false
  let overallReason: string | null = null

  try {
    const r = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.1, // 검수자 — 매우 보수적
      label: 'verify-research',
    })
    const raw = safeParseJson<unknown>(r.raw, 'verify-research')
    const validated = VerificationResultSchema.safeParse(raw)
    if (validated.success) {
      verifications = validated.data.verifications
      overallTrustworthy = validated.data.overallTrustworthy
      overallReason = validated.data.overallReason ?? null
    } else {
      console.warn('[verify-research] zod 실패 — 모두 uncertain 마킹:', validated.error.message.slice(0, 200))
    }
  } catch (err) {
    console.warn('[verify-research] LLM 실패 — 모두 uncertain 마킹:', err)
  }

  // Merge verification 결과로 evidence 갱신
  const verifiedEvidence: VerifiedEvidence[] = research.evidence.map((e, i) => {
    const v = verifications.find((x) => x.index === i)
    if (!v) {
      return { ...e, verificationStatus: 'uncertain', verificationReason: 'LLM 검수 응답 없음', lowConfidence: true }
    }
    // fabricated / uncertain 인 자료는 lowConfidence=true 로 force
    const isLowConfidence = v.status !== 'verified'
    return {
      ...e,
      verificationStatus: v.status,
      verificationReason: v.reason,
      lowConfidence: isLowConfidence || e.lowConfidence,
    }
  })

  const verifiedCount = verifiedEvidence.filter((e) => e.verificationStatus === 'verified').length
  const uncertainCount = verifiedEvidence.filter((e) => e.verificationStatus === 'uncertain').length
  const fabricatedCount = verifiedEvidence.filter((e) => e.verificationStatus === 'fabricated').length

  // evidenceRefs 도 갱신 — lowConfidence 정보를 source string 에 ⚠ prefix 로 박음
  const updatedEvidenceRefs = verifiedEvidence.map((e) => ({
    topic: e.topic,
    source:
      e.verificationStatus === 'fabricated'
        ? `⚠ 가공 의심: ${e.source}${e.publishedAt ? ` | ${e.publishedAt}` : ''}`
        : e.verificationStatus === 'uncertain'
          ? `⚠ 검증 필요: ${e.source}${e.publishedAt ? ` | ${e.publishedAt}` : ''}`
          : `${e.source}${e.publishedAt ? ` | ${e.publishedAt}` : ''}`,
    summary: e.summary,
    fetchedVia: 'auto-research' as const,
    capturedAt: new Date().toISOString(),
  }))

  return {
    evidence: verifiedEvidence,
    domainInsight: research.domainInsight,
    evidenceRefs: updatedEvidenceRefs,
    verification: {
      overallTrustworthy,
      overallReason,
      verifiedCount,
      uncertainCount,
      fabricatedCount,
    },
  }
}

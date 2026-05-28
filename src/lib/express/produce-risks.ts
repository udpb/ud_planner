/**
 * Produce Risks — Phase H4 (2026-05-28)
 *
 * 채워진 ExpressDraft + RFP + ClientContext + matchedAssets 받아서
 * 평가위원이 갖는 의문/위험을 4~6개 자동 추정 + 능동 답변(mitigation) 생성.
 *
 * 사용처:
 *   - produceUltimateDraft 의 step 5 — 1차본 조립 직전 1회 호출
 *   - 결과: draft.risks (기존 RiskMitigationsSchema)
 *   - .md 출력 시 자동 섹션 추가 권장 (별도 PR — render-markdown 보강)
 *
 * 평가위원 의문 예시:
 *   - "4개월 안에 정말 가능한가?" (실행 가능성)
 *   - "10개사 만족도 어떻게 보장?" (참여자 관리)
 *   - "예산 대비 임팩트 정량적으로 입증 가능?" (ROI)
 *   - "유사 사업 운영 경험 충분?" (실적 검증)
 *   - "전담 코치진 차질 없이 배정?" (운영 리스크)
 *
 * 톤:
 *   - critical / major / minor 균형 (전부 critical = 자가비판 과다)
 *   - 답변은 구체 (코치 N명·실적 N건·체계 N단계)
 *   - 회사명 직접 비교 금지
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import type { ExpressDraft, RiskMitigation } from './schema'
import { RiskMitigationsSchema } from './schema'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ClientContext } from './client-context'
import { formatClientContextForPrompt } from './client-context'
import type { AssetMatch } from '@/lib/asset-registry'
import { formatAssetMatches } from './prompts/formatters'

export interface ProduceRisksInput {
  draft: ExpressDraft
  rfp?: RfpParsed | null
  clientContext?: ClientContext | null
  matchedAssets?: AssetMatch[]
  /** 채널 (B2G/B2B/renewal) — 톤 분기 */
  channel?: 'B2G' | 'B2B' | 'renewal'
}

export async function produceRisks(input: ProduceRisksInput): Promise<RiskMitigation[]> {
  const { draft, rfp, clientContext, matchedAssets, channel } = input

  // draft 의 핵심 부분만 prompt 에 압축 (intent + BA + keyMessages + sections summary)
  const sectionsText = Object.entries(draft.sections ?? {})
    .filter(([, t]) => t && t.length > 0)
    .map(([k, t]) => `[sections.${k}]\n${(t ?? '').slice(0, 400)}`)
    .join('\n\n')

  const prompt = `
당신은 한국 정부·기업 RFP 평가위원의 시각으로 본 1차본을 검토하는 검수 에이전트입니다.
평가위원이 가질 만한 의문/위험 (risks) 을 4~6개 추정하고, 우리(언더독스) 의 능동 답변(mitigation) 을 작성합니다.

[1차본 핵심]
의도: ${draft.intent ?? '(미작성)'}
Before: ${draft.beforeAfter?.before ?? '(미작성)'}
After: ${draft.beforeAfter?.after ?? '(미작성)'}
핵심 메시지: ${(draft.keyMessages ?? []).join(' / ')}

[섹션 본문 요약]
${sectionsText || '(미작성)'}

[발주처 컨텍스트]
${formatClientContextForPrompt(clientContext) || '(미조사)'}

[RFP 핵심]
발주처: ${rfp?.client ?? '(미상)'}
사업명: ${rfp?.projectName ?? '(미상)'}
대상: ${rfp?.targetAudience ?? '(미상)'}
예산: ${rfp?.totalBudgetVat ?? '(미상)'}
기간: ${rfp?.eduStartDate ?? '?'} ~ ${rfp?.eduEndDate ?? '?'}
${channel ? `채널: ${channel}` : ''}

[매칭된 자산]
${formatAssetMatches(matchedAssets).slice(0, 1500)}

──────────────────────────────
[Risk 생성 규칙]

1. **의문 유형 분배** (4~6 risks 중):
   - 실행 가능성 (기간·예산 대비) — critical 또는 major 1~2개
   - 참여자 관리 (만족도·중도이탈) — major 1~2개
   - 정량 입증 (KPI·임팩트 측정) — major 1개
   - 운영 리스크 (코치진 배정·일정 변경) — major 또는 minor 1~2개
   - 차별성 검증 (왜 우리 회사인가) — major 1개

2. **risk 작성 톤** (평가위원의 의심을 글자 그대로):
   - "이런 risk 있지 않나?" 형 한 문장
   - 비판적이지만 일반적 (회사명 X)
   - 예: "4개월 사업 기간 내 10개사 GTM 보고서 완료가 정말 가능한가?"

3. **mitigation 작성 톤** (능동 답변):
   - 구체적 (코치 N명·실적 N건·체계 N단계)
   - 발주처 컨텍스트의 likelyQuestions 활용
   - 매칭된 자산의 narrativeSnippet 핵심 수치 인용 권장
   - 회사명 비교 금지 — 우리만의 IP·조직·방법론 어휘로 답변

4. **severity 균형** (전부 critical 금지):
   - critical 최대 1개 (사업 자체를 흔드는 risk)
   - major 2~4개 (수행 품질에 영향)
   - minor 0~2개 (부분 영향)

5. **source**: 모두 "ai-suggested" 로 표시. PM 검토 후 수락 가능.

[출력 JSON]
{
  "risks": [
    {
      "risk": "<평가위원의 의심 한 문장 — 10~200자>",
      "mitigation": "<능동 답변 — 20~400자, 구체적, 회사명 X>",
      "severity": "critical" | "major" | "minor",
      "source": "ai-suggested",
      "acceptedByPm": false
    }
  ]
}

⚠️ 4~6개 — 너무 적거나 많으면 시각적 부하.
⚠️ JSON 만 출력 — 설명·마크다운 펜스 없이.
  `.trim()

  try {
    const r = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.4,
      label: 'produce-risks',
    })
    const raw = safeParseJson<{ risks?: unknown[] }>(r.raw, 'produce-risks')
    const items = Array.isArray(raw.risks) ? raw.risks : []
    const validated = RiskMitigationsSchema.safeParse(items)
    if (validated.success) {
      return validated.data
    }
    // 부분 검증 — 통과한 항목만
    const partial = items
      .map((v) => {
        try {
          const r = RiskMitigationsSchema.element?.safeParse?.(v)
          return r?.success ? r.data : null
        } catch {
          return null
        }
      })
      .filter((x): x is RiskMitigation => x !== null)
      .slice(0, 8)
    return partial
  } catch (err) {
    console.warn('[produce-risks] 실패 → empty:', err)
    return []
  }
}

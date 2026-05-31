/**
 * Coherence Pass — Phase H5 (2026-05-28)
 *
 * 완성된 7-section draft 를 LLM 1회로 받아서:
 *   1. 각 섹션이 독립적으로만 잘 쓰여진 게 아니라 **하나의 narrative arc** 인지 평가
 *   2. 부족한 transition 문장 자동 추가 (각 section 끝 → 다음 section 시작 연결)
 *   3. 핵심 메시지가 sections 1·2·6 에 일관되게 흐르는지 cross-reference 강화
 *   4. 반복 표현 제거 + 톤 일관성
 *
 * Inspector 와 차이:
 *   - Inspector: lens 점수 측정 (passive)
 *   - Coherence Pass: 실제 텍스트 재작성 (active)
 *
 * 입력: 전체 sections 본문 + sectionMeta + messageHierarchy
 * 출력: 보강된 sections (각 N 의 transition 1~2 문장 추가 또는 시작 문장 수정)
 *
 * 안전성:
 *   - 본문 핵심은 보존 (자산 인용, 통계, KPI)
 *   - transition 문장만 추가/수정 (실수해도 글이 깨지지 않음)
 *   - LLM 응답 누락 시 원본 그대로 반환 (graceful)
 *
 * 토큰:
 *   - sections 7개 평균 500자 × 7 = 3500자 입력
 *   - 출력 동일 또는 약간 늘어남
 *   - 1회 LLM 호출 (16K maxTokens 충분)
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS, modelFor } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { z } from 'zod'
import type { ExpressDraft } from './schema'
import { SECTION_LABELS } from './schema'

const CoherenceResultSchema = z.object({
  /** 보강된 sections (각 키마다 — 원본 핵심 보존, transition 만 추가/수정) */
  sections: z.object({
    '1': z.string().max(2000).optional(),
    '2': z.string().max(2000).optional(),
    '3': z.string().max(2000).optional(),
    '4': z.string().max(2000).optional(),
    '5': z.string().max(2000).optional(),
    '6': z.string().max(2000).optional(),
    '7': z.string().max(2000).optional(),
  }).optional(),
  /** Coherence Pass 의 추론 근거 1줄 — PM 검토용 */
  reasoning: z.string().max(400).optional(),
  /** 어떤 섹션에 어떤 변화가 적용됐는지 — 추적용 (LLM 자유 형식 허용) */
  changes: z.array(z.unknown()).max(20).optional(),
})

export type CoherenceResult = z.infer<typeof CoherenceResultSchema>

export interface CoherencePassInput {
  draft: ExpressDraft
  projectName?: string
}

/**
 * draft 의 sections 를 받아서 coherence pass 적용 → 보강된 sections 반환.
 * draft 객체 자체는 mutate 안 함 — 새 sections 객체만 반환.
 */
export async function coherencePass(
  input: CoherencePassInput,
): Promise<{ updatedSections: Record<string, string>; result: CoherenceResult }> {
  const { draft, projectName } = input
  const sections = draft.sections ?? {}

  // 빈 sections 가 너무 많으면 의미 X — fallback
  const filledKeys = Object.entries(sections)
    .filter(([, v]) => v && v.length >= 50)
    .map(([k]) => k)
  if (filledKeys.length < 3) {
    return {
      updatedSections: sections as Record<string, string>,
      result: { reasoning: '채워진 섹션 부족 (3 미만) — coherence pass 미적용' },
    }
  }

  const sectionsText = filledKeys
    .map((k) => `### [sections.${k}] ${SECTION_LABELS[k as keyof typeof SECTION_LABELS] ?? k}\n${(sections as Record<string, string>)[k]}`)
    .join('\n\n')

  const intentLine = draft.intent ? `사업 정체성: ${draft.intent}` : ''
  const baLines = draft.beforeAfter
    ? [
        draft.beforeAfter.before ? `Before: ${draft.beforeAfter.before}` : '',
        draft.beforeAfter.after ? `After: ${draft.beforeAfter.after}` : '',
      ].filter(Boolean).join('\n')
    : ''
  const kmsLine = (draft.keyMessages ?? []).length > 0
    ? `핵심 메시지: ${(draft.keyMessages ?? []).filter(Boolean).join(' / ')}`
    : ''

  const prompt = `
당신은 한국 정부·기업 RFP 제안서의 narrative arc (서사 흐름) 를 검증하는 전문 에디터입니다.
다음 1차본의 7 섹션이 **독립된 단락 모음** 이 아니라 **하나의 흐름** 이 되도록 보강합니다.

[프로젝트] ${projectName ?? '(미상)'}

[1차본 전체 컨텍스트]
${intentLine}
${baLines}
${kmsLine}

[현재 sections (필러 ${filledKeys.length}개)]

${sectionsText}

──────────────────────────────
[Coherence Pass 4가지 임무]

1. **Narrative Arc** — 각 sections 사이에 자연스러운 흐름이 있나?
   - sections.1 → 2 (배경 → 전략) · 2 → 3 (전략 → 커리큘럼) · 3 → 4 (커리큘럼 → 운영) · 4 → 6 (운영 → 성과)
   - 끊겨 있으면 각 section 의 마지막 1~2 문장에 다음 section 으로 이어주는 transition 추가
   - 또는 다음 section 의 첫 1 문장에 이전 section 의 결론 참조
   - ⚠️ **리스트로 시작하는 section 처리**: section 본문이 불릿/번호/❍/STEP 등 구조화 리스트로 곧장 시작하면, 그 앞에 **이전 section 의 결론을 이어받는 산문 도입 1 문장** 을 반드시 추가한다. (예: "앞서 제시한 3단계 프레임워크는 아래 6개월 커리큘럼으로 구체화됩니다." 처럼 — 단, 매번 '앞서' 로 시작하지 말고 자연스럽게 변주) 리스트 항목 자체는 그대로 보존.

2. **핵심 메시지 Cross-Reference** — 위 [핵심 메시지] 3개가 sections.1·2·6 에 모두 나타나나?
   - sections.1 (배경) — 핵심 메시지 가 왜 중요한지 시장 관점에서 이끌어냄
   - sections.2 (전략) — 핵심 메시지 가 우리의 방법론으로 실현되는 메커니즘
   - sections.6 (성과) — 핵심 메시지 가 정량 KPI 로 검증됨
   - 빠진 경우 자연스럽게 1~2 문장 추가

3. **반복 표현 제거 / 톤 일관성**:
   - 같은 표현이 sections 여러 곳에 반복되면 1번만 유지 (가장 강한 위치)
   - 발주처 어휘 (signatureVocab) 일관 사용
   - 경어체 일관 (~합니다)

4. **본문 핵심 보존 ⚠ 절대 규칙**:
   - 자산 인용 ([자산 인용: ...]) 그대로 유지
   - 통계·KPI 수치 그대로 유지
   - inline source citation [근거: ...] 그대로 유지
   - 본문의 60~80% 는 그대로. transition 만 1~3 문장 추가/수정.

[출력 JSON]
{
  "sections": {
    "1": "<보강된 sections.1 본문 — 원본 핵심 보존, transition 1~2 문장 추가 또는 첫/끝 문장 수정>",
    "2": "<보강된 sections.2 본문>",
    "3": "<보강된 sections.3 본문>",
    "4": "<보강된 sections.4 본문>",
    "5": "<보강된 sections.5 본문 (있을 때)>",
    "6": "<보강된 sections.6 본문>",
    "7": "<보강된 sections.7 본문 (있을 때)>"
  },
  "reasoning": "<coherence pass 1줄 추론 근거 — 어떤 흐름 강화했는지>",
  "changes": [
    { "section": "1", "type": "closing-reworked", "detail": "다음 sections.2 의 4단계 프레임으로 자연 연결" },
    { "section": "2", "type": "transition-added", "detail": "핵심 메시지 #3 (10개사 맞춤) 한 문장 추가" }
  ]
}

⚠️ 빠진 sections (50자 미만) 는 sections 객체에서 생략.
⚠️ JSON 만 출력. 설명·마크다운 펜스·trailing comma 금지.
  `.trim()

  try {
    const r = await invokeAi({
      prompt,
      model: modelFor('engine.coherence'),
      maxTokens: AI_TOKENS.LARGE,
      temperature: 0.4,
      label: 'coherence-pass',
    })
    const raw = safeParseJson<unknown>(r.raw, 'coherence-pass')
    const validated = CoherenceResultSchema.safeParse(raw)
    if (!validated.success) {
      console.warn('[coherence-pass] zod 검증 실패:', validated.error.message)
      return { updatedSections: sections as Record<string, string>, result: { reasoning: 'AI 응답 형식 오류 — 원본 유지' } }
    }
    const updated: Record<string, string> = { ...(sections as Record<string, string>) }
    for (const [k, v] of Object.entries(validated.data.sections ?? {})) {
      if (typeof v === 'string' && v.length >= 50 && v.length <= 2000) {
        updated[k] = v
      }
    }
    return { updatedSections: updated, result: validated.data }
  } catch (err) {
    console.warn('[coherence-pass] 실패 → 원본 유지:', err)
    return {
      updatedSections: sections as Record<string, string>,
      result: { reasoning: `coherence pass 실패: ${err instanceof Error ? err.message : String(err)}` },
    }
  }
}

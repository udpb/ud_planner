/**
 * Infer Program Profile — Phase L2 (2026-05-29)
 *
 * ContentAsset 의 narrativeSnippet · name · keywords 를 보고
 * 자산에 가장 관련 있는 ProgramProfile 축들을 추론.
 *
 * 결과는 partial — 자산이 명확히 관련된 축만 채움 (asset-registry 의 partialProfileMatch 가
 * fit 비어있는 축은 점수 영향 X).
 *
 * 호출자:
 *   scripts/migrate-program-profile-fit.ts — 일괄 마이그레이션
 *
 * 비용:
 *   자산당 Gemini 1 call · prompt ~1KB · 응답 ~500B → 약 $0.001/자산
 *   1,765 자산 → 약 $1.7 (Claude fallback 시 약 $30)
 */

import 'server-only'

import { z } from 'zod'
import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'

// 사용할 enum 값 (program-profile.ts 의 일부)
const TARGET_STAGES = [
  '예비창업_아이디어무',
  '예비창업_아이디어유',
  'seed',
  'pre-A',
  'series-A이상',
  '소상공인',
  '비창업자',
] as const

const BUSINESS_DOMAINS = [
  'ALL',
  '식품/농업',
  '문화/예술',
  '사회/복지',
  '여행/레저',
  '교육',
  '유통/커머스',
  '제조/하드웨어',
  'IT/TECH',
  '바이오/의료',
  '환경/에너지',
  '피트니스/스포츠',
  '부동산/건설',
  '모빌리티/교통',
  '홈리빙/펫',
  '인사/법률/비즈니스',
  '금융/재무/보험',
  '미디어/엔터테인먼트',
  '핀테크',
  '기타',
] as const

const METHODOLOGIES = [
  'IMPACT',
  '로컬브랜드',
  '글로컬',
  '공모전설계',
  '매칭',
  '재창업',
  '글로벌진출',
  '소상공인성장',
  '커스텀',
] as const

const DELIVERY_MODES = ['온라인', '오프라인', '하이브리드'] as const

const PRIMARY_IMPACTS = [
  '교육효과',
  '창업률',
  '사업화',
  '매출증대',
  '고용창출',
  '글로벌진출',
  '소상공인성장',
  '재창업성공',
  '사회문제해결',
  '네트워킹',
] as const

const CHANNEL_TYPES = ['B2G', 'B2B'] as const

const InferredProfileSchema = z.object({
  /** 자산이 어느 단계 사업가 대상인지 (clear 한 경우만) */
  targetStage: z.enum(TARGET_STAGES).optional(),
  /** 도메인 (clear 한 경우만, 최대 3개) */
  businessDomain: z.array(z.enum(BUSINESS_DOMAINS)).max(3).optional(),
  /** 방법론 (가장 가까운 1개) */
  methodologyPrimary: z.enum(METHODOLOGIES).optional(),
  /** 전달 방식 */
  deliveryMode: z.enum(DELIVERY_MODES).optional(),
  /** 핵심 임팩트 (최대 2개) */
  primaryImpacts: z.array(z.enum(PRIMARY_IMPACTS)).max(2).optional(),
  /** 채널 (B2G/B2B) */
  channelType: z.enum(CHANNEL_TYPES).optional(),
  /** 추론 사유 (디버깅용) */
  reasoning: z.string().max(300).optional(),
})

export type InferredProfile = z.infer<typeof InferredProfileSchema>

export interface InferProgramProfileInput {
  /** 자산 이름 */
  name: string
  /** narrativeSnippet (본문 요약) */
  narrativeSnippet?: string | null
  /** keywords */
  keywords?: string[]
  /** 자산 카테고리 */
  category?: string
  /** sourceProject (있으면 채널 추론에 도움) */
  sourceProject?: string | null
}

/**
 * LLM 으로 ContentAsset 의 ProgramProfile 축 추론.
 * 빈 결과 (모든 축 unknown) 반환 가능.
 */
export async function inferProgramProfileFit(
  input: InferProgramProfileInput,
): Promise<InferredProfile> {
  if (!input.narrativeSnippet || input.narrativeSnippet.length < 50) {
    return {} // 정보 부족 — 빈 결과
  }

  const prompt = `
당신은 한국 창업 교육 자산 분류 전문가입니다.
다음 ContentAsset 의 narrativeSnippet 을 보고, **명확히 관련 있는** ProgramProfile 축만 추론하세요.
**확실하지 않은 축은 비워둡니다 (over-confidence 금지).**

[자산]
이름: ${input.name}
카테고리: ${input.category ?? '미상'}
${input.sourceProject ? `소스 사업: ${input.sourceProject}` : ''}
keywords: ${(input.keywords ?? []).slice(0, 8).join(', ') || '없음'}

narrativeSnippet:
${input.narrativeSnippet.slice(0, 1500)}

──────────────────────────────
[추론 가이드 — 보수적으로]

1. **targetStage** (대상 단계): 본문에 명시되거나 강하게 시사된 경우만.
   ['예비창업_아이디어무', '예비창업_아이디어유', 'seed', 'pre-A', 'series-A이상', '소상공인', '비창업자']

2. **businessDomain** (도메인 — 최대 3, ALL 은 도메인 비특이): 자산이 어느 산업에 특화되었는지.
   ['ALL', '식품/농업', '문화/예술', '사회/복지', '여행/레저', '교육', '유통/커머스',
    '제조/하드웨어', 'IT/TECH', '바이오/의료', '환경/에너지', '피트니스/스포츠',
    '부동산/건설', '모빌리티/교통', '홈리빙/펫', '인사/법률/비즈니스', '금융/재무/보험',
    '미디어/엔터테인먼트', '핀테크', '기타']
   ⚠ 도메인 시사 없으면 'ALL' 또는 비워두기.

3. **methodologyPrimary** (방법론 — 가장 가까운 1개):
   ['IMPACT', '로컬브랜드', '글로컬', '공모전설계', '매칭', '재창업', '글로벌진출',
    '소상공인성장', '커스텀']
   ⚠ 명확한 방법론 시그니처 없으면 비워두기.

4. **deliveryMode**: 본문에 명시된 경우만. ['온라인', '오프라인', '하이브리드']

5. **primaryImpacts** (핵심 임팩트 — 최대 2):
   ['교육효과', '창업률', '사업화', '매출증대', '고용창출', '글로벌진출',
    '소상공인성장', '재창업성공', '사회문제해결', '네트워킹']

6. **channelType**: sourceProject 명에 'A.XX' 같은 prefix 있으면 'B2G' 추정.
   기업 자산 (네이버·삼성 등) 명시되면 'B2B'.

7. **reasoning**: 위 결정의 1줄 사유 (디버깅용).

[출력 JSON — 명시되지 않거나 불확실한 축은 누락]
{
  "targetStage": "...",
  "businessDomain": ["..."],
  "methodologyPrimary": "...",
  "deliveryMode": "...",
  "primaryImpacts": ["..."],
  "channelType": "B2G",
  "reasoning": "..."
}

JSON 만.
`.trim()

  try {
    const r = await invokeAi({
      prompt,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.2,
      label: 'infer-profile-fit',
    })
    const raw = safeParseJson<unknown>(r.raw, 'infer-profile-fit')
    const validated = InferredProfileSchema.safeParse(raw)
    if (!validated.success) {
      console.warn(`[infer-profile-fit] zod 실패 (${input.name.slice(0, 40)}): ${validated.error.issues[0]?.message ?? 'unknown'}`)
      return {}
    }
    return validated.data
  } catch (err) {
    console.warn(`[infer-profile-fit] LLM 실패 (${input.name.slice(0, 40)}):`, err instanceof Error ? err.message : err)
    return {}
  }
}

/**
 * InferredProfile (단순 평면 형식) → Partial<ProgramProfile> (저장용 nested 구조).
 * asset-registry 의 partialProfileMatch 와 호환되는 형식으로 변환.
 *
 * 저장 정책: 추론된 축만 nest. 비어있는 축은 omit.
 */
export function toProfileFit(inferred: InferredProfile): Record<string, unknown> {
  const fit: Record<string, unknown> = {}

  if (inferred.targetStage) fit.targetStage = inferred.targetStage

  if (inferred.businessDomain && inferred.businessDomain.length > 0) {
    fit.targetSegment = { businessDomain: inferred.businessDomain }
  }

  if (inferred.methodologyPrimary) {
    fit.methodology = { primary: inferred.methodologyPrimary }
  }

  if (inferred.deliveryMode) {
    fit.delivery = { mode: inferred.deliveryMode }
  }

  if (inferred.primaryImpacts && inferred.primaryImpacts.length > 0) {
    fit.primaryImpact = inferred.primaryImpacts
  }

  if (inferred.channelType) {
    fit.channel = { type: inferred.channelType }
  }

  return fit
}

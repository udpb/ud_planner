/**
 * Sphere 2 — Content Extractor (LLM #3)
 *
 * PRD-v11.0 §4.3 — extract-tuple 의 세 번째 LLM 호출.
 *
 * 각 semantic chunk → ContentChunk 메타데이터 (category · evidenceType · keyNumbers · sourceTier).
 *
 * 비용:
 *   - 단일 chunk 당 ~200 토큰 out · ~$0.0015/chunk
 *   - 제안서 1건 평균 4 chunk → ~$0.006/건
 */

// server-only 의도 — invokeAi 가 client bundle 에서 자연 fail.

import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import { ContentChunkSchema, type ContentChunk, type Channel } from './types'
import { inferSectionHint } from './semantic-chunker'
import { z } from 'zod'

// LLM 응답은 chunk 1개의 메타데이터만 (text 는 우리가 이미 갖고 있음)
const ContentExtractResponseSchema = z.object({
  category: z.enum([
    'methodology',
    'content',
    'product',
    'human',
    'data',
    'framework',
  ]),
  evidenceType: z.enum(['quantitative', 'structural', 'case', 'methodology']),
  keyNumbers: z
    .array(
      z.object({
        value: z.string(),
        unit: z.string().optional(),
        context: z.string().max(200),
        source: z.string().optional(),
      }),
    )
    .max(15),
  sourceTier: z.enum(['high', 'medium', 'low', 'internal']).optional(),
})

export interface ContentExtractInput {
  chunkText: string
  sourceProject: string
  /** 외부 source 인 경우 — 자동 sourceTier 우선 */
  sourceHint?: 'drive-won' | 'drive-archive' | 'hbr' | 'ssir' | 'triple-light' | 'internal'
}

export interface ContentExtractResult {
  chunk: ContentChunk
  tokensUsed: number
}

const SYSTEM_PROMPT = `당신은 언더독스의 콘텐츠 분류 전문가입니다.
제안서의 한 chunk (200~800자) 를 받아 메타데이터를 추출합니다.

**category** — 자산 분류:
- methodology: 방법론·프레임워크 (IMPACT 18 모듈 등)
- content: 교육 콘텐츠 (강의 자료·학습 자료)
- product: 제품·상품
- human: 코치·인적 자원
- data: 정량 데이터·통계
- framework: 분석 도구·체계

**evidenceType** — 평가위원 검증 가능성:
- quantitative: 정량 수치·통계
- structural: 구조·체계 설명
- case: 사례·레퍼런스
- methodology: 방법론·이론

**keyNumbers** — 본문 안의 시그니처 수치 (max 15):
각 항목 { value, unit?, context, source? }
- value: "20,211명" / "32개월" / "95%"
- unit: '명' / '개월' / '%'
- context: "누적 양성" / "운영 기간"
- source: "통계청" / "내부 자료" (있으면)

**sourceTier** (선택적 추정):
- high: HBR · SSIR · 정부 공식 통계 · 트리플라잇
- medium: 일반 미디어
- low: 블로그 · 출처 불명
- internal: 언더독스 내부 자료

⚠️ 주의:
- 본문에 실제 등장한 정보만 — 추측 X
- keyNumbers 가 없으면 빈 배열 []

JSON 만 출력. 마크다운 펜스·설명 없이.`

function buildPrompt(input: ContentExtractInput): string {
  return `${SYSTEM_PROMPT}

[chunk 본문]
${input.chunkText}

[출력 JSON 스키마]
{
  "category": "data",
  "evidenceType": "quantitative",
  "keyNumbers": [
    { "value": "20,211명", "unit": "명", "context": "누적 양성", "source": "내부 자료" }
  ],
  "sourceTier": "internal"
}

JSON 만 출력.`
}

/**
 * 단일 chunk → ContentChunk (메타데이터 enrichment).
 *
 * 실패 시: invokeAi 자동 retry → schema 검증 실패 시 throw.
 */
export async function extractContent(
  input: ContentExtractInput,
): Promise<ContentExtractResult> {
  const startedAt = Date.now()
  const prompt = buildPrompt(input)

  const aiResult = await invokeAi({
    prompt,
    // Gemini 3.x thinking 모드 — thinking budget 이 maxOutputTokens 일부 사용.
    // chunk 메타는 짧지만 thinking 여유 — LIGHT (4096).
    maxTokens: 4096,
    temperature: 0.2, // 분류 작업은 일관성 우선
    label: `content-extract:${input.sourceProject}`,
  })

  let parsed: unknown
  try {
    parsed = safeParseJson(aiResult.raw, `content-extract:${input.sourceProject}`)
  } catch (e) {
    log.error('inference', '[content-extract] JSON 파싱 실패', {
      sourceProject: input.sourceProject,
      err: e instanceof Error ? e.message : String(e),
    })
    throw e
  }

  const validated = ContentExtractResponseSchema.safeParse(parsed)
  if (!validated.success) {
    log.error('inference', '[content-extract] 스키마 검증 실패', {
      sourceProject: input.sourceProject,
      issues: validated.error.issues.slice(0, 3),
    })
    throw new Error(
      `[content-extract] schema 검증 실패: ${validated.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .slice(0, 3)
        .join(' / ')}`,
    )
  }

  // sourceTier 우선순위: input.sourceHint (외부 신뢰) > LLM 추정
  const sourceTier =
    input.sourceHint === 'drive-won' || input.sourceHint === 'internal'
      ? ('internal' as const)
      : input.sourceHint === 'hbr' ||
        input.sourceHint === 'ssir' ||
        input.sourceHint === 'triple-light'
      ? ('high' as const)
      : validated.data.sourceTier

  const chunk: ContentChunk = {
    text: input.chunkText,
    sectionHint: inferSectionHint(input.chunkText),
    category: validated.data.category,
    evidenceType: validated.data.evidenceType,
    keyNumbers: validated.data.keyNumbers,
    sourceTier,
  }

  log.debug('inference', `[content-extract] chunk 완료`, {
    sourceProject: input.sourceProject,
    category: chunk.category,
    keyNumbers: chunk.keyNumbers.length,
    ms: Date.now() - startedAt,
  })

  return {
    chunk,
    tokensUsed: aiResult.raw.length,
  }
}

/**
 * 다수 chunk 를 순차 처리 (병렬 X — Gemini rate limit 보호).
 *
 * 실패한 chunk 는 result 에서 제외 (전체 fail X).
 * 실패율 > 30% 면 throw (전체 품질 의심).
 */
export async function extractContentBatch(
  chunks: readonly string[],
  sourceProject: string,
  sourceHint?: ContentExtractInput['sourceHint'],
): Promise<{
  results: ContentChunk[]
  failedCount: number
  totalTokens: number
}> {
  const results: ContentChunk[] = []
  let failedCount = 0
  let totalTokens = 0

  for (const text of chunks) {
    try {
      const r = await extractContent({
        chunkText: text,
        sourceProject,
        sourceHint,
      })
      results.push(r.chunk)
      totalTokens += r.tokensUsed
    } catch (e) {
      failedCount++
      log.warn('inference', `[content-extract-batch] chunk 실패`, {
        sourceProject,
        chunkPreview: text.slice(0, 80),
        err: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const failRate = chunks.length > 0 ? failedCount / chunks.length : 0
  if (failRate > 0.3) {
    throw new Error(
      `[content-extract-batch] 실패율 ${(failRate * 100).toFixed(1)}% 초과 (${failedCount}/${chunks.length}) — 본문 품질 의심`,
    )
  }

  return { results, failedCount, totalTokens }
}

// ═════════════════════════════════════════════════════════════════
// extractContentBulk — 단일 LLM 호출로 자산 N개 일괄 추출 (퀄리티 최우선)
//
// 2026-05-24 — 사용자 결정: "비용 X, 퀄리티 최우선".
//
// 기존 extractContent (chunk 별 N 호출) 의 한계:
//   - chunk 가 자기 맥락만 봄 → 전체 제안서에서의 위치·역할 모름
//   - 24 chunk = 24 LLM 호출 → quota 부담
//   - narrativeSnippet 이 raw chunk text → 매칭 시 다시 정제 필요
//
// extractContentBulk 의 강점 (Anthropic Contextual Retrieval 영감):
//   - 전체 텍스트 1 호출 → LLM 이 전체 맥락 안에서 자산 선별
//   - 각 자산의 narrativeSnippet 을 LLM 이 직접 정제 (raw X)
//   - 각 자산에 context (전체에서의 위치·역할) 부여
//   - 매칭 시 즉시 인용 가능한 품질
//   - 비용: PDF 1건 = 1 호출
// ═════════════════════════════════════════════════════════════════

// LLM 이 가끔 enum 외 값 출력 — fallback 적용 (전체 fail 방지).
const CATEGORY_ENUM = [
  'methodology',
  'content',
  'product',
  'human',
  'data',
  'framework',
] as const
const EVIDENCE_ENUM = [
  'quantitative',
  'structural',
  'case',
  'methodology',
] as const

const ContentBulkResponseSchema = z.object({
  assets: z
    .array(
      z.object({
        name: z.string().min(3).max(120),
        narrativeSnippet: z.string().min(80).max(800),
        context: z.string().min(20).max(400),
        sectionHint: z.string().optional(),
        // LLM 이 'education' / 'service' 같은 enum 외 값 출력 가능 → 'content' fallback
        category: z
          .string()
          .transform((v) =>
            (CATEGORY_ENUM as readonly string[]).includes(v)
              ? (v as (typeof CATEGORY_ENUM)[number])
              : ('content' as const),
          ),
        evidenceType: z
          .string()
          .transform((v) =>
            (EVIDENCE_ENUM as readonly string[]).includes(v)
              ? (v as (typeof EVIDENCE_ENUM)[number])
              : ('structural' as const),
          ),
        // LLM 이 가끔 ["261명", "2만개"] string 배열로 반환 → object 로 변환 (전체 fail 방지)
        keyNumbers: z
          .preprocess(
            (val) => {
              if (!Array.isArray(val)) return val
              return val.map((v: unknown) => {
                if (typeof v === 'string') return { value: v, context: '' }
                if (v && typeof v === 'object') {
                  const obj = v as Record<string, unknown>
                  return {
                    value: String(obj.value ?? obj.number ?? obj.amount ?? ''),
                    unit: typeof obj.unit === 'string' ? obj.unit : undefined,
                    context:
                      typeof obj.context === 'string'
                        ? obj.context.slice(0, 200)
                        : '',
                    source: typeof obj.source === 'string' ? obj.source : undefined,
                  }
                }
                return { value: String(v ?? ''), context: '' }
              })
            },
            z
              .array(
                z.object({
                  value: z.string(),
                  unit: z.string().optional(),
                  context: z.string().max(200),
                  source: z.string().optional(),
                }),
              )
              .max(15),
          )
          .default([]),
      }),
    )
    .min(3)
    .max(20),
  confidence: z.number().min(0).max(1),
})

export interface ContentBulkInput {
  proposalText: string
  sourceProject: string
  channel: Channel
  /** message tuple (있으면 prompt 에 주입 → 자산 추출 정확도 ↑) */
  messageContext?: {
    slogan: string
    keyMessages: string[]
  }
  /** sourceTier 우선 결정 */
  sourceHint?: ContentExtractInput['sourceHint']
}

export interface ContentBulkResult {
  chunks: ContentChunk[]
  confidence: number
  tokensUsed: number
}

const BULK_SYSTEM_PROMPT = `당신은 언더독스 제안서 분석 전문가입니다.
제안서 본문 전체를 받아 "재사용 가능한 자산 5~12개" 를 추출합니다.

자산이란:
- 다른 RFP 제안서 작성 시 인용·재사용 가능한 의미 단위
- 예: 방법론·코치 풀·통계 수치·사례·차별화 포인트·임팩트 KPI

각 자산:
- **name** (3~80자): 자산을 가리키는 짧은 이름. 예: "Alumni Hub 261명 코치 풀" / "4Steps 6Dimension 방법론"
- **narrativeSnippet** (80~600자): **LLM 이 직접 정제한 인용 가능 텍스트**.
  원문 그대로 X — 핵심만 압축, 다른 제안서에 즉시 paste 가능한 품질.
  반드시 시그니처 수치 포함 (예: "261명", "20,211명").
- **context** (20~400자): 이 자산이 전체 제안서에서의 위치·역할.
  예: "B2G 사업의 핵심 차별화 자산. ② 추진전략 섹션에서 우리 강점 근거로 활용된 정량 데이터."
- **sectionHint**: '1'~'7' (제안서 7섹션 중 어디서 인용 가능)
  1=배경 / 2=추진전략 / 3=커리큘럼 / 4=운영체계 / 5=예산 / 6=기대성과 / 7=리스크
- **category**: methodology / content / product / human / data / framework
- **evidenceType**: quantitative (수치) / structural (구조) / case (사례) / methodology (방법론)
- **keyNumbers**: 시그니처 수치 (최대 15)

⚠️ 중요:
1. **퀄리티 최우선** — 5~12개 정선. 100개 nó X.
2. narrativeSnippet 은 raw 본문 발췌 X — **LLM 정제 압축**.
   "고객 검증과 연쇄 실행 반복으로 단기간 IR Deck 완성하는 자립형 액트프러너 육성. 261명 전현직 창업가 코치진의 1:1 밀착 코칭과 1박 2일 압축 해커톤 방식. 2만 개 창업가 데이터 기반 DOGS 팀빌딩 + AI/노코드 활용 실전 랜딩페이지 제작." 같은 압축·완결 문장.
3. context 는 RAG 매칭 정확도의 핵심 — 단순 카테고리 X, **이 자산이 어떤 RFP·어떤 섹션에서 왜 가치 있는지** 명시.
4. confidence: 본문 품질 + 자산 추출 명확도 (0.5 이하 = 본문 부족).

JSON 만 출력. 마크다운 펜스·설명 없이.`

function buildBulkPrompt(input: ContentBulkInput): string {
  const msgCtx = input.messageContext
    ? `\n\n[제안서의 핵심 메시지 (정확한 자산 추출 hint)]
- Slogan: ${input.messageContext.slogan}
- Key Messages: ${input.messageContext.keyMessages.join(' · ')}`
    : ''

  return `${BULK_SYSTEM_PROMPT}

[제안서 정보]
- 사업명: ${input.sourceProject}
- 채널: ${input.channel}${msgCtx}

[제안서 본문]
${input.proposalText.slice(0, 30000)}

[출력 JSON 스키마]
{
  "assets": [
    {
      "name": "...",
      "narrativeSnippet": "...",
      "context": "...",
      "sectionHint": "2",
      "category": "human",
      "evidenceType": "quantitative",
      "keyNumbers": [
        { "value": "261명", "unit": "명", "context": "전현직 창업가 출신 코치", "source": "내부 자료" }
      ]
    }
    // ... 5~12개
  ],
  "confidence": 0.92
}

JSON 만 출력.`
}

/**
 * 단일 LLM 호출로 전체 PDF → 자산 N개 일괄 추출 + 정제.
 *
 * 비용: 제안서 1건 ~$0.005 (Gemini 3.x · in ~10K + out ~3K)
 * 시간: ~30~60초
 */
export async function extractContentBulk(
  input: ContentBulkInput,
): Promise<ContentBulkResult> {
  const startedAt = Date.now()
  const prompt = buildBulkPrompt(input)

  const aiResult = await invokeAi({
    prompt,
    // 자산 N개 × 각 ~500 토큰 = ~6K + context + thinking margin → LARGE
    maxTokens: 12288,
    temperature: 0.3,
    label: `content-bulk:${input.sourceProject}`,
  })

  let parsed: unknown
  try {
    parsed = safeParseJson(aiResult.raw, `content-bulk:${input.sourceProject}`)
  } catch (e) {
    log.error('inference', '[content-bulk] JSON 파싱 실패', {
      sourceProject: input.sourceProject,
      err: e instanceof Error ? e.message : String(e),
    })
    throw e
  }

  const validated = ContentBulkResponseSchema.safeParse(parsed)
  if (!validated.success) {
    log.error('inference', '[content-bulk] 스키마 검증 실패', {
      sourceProject: input.sourceProject,
      issues: validated.error.issues.slice(0, 5),
    })
    throw new Error(
      `[content-bulk] schema 검증 실패: ${validated.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .slice(0, 3)
        .join(' / ')}`,
    )
  }

  // sourceTier 우선순위: sourceHint > tier default 'internal'
  const sourceTier =
    input.sourceHint === 'drive-won' || input.sourceHint === 'internal'
      ? ('internal' as const)
      : input.sourceHint === 'hbr' ||
          input.sourceHint === 'ssir' ||
          input.sourceHint === 'triple-light'
        ? ('high' as const)
        : ('internal' as const)

  const chunks: ContentChunk[] = validated.data.assets.map((a) => ({
    name: a.name,
    text: a.narrativeSnippet,
    context: a.context,
    sectionHint: a.sectionHint ?? inferSectionHint(a.narrativeSnippet),
    category: a.category,
    evidenceType: a.evidenceType,
    keyNumbers: a.keyNumbers,
    sourceTier,
  }))

  log.info('inference', `[content-bulk] 완료`, {
    sourceProject: input.sourceProject,
    assetCount: chunks.length,
    confidence: validated.data.confidence,
    ms: Date.now() - startedAt,
    provider: aiResult.provider,
  })

  return {
    chunks,
    confidence: validated.data.confidence,
    tokensUsed: aiResult.raw.length,
  }
}

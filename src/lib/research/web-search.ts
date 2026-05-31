/**
 * Web Search Wrapper — F3 (Wave V, ADR-015)
 *
 * Gemini grounding (googleSearchRetrieval) 을 사용한 외부 검색.
 * Tier 2 호출 (auto-researcher.ts) 가 사용.
 *
 * 정형화 회피: temperature 0.5 (LLM 자체 변주) + query-variation 별도 (caller 가 결정).
 *
 * server-only — googleapis 의존성 때문.
 */

import 'server-only'
// eslint-disable-next-line no-restricted-imports -- Gemini search grounding (googleSearch tool + groundingMetadata) 사용. provider-neutral invokeAi 는 tools/grounding 미지원이라 대체 불가. 정당한 예외 (FIX-2, ADR-023 @google/genai).
import { GoogleGenAI } from '@google/genai'
import { GEMINI_MODEL, isGeminiAvailable } from '@/lib/gemini'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import { AutoResearchHitSchema, type AutoResearchHit } from './types'

export interface WebSearchInput {
  /** 검색 query (1~2개) */
  queries: string[]
  /** 검색 topic (응답에 그대로 포함) */
  topic: string
  /** 사업 맥락 — prompt 안에 명시 */
  context: {
    projectName: string
    client: string
    targetAudience: string
    keywords: string[]
    universes: string[]
    channel: string
  }
  /** dedupe 대상 — 이미 사용된 source URL */
  excludeSources?: string[]
}

export interface WebSearchResult {
  hits: AutoResearchHit[]
  usedQueries: string[]
  /** Gemini grounding 사용했는가 */
  grounded: boolean
  /** raw response (디버그) */
  rawSnippet?: string
}

/**
 * Gemini grounding 으로 외부 검색.
 *
 * 1. Gemini 호출 — tools: [{ googleSearch: {} }] (@google/genai, ADR-023)
 * 2. 응답에서 hits 3건 추출 (zod 검증)
 * 3. groundingMetadata 에서 source URL 보강
 * 4. excludeSources 와 dedupe
 *
 * 실패 시 빈 결과 + grounded=false.
 */
export async function searchWeb(input: WebSearchInput): Promise<WebSearchResult> {
  if (!isGeminiAvailable()) {
    log.warn('research-web', 'Gemini API key 미설정 — searchWeb skip', {
      topic: input.topic,
    })
    return { hits: [], usedQueries: [], grounded: false }
  }

  const apiKey = process.env.GEMINI_API_KEY!
  const ai = new GoogleGenAI({ apiKey })

  const prompt = buildSearchPrompt(input)

  try {
    // @google/genai: 검색 grounding 은 config.tools 에 { googleSearch: {} } 로 전달.
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        maxOutputTokens: 4096,
        temperature: 0.5, // 다양성 (정형화 회피)
        tools: [{ googleSearch: {} }],
      },
    })
    const raw = response.text ?? ''

    // groundingMetadata 에서 source URL 추출
    // candidates[0].groundingMetadata.groundingChunks[].web.uri
    const candidates = response.candidates ?? []
    const groundingChunks = candidates[0]?.groundingMetadata?.groundingChunks ?? []
    const sourceUrls = groundingChunks
      .map((c) => c.web?.uri)
      .filter((u): u is string => typeof u === 'string')

    // JSON 파싱
    type RawHit = {
      source?: string
      year?: string
      value?: string
      summary?: string
      sourceUrl?: string
    }
    let parsed: { hits?: RawHit[] }
    try {
      parsed = safeParseJson(raw, 'research-web-search')
    } catch {
      log.warn('research-web', 'JSON 파싱 실패 — raw 첫 300자만 로그', {
        topic: input.topic,
        rawHead: raw.slice(0, 300),
      })
      return {
        hits: [],
        usedQueries: input.queries,
        grounded: groundingChunks.length > 0,
        rawSnippet: raw.slice(0, 500),
      }
    }

    const rawHits = Array.isArray(parsed.hits) ? parsed.hits : []

    // zod 검증 + dedupe
    const excludeSet = new Set(input.excludeSources ?? [])
    const validatedHits: AutoResearchHit[] = []
    for (let i = 0; i < rawHits.length; i++) {
      const r = rawHits[i]
      const url = r.sourceUrl ?? sourceUrls[i] // groundingMetadata 보강
      // dedupe — 이미 사용된 source URL/source 명 회피
      if (url && excludeSet.has(url)) continue
      if (r.source && excludeSet.has(r.source)) continue

      const hit = AutoResearchHitSchema.safeParse({
        topic: input.topic,
        source: r.source ?? '미상',
        year: r.year ?? '미상',
        value: r.value,
        summary: r.summary ?? '',
        sourceUrl: url,
        // confidence: groundingChunks 있으면 medium, 없으면 low
        confidence: groundingChunks.length > 0 && url ? 'medium' : 'low',
        tier: 'web',
      })
      if (hit.success) {
        validatedHits.push(hit.data)
      } else {
        log.debug('research-web', 'hit zod 검증 실패', {
          hit: r,
          error: hit.error.message,
        })
      }
    }

    return {
      hits: validatedHits.slice(0, 3),
      usedQueries: input.queries,
      grounded: groundingChunks.length > 0,
    }
  } catch (err) {
    log.error('research-web', err, { topic: input.topic, queries: input.queries })
    return { hits: [], usedQueries: input.queries, grounded: false }
  }
}

/**
 * Gemini 검색 prompt 빌더.
 */
function buildSearchPrompt(input: WebSearchInput): string {
  const { topic, queries, context } = input
  const queryList = queries.map((q, i) => `  ${i + 1}. ${q}`).join('\n')

  return `당신은 한국 사회혁신·창업 사업 제안서의 외부 자료 리서치 전문가입니다.
실제 웹 검색을 활용해 신뢰할 수 있는 정량 데이터를 찾으세요.

[사업 맥락]
사업명: ${context.projectName || '(미상)'}
발주: ${context.client || '(미상)'}
대상: ${context.targetAudience || '(미상)'}
키워드: ${context.keywords.join(', ') || '(미상)'}
액트프러너 유니버스: ${context.universes.join(', ') || '(미상)'}
채널: ${context.channel}

[조사 topic]
${topic}

[검색 query 후보]
${queryList}

[조사 룰]
1. 한국·아시아 자료 우선. 글로벌 자료는 한국 맥락에서 인용 가능할 때만.
2. 7년 이내 (2019 이후) 자료. 더 오래된 자료는 그 사실을 summary 에 명시.
3. 정량 수치 (%, 억원, 명, 배 등) 필수 포함. 추상적 표현 금지.
4. 정확히 3건. 각 건은 서로 다른 출처.
5. 한 줄 평균 60~120자 요약.
6. 실제 검색 결과 기반 — 환각 금지. 모르면 빈 배열.

[출력 형식] — JSON 만, 마크다운 펜스 없이:

{
  "hits": [
    {
      "source": "출처 이름 (예: 통계청 청년경제활동조사)",
      "year": "2024.06",
      "value": "12.4%",
      "summary": "한국 청년(19-29세) 창업률은 12.4%로 2019년 대비 2.1%p 상승.",
      "sourceUrl": "https://kostat.go.kr/..."
    },
    { ... },
    { ... }
  ]
}

trailing comma 금지. JSON 만 출력.`
}

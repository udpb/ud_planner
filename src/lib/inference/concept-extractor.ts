/**
 * Sphere 2 — Concept Extractor (W14, Layer 3 Ontology)
 *
 * 자산 batch → 핵심 개념 entity 자동 추출.
 *
 * 입력: ContentAsset 다수 (name + narrativeSnippet 발췌)
 * 출력: Concept[] + AssetConcept relations
 *
 * 호출: 자산 10~20개 batch → LLM 1 call (정규화 포함).
 * 1,062 자산 / 15 batch = ~70 LLM call.
 */

import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import { z } from 'zod'

// ─────────────────────────────────────────
// Input
// ─────────────────────────────────────────

export interface AssetInput {
  id: string
  name: string
  narrativeSnippet: string
  assetType: string // 'proposal' | 'methodology' | 'case' | 'company'
}

export interface ConceptExtractInput {
  assets: AssetInput[]
  /** 이미 추출된 기존 Concept 목록 (정규화 hint) */
  existingConcepts?: Array<{ name: string; aliases: string[]; type: string }>
}

// ─────────────────────────────────────────
// LLM 응답 schema
// ─────────────────────────────────────────

const CONCEPT_TYPES = [
  'methodology', // ACTT, AX, DOGS, 5D, IMPACT 6단계, Act-preneur 7steps
  'metric', // 액트프러너십, 자립도, 수주율, 만족도
  'persona', // 청년창업가, 액트프러너, 예비창업가
  'domain', // 애그테크, 푸드테크, 핀테크, 소셜벤처
  'tool', // AI, 노코드, 클로드코드, 커서AI, 랜딩페이지
  'partnership', // SK, CJ, 네이버, 하나금융
  'framework', // 린 캔버스, BMC, GEPXR
  'event-type', // 해커톤, 부트캠프, 아이디어톤, IR 피칭
] as const

const ConceptEntitySchema = z.object({
  /** Canonical name (가장 일반적·표준 표현) */
  name: z.string().min(2).max(60),
  /** 유형 */
  type: z.preprocess(
    (v) => (typeof v === 'string' && (CONCEPT_TYPES as readonly string[]).includes(v) ? v : 'methodology'),
    z.enum(CONCEPT_TYPES),
  ),
  /** 1~2줄 정의 */
  description: z.preprocess(
    (v) => (v == null ? undefined : v),
    z.string().max(300).optional(),
  ),
  /** 다른 표현들 (예: ["Actpreneur", "Act-Preneur"]) — 10 초과 시 자동 slice */
  aliases: z.preprocess(
    (v) => (Array.isArray(v) ? v.slice(0, 10) : []),
    z.array(z.string().max(60)).max(10),
  ),
})

const AssetConceptMappingSchema = z.object({
  assetId: z.string(),
  /** 이 자산의 핵심 개념 1~5개 — 초과 시 자동 slice */
  concepts: z.preprocess(
    (v) => (Array.isArray(v) ? v.slice(0, 10) : v),
    z.array(
      z.object({
        name: z.string().min(2).max(60),
        weight: z.preprocess(
          (v) => (typeof v === 'number' ? v : 1.0),
          z.number().min(0).max(1),
        ),
        isCore: z.preprocess(
          (v) => (typeof v === 'boolean' ? v : false),
          z.boolean(),
        ),
      }),
    ).max(10),
  ),
})

const ResponseSchema = z.object({
  /** 이 batch 에서 발견된 정규화 된 개념 목록 — 초과 시 자동 slice */
  concepts: z.preprocess(
    (v) => (Array.isArray(v) ? v.slice(0, 80) : v),
    z.array(ConceptEntitySchema).max(80),
  ),
  /** 자산별 개념 매핑 — 초과 시 자동 slice */
  mappings: z.preprocess(
    (v) => (Array.isArray(v) ? v.slice(0, 50) : v),
    z.array(AssetConceptMappingSchema).max(50),
  ),
  confidence: z.number().min(0).max(1),
})

export type ConceptEntity = z.infer<typeof ConceptEntitySchema>
export type AssetConceptMapping = z.infer<typeof AssetConceptMappingSchema>

export interface ConceptExtractOutput {
  concepts: ConceptEntity[]
  mappings: AssetConceptMapping[]
  confidence: number
  tokensUsed: number
  elapsedMs: number
}

// ─────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 언더독스 자산 온톨로지 분석가입니다.
자산 batch 의 name·narrative 를 받아 **자산을 횡단하는 핵심 개념 (Concept)** 을 entity 로 추출합니다.

⚠️ 목적: 자산 간 의미 그래프 구축. "액트프러너"·"ACTT"·"DOGS" 같은 개념이 여러 자산에 등장하므로 entity 로 통합.

**개념 추출 원칙**:
1. **고유 명사 + 회사 IP**: ACTT, DOGS, 5D, GEPXR, 액트프러너, AX 가이드북, Act-preneur 7steps
2. **사업 유형·도메인**: 애그테크, 푸드테크, 예비창업패키지, 청년창업캠프, 부트캠프
3. **방법론·도구**: 4Steps, 6Dimension, 린스타트업, MVP 검증, IR Deck, AI 마스터 코스
4. **파트너·발주처**: SK이노, CJ, 네이버, 하나금융 (개별 사업명 X — partnership 묶음)
5. **너무 일반적 X**: "교육", "사업", "프로그램" 같은 단어는 개념 X

**type 분류 (8개)**:
- methodology: 방법론·진단도구 (ACTT, AX, 4Steps, IMPACT 6단계)
- metric: 평가 지표·기준 (액트프러너십, 자립도)
- persona: 사람·역할 (액트프러너, 청년창업가, 예비창업가)
- domain: 산업·영역 (애그테크, 푸드테크, 소셜벤처)
- tool: 도구·기술 (AI, 노코드, 클로드코드, 커서AI)
- partnership: 발주처·파트너 (SK, CJ, 네이버, 하나금융)
- framework: 프레임워크 (린 캔버스, GEPXR)
- event-type: 행사 유형 (해커톤, 부트캠프, 아이디어톤)

**정규화 (중요)**:
- "액트프러너" / "Actpreneur" / "Act-Preneur" / "액트프러너십" → name: "액트프러너", aliases: ["Actpreneur", "Act-Preneur", "액트프러너십"]
- "예비창업패키지" / "예비창업패키지 사전인큐베이팅" → name: "예비창업패키지"

**자산 매핑**:
- 자산 1건 당 핵심 개념 1~5개 추출
- isCore=true: 가장 중요한 1~2개 (자산의 정체성)
- weight: 자산에서 이 개념의 중심도 (0.5~1.0)

JSON 만 출력.`

function buildPrompt(input: ConceptExtractInput): string {
  const assetsText = input.assets
    .map((a, i) =>
      `[자산 ${i + 1}] id=${a.id}, type=${a.assetType}
name: ${a.name}
narrative: ${a.narrativeSnippet.slice(0, 400).replace(/\n/g, ' ')}`,
    )
    .join('\n\n')

  const existingText = input.existingConcepts && input.existingConcepts.length > 0
    ? `\n\n[기존 발견된 개념 (정규화 참고)]\n${input.existingConcepts.slice(0, 30).map((c) => `- ${c.name} (${c.type}): aliases ${c.aliases.join(', ')}`).join('\n')}`
    : ''

  return `${SYSTEM_PROMPT}

[자산 batch (${input.assets.length}건)]
${assetsText}${existingText}

[출력 JSON]
{
  "concepts": [
    {"name": "ACTT", "type": "methodology", "description": "Action Competency Transformation Tool — 언더독스 실전 역량 진단", "aliases": ["Action Competency Transformation Tool"]},
    {"name": "액트프러너", "type": "persona", "description": "실행을 통해 성과를 내는 실전 창업가", "aliases": ["Actpreneur", "Act-Preneur", "액트프러너십"]}
  ],
  "mappings": [
    {"assetId": "...", "concepts": [{"name": "ACTT", "weight": 1.0, "isCore": true}, {"name": "5D", "weight": 0.7, "isCore": false}]}
  ],
  "confidence": 0.92
}

JSON 만 출력.`
}

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

export async function extractConcepts(input: ConceptExtractInput): Promise<ConceptExtractOutput> {
  if (input.assets.length === 0) {
    return { concepts: [], mappings: [], confidence: 1.0, tokensUsed: 0, elapsedMs: 0 }
  }
  const startedAt = Date.now()
  const prompt = buildPrompt(input)

  const aiResult = await invokeAi({
    prompt,
    maxTokens: 16384,
    temperature: 0.2,
    label: `concept-extract:batch-${input.assets.length}`,
  })

  let parsed: unknown
  try {
    parsed = safeParseJson(aiResult.raw, `concept-extract:batch-${input.assets.length}`)
  } catch (e) {
    log.error('inference', '[concept-extract] JSON 파싱 실패', {
      err: e instanceof Error ? e.message : String(e),
    })
    throw e
  }

  const validated = ResponseSchema.safeParse(parsed)
  if (!validated.success) {
    log.error('inference', '[concept-extract] 스키마 검증 실패', {
      issues: validated.error.issues.slice(0, 3),
    })
    throw new Error(
      `[concept-extract] schema 실패: ${validated.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .slice(0, 3)
        .join(' / ')}`,
    )
  }

  const result: ConceptExtractOutput = {
    concepts: validated.data.concepts,
    mappings: validated.data.mappings,
    confidence: validated.data.confidence,
    tokensUsed: aiResult.raw.length,
    elapsedMs: Date.now() - startedAt,
  }

  log.info('inference', `[concept-extract] 완료`, {
    assetCount: input.assets.length,
    conceptsFound: result.concepts.length,
    mappingCount: result.mappings.length,
    confidence: result.confidence,
    elapsedMs: result.elapsedMs,
    provider: aiResult.provider,
  })

  return result
}

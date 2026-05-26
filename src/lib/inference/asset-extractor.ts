/**
 * Sphere 2 — Asset Extractor (W8)
 *
 * ud Labs 내부 자산 (방법론·사례·회사메타) → ContentAsset narrative chunk 추출.
 *
 * 기존 extract-tuple 과 다름:
 *   - Message 추출 X (제안서 아님)
 *   - LogicStructure 추출 X
 *   - Content (narrative + keyNumbers + context) 만 — 1-tuple
 *
 * 호출 횟수: 자산 1건 = 1 LLM (Gemini Flash, ~10초).
 * server-only 의도.
 */

import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import { z } from 'zod'

// ─────────────────────────────────────────
// Input
// ─────────────────────────────────────────

export type AssetType = 'methodology' | 'case' | 'company'

export interface AssetExtractInput {
  /** 자산 본문 (PDF/DOCX/PPTX 에서 추출된 텍스트) */
  assetText: string
  /** 자산 이름 (파일명 또는 Drive 메타) */
  assetName: string
  /** 자산 type — 폴더 단위로 사용자가 지정 */
  assetType: AssetType
  /** sourceTier (high·medium·low·internal) */
  sourceTier?: 'high' | 'medium' | 'low' | 'internal'
  /** 폴더 경로 (context 용) */
  folderPath?: string
  /**
   * Read mode — 'deep' (chunks 15, narrative 3000, signaturePhrases) 또는 'standard'.
   * 미지정 시 autoDetermineReadMode() 자동 판단.
   */
  readMode?: 'deep' | 'standard'
}

// ─────────────────────────────────────────
// Read mode 자동 판단 (사용자 정책 — W14-update v2)
// ─────────────────────────────────────────

const DEEP_KEYWORD_HINTS = [
  '방법론', '가이드', 'guide', 'manual', '매뉴얼',
  'session', 'orientation', 'ot_', 'textbook', '교재',
  '체계', '프레임워크', 'framework', 'methodology',
  'v1', 'v2', 'v3', '진단', '설계서', '기획',
  'impact', 'actt', 'dogs', '5d', 'gepxr', 'act-preneur',
]

export function autoDetermineReadMode(input: {
  assetType: AssetType
  assetName: string
  assetText: string
  sourceTier?: string
}): 'deep' | 'standard' {
  // 1. methodology / company → 항상 deep
  if (input.assetType === 'methodology' || input.assetType === 'company') return 'deep'
  // 2. high tier → deep
  if (input.sourceTier === 'high') return 'deep'
  // 3. 큰 자료 (5K+) → deep
  if (input.assetText.length >= 5000) return 'deep'
  // 4. 파일명 키워드 → deep
  const nameLower = input.assetName.toLowerCase()
  if (DEEP_KEYWORD_HINTS.some((kw) => nameLower.includes(kw.toLowerCase()))) return 'deep'
  // 5. 짧은 case → standard (코칭일지 등)
  return 'standard'
}

// ─────────────────────────────────────────
// LLM 응답 schema
// ─────────────────────────────────────────

const KeyNumberSchema = z.object({
  value: z.preprocess((v) => String(v ?? ''), z.string()),
  unit: z.preprocess((v) => (v == null ? undefined : String(v)), z.string().optional()),
  // context 가 누락된 경우 빈 문자열로 (LLM 변동 흡수)
  context: z.preprocess(
    (v) => (typeof v === 'string' ? v.slice(0, 200) : ''),
    z.string().max(200),
  ),
  source: z.preprocess((v) => (v == null ? undefined : String(v)), z.string().optional()),
})

const ChunkSchema = z.object({
  name: z.string().min(3).max(120),
  /** Deep Read (2026-05-26): 100~3000자 — 원문 표현·예시·수치 보존 */
  narrativeSnippet: z.string().min(50).max(3000),
  context: z.preprocess(
    (v) => (v == null ? undefined : v),
    z.string().max(400).optional(),
  ),
  sectionHint: z.preprocess(
    (v) => (v == null ? undefined : v),
    z.string().optional(),
  ),
  category: z.preprocess(
    (v) => {
      const validCategories = ['methodology', 'content', 'product', 'human', 'data', 'framework']
      if (typeof v === 'string' && validCategories.includes(v)) return v
      return 'methodology'
    },
    z.enum(['methodology', 'content', 'product', 'human', 'data', 'framework']),
  ),
  evidenceType: z.preprocess(
    (v) => {
      const valid = ['quantitative', 'structural', 'case', 'methodology']
      if (typeof v === 'string' && valid.includes(v)) return v
      return 'structural'
    },
    z.enum(['quantitative', 'structural', 'case', 'methodology']),
  ),
  /** 모든 수치 보존 — 정량 증거 + 비교 기준 */
  keyNumbers: z.preprocess(
    (v) => (Array.isArray(v) ? v.slice(0, 25) : []),
    z.array(KeyNumberSchema).max(25).default([]),
  ),
  /** 시그니처 표현·문체 (Deep Read 신규) — 이 자산이 사용하는 unique 한 phrase */
  signaturePhrases: z.preprocess(
    (v) => (Array.isArray(v) ? v.slice(0, 10) : []),
    z.array(z.string().min(3).max(200)).max(10).default([]),
  ),
  keywords: z.preprocess(
    (v) => (Array.isArray(v) ? v.slice(0, 25) : []),
    z.array(z.string()).max(25).default([]),
  ),
})

const AssetResponseSchema = z.object({
  /** Deep Read: 1자산당 5 → 15 chunks (PPTX 슬라이드별 권장) */
  chunks: z.preprocess(
    (v) => (Array.isArray(v) ? v.slice(0, 15) : v),
    z.array(ChunkSchema).min(1).max(15),
  ),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
})

export type AssetChunk = z.infer<typeof ChunkSchema>

// ─────────────────────────────────────────
// Output
// ─────────────────────────────────────────

export interface AssetExtractOutput {
  chunks: AssetChunk[]
  confidence: number
  notes?: string
  tokensUsed: number
  elapsedMs: number
}

// ─────────────────────────────────────────
// Prompt (assetType 별)
// ─────────────────────────────────────────

function buildSystemPrompt(assetType: AssetType, readMode: 'deep' | 'standard' = 'deep'): string {
  // Standard mode — 짧은 case 자료 등에 적용
  if (readMode === 'standard') {
    const standardGuide = {
      methodology: '회사의 방법론·진단도구. 핵심 단계·원리·예시 추출.',
      case: '실제 사례·코칭일지. 정량 결과 + 핵심 교훈.',
      company: '회사 메타. 누적 수치·차별화 포인트.',
    }[assetType]
    return `당신은 언더독스 자산 분석 전문가입니다.
자산 본문을 받아 **제안서에서 인용 가능한 narrative chunk** 로 정제합니다.

자산 type: **${assetType.toUpperCase()}**
${standardGuide}

**각 chunk** (최대 5개):
- name (3~120자)
- narrativeSnippet (50~1500자) — 인용 가능한 정제 문장
- context (≤400자, optional)
- sectionHint (optional)
- category: 'methodology' | 'content' | 'product' | 'human' | 'data' | 'framework'
- evidenceType: 'quantitative' | 'structural' | 'case' | 'methodology'
- keyNumbers (최대 15)
- signaturePhrases (최대 5)
- keywords (최대 15)

JSON 만 출력.`
  }

  // Deep Read mode (default)
  const typeGuide = {
    methodology: `이 자산은 **회사의 방법론·교재·진단도구** 입니다 (예: AX 컨설팅 가이드북, IMPACT 창업방법론, ACTT 진단도구, Act-preneur 7steps).
주요 가치: 새 사업 제안서에서 "우리만의 방법론" 으로 인용 가능. 차별화 핵심.
**Deep Read 강조**:
- 슬라이드/섹션 단위로 chunk 분할 (PPTX 12장 = 8~12 chunks 권장)
- 방법론의 각 단계·원리·이론 근거를 명시
- 평가 기준·척도·점수 체계를 그대로 보존 (예: "Level 4 자립", "5점 척도")
- 예시·case study·수치 데이터 모두 포함`,
    case: `이 자산은 **회사의 사례·코칭일지·인터뷰** 입니다 (예: 과거 코칭일지, 선배 창업가 인터뷰).
주요 가치: "실제 성과" 의 증거. 정량 수치 + 정성 narrative 모두 포함.
**Deep Read 강조**: 구체적 변화·성과 (수치 우선), 사례의 핵심 교훈, before/after 명시.`,
    company: `이 자산은 **회사의 메타 자산** 입니다 (예: 회사소개서, R&D 사업계획서, 웨비나 자료).
주요 가치: 제안서의 "회사 소개·역량" 부분 인용. 신뢰도 형성.
**Deep Read 강조**: 누적 수치, 차별화 포인트, 인증·수상, 회사 정체성을 표현하는 표현·문체.`,
  }[assetType]

  return `당신은 언더독스 자산 분석 전문가입니다.
ud Labs 의 내부 자산 본문을 받아 **제안서에서 인용 가능한 deep narrative chunks 로 정제**합니다.

⚠️ 자산 type: **${assetType.toUpperCase()}**

${typeGuide}

🔑 **DEEP READ 원칙 (가장 중요)**:
1. **요약 X · 디테일 보존 O** — 자료의 70%+ 의 정보를 잃지 마세요. 슬라이드/섹션 단위로 chunk 분할.
2. **원문 표현 그대로** — paraphrase 최소화. 회사의 unique 한 문체·tone 보존.
3. **모든 수치 추출** — 자료 안의 어떤 수치도 빠뜨리지 마세요 (keyNumbers + signaturePhrases 활용).
4. **chunk 갯수**: PPTX 12장 = 8~12 chunks / PDF 30페이지 = 10~15 chunks / 짧은 자료 = 3~6 chunks.
5. **각 chunk 는 독립적으로 인용 가능** — 한 chunk 만 봐도 의미·논리·예시가 살아있게.

**각 chunk 의 필드**:
- **name** (3~120자): chunk 의 시그니처 제목 (예: "ACTT 5단계 실행 루프 - 인지 → 적용 → 실행")
- **narrativeSnippet** (50~3000자): **deep narrative**. 원문 표현 보존. 예시·수치·이론 근거 포함. **요약 금지** — 자료가 길면 chunk 를 늘리세요.
- **context** (≤400자, optional): 자료 전체에서 이 chunk 의 위치·역할 (예: "IMPACT 방법론의 P 단계 (Plan) 의 3번째 세션")
- **sectionHint** (optional): 제안서 어느 섹션에 들어갈지 ('1'~'7' 또는 'background', 'methodology')
- **category**: 'methodology' | 'content' | 'product' | 'human' | 'data' | 'framework'
- **evidenceType**: 'quantitative' (수치) | 'structural' (구조) | 'case' (사례) | 'methodology' (방법론)
- **keyNumbers** (최대 25): **모든 수치** + 의미 (예: { "value": "20,211명", "context": "누적 양성", "source": "2026 기준" })
- **signaturePhrases** (최대 10): 이 자산의 unique 표현·문체 (그대로 인용 시 톤이 살아남). 예: ["연쇄 실행으로 임팩트를 만드는 액트프러너", "1박 2일 압축 성장형 해커톤"]
- **keywords** (최대 25): 매칭용 도메인·방법론 용어

**confidence**:
- 0.9+: 깊이 있게 정제. 원문 디테일 보존.
- 0.7~0.9: 일부 디테일 손실. 추가 pass 권장.
- < 0.7: 자료 자체가 형식적·짧음.

JSON 만 출력.`
}

function buildPrompt(input: AssetExtractInput & { readMode: 'deep' | 'standard' }): string {
  const system = buildSystemPrompt(input.assetType, input.readMode)
  const meta = [
    `자산 이름: ${input.assetName}`,
    input.folderPath ? `폴더: ${input.folderPath}` : '',
    `Tier: ${input.sourceTier ?? 'medium'}`,
    `Read Mode: ${input.readMode === 'deep' ? 'DEEP (세부 보존)' : 'STANDARD (간략)'}`,
  ].filter(Boolean).join('\n')

  // Deep: 30K, Standard: 12K
  const textSlice = input.readMode === 'deep' ? 30000 : 12000

  return `${system}

[자산 메타]
${meta}

[자산 본문 — ${input.readMode === 'deep' ? 'Deep Read 30K' : 'Standard 12K'} 자]
${input.assetText.slice(0, textSlice)}

[출력 JSON 스키마 — Deep Read]
{
  "chunks": [
    {
      "name": "ACTT 5단계 실행 루프 - 인지·적용·실행",
      "narrativeSnippet": "ACTT 진단은 비즈니스 실행 과정을 5단계 루프로 구조화하여 각 단계별 역량을 정밀 측정합니다. ①목표 설정(비전 및 우선순위) ②환경 인식(고객 및 기회 발견) ③문제 구조화(문제 분해 및 원인 파악) ④실행 설계(효율적 MVP 설계 및 유연한 피벗) ⑤루틴화(돌파력 및 자산화)로 이어지는 이 루프는 언더독스 10계명과 린스타트업의 핵심 원리를 반영하고 있습니다. 각 단계는 '무엇을 할 것인가'에서 시작해 '어떻게 지속할 것인가'까지의 전 과정을 포괄하며...",
      "context": "ACTT 진단도구의 핵심 구조 — 인지(Cognition)·적용(Application)·실행(Execution) 3단계 측정 모델의 5 step 루프 정의",
      "sectionHint": "methodology",
      "category": "methodology",
      "evidenceType": "methodology",
      "keyNumbers": [
        {"value": "5단계", "context": "실행 루프", "source": "ACTT v2 (2026)"},
        {"value": "Level 4", "context": "자립 기준"}
      ],
      "signaturePhrases": [
        "Thinker 에서 Actpreneur 로",
        "비즈니스 근육 (Business Muscle)",
        "연쇄 실행"
      ],
      "keywords": ["ACTT", "액트프러너", "5단계 실행 루프", "C-A-E", "역량 진단"]
    },
    ... (PPTX 12장 = 8~12 chunks, 디테일 보존)
  ],
  "confidence": 0.92,
  "notes": null
}

JSON 만 출력.`
}

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

export async function extractAsset(input: AssetExtractInput): Promise<AssetExtractOutput> {
  const startedAt = Date.now()
  // readMode 자동 판단 (사용자 미지정 시)
  const readMode: 'deep' | 'standard' = input.readMode ?? autoDetermineReadMode({
    assetType: input.assetType,
    assetName: input.assetName,
    assetText: input.assetText,
    sourceTier: input.sourceTier,
  })
  const prompt = buildPrompt({ ...input, readMode })

  // Deep Read = 큰 응답 가능 (chunks 15+ × narrative 3000자)
  // Standard = 작은 자료의 절제된 추출
  const maxTokens = readMode === 'deep' ? 32768 : 16384

  log.info('inference', `[asset-extract] read mode: ${readMode}`, {
    assetName: input.assetName.slice(0, 50),
    assetType: input.assetType,
    textChars: input.assetText.length,
    sourceTier: input.sourceTier,
  })

  const aiResult = await invokeAi({
    prompt,
    maxTokens,
    temperature: 0.25,
    label: `asset-extract:${readMode}:${input.assetType}:${input.assetName.slice(0, 50)}`,
  })

  let parsed: unknown
  try {
    parsed = safeParseJson(aiResult.raw, `asset-extract:${input.assetName.slice(0, 50)}`)
  } catch (e) {
    log.error('inference', '[asset-extract] JSON 파싱 실패', {
      assetName: input.assetName,
      err: e instanceof Error ? e.message : String(e),
    })
    throw e
  }

  const validated = AssetResponseSchema.safeParse(parsed)
  if (!validated.success) {
    log.error('inference', '[asset-extract] 스키마 검증 실패', {
      assetName: input.assetName,
      issues: validated.error.issues.slice(0, 3),
    })
    throw new Error(
      `[asset-extract] schema 실패: ${validated.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .slice(0, 3)
        .join(' / ')}`,
    )
  }

  const result: AssetExtractOutput = {
    chunks: validated.data.chunks,
    confidence: validated.data.confidence,
    notes: validated.data.notes,
    tokensUsed: aiResult.raw.length,
    elapsedMs: Date.now() - startedAt,
  }

  log.info('inference', `[asset-extract] 완료`, {
    assetName: input.assetName,
    assetType: input.assetType,
    chunkCount: result.chunks.length,
    confidence: result.confidence,
    elapsedMs: result.elapsedMs,
    provider: aiResult.provider,
  })

  return result
}

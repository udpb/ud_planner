/**
 * Sphere 2 — Result Report Extractor (W12)
 *
 * 결과보고서 (사업 종료 후 작성) → **지표 중심 + 레슨런 중심** 으로 정제.
 *
 * 일반 extractAsset 과 다름:
 *   - 지표 (keyMetrics) 다수 강조 — 참여자수·만족도·수료율·매출 등
 *   - 레슨런 분리 — 성공 요인·어려운 점·개선 사항
 *
 * 출력: ContentAsset 2~4 chunk
 *   - "[사업] 핵심 지표" — quantitative
 *   - "[사업] 성공 요인" — case
 *   - "[사업] 어려운 점·개선" — case
 *   - 사업 요약 (간략) — context
 *
 * 호출: 결과보고서 1건 = 1 LLM (Gemini Flash, ~15초).
 */

import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import { z } from 'zod'
import type { Channel } from './types'

// ─────────────────────────────────────────
// Input
// ─────────────────────────────────────────

export interface ResultReportInput {
  reportText: string
  sourceProject: string
  channel: Channel
  /** sourceTier (high·medium·low·internal) */
  sourceTier?: 'high' | 'medium' | 'low' | 'internal'
}

// ─────────────────────────────────────────
// LLM 응답 schema
// ─────────────────────────────────────────

const KeyMetricSchema = z.object({
  value: z.string(),
  unit: z.preprocess(
    (v) => (v == null ? undefined : v),
    z.string().max(20).optional(),
  ),
  category: z.preprocess(
    (v) => {
      const valid = ['참여자수', '만족도', '수료율', '매출', '예산 집행', '시간', '횟수', '기타']
      if (typeof v === 'string' && valid.includes(v)) return v
      return '기타'
    },
    z.enum(['참여자수', '만족도', '수료율', '매출', '예산 집행', '시간', '횟수', '기타']),
  ),
  context: z.string().max(300),
})

const ResultReportResponseSchema = z.object({
  /** 사업 1~2 줄 요약 (50~400자) */
  summary: z.string().min(30).max(500),
  /** 핵심 지표 (수치 + 의미 — 정량 증거) */
  keyMetrics: z.array(KeyMetricSchema).min(0).max(20),
  /** 레슨런 — 성공 요인·어려움·개선 */
  lessons: z.object({
    successes: z.preprocess(
      (v) => (Array.isArray(v) ? v : []),
      z.array(z.string().min(10).max(500)).max(8),
    ),
    challenges: z.preprocess(
      (v) => (Array.isArray(v) ? v : []),
      z.array(z.string().min(10).max(500)).max(8),
    ),
    improvements: z.preprocess(
      (v) => (Array.isArray(v) ? v : []),
      z.array(z.string().min(10).max(500)).max(8),
    ),
  }),
  /** 매칭용 keyword (사업 도메인) */
  keywords: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(z.string()).max(20),
  ),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
})

export type KeyMetric = z.infer<typeof KeyMetricSchema>
export type ResultReportData = z.infer<typeof ResultReportResponseSchema>

// ─────────────────────────────────────────
// Output (변환된 ContentAsset chunks)
// ─────────────────────────────────────────

export interface ResultReportChunk {
  name: string
  narrativeSnippet: string
  category: 'data' | 'content' | 'methodology'
  evidenceType: 'quantitative' | 'case' | 'structural'
  keyNumbers: Array<{ value: string; unit?: string; context: string }>
  keywords: string[]
}

export interface ResultReportOutput {
  chunks: ResultReportChunk[]
  summary: string
  totalMetrics: number
  totalLessons: number
  confidence: number
  notes?: string
  tokensUsed: number
  elapsedMs: number
}

// ─────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 언더독스 사업 결과보고서 분석 전문가입니다.
종료된 사업의 결과보고서 본문을 받아 **유의미한 지표 + 레슨런** 으로 정제합니다.

⚠️ 핵심 원칙:
- **지표 (keyMetrics)**: 객관적 수치만 추출. "노력", "최선" 같은 정성 표현 X.
  - 좋은 예: "참여자 25명", "만족도 4.7/5", "수료율 92%", "MVP 12건 도출"
  - 나쁜 예: "많은 참여자", "높은 만족도"
- **레슨런 (lessons)**: 다음 사업에 활용 가능한 구체 교훈.
  - successes: 잘 됐던 요인 (specific, actionable)
  - challenges: 어려웠던 점 (PM 이 알아야 할 risk)
  - improvements: 다음에 개선할 사항

**keyMetrics category 분류**:
- 참여자수: 참가자·수료자·신청자 수
- 만족도: 만족도 점수, NPS, 평가 결과
- 수료율: 완주율·이수율 (%)
- 매출: 발생 매출·투자 유치 등 (원)
- 예산 집행: 집행률·잔여 등 (%)
- 시간: 운영 기간·시간 (시간·주·개월)
- 횟수: 회기·세션 수
- 기타

**summary** (30~500자): 사업 1~2 줄 요약 — 무엇을 했고 어떤 결과를 냈는지.

**confidence**:
- 0.9+: 보고서 풍부 (지표 5+ , 레슨런 3+ 추출)
- 0.6~0.9: 일부 추출 (지표 적거나 레슨런 부족)
- < 0.6: 보고서가 형식적·짧음 (의미 추출 어려움)

JSON 만 출력.`

function buildPrompt(input: ResultReportInput): string {
  return `${SYSTEM_PROMPT}

[사업 정보]
프로젝트: ${input.sourceProject}
채널: ${input.channel}

[결과보고서 본문 — 발췌]
${input.reportText.slice(0, 14000)}

[출력 JSON 스키마]
{
  "summary": "...",
  "keyMetrics": [
    {"value": "25", "unit": "명", "category": "참여자수", "context": "최종 수료자"},
    {"value": "4.7", "unit": "/5", "category": "만족도", "context": "프로그램 전체 만족도"}
  ],
  "lessons": {
    "successes": ["1:1 코칭이 참여자 만족도 견인...", "..."],
    "challenges": ["오프라인 일정 조율 어려움...", "..."],
    "improvements": ["다음에는 사전 진단 추가...", "..."]
  },
  "keywords": ["애그테크", "청년창업", "..."],
  "confidence": 0.85,
  "notes": null
}

JSON 만 출력.`
}

// ─────────────────────────────────────────
// Main extractor
// ─────────────────────────────────────────

export async function extractResultReport(input: ResultReportInput): Promise<ResultReportOutput> {
  const startedAt = Date.now()
  const prompt = buildPrompt(input)

  const aiResult = await invokeAi({
    prompt,
    maxTokens: 16384,
    temperature: 0.2,
    label: `result-report:${input.sourceProject.slice(0, 50)}`,
  })

  let parsed: unknown
  try {
    parsed = safeParseJson(aiResult.raw, `result-report:${input.sourceProject.slice(0, 50)}`)
  } catch (e) {
    log.error('inference', '[result-report] JSON 파싱 실패', {
      sourceProject: input.sourceProject,
      err: e instanceof Error ? e.message : String(e),
    })
    throw e
  }

  const validated = ResultReportResponseSchema.safeParse(parsed)
  if (!validated.success) {
    log.error('inference', '[result-report] 스키마 검증 실패', {
      sourceProject: input.sourceProject,
      issues: validated.error.issues.slice(0, 3),
    })
    throw new Error(
      `[result-report] schema 실패: ${validated.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .slice(0, 3)
        .join(' / ')}`,
    )
  }

  const data = validated.data
  const totalLessons =
    data.lessons.successes.length + data.lessons.challenges.length + data.lessons.improvements.length

  // ─────────────────────────────────────────
  // 변환: ContentAsset chunk 2~4개
  // ─────────────────────────────────────────

  const chunks: ResultReportChunk[] = []
  const baseKeywords = data.keywords

  // chunk 1: 핵심 지표 (있으면)
  if (data.keyMetrics.length > 0) {
    const metricsText = data.keyMetrics
      .map((m) => `- ${m.context}: ${m.value}${m.unit ?? ''} (${m.category})`)
      .join('\n')
    chunks.push({
      name: `[${input.sourceProject.slice(0, 40)}] 핵심 지표`,
      narrativeSnippet:
        `${data.summary}\n\n[정량 결과]\n${metricsText}`.slice(0, 1500),
      category: 'data',
      evidenceType: 'quantitative',
      keyNumbers: data.keyMetrics.map((m) => ({
        value: m.value + (m.unit ?? ''),
        unit: m.unit,
        context: m.context,
      })),
      keywords: baseKeywords,
    })
  }

  // chunk 2: 성공 요인 (있으면)
  if (data.lessons.successes.length > 0) {
    chunks.push({
      name: `[${input.sourceProject.slice(0, 40)}] 성공 요인`,
      narrativeSnippet:
        `${data.summary}\n\n[성공 요인]\n${data.lessons.successes.map((s, i) => `${i + 1}. ${s}`).join('\n')}`.slice(0, 1500),
      category: 'content',
      evidenceType: 'case',
      keyNumbers: [],
      keywords: baseKeywords,
    })
  }

  // chunk 3: 어려운 점 / 개선 (합쳐서)
  if (data.lessons.challenges.length > 0 || data.lessons.improvements.length > 0) {
    const parts: string[] = []
    if (data.lessons.challenges.length > 0) {
      parts.push('[어려웠던 점]\n' + data.lessons.challenges.map((c, i) => `${i + 1}. ${c}`).join('\n'))
    }
    if (data.lessons.improvements.length > 0) {
      parts.push('[다음 개선]\n' + data.lessons.improvements.map((c, i) => `${i + 1}. ${c}`).join('\n'))
    }
    chunks.push({
      name: `[${input.sourceProject.slice(0, 40)}] 어려운 점 및 개선`,
      narrativeSnippet: `${data.summary}\n\n${parts.join('\n\n')}`.slice(0, 1500),
      category: 'content',
      evidenceType: 'case',
      keyNumbers: [],
      keywords: baseKeywords,
    })
  }

  // chunk 0 (보조): 요약만 (지표·레슨런 모두 부족할 때 fallback)
  if (chunks.length === 0) {
    chunks.push({
      name: `[${input.sourceProject.slice(0, 40)}] 요약`,
      narrativeSnippet: data.summary.slice(0, 1500),
      category: 'content',
      evidenceType: 'structural',
      keyNumbers: [],
      keywords: baseKeywords,
    })
  }

  const result: ResultReportOutput = {
    chunks,
    summary: data.summary,
    totalMetrics: data.keyMetrics.length,
    totalLessons,
    confidence: data.confidence,
    notes: data.notes,
    tokensUsed: aiResult.raw.length,
    elapsedMs: Date.now() - startedAt,
  }

  log.info('inference', `[result-report] 완료`, {
    sourceProject: input.sourceProject,
    chunkCount: result.chunks.length,
    totalMetrics: result.totalMetrics,
    totalLessons: result.totalLessons,
    confidence: result.confidence,
    elapsedMs: result.elapsedMs,
    provider: aiResult.provider,
  })

  return result
}

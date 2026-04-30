/**
 * 전략 인터뷰 → 자산 후보 추출 (Phase I4 후속)
 *
 * IngestionJob (kind='strategy_interview', status='queued') 의 metadata.rawText 를
 * 분석해 자산 후보 N개를 ExtractedItem 으로 생성. 콘텐츠 담당자가 admin UI 로
 * 검토 후 승인 시 ContentAsset 으로 변환.
 *
 * targetAsset 4 종 (IngestionJob 모델 명세):
 *   - winning_pattern  : 수주 패턴 (어떤 메시지가 통했는가)
 *   - curriculum_archetype : 커리큘럼 원형 (회차 구성 등)
 *   - evaluator_question : 평가위원 질문 패턴
 *   - strategy_note  : 전략 노트 (담당자 통화 인사이트 등)
 *
 * server-only — invokeAi · prisma 호출.
 */

import 'server-only'

import { z } from 'zod'
import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJsonExternal } from '@/lib/claude'

// ─────────────────────────────────────────
// 응답 스키마
// ─────────────────────────────────────────

export const ExtractedItemCandidateSchema = z.object({
  targetAsset: z.enum(['winning_pattern', 'curriculum_archetype', 'evaluator_question', 'strategy_note']),
  payload: z.object({
    name: z.string().min(2).max(120),
    narrativeSnippet: z.string().min(40).max(800),
    keywords: z.array(z.string()).max(10).optional(),
    keyNumbers: z.array(z.string()).max(5).optional(),
    evidenceFromInterview: z.string().max(400).optional(),
  }),
  confidence: z.number().min(0).max(1),
})

export type ExtractedItemCandidate = z.infer<typeof ExtractedItemCandidateSchema>

export const ExtractionResultSchema = z.object({
  candidates: z.array(ExtractedItemCandidateSchema).max(15),
  summary: z.string().max(500),
  redFlags: z.array(z.string()).max(5).default([]),
})

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>

// ─────────────────────────────────────────
// 프롬프트
// ─────────────────────────────────────────

interface InterviewMeta {
  projectName: string
  outcome: 'won' | 'lost' | 'cancelled' | string
  intervieweeName: string
  client?: string | null
  domain?: string | null
}

function buildPrompt(rawText: string, meta: InterviewMeta): string {
  return `
당신은 언더독스의 자산 큐레이터입니다.
PM 전략 인터뷰를 분석해 재사용 가능한 자산 후보를 추출하세요.

[인터뷰 메타]
- 사업명: ${meta.projectName}
- 결과: ${meta.outcome === 'won' ? '🏆 수주' : meta.outcome === 'lost' ? '미수주' : '취소'}
- 인터뷰 대상: ${meta.intervieweeName}
- 발주 기관: ${meta.client ?? '(미상)'}
- 사업 영역: ${meta.domain ?? '(미상)'}

[인터뷰 본문]
${rawText.slice(0, 8000)}
${rawText.length > 8000 ? '\n\n[... 본문 일부 절단됨, 8000자 까지만 사용 ...]' : ''}

────────────────────────────────────────────
[당신의 일]

다음 4 자산 유형 중 해당되는 것만 추출하세요. 각 자산은 다른 사업에서도
재사용 가능해야 합니다 (이번 사업 고유의 일회성 정보는 제외).

1. **winning_pattern** — 수주에 기여한 메시지 패턴
   예: "발주처가 '실증 중심'을 강조 → 우리 응답: 데모데이 IR 피칭 첨부"
2. **curriculum_archetype** — 재사용 가능한 커리큘럼 원형
   예: "8주차 + Action Week 1회 + 1:1 코칭 3회 = 청년 창업 표준"
3. **evaluator_question** — 평가위원이 자주 묻는 질문 패턴
   예: "왜 8주차냐? 실증 기간이 충분한가?"
4. **strategy_note** — 발주처/평가/운영 인사이트
   예: "기관장이 신경 쓰는 KPI 는 N. 공모 직전 통화로 확인"

[추출 규칙]
- 인터뷰에 명시적 근거가 있는 것만 (추측 금지)
- evidenceFromInterview 에 인터뷰 원문 한 줄 인용
- name 은 짧고 명확 (2~120자)
- narrativeSnippet 은 ContentAsset 의 narrativeSnippet 으로 그대로 들어갈 형식 (40~800자, 자체 완결)
- keywords 는 검색·매칭용 (최대 10개)
- confidence: 0.4 (약함) ~ 0.9 (매우 강함)
- 자산 후보는 0~15 개 (정말 가치 있는 것만)
- redFlags: 인터뷰에서 발견된 우려·시정 사항 (최대 5개, 예: "후보군 부족", "코치 단가 합의 늦음")

[출력 JSON 스키마]
{
  "summary": "이 인터뷰의 핵심 한 단락 요약 (~300자)",
  "candidates": [
    {
      "targetAsset": "winning_pattern" | "curriculum_archetype" | "evaluator_question" | "strategy_note",
      "payload": {
        "name": "...",
        "narrativeSnippet": "...",
        "keywords": ["...", "..."],
        "keyNumbers": ["...", "..."],
        "evidenceFromInterview": "인터뷰 원문 한 줄 인용"
      },
      "confidence": 0.0-1.0
    }
  ],
  "redFlags": ["...", "..."]
}

JSON 만 출력. 설명·마크다운 펜스 없이. trailing comma 금지.
`.trim()
}

// ─────────────────────────────────────────
// 메인
// ─────────────────────────────────────────

export interface ExtractInterviewInput {
  rawText: string
  meta: InterviewMeta
}

export interface ExtractInterviewOutput {
  ok: boolean
  result?: ExtractionResult
  error?: string
  rawAi?: string
  aiProvider?: 'gemini' | 'claude'
  aiModel?: string
}

export async function extractFromInterview(
  input: ExtractInterviewInput,
): Promise<ExtractInterviewOutput> {
  if (!input.rawText || input.rawText.trim().length < 50) {
    return { ok: false, error: '인터뷰 텍스트가 너무 짧습니다 (최소 50자)' }
  }

  const prompt = buildPrompt(input.rawText, input.meta)

  try {
    const r = await invokeAi({
      prompt,
      maxTokens: 8192,
      temperature: 0.3,
      label: 'interview-extract',
    })

    const raw = safeParseJsonExternal<unknown>(r.raw, 'interview-extract')
    const validated = ExtractionResultSchema.safeParse(raw)
    if (validated.success) {
      return {
        ok: true,
        result: validated.data,
        rawAi: r.raw,
        aiProvider: r.provider,
        aiModel: r.model,
      }
    }
    // 부분 채움 시도
    console.warn('[interview-extract] zod 검증 실패 → coerce:', validated.error.message)
    const coerced = coerceResult(raw)
    return {
      ok: true,
      result: coerced,
      rawAi: r.raw,
      aiProvider: r.provider,
      aiModel: r.model,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

function coerceResult(raw: unknown): ExtractionResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const candidates = Array.isArray(obj.candidates)
    ? (obj.candidates as ExtractedItemCandidate[]).filter((c) => {
        const r = ExtractedItemCandidateSchema.safeParse(c)
        return r.success
      })
    : []
  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    candidates,
    redFlags: Array.isArray(obj.redFlags)
      ? (obj.redFlags as string[]).filter((x) => typeof x === 'string')
      : [],
  }
}

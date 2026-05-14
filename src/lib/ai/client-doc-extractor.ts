/**
 * ClientDocExtractor — Express 2.0 (Phase M3-2, 2026-05-14)
 *
 * 발주처 공식 문서 (홈페이지 소개 · 중장기 계획 · 사업보고서 · 정책자료)
 * 텍스트 → 3 카테고리 추출:
 *   1. keywords  — 발주처가 자주 쓰는 어휘 (제안서 톤 일치용)
 *   2. policies  — 정책·법령·계획 (§1 제안 배경 정당성 근거)
 *   3. track     — 발주처 자체 실적·통계 (인용 가능한 정량)
 *
 * 호출자: /api/projects/[id]/ingest-client-doc
 *   - PDF → unpdf 로 텍스트 추출
 *   - 본 함수가 AI 1회 호출 (~3K) → StrategicNotes.clientOfficialDoc 저장
 *
 * AI 호출 정책 (ADR-013 §결정 §1):
 *   - 무거운 리서치 외부 LLM 정책에 부합 (정부 공식 문서가 정확히 그 범주)
 *   - 토큰 ~3K (LARGE 는 과함). STANDARD 8K.
 *
 * 관련: docs/decisions/013-express-v2-auto-diagnosis.md §결정 §3 (M3-2)
 */

import 'server-only'
import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import { AI_TOKENS } from '@/lib/ai/config'
import { log } from '@/lib/logger'

// ─────────────────────────────────────────
// 1. 결과 타입
// ─────────────────────────────────────────

export interface ClientDocExtraction {
  keywords: string[]   // 5~15 개
  policies: string[]   // 0~8 개 (정책·법령·계획·기본방향)
  track: string[]      // 0~8 개 (실적·통계·KPI)
  /** 요약 1줄 (200자 이내) */
  summary: string
}

// ─────────────────────────────────────────
// 2. 메인 함수
// ─────────────────────────────────────────

export async function extractClientDoc(input: {
  /** 발주기관명 — 프롬프트 컨텍스트 */
  clientName: string
  /** PDF 본문 추출 텍스트 */
  text: string
}): Promise<ClientDocExtraction> {
  if (!input.text || input.text.length < 100) {
    log.warn('client-doc-extractor', '텍스트 100자 미만 — 빈 결과 반환', {
      len: input.text?.length ?? 0,
    })
    return { keywords: [], policies: [], track: [], summary: '추출 가능한 텍스트 부족' }
  }

  const slice = input.text.slice(0, 12_000) // 토큰 안전 마진

  const prompt = `당신은 한국 공공·기업 제안서 컨설팅 시니어입니다.
아래 발주기관의 공식 문서 (홈페이지·중장기 계획·사업보고서 등) 본문에서
제안서 작성에 직접 활용 가능한 정보를 3 카테고리로 추출하세요.

[발주기관]
${input.clientName}

[공식 문서 본문]
${slice}

[추출 기준]
1. keywords (5~15개):
   - 발주처가 반복적으로 쓰는 핵심 어휘 (제안서가 같은 톤으로 작성되어야 친숙)
   - 예: "지역혁신", "동반성장", "디지털 전환", "사회적 가치"
   - 너무 일반적인 단어 (회사·사업) 는 제외

2. policies (0~8개):
   - 명시된 정책·법령·기본계획·시행령
   - 형식: "정책명/법령명 (연도 또는 차수)"
   - 예: "제5차 사회적기업 기본계획 (2026)", "창업진흥법 시행령 §12"

3. track (0~8개):
   - 발주처 자체 실적·통계·KPI (인용 가능)
   - 형식: "지표명 — 정량"
   - 예: "누적 지원 기업 수 — 1,200개", "투자 유치 평균 — 3억원"

반드시 아래 JSON 만 반환 (마크다운 코드 블록 없이):
{
  "keywords": ["키워드 1", "키워드 2", ...],
  "policies": ["정책명 1 (연도)", ...],
  "track": ["지표명 — 값", ...],
  "summary": "발주기관의 핵심 방향 1줄 (200자 이내)"
}`

  const result = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.STANDARD,
    temperature: 0.3,
    label: 'client-doc-extractor',
  })

  const parsed = safeParseJson<ClientDocExtraction>(result.raw, 'client-doc-extractor')

  // 안전 정규화
  return {
    keywords: dedupe(parsed.keywords ?? []).slice(0, 15),
    policies: dedupe(parsed.policies ?? []).slice(0, 8),
    track: dedupe(parsed.track ?? []).slice(0, 8),
    summary: (parsed.summary ?? '').slice(0, 200),
  }
}

function dedupe(arr: unknown[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of arr) {
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

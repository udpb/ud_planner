/**
 * Gate 3a: 당선 패턴 대조
 *
 * 생성된 제안서 섹션을 WinningPattern (outcome='won') 과 비교하여
 * 유사도 점수 + 부족 요소를 분석한다.
 *
 * WinningPattern 0건 → similarityScore 0, 안내 메시지 반환.
 * safeParseJson 은 B1 패턴대로 본 모듈에 국지 복제.
 */

import { invokeAi } from '@/lib/ai-fallback'
import { findWonPatternsBySection } from '@/lib/winning-patterns'
import type { PipelineContext, ProposalSectionKey } from '@/lib/pipeline-context'
import type { ProposalSectionNo } from '@/lib/proposal-ai'
import type { PatternComparisonResult } from './types'

// ─────────────────────────────────────────
// sectionNo → ProposalSectionKey 매핑
// ─────────────────────────────────────────

const SECTION_NO_TO_KEY: Record<number, ProposalSectionKey> = {
  1: 'proposal-background',
  2: 'other',       // 추진전략 — 별도 키 없음
  3: 'curriculum',
  4: 'org-team',
  5: 'budget',
  6: 'impact',
  7: 'other',       // 수행역량 — 별도 키 없음
}

// ─────────────────────────────────────────
// 국지 safeParseJson (B1 패턴)
// ─────────────────────────────────────────

function safeParseJson<T>(raw: string): T {
  const s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  let start: number, end: number
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    start = arrStart; end = s.lastIndexOf(']')
  } else {
    start = objStart; end = s.lastIndexOf('}')
  }
  if (start === -1 || end === -1 || end <= start) throw new Error('JSON not found in AI response')
  return JSON.parse(s.slice(start, end + 1)) as T
}

// ─────────────────────────────────────────
// 메인 함수
// ─────────────────────────────────────────

export async function comparePatterns(
  sectionNo: ProposalSectionNo,
  sectionContent: string,
  _context: PipelineContext,
): Promise<PatternComparisonResult> {
  const sectionKey = SECTION_NO_TO_KEY[sectionNo] ?? 'other'

  // 1. WinningPattern 조회 (top 3, outcome=won)
  const patterns = await findWonPatternsBySection(sectionKey, 3)

  // 0건 fallback
  if (patterns.length === 0) {
    return {
      similarityScore: 0,
      matchedPatterns: [],
      missingElements: [
        '당선 패턴 데이터가 아직 없습니다. 수주 제안서를 Ingestion 하면 비교 정확도가 향상됩니다.',
      ],
    }
  }

  // 2. 패턴 스니펫 직렬화
  const patternsBlock = patterns
    .map((p, i) => [
      `[패턴 ${i + 1}] (출처: ${p.sourceProject})`,
      `스니펫: ${p.snippet.slice(0, 800)}`,
      `성공 요인: ${p.whyItWorks}`,
    ].join('\n'))
    .join('\n\n')

  // 3. Claude 프롬프트 (~700 토큰)
  const prompt = `당신은 교육 사업 제안서 품질 분석가입니다.
아래 "현재 섹션"과 "당선 패턴 3개"를 비교하여 유사도를 분석하세요.

[현재 섹션 (sectionNo: ${sectionNo})]
${sectionContent.slice(0, 2000)}

[당선 패턴]
${patternsBlock}

분석 기준:
- 구조적 유사성 (논리 전개 흐름)
- 키워드·표현 유사성
- 정량 데이터 포함 수준
- 평가위원 관점 어필 요소

반드시 아래 JSON만 반환하세요:
{
  "similarityScore": 0에서 100 사이 정수,
  "matchedPatterns": [
    { "id": "패턴 id", "sourceProject": "출처 프로젝트명", "snippet": "매칭된 부분 요약 50자" }
  ],
  "missingElements": ["현재 섹션에 부족한 요소 1", "부족한 요소 2"]
}`

  const result = await invokeAi({
    prompt,
    maxTokens: 1024,
    temperature: 0.3,
    label: 'gate3-pattern-comparison',
  })

  const raw = result.raw

  const parsed = safeParseJson<{
    similarityScore: number
    matchedPatterns: Array<{ id: string; sourceProject: string; snippet: string }>
    missingElements: string[]
  }>(raw)

  return {
    similarityScore: Math.max(0, Math.min(100, parsed.similarityScore ?? 0)),
    matchedPatterns: (parsed.matchedPatterns ?? []).map((mp) => ({
      id: String(mp.id ?? ''),
      sourceProject: String(mp.sourceProject ?? ''),
      snippet: String(mp.snippet ?? ''),
    })),
    missingElements: (parsed.missingElements ?? []).map(String),
  }
}

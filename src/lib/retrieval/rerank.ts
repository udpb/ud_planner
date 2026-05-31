/**
 * LLM Rerank — cross-encoder 대체 (RET-1, Tech Spec §4.2, ADR-022).
 *
 * cross-encoder API 가 없으므로 Flash 에 (질의 + 후보 텍스트들)을 한 번에 주고 각 후보의
 * 관련도 0~1 점수를 JSON 으로 받는다(배치 프롬프트). 점수순 top-N.
 *
 * 모델: **Flash**(plumbing, invokeGemini({model:FLASH_MODEL}) 직접 — 단일 진입점 예외).
 * 견고성: 후보에 인덱스 부여 → `{ "0": 0.9, "1": 0.3 }` 강제 → safeParseJson.
 * 실패·누락 점수 시 RRF 융합 점수(rawScore)로 fallback — 절대 throw 하지 않는다.
 */

import 'server-only'

import { invokeGemini } from '@/lib/gemini'
import { FLASH_MODEL, AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import type { Candidate, RetrievedChunk } from './types'

/** 후보 텍스트가 너무 길면 rerank 프롬프트 비대 — 후보당 잘라낸다. */
const SNIPPET_CHARS = 600

/**
 * RRF 점수를 0~1 로 정규화한 fallback 점수.
 * (RRF 점수는 절대 스케일이 작아 그대로 두면 비교만 가능. fallback 경로에서 사용.)
 */
function rrfFallback(candidates: Candidate[], topN: number): RetrievedChunk[] {
  const max = candidates.reduce((m, c) => Math.max(m, c.rawScore), 0) || 1
  return candidates
    .slice()
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, topN)
    .map((c) => ({ ...c, score: c.rawScore / max }))
}

/**
 * LLM rerank. 후보가 비었거나 1개 이하면 LLM 생략(정렬 의미 없음).
 *
 * @param query 원 질의 텍스트
 * @param candidates RRF 융합 후보(상위 slice 권장 — 호출부에서 40 정도)
 * @param topN 최종 반환 개수 (기본 8)
 */
export async function rerank(
  query: string,
  candidates: Candidate[],
  topN = 8,
): Promise<RetrievedChunk[]> {
  if (candidates.length === 0) return []
  if (candidates.length === 1) {
    return [{ ...candidates[0], score: 1 }]
  }

  const numbered = candidates
    .map((c, i) => `[${i}] ${c.text.slice(0, SNIPPET_CHARS).replace(/\s+/g, ' ').trim()}`)
    .join('\n')

  try {
    const r = await invokeGemini({
      model: FLASH_MODEL,
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0,
      prompt:
        '당신은 검색 결과 재랭킹 엔진입니다. 아래 "질의" 에 대해 각 후보 문단의 관련도를 ' +
        '0.0~1.0 실수로 평가하세요(1.0=직접적·강하게 관련, 0.0=무관). ' +
        '반드시 후보 인덱스를 키로 하는 JSON 객체만 출력하세요. 설명·마크다운 금지.\n\n' +
        `질의: ${query}\n\n후보:\n${numbered}\n\n` +
        '출력 형식 예: {"0": 0.92, "1": 0.10, "2": 0.55}',
    })
    const scores = safeParseJson<Record<string, unknown>>(r.raw, 'ret.rerank')

    const scored: RetrievedChunk[] = candidates.map((c, i) => {
      const raw = scores[String(i)]
      const s = typeof raw === 'number' ? raw : Number(raw)
      // 점수 누락·비정상 → RRF 융합 점수로 fallback(상대 신호 유지)
      const score = Number.isFinite(s) ? Math.max(0, Math.min(1, s)) : c.rawScore
      return { ...c, score }
    })

    return scored.sort((a, b) => b.score - a.score).slice(0, topN)
  } catch (e) {
    log.warn('ret.rerank', 'LLM rerank 실패 → RRF 점수 fallback', {
      err: e instanceof Error ? e.message : String(e),
      candidates: candidates.length,
    })
    return rrfFallback(candidates, topN)
  }
}

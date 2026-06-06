/**
 * gather — 증거 수집 (EX-1, Tech Spec §5 G5)
 *
 * RET-1 의 단일 검색 계약 `retrieve()` 를 섹션별·과업별로 호출해 evidence 풀을 구성한다.
 * 외부 무거운 리서치(통계·발주처 공식 문서)는 본 브리프 범위 아님 — 여기서는 당선 청크·
 * 자산만 모은다.
 *
 * 동시성: 섹션·과업 retrieve() 는 내부에서 임베딩+rerank LLM 을 호출한다. 7섹션을 한꺼번에
 * 병렬로 쏘면 Gemini 분당 한도(429 RESOURCE_EXHAUSTED)를 버스트로 친다(메인 실측 2026-06-04).
 * → 경량 limiter 로 동시성을 GATHER_CONCURRENCY(2) 로 캡한다. 결과는 key 로 저장하므로
 * 순서·내용은 동시성과 무관하게 동일. (RET-1 retrieve 내부의 429 는 ai-fallback 백오프가 흡수.)
 */

import 'server-only'

import { retrieve } from '@/lib/retrieval'
import { log } from '@/lib/logger'
import { createLimiter } from '@/lib/util/limit'
import { SECTION_LABELS } from '../schema'
import type { SectionKey } from '../schema'
import type { EngineInput, EvidencePool } from './types'
import { scoringCategoryFor } from '@/lib/workstream/types'

/** 섹션·과업 retrieve 동시 실행 캡 — rerank/임베딩 LLM 버스트(429) 방지. 품질 우선 → 작게. */
const GATHER_CONCURRENCY = 2

/** 섹션별 검색 쿼리 — RFP 요약 + 섹션 라벨 + 목표. retrieve() 가 채널 필터. */
function sectionQuery(input: EngineInput, key: SectionKey): string {
  const { rfp } = input
  const objectives = (rfp.objectives ?? []).slice(0, 3).join(' / ')
  const keywords = (rfp.keywords ?? []).slice(0, 6).join(', ')
  return [
    `${rfp.projectName ?? ''} — ${SECTION_LABELS[key]}`,
    objectives ? `목표: ${objectives}` : '',
    keywords ? `키워드: ${keywords}` : '',
    rfp.summary ?? '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 600)
}

/**
 * 섹션별·과업별 evidence 풀 수집.
 *
 * - 섹션은 7개 전부 검색 (writeSection 이 섹션별 청크 사용).
 * - 과업은 각 type·scoringCategory 로 검색 (③ 사업내용 블록이 과업별 근거 인용).
 */
export async function gather(input: EngineInput): Promise<EvidencePool> {
  const { channel, workstreams, onProgress } = input
  const bySection = new Map<SectionKey, RetrievedChunkMap>()
  const byWorkstream = new Map<string, RetrievedChunkMap>()

  const sectionKeys: SectionKey[] = ['1', '2', '3', '4', '5', '6', '7']

  // limiter — 섹션·과업 retrieve 동시 실행을 GATHER_CONCURRENCY 로 캡(429 버스트 방지).
  // 결과는 Map(key) 에 저장하므로 완료 순서와 무관하게 내용·키 동일.
  const limit = createLimiter(GATHER_CONCURRENCY)

  // 섹션별 — 동시성 캡(rerank LLM 버스트 방지)
  await Promise.all(
    sectionKeys.map((key) =>
      limit(async () => {
        try {
          const chunks = await retrieve(
            { text: sectionQuery(input, key), channel },
            { topN: 6 },
          )
          bySection.set(key, chunks)
        } catch (e) {
          log.warn('engine.gather', `섹션 ${key} 검색 실패 → 빈 풀`, {
            err: e instanceof Error ? e.message : String(e),
          })
          bySection.set(key, [])
        }
      }),
    ),
  )
  onProgress?.('gather', `섹션 검색 완료 (${bySection.size}개)`)

  // 과업별 — type·scoringCategory 로 검색 (동일 limiter 로 동시성 캡)
  await Promise.all(
    workstreams.map((ws) =>
      limit(async () => {
        const scoring = ws.scoringCategory || scoringCategoryFor(ws.type) || ''
        const q = [
          `${input.rfp.projectName ?? ''} — 과업: ${ws.type}`,
          scoring ? `평가 배점: ${scoring}` : '',
          (input.rfp.keywords ?? []).slice(0, 5).join(', '),
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 500)
        try {
          const chunks = await retrieve(
            { text: q, channel, workstreamType: ws.type },
            { topN: 5 },
          )
          byWorkstream.set(ws.id, chunks)
        } catch (e) {
          log.warn('engine.gather', `과업 ${ws.id}(${ws.type}) 검색 실패 → 빈 풀`, {
            err: e instanceof Error ? e.message : String(e),
          })
          byWorkstream.set(ws.id, [])
        }
      }),
    ),
  )
  onProgress?.('gather', `과업 검색 완료 (${byWorkstream.size}개)`)

  return { bySection, byWorkstream }
}

// retrieve() 의 반환 타입 별칭 (import 순환 회피용 — 실제 타입은 RetrievedChunk[])
type RetrievedChunkMap = Awaited<ReturnType<typeof retrieve>>

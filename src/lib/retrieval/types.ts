/**
 * Retrieval 계약 — 공용 타입 (RET-1, Tech Spec §4).
 *
 * 단일 검색 계약 `retrieve()` 의 입력·후보·결과·옵션 타입. 순수 타입만 — IO 없음.
 * 기존 검색 모듈(winning-reference·asset-registry)은 후보 생성기로 wrap 되어
 * 여기 정의된 `Candidate` 로 정규화된다.
 */

/** 검색 질의 — 본문 + 채널/과업유형 필터(있으면). */
export interface RetrieveQuery {
  text: string
  /** B2G | B2B | renewal (winning-reference 채널 필터로 전달) */
  channel?: string
  /** WorkstreamType (자산/청크 필터 — 데이터 태깅 도입 후 활성) */
  workstreamType?: string
}

/** 후보 생성기(dense/keyword) 정규화 출력. rerank 전 점수는 rawScore. */
export interface Candidate {
  /** 후보 고유 id — RRF 병합 키 (source prefix 로 winning/asset 충돌 방지) */
  id: string
  source: 'winning' | 'asset'
  text: string
  /** 섹션 단위 확장용 부모 텍스트(coherence) — 있으면 */
  parentSectionText?: string
  /** 생성기 원점수 (winning=cosine, asset=matchScore 등 0~1) */
  rawScore: number
  citation: { docId?: string; chunkId?: string; assetId?: string }
}

/** 최종 검색 결과 — rerank 점수 부여. */
export interface RetrievedChunk extends Candidate {
  /** 최종 rerank 점수 (rerank 미사용 시 RRF fused 점수) */
  score: number
}

/** retrieve() 옵션 — 품질-우선 기본값(깊게 검색 → rerank → top-N). */
export interface RetrieveOptions {
  /** dense 후보 깊이 (기본 40) */
  kDense?: number
  /** keyword 후보 깊이 (기본 40) */
  kKeyword?: number
  /** 최종 반환 개수 (기본 8) */
  topN?: number
  /** HyDE·decompose 다중쿼리 사용 (기본 false — 비용·latency) */
  useMultiQuery?: boolean
  /** LLM rerank 사용 (기본 true — 품질 핵심). false 면 RRF 점수로 top-N */
  useRerank?: boolean
}

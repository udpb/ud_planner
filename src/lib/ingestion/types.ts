/**
 * Ingestion 파이프라인 — 공용 타입
 * (ADR-003, docs/architecture/ingestion.md)
 *
 * Phase A: 스키마 + 업로드 UI 뼈대.
 * 실제 추출/AI 처리 모듈은 Phase D 이후.
 */

// 자료 종류 (IngestionJob.kind) — 문자열 enum
export const INGESTION_KINDS = [
  'proposal',
  'curriculum',
  'evaluator_question',
  'strategy_interview',
] as const

export type IngestionKind = (typeof INGESTION_KINDS)[number]

export const INGESTION_KIND_LABELS: Record<IngestionKind, string> = {
  proposal: '제안서',
  curriculum: '커리큘럼',
  evaluator_question: '심사위원 질문',
  strategy_interview: '전략 인터뷰',
}

// IngestionJob.status — 문자열 enum
export const INGESTION_STATUSES = [
  'queued',
  'processing',
  'review',
  'approved',
  'rejected',
  'failed',
] as const

export type IngestionStatus = (typeof INGESTION_STATUSES)[number]

export const INGESTION_STATUS_LABELS: Record<IngestionStatus, string> = {
  queued: '대기 중',
  processing: '처리 중',
  review: '검토 대기',
  approved: '승인됨',
  rejected: '거부됨',
  failed: '실패',
}

// ExtractedItem.status — 문자열 enum
export type ExtractedItemStatus = 'pending' | 'approved' | 'rejected' | 'edited'

// ExtractedItem.targetAsset — 문자열 enum
export type ExtractedTargetAsset =
  | 'winning_pattern'
  | 'curriculum_archetype'
  | 'evaluator_question'
  | 'strategy_note'

// ─────────────────────────────────────────
// 메타데이터 스키마 (kind 별)
// JSON 필드이므로 유연하게 — Phase D 이후 확장 가능
// ─────────────────────────────────────────

export interface ProposalMeta {
  projectName: string // 사업명 (필수)
  client?: string     // 발주처
  isWon?: boolean     // 수주 여부
  totalScore?: number // 총점 (옵션)
}

export interface CurriculumMeta {
  projectName?: string
  audience?: string   // 대상자
  sessionCount?: number // 총 회차
}

export interface EvaluatorQuestionMeta {
  projectName?: string
  presentationDate?: string // ISO date
}

export interface StrategyInterviewMeta {
  interviewee?: string // 대상자
  date?: string        // ISO date
}

export type IngestionMeta =
  | ProposalMeta
  | CurriculumMeta
  | EvaluatorQuestionMeta
  | StrategyInterviewMeta

// 업로드 입력 DTO — POST /api/ingest 요청 본문 (FormData)
export interface IngestionUploadInput {
  kind: IngestionKind
  metadata: IngestionMeta
  // 파일 또는 URL 중 최소 하나 필요
  file?: File
  sourceUrl?: string
}

// 업로드 응답 DTO
export interface IngestionUploadResponse {
  jobId: string
  status: IngestionStatus
  uploadedAt: string
}

// 최근 목록 DTO — GET /api/ingest 응답
export interface IngestionJobSummary {
  id: string
  kind: IngestionKind
  status: IngestionStatus
  metadata: Record<string, unknown>
  sourceFile: string | null
  sourceUrl: string | null
  uploadedAt: string
  uploadedBy: string
}

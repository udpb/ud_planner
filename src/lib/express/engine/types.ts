/**
 * 단일 생성 엔진 — 타입 계약 (EX-1, ADR-021, Tech Spec §5·§7)
 *
 * 과업(Workstream)-aware 단계형 파이프라인의 입출력 타입.
 * 순수 타입만 — IO·LLM 없음. server/client 양쪽 import 안전.
 *
 * 핵심 차별점: 7섹션은 과업 위 투영 (Tech Spec §7.2).
 *   ③ 사업내용 = 과업 블록 순차 · ⑤ 예산 = Σ과업 · ⑥ 성과 = 과업 Outcome 합성.
 */

import type { Workstream } from '@prisma/client'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'
import type { Channel, ExpressDraft, PmInputs, SectionKey } from '../schema'
import type { RetrievedChunk } from '@/lib/retrieval/types'
import type { WinThemeDraft } from './win-theme'
import type { ComplianceMatrix } from './compliance'
import type { VerifyReport } from './verify'

// ─────────────────────────────────────────
// 입력
// ─────────────────────────────────────────

export interface EngineInput {
  projectId: string
  /** 기존 RfpParsed (ai/parse-rfp) */
  rfp: RfpParsed
  /** B2G | B2B | renewal (schema.ts) */
  channel: Channel
  /** DB(Prisma) 의 과업. 비어 있으면 index.ts 가 ensureDefaultWorkstream 후 재로드. */
  workstreams: Workstream[]
  /** ProgramProfile (있으면 과업 분해·자산 매칭 품질 ↑) */
  profile?: ProgramProfile | null
  /** K7 — PM 이 입력한 외부 reality (통화·코치·평가위원) */
  pmInputs?: PmInputs | null
  /** 진행 상황 콜백 (CLI/스트리밍용) */
  onProgress?: (step: string, detail: string) => void
}

// ─────────────────────────────────────────
// gather — 섹션별·과업별 evidence 풀
// ─────────────────────────────────────────

export interface EvidencePool {
  /** 섹션 키('1'~'7') → 검색된 청크. assemble 의 writeSection 이 인용. */
  bySection: Map<SectionKey, RetrievedChunk[]>
  /** 과업 id → 검색된 청크. ③ 사업내용 과업 블록 렌더 시 인용. */
  byWorkstream: Map<string, RetrievedChunk[]>
}

// ─────────────────────────────────────────
// assemble — plan-then-write 산출물
// ─────────────────────────────────────────

/** planOutline 결과 — 섹션별 thesis + evidence 계획 + 길이 예산. */
export interface SectionPlan {
  /** 한 줄 thesis (이 섹션의 핵심 주장) */
  thesis: string
  /** 인용할 evidence 참조 키 (gather 의 청크 id 또는 자유 메모) */
  evidenceRefs: string[]
  /** 목표 길이 (자) — schema 상 ≤2000 */
  lengthBudget: number
}

export type Outline = Record<SectionKey, SectionPlan>

// ─────────────────────────────────────────
// self-score — 기본 Rubric (Tech Spec §6, 8 라인)
// ─────────────────────────────────────────

export interface ScoreLine {
  key: string
  weight: number
  /** 0~100 */
  score: number
}

export interface SelfScore {
  /** 0~100 가중 평균 (다중 샘플 라인별 median 가중합) */
  overall: number
  lines: ScoreLine[]
  /** 약점 top-3 섹션 키('1'~'7') 또는 라인 키 — 정제 루프 대상 */
  weakest: string[]
  /** 라인 key → "왜 낮은지" judge 진단 한 문장 (EVAL-1 — refine 타깃 주입). */
  lineFeedback?: Record<string, string>
}

// ─────────────────────────────────────────
// 최종 결과
// ─────────────────────────────────────────

export interface EngineResult {
  draft: ExpressDraft
  score: SelfScore
  /** 정제 루프 반복 횟수 (assemble 후 self-score → refine 사이클) */
  iterations: number
  /** EX-2 — typed WinTheme[] (proof chain 강제). 라우트가 DB persist. */
  winThemes?: WinThemeDraft[]
  /** EX-2 — compliance matrix (RFP 요구 → 섹션 매핑). 라우트가 DB persist. */
  compliance?: ComplianceMatrix
  /** EX-2 — faithfulness gate report (검증·제거 통계). */
  verifyReport?: VerifyReport
}

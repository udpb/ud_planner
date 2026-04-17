/**
 * Gate 3 AI Validation Types
 *
 * quality-gates.md Gate 3: 당선 패턴 대조 + 평가위원 시뮬레이션 + 논리 체인 검증.
 * 자동 블록 없음 — 리포트만 반환, PM 최종 판단.
 */

import type { ProposalSectionNo } from '@/lib/proposal-ai'

// ─────────────────────────────────────────
// 3a. 당선 패턴 대조 결과
// ─────────────────────────────────────────

export interface MatchedPattern {
  id: string
  sourceProject: string
  snippet: string
}

export interface PatternComparisonResult {
  similarityScore: number // 0~100
  matchedPatterns: MatchedPattern[]
  missingElements: string[]
}

// ─────────────────────────────────────────
// 3b. 평가위원 시뮬레이션 결과
// ─────────────────────────────────────────

export interface EvaluatorSimulationResult {
  expectedScore: number // 해당 섹션 예상 점수
  maxScore: number
  deductionReasons: string[]
  likelyQuestions: string[] // 3~5개
}

// ─────────────────────────────────────────
// 3c. 논리 체인 검증 결과
// ─────────────────────────────────────────

export interface LogicChainResult {
  passed: boolean
  breakpoints: string[] // 끊긴 연결 설명
}

// ─────────────────────────────────────────
// 통합 Gate3 리포트
// ─────────────────────────────────────────

export interface Gate3Report {
  sectionNo: ProposalSectionNo
  patternComparison: PatternComparisonResult
  evaluatorSimulation: EvaluatorSimulationResult
  logicChain: LogicChainResult
  overallFeedback: string
  runAt: string
}

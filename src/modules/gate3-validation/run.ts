/**
 * Gate 3 Runner — 3개 검증 병렬 실행 + overallFeedback 합성
 *
 * comparePatterns + simulateEvaluator + validateLogicChain 을 Promise.all 로 실행.
 * 자동 블록 없음 — 리포트만 반환.
 */

import type { PipelineContext } from '@/lib/pipeline-context'
import type { ProposalSectionNo } from '@/lib/proposal-ai'
import type { Gate3Report } from './types'
import { comparePatterns } from './pattern-comparison'
import { simulateEvaluator } from './evaluator-simulation'
import { validateLogicChain } from './logic-chain'

/**
 * Gate 3 검증을 병렬로 실행하여 통합 리포트를 반환한다.
 *
 * @param sectionNo 검증 대상 제안서 섹션 번호 (1~7)
 * @param sectionContent 해당 섹션의 현재 본문
 * @param context 전체 PipelineContext
 * @returns Gate3Report (자동 블록 없음 — 리포트만)
 */
export async function runGate3(
  sectionNo: ProposalSectionNo,
  sectionContent: string,
  context: PipelineContext,
): Promise<Gate3Report> {
  const [patternComparison, evaluatorSimulation, logicChain] = await Promise.all([
    comparePatterns(sectionNo, sectionContent, context),
    simulateEvaluator(sectionNo, sectionContent, context),
    validateLogicChain(sectionNo, context),
  ])

  // overallFeedback 합성
  const feedbackParts: string[] = []

  // 패턴 대조 요약
  if (patternComparison.similarityScore === 0 && patternComparison.matchedPatterns.length === 0) {
    feedbackParts.push('당선 패턴 데이터가 없어 패턴 비교를 수행하지 못했습니다.')
  } else {
    feedbackParts.push(`패턴 유사도 ${patternComparison.similarityScore}점.`)
    if (patternComparison.missingElements.length > 0) {
      feedbackParts.push(`부족 요소: ${patternComparison.missingElements.slice(0, 3).join(', ')}.`)
    }
  }

  // 평가위원 시뮬 요약
  const pct = evaluatorSimulation.maxScore > 0
    ? Math.round((evaluatorSimulation.expectedScore / evaluatorSimulation.maxScore) * 100)
    : 0
  feedbackParts.push(
    `평가위원 시뮬 ${evaluatorSimulation.expectedScore}/${evaluatorSimulation.maxScore}점 (${pct}%).`,
  )
  if (evaluatorSimulation.deductionReasons.length > 0) {
    feedbackParts.push(`주요 감점: ${evaluatorSimulation.deductionReasons[0]}.`)
  }

  // 논리 체인 요약
  if (logicChain.passed) {
    feedbackParts.push('논리 체인 정합성 통과.')
  } else {
    feedbackParts.push(`논리 체인 끊김 ${logicChain.breakpoints.length}건.`)
    if (logicChain.breakpoints.length > 0) {
      feedbackParts.push(`첫 번째 끊김: ${logicChain.breakpoints[0]}.`)
    }
  }

  return {
    sectionNo,
    patternComparison,
    evaluatorSimulation,
    logicChain,
    overallFeedback: feedbackParts.join(' '),
    runAt: new Date().toISOString(),
  }
}

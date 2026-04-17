/**
 * 규칙 기반 예상 점수 계산 — AI 호출 없음.
 *
 * evalStrategy.topItems 를 순회하며 각 섹션의 완성도를 판정,
 * maxPoints * completeness 로 현재 점수를 산출한다.
 *
 * evalStrategy 가 없으면 totalScore=0 인 빈 결과를 반환 (안전 fallback).
 */

import type { PipelineContext, ProposalSectionKey } from '@/lib/pipeline-context'
import type { PredictedScoreBreakdown, PredictedScoreItem } from './types'

// ─────────────────────────────────────────
// 메인 함수
// ─────────────────────────────────────────

export function calculatePredictedScore(
  context: PipelineContext,
): PredictedScoreBreakdown {
  const evalStrategy = context.rfp?.evalStrategy
  if (!evalStrategy) {
    return zeroScore('RFP 평가배점 정보 없음')
  }

  const topItems = evalStrategy.topItems
  if (!topItems || topItems.length === 0) {
    return zeroScore('평가배점 항목이 비어있습니다')
  }

  const items: PredictedScoreItem[] = topItems.map((topItem) => {
    const { completeness, reason } = judgeSection(topItem.section, context)
    return {
      sectionKey: topItem.section,
      maxPoints: topItem.points,
      currentScore: Math.round(topItem.points * completeness * 100) / 100,
      completeness,
      reason,
    }
  })

  const totalScore =
    Math.round(items.reduce((s, i) => s + i.currentScore, 0) * 100) / 100

  return {
    totalScore,
    items,
    calculatedAt: new Date().toISOString(),
    source: 'rule_based',
  }
}

// ─────────────────────────────────────────
// 섹션별 판정 규칙
// ─────────────────────────────────────────

interface JudgeResult {
  completeness: number
  reason: string
}

function judgeSection(
  section: ProposalSectionKey,
  ctx: PipelineContext,
): JudgeResult {
  switch (section) {
    case 'curriculum':
      return judgeCurriculum(ctx)
    case 'coaches':
      return judgeCoaches(ctx)
    case 'budget':
      return judgeBudget(ctx)
    case 'impact':
      return judgeImpact(ctx)
    case 'proposal-background':
      return judgeProposalBackground(ctx)
    case 'org-team':
      return judgeOrgTeam(ctx)
    case 'other':
      return { completeness: 0.5, reason: '매핑되지 않은 항목 — 기본 50%' }
  }
}

function judgeCurriculum(ctx: PipelineContext): JudgeResult {
  let score = 0
  const reasons: string[] = []

  if (ctx.curriculum?.confirmedAt) {
    score += 0.8
    reasons.push('커리큘럼 확정됨')
  } else if (ctx.curriculum?.sessions && ctx.curriculum.sessions.length > 0) {
    score += 0.4
    reasons.push('세션 존재(미확정)')
  } else {
    reasons.push('커리큘럼 미작성')
  }

  if (ctx.curriculum?.sessions && ctx.curriculum.sessions.length > 0) {
    score += 0.15
    reasons.push(`${ctx.curriculum.sessions.length}회차`)
  }

  if (ctx.curriculum?.ruleValidation?.passed) {
    score += 0.05
    reasons.push('룰 검증 통과')
  }

  const completeness = Math.min(score, 1)
  return { completeness, reason: reasons.join(' / ') }
}

function judgeCoaches(ctx: PipelineContext): JudgeResult {
  let score = 0
  const reasons: string[] = []

  const assignmentCount = ctx.coaches?.assignments?.length ?? 0
  if (assignmentCount > 0) {
    score += 0.7
    reasons.push(`${assignmentCount}명 배정`)
  } else {
    reasons.push('코치 미배정')
    return { completeness: 0, reason: reasons.join(' / ') }
  }

  if ((ctx.coaches?.totalFee ?? 0) > 0) {
    score += 0.2
    reasons.push('사례비 산출됨')
  }

  const confirmedCount = ctx.coaches?.assignments?.filter((a) => a.confirmed).length ?? 0
  if (assignmentCount > 0) {
    const confirmedRatio = confirmedCount / assignmentCount
    score += 0.1 * confirmedRatio
    if (confirmedRatio >= 1) {
      reasons.push('전원 확정')
    } else {
      reasons.push(`${confirmedCount}/${assignmentCount} 확정`)
    }
  }

  const completeness = Math.min(score, 1)
  return { completeness, reason: reasons.join(' / ') }
}

function judgeBudget(ctx: PipelineContext): JudgeResult {
  let score = 0
  const reasons: string[] = []

  if (ctx.budget?.structure) {
    score += 0.6
    reasons.push('예산 구조 생성됨')
  } else {
    reasons.push('예산 미작성')
    return { completeness: 0, reason: reasons.join(' / ') }
  }

  const mr = ctx.budget?.marginRate ?? 0
  if (mr >= 10 && mr <= 15) {
    score += 0.2
    reasons.push(`마진율 ${mr.toFixed(1)}% (적정)`)
  } else if (mr > 0) {
    score += 0.1
    reasons.push(`마진율 ${mr.toFixed(1)}%`)
  }

  if (ctx.budget?.sroiForecast) {
    score += 0.2
    reasons.push('SROI 예측 있음')
  }

  const completeness = Math.min(score, 1)
  return { completeness, reason: reasons.join(' / ') }
}

function judgeImpact(ctx: PipelineContext): JudgeResult {
  let score = 0
  const reasons: string[] = []

  if (ctx.impact?.logicModel) {
    score += 0.7
    reasons.push('Logic Model 존재')
  } else {
    reasons.push('Logic Model 미작성')
    return { completeness: 0, reason: reasons.join(' / ') }
  }

  if (ctx.impact?.measurementPlan && ctx.impact.measurementPlan.length > 0) {
    score += 0.3
    reasons.push(`측정 계획 ${ctx.impact.measurementPlan.length}건`)
  }

  const completeness = Math.min(score, 1)
  return { completeness, reason: reasons.join(' / ') }
}

function judgeProposalBackground(ctx: PipelineContext): JudgeResult {
  const reasons: string[] = []

  const hasConfirmed = !!ctx.rfp?.confirmedAt
  const hasConcept = !!ctx.rfp?.proposalConcept

  if (hasConfirmed && hasConcept) {
    reasons.push('RFP 확정 + 제안 컨셉 완료')
    return { completeness: 1.0, reason: reasons.join(' / ') }
  }

  if (hasConcept) {
    reasons.push('제안 컨셉 있음 (미확정)')
    return { completeness: 0.7, reason: reasons.join(' / ') }
  }

  if (hasConfirmed) {
    reasons.push('RFP 확정됨 (컨셉 미작성)')
    return { completeness: 0.5, reason: reasons.join(' / ') }
  }

  reasons.push('RFP 미확정 / 컨셉 미작성')
  return { completeness: 0.2, reason: reasons.join(' / ') }
}

function judgeOrgTeam(ctx: PipelineContext): JudgeResult {
  let score = 0
  const reasons: string[] = []

  if ((ctx.coaches?.assignments?.length ?? 0) > 0) {
    score += 0.5
    reasons.push('코치 배정됨')
  }

  if (ctx.strategy) {
    score += 0.3
    reasons.push('전략 수립됨')
  }

  if (score === 0) {
    reasons.push('조직/전문가 정보 없음')
  }

  const completeness = Math.min(score, 1)
  return { completeness, reason: reasons.join(' / ') }
}

// ─────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────

function zeroScore(_reason: string): PredictedScoreBreakdown {
  return {
    totalScore: 0,
    items: [],
    calculatedAt: new Date().toISOString(),
    source: 'rule_based',
  }
}

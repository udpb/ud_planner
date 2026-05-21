'use client'

/**
 * RecommendationBadge — Wave V / F1 (ADR-015)
 *
 * 코치 매칭 점수를 시각화. HIGH (≥0.7) green / MID (≥0.5) amber / LOW slate.
 *
 * tooltip 에 5축 breakdown 노출 (keyword/task/region/tier/history).
 */

import { cn } from '@/lib/utils'
import { RECOMMENDATION_THRESHOLDS } from '@/lib/coaches/types'
import type { ScoreBreakdown } from '@/lib/coaches/types'

interface Props {
  score: number // 0~1
  breakdown?: ScoreBreakdown
  className?: string
}

export function RecommendationBadge({ score, breakdown, className }: Props) {
  const pct = Math.round(score * 100)
  const tier =
    score >= RECOMMENDATION_THRESHOLDS.HIGH
      ? 'high'
      : score >= RECOMMENDATION_THRESHOLDS.MID
        ? 'mid'
        : 'low'

  const tone = {
    high: 'bg-green-100 text-green-800 border-green-200',
    mid: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-slate-100 text-slate-700 border-slate-200',
  }[tier]

  const label = {
    high: '강추',
    mid: '추천',
    low: '참고',
  }[tier]

  const title = breakdown
    ? `매칭 ${pct}점 — ${label}\nkeyword ${Math.round(breakdown.keyword * 100)}점 · task ${Math.round(breakdown.task * 100)}점 · region ${Math.round(breakdown.region * 100)}점 · tier ${Math.round(breakdown.tier * 100)}점 · history ${Math.round(breakdown.history * 100)}점`
    : `매칭 ${pct}점 — ${label}`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        tone,
        className,
      )}
      title={title}
    >
      {label}
      <span className="opacity-75">{pct}</span>
    </span>
  )
}

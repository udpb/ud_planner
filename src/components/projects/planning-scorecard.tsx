'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { PlanningScore } from '@/lib/planning-score'
import {
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  Gauge, ArrowRight,
} from 'lucide-react'

interface Props {
  score: PlanningScore
}

export function PlanningScorecard({ score }: Props) {
  const [expanded, setExpanded] = useState(false)

  const pct = Math.round((score.total / score.maxTotal) * 100)

  const goodCount = score.categories.filter((c) => c.status === 'good').length
  const warnCount = score.categories.filter((c) => c.status === 'warn').length
  const missingCount = score.categories.filter((c) => c.status === 'missing').length

  // 다음 행동 제안 — 가장 점수가 낮은 카테고리의 action
  const nextAction = score.categories
    .filter((c) => c.action)
    .sort((a, b) => (a.score / a.max) - (b.score / b.max))[0]

  return (
    <div className="border-b bg-background">
      {/* 요약 바 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-4 px-6 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">기획 품질</span>
        </div>

        {/* 점수 */}
        <span className={cn(
          'text-sm font-bold tabular-nums',
          pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600',
        )}>
          {score.total}<span className="text-xs font-normal text-muted-foreground">/{score.maxTotal}</span>
        </span>

        {/* 프로그레스 바 */}
        <div className="flex-1 max-w-[200px]">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* 상태 뱃지들 */}
        <div className="flex items-center gap-2">
          {goodCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-green-600">
              <CheckCircle2 className="h-3 w-3" />{goodCount}
            </span>
          )}
          {warnCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-amber-600">
              <AlertTriangle className="h-3 w-3" />{warnCount}
            </span>
          )}
          {missingCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-red-500">
              <XCircle className="h-3 w-3" />{missingCount}
            </span>
          )}
        </div>

        {/* 다음 행동 */}
        {nextAction && !expanded && (
          <span className="hidden lg:flex items-center gap-1 text-[11px] text-muted-foreground">
            <ArrowRight className="h-3 w-3" />
            {nextAction.action}
          </span>
        )}

        <span className="ml-auto shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {/* 상세 카테고리 */}
      {expanded && (
        <div className="grid gap-2 px-6 pb-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {score.categories.map((cat) => (
            <div
              key={cat.key}
              className={cn(
                'rounded-lg border p-3',
                cat.status === 'good' ? 'border-green-200 bg-green-50/50' :
                  cat.status === 'warn' ? 'border-amber-200 bg-amber-50/50' :
                    'border-red-200 bg-red-50/50',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">{cat.label}</span>
                {cat.status === 'good' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                {cat.status === 'warn' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                {cat.status === 'missing' && <XCircle className="h-3.5 w-3.5 text-red-400" />}
              </div>

              <div className="mt-1 flex items-end gap-1">
                <span className={cn(
                  'text-lg font-bold tabular-nums',
                  cat.status === 'good' ? 'text-green-700' :
                    cat.status === 'warn' ? 'text-amber-700' : 'text-red-600',
                )}>
                  {cat.score}
                </span>
                <span className="mb-0.5 text-[10px] text-muted-foreground">/{cat.max}</span>
              </div>

              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{cat.detail}</p>

              {cat.action && (
                <p className="mt-1.5 text-[10px] leading-snug font-medium text-amber-700">
                  → {cat.action}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

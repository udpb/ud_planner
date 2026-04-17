/**
 * ScoreBar — 파이프라인 상단 예상 점수 바 (서버 컴포넌트).
 *
 * 디자인 SKILL:
 * - §8 Scale: 총점 우측 text-3xl font-bold
 * - §2 색 규칙: 0.5 미만 muted, 0.5~0.8 orange-tint, 0.8+ primary
 * - hover tooltip 으로 reason 표시
 */

import { buildPipelineContext } from '@/lib/pipeline-context'
import { sectionLabel } from '@/lib/eval-strategy'
import { cn } from '@/lib/utils'
import { calculatePredictedScore } from './calculate'
import type { PredictedScoreItem } from './types'
import type { ProposalSectionKey } from '@/lib/pipeline-context'

// ─────────────────────────────────────────
// 색 매핑 (completeness 기준)
// ─────────────────────────────────────────

function completenessBarColor(completeness: number): string {
  if (completeness >= 0.8) return 'bg-primary'              // Action Orange
  if (completeness >= 0.5) return 'bg-[var(--ud-orange-tint)]' // orange-tint (#F9BBA3)
  return 'bg-muted'
}

function completenessTextColor(completeness: number): string {
  if (completeness >= 0.8) return 'text-primary'
  if (completeness >= 0.5) return 'text-[var(--ud-orange-light)]'
  return 'text-muted-foreground'
}

// ─────────────────────────────────────────
// ScoreSegment (개별 세그먼트)
// ─────────────────────────────────────────

function ScoreSegment({
  sectionKey,
  maxPoints,
  currentScore,
  completeness,
  reason,
}: PredictedScoreItem) {
  const pct = Math.round(completeness * 100)
  const label = sectionLabel(sectionKey)

  return (
    <div className="group relative flex-1 min-w-0" title={reason}>
      {/* 라벨 + 점수 */}
      <div className="flex items-baseline justify-between mb-1 px-0.5">
        <span className="text-[10px] text-muted-foreground truncate">
          {label}
        </span>
        <span
          className={cn(
            'text-xs font-semibold tabular-nums',
            completenessTextColor(completeness),
          )}
        >
          {Math.round(currentScore)}/{maxPoints}
        </span>
      </div>

      {/* 프로그레스 바 */}
      <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            completenessBarColor(completeness),
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Hover tooltip (CSS only) */}
      <div
        className={cn(
          'absolute bottom-full left-1/2 -translate-x-1/2 mb-2',
          'pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity',
          'z-30 w-48 rounded-md bg-popover p-2 text-xs text-popover-foreground shadow-md border',
        )}
      >
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 text-muted-foreground">{reason}</p>
        <p className="mt-1 tabular-nums">
          완성도 {pct}% ({Math.round(currentScore)}/{maxPoints}점)
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// ScoreBar (메인)
// ─────────────────────────────────────────

export async function ScoreBar({ projectId }: { projectId: string }) {
  let ctx
  try {
    ctx = await buildPipelineContext(projectId)
  } catch {
    return null
  }

  const score = calculatePredictedScore(ctx)

  // 항목이 없으면 (evalStrategy 없음) 렌더 생략
  if (score.items.length === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b bg-background/80">
      <div className="flex-1 flex gap-3">
        {score.items.map((item) => (
          <ScoreSegment key={item.sectionKey} {...item} />
        ))}
      </div>
      <div className="flex items-baseline gap-1 shrink-0 pl-4 border-l">
        <span className="text-3xl font-bold tabular-nums">
          {Math.round(score.totalScore)}
        </span>
        <span className="text-sm text-muted-foreground">/100</span>
      </div>
    </div>
  )
}

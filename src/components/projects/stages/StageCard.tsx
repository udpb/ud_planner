'use client'

/**
 * StageCard — Wave V / F0 (ADR-015, 2026-05-20)
 *
 * 5 Stage Progressive Disclosure 의 단일 stage 카드.
 *
 * 상태:
 *  - 펼침 (expanded): 본문 children 노출. 헤더에 stage id·label·description.
 *  - 접힘 (collapsed): sticky 1줄 요약만. 클릭 시 펼침.
 *
 * 펼침/접힘 우선순위:
 *   manualOverride ('expanded' | 'collapsed') > active (auto)
 *
 * 디자인: shadcn Card + ud-design-system 토큰. Action Orange 는 활성 stage 만.
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { ChevronDown, ChevronUp, CircleDot, CheckCircle2, Circle } from 'lucide-react'
import type { StageId } from './stage-mapping'
import { STAGE_LABELS, STAGE_DESCRIPTIONS } from './stage-mapping'

export type StageExpandState = 'expanded' | 'collapsed' | null

interface Props {
  /** Stage 식별자 (S1~S5) */
  id: StageId
  /** Stage 순서 (1~5) — 번호 표시용 */
  index: number
  /**
   * 자동 활성 여부 — computeCurrentStage 의 결과가 이 stage 와 일치하면 true.
   * 활성 stage 는 펼침 + Action Orange 강조. PM 의 manualOverride 가 없을 때만 적용.
   */
  active: boolean
  /**
   * 완료 여부 — 이 stage 의 결과물이 충족된 경우 (예: S1=RFP 파싱 완료, S2=1차본 승인 등).
   * 헤더 좌측 체크 아이콘. active 와 별개 (S3 통과해도 PM 이 S4 활성 중일 수 있음).
   */
  done?: boolean
  /** PM 수동 토글 결과. 우선순위 1순위. */
  manualOverride: StageExpandState
  /** 헤더 우측 1줄 sticky 요약 (접힘 상태에서 중요) */
  summary: string
  /** 펼침 시 노출되는 본문 */
  children: React.ReactNode
  /**
   * PM 이 카드 클릭 (접힘 → 펼침) 또는 chevron 클릭 (펼침 → 접힘) 시 호출.
   * 다음 manualOverride 값을 인자로 전달.
   */
  onToggle: (next: StageExpandState) => void
}

export function StageCard({
  id,
  index,
  active,
  done,
  manualOverride,
  summary,
  children,
  onToggle,
}: Props) {
  // 최종 펼침 여부 (manualOverride > active)
  const expanded = useMemo<boolean>(() => {
    if (manualOverride === 'expanded') return true
    if (manualOverride === 'collapsed') return false
    return active
  }, [active, manualOverride])

  const label = STAGE_LABELS[id]
  const description = STAGE_DESCRIPTIONS[id]

  // 헤더 좌측 마커
  const stateIcon = done ? (
    <CheckCircle2 className="h-4 w-4 text-green-600" />
  ) : active ? (
    <CircleDot className="h-4 w-4 text-primary" />
  ) : (
    <Circle className="h-4 w-4 text-muted-foreground/60" />
  )

  return (
    <Card
      className={cn(
        'transition-all',
        expanded
          ? active
            ? 'border-primary/40 shadow-sm'
            : 'border-border'
          : 'border-border bg-muted/30',
      )}
      data-stage-id={id}
      data-stage-active={active ? 'true' : 'false'}
      data-stage-expanded={expanded ? 'true' : 'false'}
    >
      {/* 헤더 — 항상 노출. 클릭 시 토글. */}
      <button
        type="button"
        onClick={() => onToggle(expanded ? 'collapsed' : 'expanded')}
        aria-expanded={expanded}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
          'hover:bg-muted/50',
          expanded && 'border-b',
        )}
      >
        {/* Stage 번호 + state 아이콘 */}
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
            done
              ? 'bg-green-500 text-white'
              : active
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                : 'border border-border bg-muted text-muted-foreground',
          )}
          aria-hidden
        >
          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index}
        </span>

        {/* Label + description (펼침) or summary (접힘) */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-sm font-semibold',
                expanded || active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <span className="font-mono text-xs text-muted-foreground mr-1">{id}</span>
              {label}
            </span>
            {active && !expanded && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                현재 단계
              </span>
            )}
          </div>
          {/* 1줄 요약 (접힘) or description (펼침) */}
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {expanded ? description : summary}
          </div>
        </div>

        {/* state 아이콘 + chevron */}
        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          {stateIcon}
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      {/* 본문 — 펼침일 때만 */}
      {expanded && <div className="p-4">{children}</div>}
    </Card>
  )
}

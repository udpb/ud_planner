'use client'

/**
 * NorthStarBar — 5단계 진행 바 + 자동 저장 상태 + 1차본 승인
 * (Phase L Wave L2, ADR-011 §3.2 장치 1)
 */

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CheckCircle2, Loader2, AlertCircle, Sparkles } from 'lucide-react'
import type { calcProgress } from '@/lib/express/schema'

interface Props {
  progress: ReturnType<typeof calcProgress>
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error'
  onSubmitDraft: () => void
  submitting: boolean
  isCompleted: boolean
}

/**
 * Wave 2 #6: 각 단계의 완료 조건 PM 에게 명시.
 * hover tooltip 으로 어디까지 채워야 다음 단계 진행되는지 보여줌.
 */
const STAGE_TOOLTIP: Record<string, string> = {
  rfp: 'RFP 업로드 + 파싱 완료',
  intent:
    '사업의 한 문장 정체성 + Before·After + 핵심 메시지 3개 모두 채움',
  differentiators: '차별화 자산 최소 3개 수락',
  sections: '제안서 7섹션 中 5개(①②③④⑥) 가 200자 이상',
  submit: '1차본 승인 (자동 검수 통과 + Project 필드 인계)',
}

export function NorthStarBar({
  progress,
  autosaveStatus,
  onSubmitDraft,
  submitting,
  isCompleted,
}: Props) {
  return (
    <div className="border-b bg-gradient-to-r from-orange-50/40 via-background to-background">
      <div className="flex items-center gap-3 px-6 py-2.5">
        {/* 북극성 메시지 */}
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">RFP → 1차본</span>
          <span className="text-muted-foreground">· 30~45분</span>
        </div>

        {/* 5단계 진행 점 */}
        <div className="ml-3 flex flex-1 items-center gap-1">
          {progress.stages.map((stage, i) => {
            const done = stage.pct >= 100
            const active = stage.pct > 0 && !done
            const tooltipText = STAGE_TOOLTIP[stage.key]
              ? `${stage.label}: ${stage.pct}% · ${STAGE_TOOLTIP[stage.key]}`
              : `${stage.label}: ${stage.pct}%`
            return (
              <div key={stage.key} className="flex flex-1 items-center gap-1">
                <div
                  className="group relative flex flex-col items-center gap-0.5 cursor-help"
                  title={tooltipText}
                >
                  <div
                    className={cn(
                      'h-2.5 w-2.5 rounded-full transition-all',
                      done
                        ? 'bg-primary'
                        : active
                          ? 'bg-primary/40 ring-2 ring-primary/20'
                          : 'bg-muted',
                    )}
                  />
                  <span
                    className={cn(
                      'text-[10px] tabular-nums',
                      done
                        ? 'font-semibold text-primary'
                        : active
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                    )}
                  >
                    {stage.label}
                  </span>
                  {/* Hover tooltip (CSS-only, 작은 카드) */}
                  <div className="pointer-events-none absolute top-full left-1/2 z-30 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[10px] text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                    <div className="font-medium">
                      {stage.label} · {stage.pct}%
                    </div>
                    {STAGE_TOOLTIP[stage.key] && (
                      <div className="mt-0.5 text-muted-foreground">
                        {STAGE_TOOLTIP[stage.key]}
                      </div>
                    )}
                  </div>
                </div>
                {i < progress.stages.length - 1 && (
                  <div
                    className={cn(
                      'h-px flex-1 transition-all',
                      done ? 'bg-primary' : 'bg-muted',
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* 전체 % */}
        <div className="text-right">
          <div className="text-xs text-muted-foreground">전체</div>
          <div className="text-base font-bold tabular-nums text-primary">
            {progress.overall}%
          </div>
        </div>

        {/* 자동 저장 상태 */}
        <div className="ml-3 flex w-24 items-center gap-1.5 text-xs">
          {autosaveStatus === 'saving' && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">저장 중</span>
            </>
          )}
          {autosaveStatus === 'saved' && (
            <>
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              <span className="text-muted-foreground">저장됨</span>
            </>
          )}
          {autosaveStatus === 'error' && (
            <>
              <AlertCircle className="h-3 w-3 text-red-600" />
              <span className="text-red-600">저장 실패</span>
            </>
          )}
          {autosaveStatus === 'idle' && (
            <span className="text-muted-foreground">자동 저장</span>
          )}
        </div>

        {/* 1차본 승인 */}
        {isCompleted ? (
          <div className="rounded-md bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
            1차본 완성 ✓
          </div>
        ) : (
          <Button
            size="sm"
            onClick={onSubmitDraft}
            disabled={submitting || progress.overall < 60}
            className="ml-2"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                승인 중
              </>
            ) : (
              '1차본 승인'
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

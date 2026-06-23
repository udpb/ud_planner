'use client'

/**
 * WorkspacePipeline — 상단 고정 파이프라인 스텝퍼 (BR-WS-5)
 *
 * 5단계 가로 스텝퍼. 안 바뀌는 고정 흐름:
 *   RFP 분석 → 프로그램 기획 → 코치 매칭 → 예산 자동화 → SROI 예측
 *
 * - 현재 단계 = accent(#F05519) 강조.
 * - 완료 단계 = success 체크(done flag, server 판정).
 * - 클릭 → onSelect(stageId) 로 우 캔버스만 전환(대화는 이어짐).
 * - overflow-x auto (좁은 폭 가로 스크롤).
 *
 * 디자인킷 260529: radius 0, accent 1개, NanumHuman/Poppins. 점수판·게이트 없음.
 * 단계 컴포넌트 내부 무변경 — 이건 순수 네비게이션 띠.
 */

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  WORKSPACE_STAGE_IDS,
  WORKSPACE_STAGE_LABELS,
  type WorkspaceStageId,
} from './workspace-stages'

interface Props {
  currentStage: WorkspaceStageId
  doneFlags: Record<WorkspaceStageId, boolean>
  onSelect: (stageId: WorkspaceStageId) => void
}

export function WorkspacePipeline({ currentStage, doneFlags, onSelect }: Props) {
  return (
    <nav
      aria-label="파이프라인 단계"
      className="shrink-0 overflow-x-auto border-b bg-background"
    >
      <ol className="flex min-w-max items-stretch">
        {WORKSPACE_STAGE_IDS.map((id, idx) => {
          const active = id === currentStage
          const done = doneFlags[id]
          const label = WORKSPACE_STAGE_LABELS[id]
          const isLast = idx === WORKSPACE_STAGE_IDS.length - 1

          return (
            <li key={id} className="flex items-center">
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={active ? 'step' : undefined}
                data-stage-id={id}
                data-stage-active={active ? 'true' : 'false'}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-3 text-left transition-colors',
                  'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  active && 'bg-muted/40',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center text-xs font-bold',
                    done
                      ? 'bg-green-500 text-white'
                      : active
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-muted text-muted-foreground',
                  )}
                  aria-hidden
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap text-sm font-semibold',
                    active
                      ? 'text-brand'
                      : done
                        ? 'text-foreground'
                        : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </button>

              {!isLast && (
                <span
                  aria-hidden
                  className="h-px w-6 shrink-0 bg-border"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

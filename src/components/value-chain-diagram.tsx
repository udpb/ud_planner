/**
 * ValueChainDiagram — Impact Value Chain 5단계 가로 플로우 + 루프 화살표
 *
 * 근거: ADR-008 · docs/architecture/value-chain.md
 *
 * pm-guide 우측 패널 상단에 상시 고정되어 PM 이 항상 "지금 어느 단계에 있는지"
 * 가시적으로 인지하도록 한다.
 *
 * 렌더 규칙:
 *   - 5단계 가로 박스 플로우 (① Impact → ② Input → ③ Output → ④ Activity → ⑤ Outcome)
 *   - 현재 활성 단계: Action Orange 배경 + 굵은 텍스트
 *   - 완료된 단계: 체크 아이콘 + 소프트 컬러
 *   - 미완료 단계: 연한 회색
 *   - 루프 화살표 (⑤ → ①):
 *       hasSroi=false → 점선 (아직 수렴 안 됨)
 *       hasSroi=true  → 실선 Action Orange (수렴 완료, 얼라인 체크 대상)
 *
 * Server Component (상태 없음).
 */

import { Check } from 'lucide-react'
import {
  VALUE_CHAIN_STAGES_ORDERED,
  type ValueChainStage,
} from '@/lib/value-chain'
import { cn } from '@/lib/utils'

export interface ValueChainDiagramProps {
  /** 현재 활성 단계 — 하이라이트 */
  currentStage: ValueChainStage
  /** 이미 완료된 단계들 — 체크 아이콘 */
  completedStages: ValueChainStage[]
  /**
   * SROI 숫자가 있는가 — 루프 화살표 스타일 결정.
   * false: 점선 (아직 루프 수렴 전), true: 실선 (⑤ Outcome 수렴 완료)
   */
  hasSroi: boolean
  /** 추가 클래스 */
  className?: string
}

export function ValueChainDiagram({
  currentStage,
  completedStages,
  hasSroi,
  className,
}: ValueChainDiagramProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-border bg-background p-3',
        className,
      )}
      aria-label="Impact Value Chain 5단계 진행 상태"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Impact Value Chain
        </p>
        {hasSroi && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
            SROI 수렴 · 루프 활성
          </span>
        )}
      </div>

      {/* 5단계 가로 플로우 */}
      <div className="flex items-stretch gap-0.5">
        {VALUE_CHAIN_STAGES_ORDERED.map((spec, idx) => {
          const isCurrent = spec.key === currentStage
          const isCompleted = completedStages.includes(spec.key)
          const isLast = idx === VALUE_CHAIN_STAGES_ORDERED.length - 1

          return (
            <div key={spec.key} className="flex flex-1 items-stretch">
              <StageBox
                stage={spec.key}
                order={spec.order}
                koLabel={spec.koLabel}
                colorHex={spec.colorHex}
                isCurrent={isCurrent}
                isCompleted={isCompleted}
              />
              {!isLast && <FlowArrow active={isCompleted} />}
            </div>
          )
        })}
      </div>

      {/* 루프 화살표 ⑤ → ① */}
      <div className="mt-2 flex items-center gap-1.5">
        <div
          className={cn(
            'h-px flex-1',
            hasSroi
              ? 'bg-primary'
              : 'bg-[repeating-linear-gradient(to_right,theme(colors.muted-foreground)_0_4px,transparent_4px_8px)]',
          )}
        />
        <span
          className={cn(
            'text-[9px] font-medium',
            hasSroi ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          루프: ⑤ → ①·②·④ 얼라인
        </span>
        <div
          className={cn(
            'h-px flex-1',
            hasSroi
              ? 'bg-primary'
              : 'bg-[repeating-linear-gradient(to_right,theme(colors.muted-foreground)_0_4px,transparent_4px_8px)]',
          )}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 단일 단계 박스
// ─────────────────────────────────────────

interface StageBoxProps {
  stage: ValueChainStage
  order: number
  koLabel: string
  colorHex: string
  isCurrent: boolean
  isCompleted: boolean
}

function StageBox({
  order,
  koLabel,
  colorHex,
  isCurrent,
  isCompleted,
}: StageBoxProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center justify-center rounded px-1 py-1.5 transition-colors',
        isCurrent && 'ring-2 ring-offset-0',
      )}
      style={
        isCurrent
          ? {
              backgroundColor: colorHex,
              color: '#FFFFFF',
              // ring 색상
              boxShadow: `0 0 0 2px ${colorHex}33`,
            }
          : isCompleted
            ? {
                backgroundColor: `${colorHex}18`,
                color: colorHex,
                borderLeft: `2px solid ${colorHex}`,
              }
            : {
                backgroundColor: 'transparent',
                color: '#999',
              }
      }
    >
      <div className="flex items-center gap-0.5">
        <span
          className={cn(
            'text-[10px] font-bold tabular-nums',
            isCurrent && 'text-white',
          )}
        >
          {orderToCircled(order)}
        </span>
        {isCompleted && !isCurrent && (
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        )}
      </div>
      <span
        className={cn(
          'truncate text-[9px] font-medium leading-tight',
          isCurrent && 'font-semibold',
        )}
      >
        {koLabel}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────
// 플로우 화살표
// ─────────────────────────────────────────

function FlowArrow({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center px-0.5',
        active ? 'text-primary' : 'text-muted-foreground/40',
      )}
      aria-hidden
    >
      <span className="text-[10px]">→</span>
    </div>
  )
}

// ─────────────────────────────────────────
// ① ~ ⑤ 유니코드 변환
// ─────────────────────────────────────────

function orderToCircled(order: number): string {
  const map: Record<number, string> = {
    1: '①',
    2: '②',
    3: '③',
    4: '④',
    5: '⑤',
  }
  return map[order] ?? String(order)
}

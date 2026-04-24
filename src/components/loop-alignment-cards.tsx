/**
 * LoopAlignmentCards — SROI 축 3방향 얼라인 결과 카드 (ADR-008 Phase F Wave 7)
 *
 * 근거: docs/architecture/value-chain.md ("UI 통합 · 루프 Alignment Check 카드 3개")
 *
 * SROI 숫자가 확정된 시점에 ⑤ Outcome 을 축으로 한 3방향 얼라인 체크 결과
 * (⑤→① Impact · ⑤→② Input · ⑤→④ Activity) 를 각각 카드로 렌더.
 * mismatch · warn 일 때는 해당 UI 스텝으로 복귀하는 CTA 를 제공 (블록하지 않음).
 *
 * 상태 없는 View 컴포넌트 (use client 지시어 없음).
 * step-impact.tsx 가 client 이지만 이 컴포넌트는 내부 상태·이벤트 없이
 * props 만 렌더하므로 client 번들에 함께 실려도 동작한다.
 */

import Link from 'next/link'
import {
  VALUE_CHAIN_STAGES,
  type LoopAlignmentChecks,
  type AlignmentCheck,
  type AlignmentStatus,
} from '@/lib/value-chain'
import { cn } from '@/lib/utils'

export interface LoopAlignmentCardsProps {
  checks: LoopAlignmentChecks
  /** 복귀 CTA 링크를 만들 때 사용. 없으면 CTA 버튼 숨김. */
  projectId?: string
  /** 추가 클래스 */
  className?: string
}

// ─── 상태별 뱃지 · 보더 · 배경 ────────────────────────────

const STATUS_ICON: Record<AlignmentStatus, string> = {
  ok: '✓',
  warn: '⚠️',
  mismatch: '🔴',
}

const STATUS_LABEL: Record<AlignmentStatus, string> = {
  ok: '얼라인',
  warn: '경계',
  mismatch: '불일치',
}

const STATUS_CARD_CLASS: Record<AlignmentStatus, string> = {
  ok: 'border-emerald-200 bg-emerald-50/40',
  warn: 'border-amber-300 bg-amber-50/50',
  mismatch: 'border-rose-300 bg-rose-50/60',
}

const STATUS_BADGE_CLASS: Record<AlignmentStatus, string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-800',
  mismatch: 'bg-rose-100 text-rose-800',
}

// ═════════════════════════════════════════════════════════════
// 진입 컴포넌트
// ═════════════════════════════════════════════════════════════

export function LoopAlignmentCards({
  checks,
  projectId,
  className,
}: LoopAlignmentCardsProps) {
  const { sroiRatio, impactDirection, inputDirection, activityDirection, overallStatus } =
    checks

  const ratioStr = Number.isFinite(sroiRatio)
    ? sroiRatio.toFixed(2).replace(/\.?0+$/, '') || '0'
    : '—'

  return (
    <section
      className={cn('space-y-3 rounded-lg border border-border bg-background p-4', className)}
      aria-label="SROI 루프 얼라인 체크"
    >
      {/* 섹션 헤더 */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">
          🔄 루프 얼라인 체크 — SROI 1:{ratioStr} 축으로 ①·②·④ 확인
        </h4>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            STATUS_BADGE_CLASS[overallStatus],
          )}
        >
          전체 {STATUS_LABEL[overallStatus]}
        </span>
      </header>

      {/* 전체 OK 안내 */}
      {overallStatus === 'ok' && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          ✓ 모든 방향 얼라인 완료 — Impact · Input · Activity 가 SROI 축과 정합적입니다.
        </p>
      )}

      {/* 3방향 카드 */}
      <div className="flex flex-col gap-2">
        <DirectionCard check={impactDirection} projectId={projectId} />
        <DirectionCard check={inputDirection} projectId={projectId} />
        <DirectionCard check={activityDirection} projectId={projectId} />
      </div>
    </section>
  )
}

// ═════════════════════════════════════════════════════════════
// 단일 방향 카드
// ═════════════════════════════════════════════════════════════

interface DirectionCardProps {
  check: AlignmentCheck
  projectId?: string
}

function DirectionCard({ check, projectId }: DirectionCardProps) {
  const { targetStage, status, signal, fixHint, returnTo } = check
  const stageSpec = VALUE_CHAIN_STAGES[targetStage]
  const showCta = status !== 'ok' && projectId

  return (
    <article
      className={cn(
        'flex items-stretch gap-3 rounded-md border p-3',
        STATUS_CARD_CLASS[status],
      )}
    >
      {/* 좌측: 방향 뱃지 */}
      <div
        className="flex w-24 shrink-0 flex-col items-center justify-center rounded px-2 py-1.5 text-center"
        style={{
          backgroundColor: `${stageSpec.colorHex}1A`, // 10% opacity
          borderLeft: `3px solid ${stageSpec.colorHex}`,
        }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: stageSpec.colorHex }}
        >
          ⑤ → {stageSpec.numberedLabel}
        </span>
        <span className="mt-0.5 text-[10px] text-muted-foreground">{stageSpec.koLabel}</span>
      </div>

      {/* 우측: 본문 */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none" aria-hidden>
            {STATUS_ICON[status]}
          </span>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              STATUS_BADGE_CLASS[status],
            )}
          >
            {STATUS_LABEL[status]}
          </span>
          <span className="truncate text-xs font-medium text-foreground">{signal}</span>
        </div>

        {status !== 'ok' && fixHint && (
          <p className="text-[11px] text-muted-foreground">힌트: {fixHint}</p>
        )}

        {showCta && (
          <div className="mt-1">
            <Link
              href={`/projects/${projectId}?step=${returnTo}`}
              className="inline-flex items-center gap-1 rounded border border-foreground/20 bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-foreground/5"
            >
              Step {returnTo} 로 돌아가기 →
            </Link>
          </div>
        )}
      </div>
    </article>
  )
}

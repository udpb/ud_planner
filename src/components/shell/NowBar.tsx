'use client'
/**
 * NowBar — UX v2 (ADR-018)
 *
 * 64px sticky bottom. 단일 다음 액션 CTA. Stage 전환의 단일 진실.
 *
 * 영역:
 *   좌: 💡 다음 액션 설명 + Stage 컨텍스트
 *   우: Primary CTA (큰 버튼) + (옵션) Secondary action
 *
 * Stage 자동 전환: 이 NowBar 의 CTA 가 stage 완료 → 다음 stage 로 전환.
 */

import { ArrowRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface NowBarAction {
  label: string
  onClick?: () => void
  href?: string
  variant?: 'primary' | 'secondary'
  icon?: React.ReactNode
  /** ETA 예: "~30초" */
  eta?: string
  disabled?: boolean
}

export interface NowBarProps {
  /** 컨텍스트 라벨 — "S2 1차본 작성 중" 등 */
  context?: string
  /** 메인 문구 — "다음: Before/After 채우기" 등 */
  message: string
  /** 1~2 액션 */
  actions: NowBarAction[]
  /** 좌측 보조 메시지 (옵션) — 진행률 등 */
  hint?: string
}

export function NowBar({ context, message, actions, hint }: NowBarProps) {
  return (
    <div className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4">
        {/* 좌측 — 컨텍스트 + 메시지 */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            {context && (
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {context}
              </div>
            )}
            <div className="truncate text-sm font-medium text-foreground">{message}</div>
            {hint && (
              <div className="truncate text-[10px] text-muted-foreground">{hint}</div>
            )}
          </div>
        </div>

        {/* 우측 — 액션 1~2개 */}
        <div className="flex shrink-0 items-center gap-2">
          {actions.map((a, i) => (
            <ActionButton key={i} action={a} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ActionButton({ action }: { action: NowBarAction }) {
  const isPrimary = action.variant !== 'secondary'
  const baseClass = cn(
    'inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
    isPrimary
      ? 'bg-primary text-white hover:bg-primary/90 shadow-sm'
      : 'border bg-card text-foreground hover:bg-muted',
  )
  const content = (
    <>
      {action.icon}
      <span>{action.label}</span>
      {action.eta && (
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[9px] font-normal',
            isPrimary ? 'bg-white/20' : 'bg-muted',
          )}
        >
          {action.eta}
        </span>
      )}
      {isPrimary && <ArrowRight className="h-3.5 w-3.5" />}
    </>
  )
  if (action.href) {
    return (
      <a href={action.href} className={baseClass}>
        {content}
      </a>
    )
  }
  return (
    <button onClick={action.onClick} disabled={action.disabled} className={baseClass}>
      {content}
    </button>
  )
}

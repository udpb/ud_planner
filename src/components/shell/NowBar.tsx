'use client'
/**
 * NowBar — UX v2 (ADR-018 · mockup _shared.css 1:1)
 *
 * 72px sticky bottom · 다크 charcoal · border-top 3px orange.
 *
 * 영역:
 *   좌: orange icon-box (40×40) + 컨텍스트 라벨 + 메시지 + hint
 *   우: primary button (sharp · big orange shadow) + (옵션) ghost light
 *
 * Mockup 참조: /public/mockups/v2/_shared.css `.nowbar`
 */

export interface NowBarAction {
  label: string
  onClick?: () => void
  href?: string
  variant?: 'primary' | 'secondary'
  /** ETA 라벨 — "~30초" 등 */
  eta?: string
  disabled?: boolean
}

export interface NowBarProps {
  /** UPPERCASE 컨텍스트 — "Next · Stage 01" 등 */
  context?: string
  /** 메인 문구 */
  message: string
  /** 보조 hint */
  hint?: string
  /** 1~2 액션 */
  actions: NowBarAction[]
}

export function NowBar({ context, message, hint, actions }: NowBarProps) {
  return (
    <div
      className="sticky bottom-0 z-30 flex h-[72px] items-center gap-5 px-8 text-white"
      style={{
        background: 'var(--dark-charcoal)',
        borderTop: '3px solid var(--action-orange)',
      }}
    >
      {/* icon box (orange · sharp · 40×40) */}
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center text-white"
        style={{ background: 'var(--primary-orange)' }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* 좌측 text block */}
      <div className="min-w-0 flex-1">
        {context && (
          <div
            className="text-[9px] font-semibold uppercase tracking-[1.5px]"
            style={{ color: 'var(--action-orange)' }}
          >
            {context}
          </div>
        )}
        <div className="mt-0.5 truncate text-[15px] font-semibold tracking-[-0.2px] text-white">
          {message}
        </div>
        {hint && (
          <div
            className="mt-0.5 truncate text-[11px]"
            style={{ color: 'var(--warm-gray)' }}
          >
            {hint}
          </div>
        )}
      </div>

      {/* 우측 actions */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {actions.map((a, i) => (
          <ActionButton key={i} action={a} />
        ))}
      </div>
    </div>
  )
}

function ActionButton({ action }: { action: NowBarAction }) {
  const isPrimary = action.variant !== 'secondary'
  const isDisabled = action.disabled

  // primary 스타일 (mockup .btn-primary)
  const primaryStyle: React.CSSProperties = isDisabled
    ? {
        background: 'transparent',
        color: 'var(--warm-gray)',
        border: '1px solid rgba(216,212,215,.35)',
        boxShadow: 'none',
      }
    : {
        background: 'var(--primary-orange)',
        color: '#ffffff',
        boxShadow: '0 4px 12px rgba(232,84,26,.25)',
      }

  // secondary (.btn-ghost-light)
  const secondaryStyle: React.CSSProperties = {
    background: 'transparent',
    color: 'var(--warm-gray)',
    border: '1px solid rgba(255,255,255,.15)',
  }

  const content = (
    <>
      <span className="text-[13px] font-semibold tracking-[0.3px]">{action.label}</span>
      {action.eta && (
        <span
          className="px-[7px] py-[3px] text-[10px] font-medium tracking-[0.5px]"
          style={{
            background: isPrimary && !isDisabled ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.05)',
          }}
        >
          {action.eta}
        </span>
      )}
      {isPrimary && !isDisabled && <span className="text-[16px] leading-none">→</span>}
    </>
  )

  const cls = isDisabled
    ? 'cursor-not-allowed'
    : 'transition-all duration-200 hover:-translate-y-0.5'

  if (action.href && !isDisabled) {
    return (
      <a
        href={action.href}
        className={`inline-flex h-11 items-center gap-2.5 px-[22px] ${cls}`}
        style={isPrimary ? primaryStyle : secondaryStyle}
      >
        {content}
      </a>
    )
  }

  return (
    <button
      onClick={action.onClick}
      disabled={isDisabled}
      className={`inline-flex h-11 items-center gap-2.5 px-[22px] ${cls}`}
      style={isPrimary ? primaryStyle : secondaryStyle}
    >
      {content}
    </button>
  )
}

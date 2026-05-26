'use client'
/**
 * SubHeader — UX v2 (ADR-018 · mockup _shared.css 1:1)
 *
 * 사업 메타 영역 (TopBar 하단 · 카운터 캔버스 위). White bg.
 *
 * 레이아웃:
 *   상단: eyebrow (orange dot + UPPERCASE) + big title + secondary buttons
 *   하단: meta-pill row (B2G badge · 발주처 · 예산 · 평가배점 · 진행도)
 *
 * Mockup 참조: /public/mockups/v2/_shared.css `.subheader` ~ `.badge-channel`
 */

import Link from 'next/link'

export interface SubHeaderMeta {
  channel?: 'B2G' | 'B2B' | 'B2C' | string | null
  client?: string | null
  /** 원 단위 — 억 표시 자동 */
  totalBudget?: number | null
  evalCount?: number | null
  /** 0~100 */
  progressPct?: number
}

export interface SubHeaderProps {
  /** UPPERCASE eyebrow — "Project · In Progress" 등 */
  status?: string
  /** big title */
  title: string
  meta?: SubHeaderMeta
  /** v1 화면 링크 (옵션) */
  v1Href?: string
  onEdit?: () => void
}

export function SubHeader({
  status = 'Project · In Progress',
  title,
  meta,
  v1Href,
  onEdit,
}: SubHeaderProps) {
  return (
    <div
      className="bg-white px-8 pb-[18px] pt-[22px]"
      style={{ borderBottom: '1px solid var(--hairline, #f0ede8)' }}
    >
      {/* 상단 */}
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div
            className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px]"
            style={{ color: 'var(--primary-orange)' }}
          >
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: 'var(--primary-orange)' }}
            />
            {status}
          </div>
          <h1
            className="max-w-[760px] text-[22px] font-bold leading-[1.25] tracking-[-0.5px]"
            style={{ color: 'var(--dark-charcoal)' }}
          >
            {title}
          </h1>
        </div>
        <div className="flex flex-shrink-0 gap-1.5">
          {onEdit && (
            <button
              onClick={onEdit}
              className="h-[34px] bg-white px-3.5 text-[12px] font-semibold uppercase tracking-[0.2px] transition-colors"
              style={{
                color: 'var(--body-text, #333)',
                border: '1px solid var(--hairline-strong, #e4dfd6)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary-orange)'
                e.currentTarget.style.color = 'var(--primary-orange)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--hairline-strong, #e4dfd6)'
                e.currentTarget.style.color = 'var(--body-text, #333)'
              }}
            >
              편집
            </button>
          )}
          {v1Href && (
            <Link
              href={v1Href}
              className="inline-flex h-[34px] items-center bg-white px-3.5 text-[12px] font-semibold uppercase tracking-[0.2px] transition-colors"
              style={{
                color: 'var(--body-text, #333)',
                border: '1px solid var(--hairline-strong, #e4dfd6)',
              }}
            >
              v1 화면
            </Link>
          )}
        </div>
      </div>

      {/* 하단 meta-pill row */}
      {meta && (
        <div
          className="flex flex-wrap items-center pt-3"
          style={{ borderTop: '1px solid var(--hairline, #f0ede8)' }}
        >
          {meta.channel && (
            <MetaPill first>
              <span
                className="inline-flex h-[22px] items-center px-2.5 text-[10px] font-bold uppercase tracking-[1.5px]"
                style={{
                  color: 'var(--primary-orange)',
                  border: '1px solid rgba(232,84,26,.3)',
                  background: 'rgba(232,84,26,.06)',
                }}
              >
                {meta.channel}
              </span>
            </MetaPill>
          )}
          {meta.client && (
            <MetaPill label="발주처" value={meta.client} />
          )}
          {meta.totalBudget != null && (
            <MetaPill
              label="예산"
              value={`${(meta.totalBudget / 1e8).toFixed(2)}억`}
              big
              accent
            />
          )}
          {meta.evalCount != null && (
            <MetaPill label="평가배점" value={`${meta.evalCount}개`} />
          )}
          {meta.progressPct != null && (
            <MetaPill label="진행도" value={`${Math.round(meta.progressPct)}%`} />
          )}
        </div>
      )}
    </div>
  )
}

function MetaPill({
  label,
  value,
  big,
  accent,
  first,
  children,
}: {
  label?: string
  value?: string
  big?: boolean
  accent?: boolean
  first?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className="flex h-6 items-center gap-1.5 text-[12px]"
      style={{
        padding: first ? '0 16px 0 0' : '0 16px',
        color: 'var(--subtitle-text)',
        borderRight: '1px solid var(--hairline, #f0ede8)',
      }}
    >
      {children}
      {label && (
        <span
          className="text-[9px] font-semibold uppercase tracking-[1px]"
          style={{ color: 'var(--subtitle-text)' }}
        >
          {label}
        </span>
      )}
      {value && (
        <span
          className="font-semibold"
          style={{
            color: accent ? 'var(--primary-orange)' : 'var(--body-text)',
            fontSize: big ? '14px' : '12px',
          }}
        >
          {value}
        </span>
      )}
    </div>
  )
}

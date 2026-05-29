'use client'
/**
 * SlideShell — 16:9 슬라이드 컨테이너 (Phase M2)
 *
 * 모든 슬라이드 변형이 이 shell 안에 들어간다.
 * head (로고 + page number) · main (children) · foot (페이지 카운터)
 *
 * 디자인 시스템:
 *   - 16:9 aspect ratio (.ud-slide-canvas)
 *   - density-standard 기본 (5-7 sections 페이지)
 *   - 로고 1개 자동 배치 (Design Principle 13)
 *   - paper 배경 (60%+ 면적)
 */

import { cn } from '@/lib/utils'

interface Props {
  /** 좌상단 kicker 라벨 (예: "01 제안 배경 및 목적") */
  kicker?: string
  /** 페이지 번호 (1부터) */
  pageNumber?: number
  /** 전체 페이지 수 */
  totalPages?: number
  /** density tier */
  density?: 'sparse' | 'standard' | 'dense'
  /** 작은 미리보기 (사이드바·preview 카드) — 폰트 축소 */
  scalePreview?: boolean
  /** 표지 / section-divider 같은 variant */
  variant?: 'normal' | 'cover' | 'section-divider'
  /** 다크 배경 전환 (한 산출물 1회만 권장) */
  dark?: boolean
  /** 로고 종류 */
  logoColor?: 'black' | 'white'
  className?: string
  children: React.ReactNode
}

export function SlideShell({
  kicker,
  pageNumber,
  totalPages,
  density = 'standard',
  scalePreview = false,
  variant = 'normal',
  dark = false,
  logoColor,
  className,
  children,
}: Props) {
  const resolvedLogoColor = logoColor ?? (dark || variant === 'section-divider' ? 'white' : 'black')
  return (
    <div
      className={cn(
        'ud-slide-canvas',
        density === 'sparse' && 'density-sparse',
        density === 'dense' && 'density-dense',
        scalePreview && 'scale-preview',
        variant === 'cover' && 'ud-cover',
        variant === 'section-divider' && 'ud-section-divider',
        className,
      )}
    >
      <div className="ud-slide-inner">
        {kicker || pageNumber !== undefined ? (
          <header className="ud-page-head">
            {kicker ? <span className="ud-kicker">{kicker}</span> : <span />}
            <img
              src={`/design-kit/logo/underdogs-wordmark-${resolvedLogoColor}.svg`}
              alt="Underdogs"
              className="ud-logo"
            />
          </header>
        ) : null}

        <main style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ud-gap-section)', flex: 1 }}>
          {children}
        </main>

        {pageNumber !== undefined ? (
          <footer className="ud-page-foot">
            <span className="ud-page-num en">
              {pageNumber}
              {totalPages ? ` / ${totalPages}` : ''}
            </span>
            {/* foot 로고는 head 가 없을 때만 */}
            {!kicker && (
              <img
                src={`/design-kit/logo/underdogs-symbol-${resolvedLogoColor}.svg`}
                alt="Underdogs"
                className="ud-logo"
                style={{ height: 16 }}
              />
            )}
          </footer>
        ) : null}
      </div>
    </div>
  )
}

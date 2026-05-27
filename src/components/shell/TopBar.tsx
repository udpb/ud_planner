'use client'
/**
 * TopBar — UX v2 (ADR-018 Adaptive Stage Layout · mockup _shared.css 1:1)
 *
 * 56px sticky top · 다크 charcoal · italic brand · stage-journey 내장.
 *
 * 영역:
 *   좌: italic logo + v2 badge + 프로젝트 switcher
 *   중: stage-journey 5 chip (flex 균등 분할 · is-active border-bottom orange)
 *   우: Brain 토글 + 아바타
 *
 * Mockup 참조: /public/mockups/v2/_shared.css `.topbar` ~ `.stage-step`
 */

import Link from 'next/link'

export type StageId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5'
export type StageStatus = 'done' | 'active' | 'pending'

const STAGE_NAME: Record<StageId, string> = {
  S1: 'RFP 분석',
  S2: '1차본',
  S3: '검수',
  S4: '정밀',
  S5: '승인',
}

export interface TopBarProps {
  projectName: string
  projectSwitchHref?: string
  /** 5 stage 의 상태 — 항상 5개 길이 */
  stages: { id: StageId; status: StageStatus }[]
  brainOpen?: boolean
  onBrainToggle?: () => void
  onStageClick?: (id: StageId) => void
  userInitials?: string
}

export function TopBar({
  projectName,
  projectSwitchHref,
  stages,
  brainOpen,
  onBrainToggle,
  onStageClick,
  userInitials = 'PM',
}: TopBarProps) {
  return (
    <header
      className="sticky top-0 z-30 flex h-12 items-center gap-5 px-8 text-white"
      style={{
        background: 'var(--dark-charcoal)',
        borderBottom: '1px solid rgba(255,255,255,.08)',
      }}
    >
      {/* 좌: italic logo */}
      <Link
        href="/"
        className="text-base font-bold italic tracking-tight text-white"
      >
        UD·Planner
      </Link>

      {/* v2 badge */}
      <span
        className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1.3px]"
        style={{
          color: 'var(--action-orange)',
          border: '1px solid rgba(255,130,4,.4)',
        }}
      >
        v2
      </span>

      {/* 프로젝트 switcher */}
      {projectSwitchHref ? (
        <Link
          href={projectSwitchHref}
          className="flex max-w-[280px] items-center gap-1 truncate px-2 py-1 text-[13px] font-medium text-white/85 transition-colors hover:text-[var(--action-orange)]"
        >
          <span className="truncate">← {projectName}</span>
          <span className="ml-0.5 text-[10px] opacity-55">▾</span>
        </Link>
      ) : (
        <span className="max-w-[280px] truncate text-[13px] font-medium text-white/85">
          {projectName}
        </span>
      )}

      {/* 중: stage-journey 5 chip */}
      <nav className="flex h-full flex-1 items-stretch">
        {stages.map((s) => (
          <StageStep
            key={s.id}
            id={s.id}
            status={s.status}
            isLast={s.id === 'S5'}
            onClick={() => onStageClick?.(s.id)}
          />
        ))}
      </nav>

      {/* 우: Brain + avatar */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBrainToggle}
          className="inline-flex h-8 items-center gap-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.5px] transition-colors"
          style={{
            color: brainOpen ? 'var(--dark-charcoal)' : 'var(--action-orange)',
            background: brainOpen ? 'var(--action-orange)' : 'transparent',
            border: `1px solid ${brainOpen ? 'var(--action-orange)' : 'rgba(255,130,4,.4)'}`,
          }}
          title="Brain — 자산 매칭 · 유사 사업 · AI 채팅"
        >
          🧠 Brain
        </button>
        <div
          className="flex h-8 w-8 items-center justify-center text-[11px] font-bold tracking-[0.5px] text-white"
          style={{ background: 'rgba(255,255,255,.08)' }}
          title={userInitials}
        >
          {userInitials}
        </div>
      </div>
    </header>
  )
}

function StageStep({
  id,
  status,
  isLast,
  onClick,
}: {
  id: StageId
  status: StageStatus
  isLast: boolean
  onClick?: () => void
}) {
  const idNum = id.replace('S', '0')

  // 상태별 스타일 (mockup _shared.css 정확 일치)
  const isActive = status === 'active'
  const isDone = status === 'done'
  const isPending = status === 'pending'

  const bg = isActive
    ? 'rgba(232,84,26,.12)'
    : isDone
      ? 'rgba(46,204,113,.08)'
      : 'transparent'
  const idColor = isActive
    ? 'var(--action-orange)'
    : isDone
      ? 'var(--green)'
      : 'rgba(255,255,255,.55)'
  const nameColor = isActive
    ? '#ffffff'
    : isDone
      ? 'rgba(255,255,255,.65)'
      : 'rgba(255,255,255,.55)'
  const borderBottom = isActive
    ? '3px solid var(--primary-orange)'
    : '3px solid transparent'
  // pending stage 도 preview 가능 — opacity 만 낮추고 클릭은 허용
  const opacity = isPending ? 0.55 : 1

  return (
    <button
      onClick={onClick}
      className="relative flex flex-1 flex-col justify-center px-3 text-left transition-colors"
      style={{
        background: bg,
        borderBottom,
        cursor: 'pointer',
        opacity,
      }}
    >
      <div
        className="mb-0.5 text-[9px] font-semibold uppercase tracking-[1.2px]"
        style={{ color: idColor }}
      >
        Stage {idNum}
        {isDone && ' ✓'}
      </div>
      <div
        className="text-[12px] font-semibold tracking-[-0.1px]"
        style={{ color: nameColor }}
      >
        {STAGE_NAME[id]}
      </div>
      {!isLast && (
        <span
          className="absolute right-[-6px] top-1/2 -translate-y-1/2 text-[11px]"
          style={{ color: 'rgba(255,255,255,.18)' }}
        >
          →
        </span>
      )}
    </button>
  )
}

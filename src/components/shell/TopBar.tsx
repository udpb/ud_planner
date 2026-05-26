'use client'
/**
 * TopBar — UX v2 (ADR-018 Adaptive Stage Layout)
 *
 * 44px sticky top. 단일 진행도 SSoT.
 *
 * 영역:
 *   좌: 로고 + 프로젝트 switcher (드롭다운)
 *   중: Stage chips (S1~S5) + 전체 진행도 bar
 *   우: 🧠 Brain toggle + 사용자 프로필
 */

import Link from 'next/link'
import { Brain, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StageId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5'
export type StageStatus = 'done' | 'active' | 'pending'

const STAGE_LABEL: Record<StageId, string> = {
  S1: 'RFP',
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
  /** 0~100 */
  progressPct: number
  brainOpen?: boolean
  onBrainToggle?: () => void
  userInitials?: string
}

export function TopBar({
  projectName,
  projectSwitchHref,
  stages,
  progressPct,
  brainOpen,
  onBrainToggle,
  userInitials = 'PM',
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-11 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur">
      {/* 좌: 로고 + 프로젝트 switcher */}
      <Link href="/" className="text-sm font-semibold tracking-tight">
        UD·Ops
      </Link>
      {projectSwitchHref ? (
        <Link
          href={projectSwitchHref}
          className="group flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <span className="truncate max-w-[260px]">{projectName}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
        </Link>
      ) : (
        <span className="truncate max-w-[260px] text-sm font-medium">{projectName}</span>
      )}

      {/* 중: Stage chips + progress bar */}
      <div className="ml-4 flex flex-1 items-center gap-3">
        <div className="flex items-center gap-1">
          {stages.map((s) => (
            <StageChip key={s.id} id={s.id} status={s.status} />
          ))}
        </div>
        <div className="hidden flex-1 items-center gap-2 md:flex">
          <div className="relative h-1.5 flex-1 max-w-[200px] overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
            />
          </div>
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {Math.round(progressPct)}%
          </span>
        </div>
      </div>

      {/* 우: Brain toggle + 사용자 */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBrainToggle}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition',
            brainOpen
              ? 'border-purple-400 bg-purple-500/10 text-purple-700'
              : 'border-purple-300/40 bg-purple-500/5 text-purple-700 hover:bg-purple-500/10',
          )}
          title="Brain 4+1 — 자산 매칭 · 유사 사업 · AI 채팅"
        >
          <Brain className="h-3.5 w-3.5" />
          <span>Brain</span>
        </button>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full border bg-card text-[10px] font-semibold"
          title={userInitials}
        >
          {userInitials}
        </div>
      </div>
    </header>
  )
}

function StageChip({ id, status }: { id: StageId; status: StageStatus }) {
  const cls =
    status === 'done'
      ? 'border-green-300 bg-green-50 text-green-700'
      : status === 'active'
        ? 'border-primary/50 bg-primary/10 text-primary'
        : 'border-muted bg-muted/40 text-muted-foreground'
  const dot =
    status === 'done'
      ? 'bg-green-500'
      : status === 'active'
        ? 'bg-primary'
        : 'bg-muted-foreground/30'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        cls,
      )}
      title={`${id} · ${STAGE_LABEL[id]}`}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      <span>{id}</span>
      <span className="hidden sm:inline">{STAGE_LABEL[id]}</span>
    </span>
  )
}

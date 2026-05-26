'use client'
/**
 * StageSidebar — UX v2 (ADR-018)
 *
 * 좌 56px 슬림 사이드바. 다크 배경 (#373938 charcoal).
 *
 * 영역:
 *   - 🏠 홈 (프로젝트 목록)
 *   - S1~S5 점프 버튼 (status 표시)
 *   - 👤 사용자 메뉴 (하단)
 *
 * 점프 정책: 완료 + 현재 + 다음 stage 만 클릭 가능 (앞당기기 방지).
 */

import Link from 'next/link'
import { Home, User, Check, Circle, CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StageId, StageStatus } from './TopBar'

const STAGE_LABEL: Record<StageId, string> = {
  S1: 'RFP 분석',
  S2: '1차본 작성',
  S3: '검수',
  S4: '정밀 편집',
  S5: '최종 승인',
}

export interface StageSidebarProps {
  stages: { id: StageId; status: StageStatus }[]
  currentStage: StageId
  onStageClick?: (id: StageId) => void
  projectsHref?: string
  userMenuHref?: string
}

export function StageSidebar({
  stages,
  currentStage,
  onStageClick,
  projectsHref = '/',
  userMenuHref,
}: StageSidebarProps) {
  // 점프 가능 stage 계산
  const stageOrder: StageId[] = ['S1', 'S2', 'S3', 'S4', 'S5']
  const currentIdx = stageOrder.indexOf(currentStage)
  const isClickable = (id: StageId) => {
    const idx = stageOrder.indexOf(id)
    return idx <= currentIdx + 1 // 완료 + 현재 + 다음
  }

  return (
    <aside className="sticky top-11 flex h-[calc(100vh-2.75rem)] w-14 flex-col items-center justify-between border-r bg-[#373938] py-3 text-white">
      {/* 상단 — 홈 */}
      <div className="flex flex-col items-center gap-1">
        <Link
          href={projectsHref}
          className="flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition hover:bg-white/10 hover:text-white"
          title="프로젝트 목록"
        >
          <Home className="h-4 w-4" />
        </Link>
        <div className="my-2 h-px w-6 bg-white/15" />
        {/* Stage 5개 */}
        <div className="flex flex-col items-center gap-1.5">
          {stages.map((s) => (
            <StageButton
              key={s.id}
              id={s.id}
              status={s.status}
              isCurrent={s.id === currentStage}
              clickable={isClickable(s.id)}
              onClick={() => isClickable(s.id) && onStageClick?.(s.id)}
            />
          ))}
        </div>
      </div>

      {/* 하단 — 사용자 메뉴 */}
      {userMenuHref ? (
        <Link
          href={userMenuHref}
          className="flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition hover:bg-white/10 hover:text-white"
          title="내 메뉴"
        >
          <User className="h-4 w-4" />
        </Link>
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-md text-white/40">
          <User className="h-4 w-4" />
        </div>
      )}
    </aside>
  )
}

function StageButton({
  id,
  status,
  isCurrent,
  clickable,
  onClick,
}: {
  id: StageId
  status: StageStatus
  isCurrent: boolean
  clickable: boolean
  onClick: () => void
}) {
  const cls = cn(
    'group relative flex h-9 w-9 items-center justify-center rounded-md text-[10px] font-semibold transition',
    isCurrent
      ? 'bg-primary text-white shadow-md ring-2 ring-primary/40'
      : status === 'done'
        ? 'bg-green-600/80 text-white hover:bg-green-600'
        : clickable
          ? 'bg-white/5 text-white/70 hover:bg-white/15 hover:text-white'
          : 'bg-white/5 text-white/30 cursor-not-allowed',
  )
  const icon =
    status === 'done' ? (
      <Check className="h-3.5 w-3.5" />
    ) : isCurrent ? (
      <CircleDot className="h-3.5 w-3.5" />
    ) : (
      <Circle className="h-3.5 w-3.5" />
    )
  return (
    <button onClick={onClick} disabled={!clickable} className={cls} title={`${id} · ${STAGE_LABEL[id]}`}>
      <div className="flex flex-col items-center leading-none">
        {icon}
        <span className="mt-0.5 text-[9px]">{id}</span>
      </div>
      {/* Tooltip on hover (큰 화면용) */}
      <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] text-background opacity-0 transition group-hover:opacity-100">
        {id} · {STAGE_LABEL[id]}
      </span>
    </button>
  )
}

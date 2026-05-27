'use client'
/**
 * S4Workspace — UX v2 (ADR-018 · mockup s4.html 1:1)
 *
 * Stage 04 · 정밀 편집 · 4 tabs (Curriculum · Coaches · Budget · Proposal).
 *
 * 레이아웃:
 *   - 4 tabs (sharp · UPPERCASE · orange active border-bottom)
 *   - Layout: 1fr main + 320px right stats
 *   - Curriculum: table-like grid (60/1fr/100/160/80)
 *   - Stats column: 3 stat-card (border-top 3px orange · key-value rows)
 *
 * Wire up 상태:
 *   - Curriculum: read-only · 기존 Project.curriculum 데이터 매핑
 *   - Coaches: read-only · CoachAssignment[]
 *   - Budget: read-only · Project.budget
 *   - Proposal: read-only · ProposalSection[]
 *   - Edit 버튼: placeholder (실 구현은 후속)
 */

import { useState } from 'react'

export type S4Tab = 'curriculum' | 'coaches' | 'budget' | 'proposal'

export interface CurriculumWeek {
  week: number
  name: string
  description?: string
  type: 'theory' | 'action' | 'lecture'
  duration: string // e.g. "3h", "7d"
  instructor?: string
}

export interface CoachInfo {
  id: string
  name: string
  role: '메인' | '보조' | '특강'
  feeKrw?: number | null
  modulesAssigned?: number
}

export interface BudgetItem {
  category: string
  amountKrw: number
}

export interface ProposalSectionRef {
  num: string
  title: string
  status: 'complete' | 'pending'
}

export interface S4WorkspaceProps {
  projectId: string
  /** 12주차 — 보통 12개, 없으면 빈 배열 */
  curriculum: CurriculumWeek[]
  coaches: CoachInfo[]
  budget: {
    totalKrw: number
    items: BudgetItem[]
    marginPct?: number | null
  }
  proposal: {
    sections: ProposalSectionRef[]
  }
  onProceedToS5?: () => void
}

const TAB_INFO: Record<S4Tab, { label: string }> = {
  curriculum: { label: 'Curriculum' },
  coaches: { label: 'Coaches' },
  budget: { label: 'Budget' },
  proposal: { label: 'Proposal' },
}

export function S4Workspace({
  projectId,
  curriculum,
  coaches,
  budget,
  proposal,
}: S4WorkspaceProps) {
  const [tab, setTab] = useState<S4Tab>('curriculum')

  // tab counts
  const counts: Record<S4Tab, string> = {
    curriculum: `${curriculum.length}W`,
    coaches: String(coaches.length),
    budget: budget.marginPct != null ? `${budget.marginPct.toFixed(0)}%` : '—',
    proposal: `${proposal.sections.filter((s) => s.status === 'complete').length}/${proposal.sections.length}`,
  }

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-6">
      {/* 4 tabs */}
      <div
        className="mb-5 flex gap-0 bg-white"
        style={{ borderBottom: '1px solid var(--hairline, #f0ede8)' }}
      >
        {(Object.keys(TAB_INFO) as S4Tab[]).map((t) => (
          <TabButton
            key={t}
            active={tab === t}
            label={TAB_INFO[t].label}
            count={counts[t]}
            onClick={() => setTab(t)}
          />
        ))}
      </div>

      {/* Layout — main + stats */}
      <div
        className="grid"
        style={{ gridTemplateColumns: '1fr 280px', gap: 20 }}
      >
        {/* LEFT main */}
        <div>
          {tab === 'curriculum' && <CurriculumTab curriculum={curriculum} />}
          {tab === 'coaches' && <CoachesTab coaches={coaches} />}
          {tab === 'budget' && <BudgetTab budget={budget} />}
          {tab === 'proposal' && <ProposalTab proposal={proposal} />}
        </div>

        {/* RIGHT stats */}
        <div
          className="flex flex-col"
          style={{ gap: 2, background: 'var(--hairline, #f0ede8)' }}
        >
          <StatCard label="Curriculum">
            <StatRow label="총 회차" value={String(curriculum.length)} big />
            <StatRow
              label="총 시간"
              value={`${curriculum.reduce((sum, c) => sum + parseFloat(c.duration) || 0, 0)}h`}
            />
            <StatRow
              label="이론 · 실행"
              value={`${curriculum.filter((c) => c.type === 'theory').length} : ${curriculum.filter((c) => c.type === 'action').length}`}
              status={
                curriculum.filter((c) => c.type === 'action').length > 0
                  ? 'ok'
                  : undefined
              }
            />
            <StatRow
              label="실전 주간"
              value={
                curriculum.filter((c) => c.type === 'action').length > 0
                  ? '포함'
                  : '미포함'
              }
              status={
                curriculum.filter((c) => c.type === 'action').length > 0
                  ? 'ok'
                  : 'warn'
              }
            />
          </StatCard>

          <StatCard label="Coaches">
            <StatRow
              label="메인 코치"
              value={`${coaches.filter((c) => c.role === '메인').length}명`}
            />
            <StatRow
              label="보조 코치"
              value={`${coaches.filter((c) => c.role === '보조').length}명`}
            />
            <StatRow
              label="특강 연사"
              value={`${coaches.filter((c) => c.role === '특강').length}명`}
            />
            <StatRow
              label="총 강사료"
              value={formatKrw(
                coaches.reduce((sum, c) => sum + (c.feeKrw ?? 0), 0),
              )}
            />
          </StatCard>

          <StatCard label="Budget">
            <StatRow
              label="총 예산"
              value={`${(budget.totalKrw / 1e8).toFixed(2)}`}
              suffix="억"
              big
              accent
            />
            {budget.items.map((item) => (
              <StatRow
                key={item.category}
                label={item.category}
                value={formatKrw(item.amountKrw)}
              />
            ))}
            {budget.marginPct != null && (
              <StatRow
                label="마진율"
                value={`${budget.marginPct.toFixed(1)}%`}
                status="ok"
              />
            )}
          </StatCard>
        </div>
      </div>

      <p
        className="mt-5 text-[9px] uppercase tracking-[1.2px]"
        style={{ color: 'var(--subtitle-text)' }}
      >
        Project · {projectId}
      </p>
    </div>
  )
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-3 text-[11px] font-bold uppercase tracking-[1.2px] transition-colors"
      style={{
        color: active ? 'var(--primary-orange)' : 'var(--subtitle-text)',
        borderBottom: active
          ? '2px solid var(--primary-orange)'
          : '2px solid transparent',
        background: active ? '#ffffff' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--light-beige)'
          e.currentTarget.style.color = 'var(--dark-charcoal)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--subtitle-text)'
        }
      }}
    >
      {label}
      <span
        className="px-1.5 py-[2px] text-[9px] font-semibold tracking-[0.4px]"
        style={{
          background: active ? 'var(--primary-orange)' : 'var(--light-beige)',
          color: active ? '#ffffff' : 'var(--subtitle-text)',
        }}
      >
        {count}
      </span>
    </button>
  )
}

function CurriculumTab({ curriculum }: { curriculum: CurriculumWeek[] }) {
  const theoryCount = curriculum.filter((c) => c.type === 'theory').length
  const actionCount = curriculum.filter((c) => c.type === 'action').length
  const lectureCount = curriculum.filter((c) => c.type === 'lecture').length

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span
            className="text-base font-bold tracking-[-0.2px]"
            style={{ color: 'var(--dark-charcoal)' }}
          >
            커리큘럼 {curriculum.length}주차
          </span>
          <span
            className="ml-2 text-[11px] font-medium"
            style={{ color: 'var(--subtitle-text)' }}
          >
            이론 {theoryCount} · 실행 {actionCount} · 강연 {lectureCount}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            className="h-7 bg-white px-2.5 text-[10px] font-semibold uppercase tracking-[0.2px]"
            style={{
              color: 'var(--subtitle-text)',
              border: '1px solid var(--hairline-strong, #e4dfd6)',
            }}
            disabled
          >
            AI 재생성
          </button>
          <button
            className="inline-flex h-7 items-center gap-1 px-2.5 text-[10px] font-bold uppercase tracking-[0.8px] text-white"
            style={{ background: 'var(--primary-orange)', opacity: 0.6 }}
            disabled
          >
            + 회차 추가
          </button>
        </div>
      </div>

      {/* Curriculum grid */}
      <div
        className="grid"
        style={{ background: 'var(--hairline, #f0ede8)', gap: 1 }}
      >
        {/* header */}
        <div
          className="grid items-center gap-3 px-4 py-2.5"
          style={{
            background: 'var(--dark-charcoal)',
            color: 'var(--warm-gray)',
            gridTemplateColumns: '50px 1fr 80px 140px 60px',
          }}
        >
          {['WEEK', 'SESSION', 'TYPE', '강사 · 시간', ''].map((h, i) => (
            <span
              key={i}
              className="text-[9px] font-bold uppercase tracking-[1.2px]"
            >
              {h}
            </span>
          ))}
        </div>

        {curriculum.length === 0 ? (
          <div
            className="bg-white p-8 text-center text-xs"
            style={{ color: 'var(--subtitle-text)' }}
          >
            아직 커리큘럼이 생성되지 않았습니다 · 이전 stage 에서 자동 생성 필요
          </div>
        ) : (
          curriculum.map((c) => <CurriculumRow key={c.week} week={c} />)
        )}
      </div>
    </div>
  )
}

function CurriculumRow({ week }: { week: CurriculumWeek }) {
  const typeStyle =
    week.type === 'action'
      ? { background: 'var(--primary-orange)', color: '#ffffff' }
      : week.type === 'lecture'
        ? { background: 'var(--dark-charcoal)', color: '#ffffff' }
        : {
            background: 'transparent',
            color: 'var(--subtitle-text)',
            border: '1px solid var(--hairline-strong, #e4dfd6)',
          }
  const typeLabel =
    week.type === 'action' ? '실행' : week.type === 'lecture' ? '강연' : '이론'

  return (
    <div
      className="grid cursor-pointer items-center gap-3 bg-white px-4 py-2.5 transition-colors"
      style={{ gridTemplateColumns: '50px 1fr 80px 140px 60px' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--light-beige)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#ffffff'
      }}
    >
      <span
        className="text-xs font-bold italic tracking-[-0.2px]"
        style={{ color: 'var(--primary-orange)' }}
      >
        W{week.week}
      </span>
      <div>
        <div
          className="text-xs font-semibold tracking-[-0.1px]"
          style={{ color: 'var(--dark-charcoal)' }}
        >
          {week.name}
        </div>
        {week.description && (
          <div
            className="mt-0.5 text-[10px]"
            style={{ color: 'var(--subtitle-text)' }}
          >
            {week.description}
          </div>
        )}
      </div>
      <span
        className="inline-block px-2 py-0.5 text-[9px] font-bold uppercase tracking-[1.2px]"
        style={typeStyle}
      >
        {typeLabel}
      </span>
      <span
        className="text-[11px] tabular-nums"
        style={{ color: 'var(--body-text, #333)' }}
      >
        <strong className="font-semibold">{week.duration}</strong>
        {week.instructor && ` · ${week.instructor}`}
      </span>
      <span
        className="text-right text-[9px] font-bold uppercase tracking-[1px]"
        style={{ color: 'var(--subtitle-text)' }}
      >
        편집 →
      </span>
    </div>
  )
}

function CoachesTab({ coaches }: { coaches: CoachInfo[] }) {
  if (coaches.length === 0) {
    return (
      <div
        className="bg-white p-8 text-center text-xs"
        style={{ color: 'var(--subtitle-text)' }}
      >
        아직 코치가 배정되지 않았습니다
      </div>
    )
  }
  return (
    <div className="grid" style={{ gap: 1, background: 'var(--hairline, #f0ede8)' }}>
      <div
        className="grid items-center gap-3 px-4 py-2.5"
        style={{
          background: 'var(--dark-charcoal)',
          color: 'var(--warm-gray)',
          gridTemplateColumns: '1fr 80px 100px 80px',
        }}
      >
        {['NAME', 'ROLE', 'FEE', 'MODULES'].map((h) => (
          <span
            key={h}
            className="text-[9px] font-bold uppercase tracking-[1.2px]"
          >
            {h}
          </span>
        ))}
      </div>
      {coaches.map((c) => (
        <div
          key={c.id}
          className="grid items-center gap-3 bg-white px-4 py-2.5"
          style={{ gridTemplateColumns: '1fr 80px 100px 80px' }}
        >
          <span
            className="text-xs font-semibold"
            style={{ color: 'var(--dark-charcoal)' }}
          >
            {c.name}
          </span>
          <span
            className="inline-block px-2 py-0.5 text-[9px] font-bold uppercase tracking-[1.2px]"
            style={{
              background:
                c.role === '메인'
                  ? 'var(--primary-orange)'
                  : c.role === '특강'
                    ? 'var(--dark-charcoal)'
                    : 'transparent',
              color: c.role === '보조' ? 'var(--subtitle-text)' : '#ffffff',
              border:
                c.role === '보조'
                  ? '1px solid var(--hairline-strong, #e4dfd6)'
                  : 'none',
            }}
          >
            {c.role}
          </span>
          <span
            className="text-[11px] tabular-nums"
            style={{ color: 'var(--body-text, #333)' }}
          >
            {c.feeKrw != null ? formatKrw(c.feeKrw) : '—'}
          </span>
          <span
            className="text-[11px] tabular-nums"
            style={{ color: 'var(--subtitle-text)' }}
          >
            {c.modulesAssigned ?? 0} mod
          </span>
        </div>
      ))}
    </div>
  )
}

function BudgetTab({ budget }: { budget: S4WorkspaceProps['budget'] }) {
  return (
    <div
      className="bg-white p-5"
      style={{ borderTop: '3px solid var(--primary-orange)' }}
    >
      <div
        className="mb-2.5 text-[10px] font-bold uppercase tracking-[1.5px]"
        style={{ color: 'var(--primary-orange)' }}
      >
        ● 총 예산
      </div>
      <div
        className="mb-5 text-[32px] font-bold italic leading-none tracking-[-1px]"
        style={{ color: 'var(--primary-orange)' }}
      >
        {(budget.totalKrw / 1e8).toFixed(2)}
        <span
          className="ml-1.5 text-xs font-medium not-italic"
          style={{ color: 'var(--subtitle-text)' }}
        >
          억원
        </span>
      </div>

      <div
        className="grid"
        style={{ gap: 1, background: 'var(--hairline, #f0ede8)' }}
      >
        <div
          className="grid items-center gap-3 px-4 py-2.5"
          style={{
            background: 'var(--dark-charcoal)',
            color: 'var(--warm-gray)',
            gridTemplateColumns: '1fr auto',
          }}
        >
          <span className="text-[9px] font-bold uppercase tracking-[1.2px]">
            CATEGORY
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[1.2px]">
            AMOUNT (KRW)
          </span>
        </div>
        {budget.items.map((item) => (
          <div
            key={item.category}
            className="grid items-center gap-3 bg-white px-4 py-2"
            style={{ gridTemplateColumns: '1fr auto' }}
          >
            <span
              className="text-xs"
              style={{ color: 'var(--body-text, #333)' }}
            >
              {item.category}
            </span>
            <span
              className="text-xs font-bold tabular-nums"
              style={{ color: 'var(--dark-charcoal)' }}
            >
              {formatKrw(item.amountKrw)}
            </span>
          </div>
        ))}
      </div>

      {budget.marginPct != null && (
        <div
          className="mt-3.5 flex items-center justify-between bg-white p-3.5"
          style={{ borderTop: '2px solid var(--green)' }}
        >
          <span
            className="text-[10px] font-semibold uppercase tracking-[1.2px]"
            style={{ color: 'var(--green)' }}
          >
            ✓ 마진율
          </span>
          <span
            className="text-lg font-bold italic tabular-nums"
            style={{ color: 'var(--green)' }}
          >
            {budget.marginPct.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  )
}

function ProposalTab({
  proposal,
}: {
  proposal: S4WorkspaceProps['proposal']
}) {
  return (
    <div
      className="grid"
      style={{ gap: 1, background: 'var(--hairline, #f0ede8)' }}
    >
      <div
        className="grid items-center gap-3 px-4 py-2.5"
        style={{
          background: 'var(--dark-charcoal)',
          color: 'var(--warm-gray)',
          gridTemplateColumns: '50px 1fr 80px',
        }}
      >
        <span className="text-[9px] font-bold uppercase tracking-[1.2px]">
          NUM
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[1.2px]">
          SECTION
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[1.2px]">
          STATUS
        </span>
      </div>
      {proposal.sections.map((s) => (
        <div
          key={s.num}
          className="grid items-center gap-3 bg-white px-4 py-2.5"
          style={{ gridTemplateColumns: '50px 1fr 80px' }}
        >
          <span
            className="text-xs font-bold italic tracking-[-0.2px]"
            style={{ color: 'var(--primary-orange)' }}
          >
            {s.num}
          </span>
          <span
            className="text-xs font-semibold"
            style={{ color: 'var(--dark-charcoal)' }}
          >
            {s.title}
          </span>
          <span
            className="inline-block px-2 py-0.5 text-[9px] font-bold uppercase tracking-[1.2px]"
            style={{
              background:
                s.status === 'complete'
                  ? 'var(--green)'
                  : 'var(--hairline-strong, #e4dfd6)',
              color: s.status === 'complete' ? '#ffffff' : 'var(--subtitle-text)',
            }}
          >
            {s.status === 'complete' ? '완성' : '대기'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────
// Stats column components
// ─────────────────────────────────────────

function StatCard({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      className="bg-white px-3.5 py-3"
      style={{ borderTop: '2px solid var(--primary-orange)' }}
    >
      <div
        className="mb-2 text-[9px] font-bold uppercase tracking-[1.2px]"
        style={{ color: 'var(--primary-orange)' }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function StatRow({
  label,
  value,
  suffix,
  big,
  accent,
  status,
}: {
  label: string
  value: string
  suffix?: string
  big?: boolean
  accent?: boolean
  status?: 'ok' | 'warn'
}) {
  const valueColor = accent
    ? 'var(--primary-orange)'
    : status === 'ok'
      ? 'var(--green)'
      : status === 'warn'
        ? 'var(--action-orange)'
        : 'var(--dark-charcoal)'

  return (
    <div
      className="flex items-center justify-between py-1.5 text-[11px]"
      style={{ borderBottom: '1px solid var(--hairline, #f0ede8)' }}
    >
      <span style={{ color: 'var(--subtitle-text)' }}>{label}</span>
      <span
        className="font-bold tabular-nums"
        style={{
          color: valueColor,
          fontSize: big ? '14px' : '11px',
          fontStyle: big && accent ? 'italic' : 'normal',
        }}
      >
        {status === 'ok' && <span>✓ </span>}
        {value}
        {suffix && (
          <span
            className="ml-0.5 not-italic"
            style={{ fontSize: '10px', color: 'var(--subtitle-text)' }}
          >
            {suffix}
          </span>
        )}
      </span>
    </div>
  )
}

function formatKrw(krw: number): string {
  if (krw >= 1e8) return `${(krw / 1e8).toFixed(2)}억`
  if (krw >= 1e4) return `${(krw / 1e4).toFixed(0)}만`
  return krw.toLocaleString()
}

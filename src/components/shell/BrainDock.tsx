'use client'
/**
 * BrainDock — UX v2 (ADR-018 · mockup _shared.css 1:1)
 *
 * 우 360px slide-open dock · charcoal header · beige body.
 *
 * Mockup 참조: /public/mockups/v2/_shared.css `.brain-dock` ~ `.dock-asset`
 */

import { useState } from 'react'
import Link from 'next/link'

export interface BrainDockMatchedAsset {
  assetId: string
  name: string
  matchScore: number
  sourceTier?: string | null
  snippet?: string
}

export interface BrainDockSimilarPattern {
  patternId: string
  sourceProject: string
  matchScore: number
}

export interface BrainDockProps {
  open: boolean
  onClose?: () => void
  projectId?: string
  /** 매칭 자산 top N */
  matchedAssets?: BrainDockMatchedAsset[]
  /** 유사 사업 top N */
  similarPatterns?: BrainDockSimilarPattern[]
  onAssetAccept?: (assetId: string) => void
  onAssetReject?: (assetId: string) => void
  /** 인용 완료된 자산 ID */
  citedAssetIds?: Set<string>
}

type DockTab = 'assets' | 'patterns'

export function BrainDock({
  open,
  onClose,
  projectId,
  matchedAssets = [],
  similarPatterns = [],
  onAssetAccept,
  onAssetReject,
  citedAssetIds,
}: BrainDockProps) {
  const [tab, setTab] = useState<DockTab>('assets')

  return (
    <>
      {/* 배경 dim (모바일) */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
        />
      )}

      <aside
        className="fixed right-0 z-[25] flex flex-col bg-white transition-transform duration-200"
        style={{
          top: 44,
          width: 320,
          height: 'calc(100vh - 44px - 56px)',
          borderLeft: '2px solid var(--dark-charcoal)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* charcoal header */}
        <div
          className="flex h-10 items-center justify-between px-3.5 text-white"
          style={{ background: 'var(--dark-charcoal)' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-[1.5px]">
            <span style={{ color: 'var(--action-orange)' }}>●</span>
            <span className="ml-1.5">Brain</span>
          </span>
          <button
            onClick={onClose}
            className="h-5 w-5 text-base leading-none transition-colors"
            style={{ color: 'var(--warm-gray)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--action-orange)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--warm-gray)'
            }}
            title="닫기"
          >
            ×
          </button>
        </div>

        {/* tabs */}
        <div
          className="flex"
          style={{ borderBottom: '1px solid var(--hairline, #f0ede8)' }}
        >
          <DockTabBtn active={tab === 'assets'} onClick={() => setTab('assets')}>
            자산 {matchedAssets.length > 0 && <span className="opacity-70">· {matchedAssets.length}</span>}
          </DockTabBtn>
          <DockTabBtn active={tab === 'patterns'} onClick={() => setTab('patterns')}>
            유사사업 {similarPatterns.length > 0 && <span className="opacity-70">· {similarPatterns.length}</span>}
          </DockTabBtn>
        </div>

        {/* body */}
        <div
          className="flex-1 overflow-y-auto p-3"
          style={{ background: 'var(--light-beige)' }}
        >
          {tab === 'assets' && (
            <AssetsTab
              matchedAssets={matchedAssets}
              onAccept={onAssetAccept}
              onReject={onAssetReject}
              citedAssetIds={citedAssetIds}
            />
          )}
          {tab === 'patterns' && <PatternsTab patterns={similarPatterns} />}
        </div>

        {/* footer */}
        <div
          className="p-2.5"
          style={{ borderTop: '1px solid var(--hairline, #f0ede8)' }}
        >
          <Link
            href="/admin/brain"
            className="flex items-center justify-between bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] transition-colors"
            style={{ color: 'var(--primary-orange)', border: '1px solid var(--hairline-strong, #e4dfd6)' }}
          >
            <span>Brain Dashboard 열기</span>
            <span>→</span>
          </Link>
          {projectId && (
            <Link
              href={`/projects/${projectId}/brain`}
              className="mt-1 flex items-center justify-between bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.4px]"
              style={{ color: 'var(--body-text, #333)', border: '1px solid var(--hairline-strong, #e4dfd6)' }}
            >
              <span>4+1 통합 패널</span>
              <span>→</span>
            </Link>
          )}
        </div>
      </aside>
    </>
  )
}

function DockTabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 px-1.5 py-2 text-center text-[9px] font-semibold uppercase tracking-[1px] transition-colors"
      style={{
        color: active ? 'var(--primary-orange)' : 'var(--subtitle-text)',
        borderBottom: active ? '2px solid var(--primary-orange)' : '2px solid transparent',
        background: active ? 'rgba(232,84,26,.04)' : 'transparent',
      }}
    >
      {children}
    </button>
  )
}

function AssetsTab({
  matchedAssets,
  onAccept,
  onReject,
  citedAssetIds,
}: {
  matchedAssets: BrainDockMatchedAsset[]
  onAccept?: (id: string) => void
  onReject?: (id: string) => void
  citedAssetIds?: Set<string>
}) {
  if (matchedAssets.length === 0) {
    return (
      <div
        className="p-6 text-center text-[11px]"
        style={{
          color: 'var(--subtitle-text)',
          background: '#ffffff',
          border: '1px dashed var(--hairline-strong, #e4dfd6)',
        }}
      >
        RFP 분석 후 자산 매칭이 표시됩니다
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {matchedAssets.map((a) => {
        const cited = citedAssetIds?.has(a.assetId)
        return (
          <div
            key={a.assetId}
            className="bg-white p-3.5 transition-transform hover:-translate-y-0.5"
            style={{ borderTop: '3px solid var(--primary-orange)' }}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span
                className="truncate text-[13px] font-semibold"
                style={{ color: 'var(--dark-charcoal)' }}
              >
                {a.name}
              </span>
              <span
                className="flex-shrink-0 text-[11px] font-bold tabular-nums"
                style={{ color: 'var(--primary-orange)' }}
              >
                {a.matchScore.toFixed(2)}
              </span>
            </div>
            {a.snippet && (
              <p
                className="mb-2.5 line-clamp-2 text-[11px] leading-[1.65]"
                style={{ color: 'var(--subtitle-text)' }}
              >
                {a.snippet}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              {cited ? (
                <span
                  className="px-2 py-1 text-[9px] font-semibold uppercase tracking-[1px]"
                  style={{
                    color: 'var(--green)',
                    background: 'rgba(46,204,113,.08)',
                    border: '1px solid rgba(46,204,113,.3)',
                  }}
                >
                  ✓ 인용됨
                </span>
              ) : (
                <>
                  <button
                    onClick={() => onAccept?.(a.assetId)}
                    className="px-3 py-1 text-[10px] font-bold uppercase tracking-[1px] text-white transition-colors hover:opacity-90"
                    style={{ background: 'var(--primary-orange)' }}
                  >
                    수락
                  </button>
                  <button
                    onClick={() => onReject?.(a.assetId)}
                    className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[1px]"
                    style={{
                      color: 'var(--subtitle-text)',
                      border: '1px solid var(--hairline-strong, #e4dfd6)',
                    }}
                  >
                    거절
                  </button>
                </>
              )}
              {a.sourceTier === 'high' && (
                <span
                  className="ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[1px]"
                  style={{
                    color: 'var(--action-orange)',
                    background: 'rgba(255,130,4,.1)',
                  }}
                >
                  high
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PatternsTab({ patterns }: { patterns: BrainDockSimilarPattern[] }) {
  if (patterns.length === 0) {
    return (
      <div
        className="p-6 text-center text-[11px]"
        style={{
          color: 'var(--subtitle-text)',
          background: '#ffffff',
          border: '1px dashed var(--hairline-strong, #e4dfd6)',
        }}
      >
        유사 수주 사업이 매칭되면 표시됩니다
      </div>
    )
  }
  return (
    <ul className="space-y-1.5 text-[11px]">
      {patterns.map((p) => (
        <li
          key={p.patternId}
          className="flex items-center justify-between gap-2 bg-white px-3 py-2"
          style={{ borderLeft: '3px solid var(--primary-orange)' }}
        >
          <span className="truncate" style={{ color: 'var(--body-text)' }}>
            {p.sourceProject}
          </span>
          <span
            className="flex-shrink-0 text-[10px] font-bold tabular-nums"
            style={{ color: 'var(--primary-orange)' }}
          >
            {p.matchScore.toFixed(2)}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ChatTab 제거 (mockup 에 없음 · /api/express/turn 연동은 후속 PR 에서 별도 위치 wire-up 예정)

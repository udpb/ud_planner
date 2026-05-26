'use client'
/**
 * BrainDock — UX v2 (ADR-018)
 *
 * 우 320px slide-open 도크. 기본 closed (메인 영역 최대 확보).
 *
 * 영역:
 *   - 자산 매칭 (수락/거절 chip)
 *   - 유사 사업 (top 5)
 *   - AI 채팅 (단순 prompt + response)
 *   - 빠른 액션 (자산 매칭 cmd, Brain Dashboard 링크)
 *
 * ActionAI v-07 Tutor Drawer 패턴.
 * BrainPanel (W31) 의 4+1 영역과 통합 가능.
 */

import { useState } from 'react'
import Link from 'next/link'
import { X, Brain, Sparkles, Network, FileText, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const [tab, setTab] = useState<'assets' | 'patterns' | 'chat'>('assets')

  return (
    <>
      {/* 배경 dim (모바일/태블릿에서) */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed right-0 top-11 z-40 flex h-[calc(100vh-2.75rem)] flex-col border-l bg-background shadow-lg transition-transform',
          'w-[320px]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* 헤더 */}
        <div className="flex h-11 items-center justify-between border-b px-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-semibold">Brain</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b text-xs">
          <TabButton active={tab === 'assets'} onClick={() => setTab('assets')}>
            <Sparkles className="h-3.5 w-3.5" />
            자산 {matchedAssets.length > 0 && <span className="ml-0.5 opacity-70">{matchedAssets.length}</span>}
          </TabButton>
          <TabButton active={tab === 'patterns'} onClick={() => setTab('patterns')}>
            <FileText className="h-3.5 w-3.5" />
            유사 사업 {similarPatterns.length > 0 && <span className="ml-0.5 opacity-70">{similarPatterns.length}</span>}
          </TabButton>
          <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>
            <Network className="h-3.5 w-3.5" />
            채팅
          </TabButton>
        </div>

        {/* 콘텐츠 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === 'assets' && (
            <AssetsTab
              matchedAssets={matchedAssets}
              onAccept={onAssetAccept}
              onReject={onAssetReject}
              citedAssetIds={citedAssetIds}
            />
          )}
          {tab === 'patterns' && <PatternsTab patterns={similarPatterns} />}
          {tab === 'chat' && <ChatTab />}
        </div>

        {/* 푸터 — Brain Dashboard 링크 */}
        <div className="border-t p-3">
          <Link
            href="/admin/brain"
            className="flex items-center justify-between rounded-md border bg-purple-50/50 px-2.5 py-1.5 text-[11px] font-medium text-purple-700 hover:bg-purple-50"
          >
            <span>Brain Dashboard 열기</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
          {projectId && (
            <Link
              href={`/projects/${projectId}/brain`}
              className="mt-1.5 flex items-center justify-between rounded-md border bg-gray-50 px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-gray-100"
            >
              <span>4+1 통합 패널</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </aside>
    </>
  )
}

function TabButton({
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
      className={cn(
        'flex flex-1 items-center justify-center gap-1 border-b-2 px-2 py-2 transition',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
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
      <div className="rounded border border-dashed bg-muted/40 p-4 text-center text-[11px] text-muted-foreground">
        🔍 RFP 분석 후 자산 매칭이 표시됩니다
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
            className="rounded-lg border bg-card p-2.5"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{a.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {a.matchScore.toFixed(2)}
              </span>
            </div>
            {a.snippet && (
              <p className="mb-2 line-clamp-2 text-[10px] text-foreground/70">{a.snippet}</p>
            )}
            <div className="flex items-center gap-1.5">
              {cited ? (
                <span className="inline-flex items-center gap-0.5 rounded border border-green-300 bg-green-50 px-1.5 py-0.5 text-[9px] text-green-700">
                  ✓ 인용됨
                </span>
              ) : (
                <>
                  <button
                    onClick={() => onAccept?.(a.assetId)}
                    className="rounded border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] text-orange-700 hover:bg-orange-100"
                  >
                    수락
                  </button>
                  <button
                    onClick={() => onReject?.(a.assetId)}
                    className="rounded border bg-card px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                  >
                    거절
                  </button>
                </>
              )}
              {a.sourceTier === 'high' && (
                <span className="ml-auto rounded bg-orange-100 px-1.5 py-0.5 text-[9px] text-orange-700">
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
      <div className="rounded border border-dashed bg-muted/40 p-4 text-center text-[11px] text-muted-foreground">
        📋 유사 수주 사업이 매칭되면 표시됩니다
      </div>
    )
  }
  return (
    <ul className="space-y-1.5 text-[11px]">
      {patterns.map((p) => (
        <li
          key={p.patternId}
          className="flex items-center justify-between gap-2 rounded border bg-card px-2.5 py-1.5"
        >
          <span className="truncate">{p.sourceProject}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {p.matchScore.toFixed(2)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function ChatTab() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 rounded border border-dashed bg-muted/40 p-4 text-center text-[11px] text-muted-foreground">
        💬 AI 채팅 (예정)
        <br />
        Brain 에 질문하기 · 자산 검색 · 인사이트 요청
      </div>
    </div>
  )
}

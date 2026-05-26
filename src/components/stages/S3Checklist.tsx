'use client'
/**
 * S3Checklist — UX v2 (ADR-018 · mockup s3.html 1:1)
 *
 * Stage 03 · 검수 · Inspector 7-lens + asset 추천 + inline diff.
 *
 * 레이아웃:
 *   - score-banner (240px orange num + 1fr dark info)
 *   - 7 lens grid (4col · 2px gap · border-top color by status)
 *   - recommend block (border-top 4px action-orange · asset list)
 *   - inline diff (dark-charcoal · monospace · + add / context)
 *
 * Wire up 상태:
 *   - Inspector lens 점수: mock (Phase D 후속 PR 에서 real inspector 호출 예정)
 *   - Brain asset 추천: real (/api/v1/inference/match-tuple — props 로 받음)
 *   - inline diff: mock (자산 수락 시 diff 생성은 후속)
 */

import { useState } from 'react'

export type LensStatus = 'pass' | 'weak' | 'unknown'

export interface LensScore {
  name: string
  score: number | null
  status: LensStatus
  hint: string
}

export interface AssetRow {
  assetId: string
  name: string
  snippet: string
  tier: 'high' | 'mid' | 'low'
  citationCount: number
}

export interface S3ChecklistProps {
  projectId: string
  /** 0~100 인스펙터 종합 점수 */
  overallScore: number
  /** 통과 임계 (기본 75) */
  passThreshold?: number
  /** 7 lens 점수 (또는 mock) */
  lenses: LensScore[]
  /** Brain 추천 자산 */
  recommendedAssets: AssetRow[]
  /** 자산 수락 콜백 */
  onAcceptAssets?: (ids: string[]) => Promise<void>
  /** Stage 04 진입 콜백 */
  onProceedToS4?: () => void
}

export function S3Checklist({
  projectId,
  overallScore,
  passThreshold = 75,
  lenses,
  recommendedAssets,
  onAcceptAssets,
  onProceedToS4,
}: S3ChecklistProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const isPass = overallScore >= passThreshold
  const weakCount = lenses.filter((l) => l.status === 'weak').length
  const passCount = lenses.filter((l) => l.status === 'pass').length
  const estimatedBoost = selected.size * 3 // 임시 — 자산당 3점 가산

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-12">
      {/* Score banner */}
      <div
        className="mb-8 grid"
        style={{
          gridTemplateColumns: '240px 1fr',
          gap: 2,
          background: 'var(--hairline, #f0ede8)',
        }}
      >
        {/* Left — orange num */}
        <div
          className="p-8 text-center text-white"
          style={{ background: 'var(--primary-orange)' }}
        >
          <div
            className="mb-2 text-[10px] font-semibold uppercase tracking-[2px]"
            style={{ opacity: 0.85 }}
          >
            Inspector Score
          </div>
          <div
            className="font-bold italic leading-none tracking-[-2px]"
            style={{ fontSize: '64px' }}
          >
            {overallScore}
            <span
              className="ml-1 text-[16px] font-medium"
              style={{ opacity: 0.85 }}
            >
              /100
            </span>
          </div>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-[1px]">
            {isPass ? '✓ 통과' : '✗ 미통과'} (임계 {passThreshold})
          </div>
        </div>

        {/* Right — dark info */}
        <div
          className="relative overflow-hidden p-8 text-white"
          style={{ background: 'var(--dark-charcoal)' }}
        >
          <div
            className="pointer-events-none absolute right-0 top-0 h-full w-1/2"
            style={{
              background:
                'linear-gradient(135deg, transparent 50%, rgba(255,130,4,0.08) 100%)',
            }}
          />
          <div
            className="relative mb-3 text-[10px] font-semibold uppercase tracking-[2px]"
            style={{ color: 'var(--action-orange)' }}
          >
            <span
              className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
              style={{ background: 'var(--action-orange)' }}
            />
            Inspector · 7 Lens · Auto Review
          </div>
          <h2 className="relative mb-2 text-[24px] font-bold tracking-[-0.5px]">
            {isPass
              ? weakCount === 0
                ? '검수 통과 — 모든 lens 안정'
                : '검수 통과 — 약점 보강 권장'
              : '검수 미통과 — 보강 필요'}
          </h2>
          <p
            className="relative max-w-[520px] text-[13px] leading-[1.7]"
            style={{ color: 'var(--warm-gray)' }}
          >
            {lenses.length} lens 중 {passCount} lens 통과
            {weakCount > 0 && (
              <>
                ,{' '}
                <strong style={{ color: 'var(--action-orange)' }}>
                  {weakCount} lens 약점 발견
                </strong>
              </>
            )}
            .
            <br />
            Brain matching {recommendedAssets.length}건 추천 · 수락 시 점수{' '}
            <strong style={{ color: 'var(--action-orange)' }}>
              +{recommendedAssets.length * 3}
            </strong>{' '}
            예상.
          </p>
        </div>
      </div>

      {/* 7 Lens grid */}
      <div
        className="mb-3.5 inline-flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[2px]"
        style={{ color: 'var(--primary-orange)' }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: 'var(--primary-orange)' }}
        />
        Inspector · 7 Lens · Detail
      </div>

      <div
        className="mb-10 grid"
        style={{
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 2,
          background: 'var(--hairline, #f0ede8)',
        }}
      >
        {lenses.map((lens) => (
          <LensCard key={lens.name} lens={lens} />
        ))}
      </div>

      {/* Recommend */}
      {recommendedAssets.length > 0 && (
        <div
          className="bg-white p-8"
          style={{ borderTop: '4px solid var(--action-orange)' }}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <div
              className="flex items-center gap-3 text-[18px] font-bold tracking-[-0.3px]"
              style={{ color: 'var(--dark-charcoal)' }}
            >
              <span
                className="inline-flex h-7 w-7 items-center justify-center text-[14px] font-bold italic text-white"
                style={{ background: 'var(--action-orange)' }}
              >
                !
              </span>
              차별화 보강 — Brain 자산 추천 {recommendedAssets.length}건
            </div>
            <div
              className="text-[11px] font-bold uppercase tracking-[1.5px]"
              style={{ color: 'var(--action-orange)' }}
            >
              수락 시 +{estimatedBoost} 점
            </div>
          </div>
          <p
            className="mb-6 text-[13px]"
            style={{ color: 'var(--subtitle-text)' }}
          >
            Brain matching score 0.84+ · 클릭으로 선택 → inline diff 미리보기 → 수락 시
            본문 자동 반영
          </p>

          <div
            className="grid"
            style={{ gap: 2, background: 'var(--hairline, #f0ede8)' }}
          >
            {recommendedAssets.map((a) => (
              <AssetCard
                key={a.assetId}
                asset={a}
                selected={selected.has(a.assetId)}
                onToggle={() => toggle(a.assetId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Diff preview (selected 가 있을 때만) */}
      {selected.size > 0 && (
        <div
          className="mt-8 p-8 text-white"
          style={{
            background: 'var(--dark-charcoal)',
            borderTop: '3px solid var(--primary-orange)',
          }}
        >
          <div
            className="mb-4 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[2px]"
            style={{ color: 'var(--action-orange)' }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--action-orange)' }}
            />
            Inline Diff · 선택 자산 {selected.size}건 추가 시
          </div>
          <div
            className="text-[12px] leading-[1.85] tabular-nums"
            style={{
              fontFamily: "'Poppins', monospace",
              color: 'var(--warm-gray)',
            }}
          >
            <DiffLine type="context">
              # 3. 차별화 — 본문 일부 (자산 수락 후 자동 반영)
            </DiffLine>
            <DiffLine type="context">기존 본문...</DiffLine>
            {[...selected].slice(0, 3).map((id) => {
              const asset = recommendedAssets.find((a) => a.assetId === id)
              if (!asset) return null
              return (
                <DiffLine key={id} type="add">
                  <strong
                    style={{
                      color: 'var(--action-orange)',
                      fontStyle: 'italic',
                    }}
                  >
                    {asset.name}
                  </strong>
                  {' — '}
                  {asset.snippet.slice(0, 80)}
                  {asset.snippet.length > 80 ? '...' : ''}
                </DiffLine>
              )
            })}
          </div>
        </div>
      )}

      {/* 액션 */}
      <div className="mt-10 flex items-center justify-end gap-3">
        <button
          onClick={onProceedToS4}
          className="inline-flex h-11 items-center bg-white px-5 text-[12px] font-semibold uppercase tracking-[1px] transition-colors"
          style={{
            color: 'var(--subtitle-text)',
            border: '1px solid var(--hairline-strong, #e4dfd6)',
          }}
        >
          바로 S4 →
        </button>
        {selected.size > 0 && (
          <button
            onClick={async () => {
              await onAcceptAssets?.([...selected])
              setSelected(new Set())
            }}
            className="inline-flex h-11 items-center gap-2.5 px-[22px] text-[13px] font-semibold tracking-[0.3px] text-white transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: 'var(--primary-orange)',
              boxShadow: '0 4px 12px rgba(232,84,26,.25)',
            }}
          >
            {selected.size}건 수락 + 본문 반영
            <span
              className="px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: 'rgba(255,255,255,.18)' }}
            >
              +{estimatedBoost}
            </span>
            <span className="text-[16px] leading-none">→</span>
          </button>
        )}
      </div>

      <p
        className="mt-6 text-[10px] uppercase tracking-[1.5px]"
        style={{ color: 'var(--subtitle-text)' }}
      >
        Project · {projectId}
      </p>
    </div>
  )
}

function LensCard({ lens }: { lens: LensScore }) {
  const isPass = lens.status === 'pass'
  const isWeak = lens.status === 'weak'
  const isUnknown = lens.status === 'unknown'

  const borderColor = isPass
    ? 'var(--green)'
    : isWeak
      ? 'var(--primary-orange)'
      : 'var(--hairline-strong, #e4dfd6)'
  const scoreColor = isPass
    ? 'var(--green)'
    : isWeak
      ? 'var(--primary-orange)'
      : 'var(--subtitle-text)'

  return (
    <div
      className="cursor-pointer bg-white px-5 py-[22px] transition-transform duration-150 hover:-translate-y-1"
      style={{
        borderTop: `3px solid ${borderColor}`,
        opacity: isUnknown ? 0.5 : 1,
      }}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <span
          className="text-[11px] font-bold uppercase tracking-[1px]"
          style={{ color: 'var(--dark-charcoal)' }}
        >
          {lens.name}
        </span>
        <span
          className="text-[28px] font-bold italic leading-none tabular-nums"
          style={{ color: scoreColor }}
        >
          {lens.score != null ? lens.score : '—'}
        </span>
      </div>
      <div
        className="text-[11px] leading-[1.5]"
        style={{ color: 'var(--subtitle-text)' }}
      >
        {lens.hint}
      </div>
    </div>
  )
}

function AssetCard({
  asset,
  selected,
  onToggle,
}: {
  asset: AssetRow
  selected: boolean
  onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      className="grid cursor-pointer items-center gap-4 px-5 py-[18px] transition-colors"
      style={{
        background: selected ? 'rgba(232,84,26,.06)' : '#ffffff',
        gridTemplateColumns: '24px 1fr auto',
      }}
    >
      {/* check */}
      <div
        className="relative h-5 w-5"
        style={{
          background: selected ? 'var(--primary-orange)' : '#ffffff',
          border: selected
            ? '2px solid var(--primary-orange)'
            : '2px solid var(--hairline-strong, #e4dfd6)',
        }}
      >
        {selected && (
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] font-bold text-white"
            style={{ lineHeight: 1 }}
          >
            ✓
          </span>
        )}
      </div>

      {/* info */}
      <div className="min-w-0">
        <div
          className="mb-1 text-[14px] font-bold tracking-[-0.2px]"
          style={{ color: 'var(--dark-charcoal)' }}
        >
          {asset.name}
        </div>
        <div
          className="line-clamp-2 text-[12px] leading-[1.55]"
          style={{ color: 'var(--subtitle-text)' }}
        >
          "{asset.snippet}"
        </div>
      </div>

      {/* meta */}
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <span
          className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-[1.2px]"
          style={{
            background:
              asset.tier === 'high'
                ? 'var(--primary-orange)'
                : 'var(--light-beige)',
            color: asset.tier === 'high' ? '#ffffff' : 'var(--subtitle-text)',
          }}
        >
          {asset.tier}
        </span>
        <span
          className="text-[11px] font-semibold"
          style={{ color: 'var(--subtitle-text)' }}
        >
          인용{' '}
          <strong
            className="text-[14px] italic"
            style={{ color: 'var(--primary-orange)' }}
          >
            {asset.citationCount}
          </strong>
        </span>
      </div>
    </div>
  )
}

function DiffLine({
  type,
  children,
}: {
  type: 'context' | 'add'
  children: React.ReactNode
}) {
  if (type === 'add') {
    return (
      <span
        className="relative block px-3 py-1"
        style={{
          paddingLeft: 32,
          background: 'rgba(46,204,113,.15)',
          color: '#ffffff',
          borderLeft: '3px solid var(--green)',
        }}
      >
        <span
          className="absolute left-3 font-bold"
          style={{ color: 'var(--green)' }}
        >
          +
        </span>
        {children}
      </span>
    )
  }
  return (
    <span
      className="relative block px-3 py-1"
      style={{ paddingLeft: 32, color: 'rgba(255,255,255,.5)' }}
    >
      <span className="absolute left-3"> </span>
      {children}
    </span>
  )
}

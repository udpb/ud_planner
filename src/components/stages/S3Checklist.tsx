'use client'
/**
 * S3Checklist — UX v2 (ADR-018 · mockup s3.html 1:1)
 *
 * Stage 03 · 검수 · Inspector 7-lens + asset 추천 + inline diff.
 *
 * Wire up 상태 (Phase G — 2026-05-27):
 *   - Inspector lens 점수: ✅ real /api/express/inspect 호출
 *   - Brain asset 추천: ✅ real (recommendations from same endpoint)
 *   - inline diff: 자산 선택 시 클라이언트 측 mock preview (자산 인용 자동 본문 반영은 후속)
 */

import { useState, useEffect } from 'react'

/** Inspector lens slug → 한국어 라벨 */
const LENS_LABELS: Record<string, string> = {
  market: '시장 분석',
  statistics: '통계 인용',
  problem: '문제 정의',
  'before-after': 'Before/After',
  'key-messages': '핵심 메시지',
  differentiators: '차별화',
  tone: '톤·문체',
}

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
  /** Fallback (DB draft 가 없거나 inspector 실패 시 보여줄 기본 점수) */
  overallScore: number
  /** 통과 임계 (기본 75) */
  passThreshold?: number
  /** Fallback lens scores (DB draft 가 없거나 inspector 실패 시) */
  lenses: LensScore[]
  /** Fallback asset 추천 */
  recommendedAssets: AssetRow[]
  /** 자산 수락 콜백 */
  onAcceptAssets?: (ids: string[]) => Promise<void>
  /** Stage 04 진입 콜백 */
  onProceedToS4?: () => void
  /** ExpressDraft 가 충분히 채워졌는지 (10+ slots) — true 일 때만 inspector 자동 호출 */
  draftReady?: boolean
}

export function S3Checklist({
  projectId,
  overallScore: fallbackScore,
  passThreshold = 75,
  lenses: fallbackLenses,
  recommendedAssets: fallbackAssets,
  onAcceptAssets,
  onProceedToS4,
  draftReady,
}: S3ChecklistProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realScore, setRealScore] = useState<number | null>(null)
  const [realLenses, setRealLenses] = useState<LensScore[] | null>(null)
  const [realAssets, setRealAssets] = useState<AssetRow[] | null>(null)
  const [fellbackToHeuristic, setFellbackToHeuristic] = useState(false)

  // draftReady 일 때 자동 fetch /api/express/inspect
  useEffect(() => {
    if (!draftReady) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/express/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{
          report?: {
            overallScore: number
            lensScores: Record<string, number>
            issues?: { lens: string; issue: string }[]
          }
          recommendations?: {
            assetId: string
            name: string
            narrativeSnippet: string
            score: number
          }[]
          fellbackToHeuristic?: boolean
        }>
      })
      .then((data) => {
        if (cancelled) return
        if (data.report) {
          setRealScore(Math.round(data.report.overallScore))
          // lensScores → LensScore[]
          const hints: Record<string, string> = {}
          data.report.issues?.forEach((iss) => {
            if (!hints[iss.lens]) hints[iss.lens] = iss.issue
          })
          const lensArr: LensScore[] = Object.entries(data.report.lensScores).map(
            ([slug, score]) => ({
              name: LENS_LABELS[slug] ?? slug,
              score: Math.round(score),
              status:
                score >= 75 ? 'pass' : score >= 0 ? 'weak' : 'unknown',
              hint: hints[slug] ?? (score >= 75 ? '통과' : '보강 권장'),
            }),
          )
          setRealLenses(lensArr)
        }
        if (data.recommendations) {
          const assetsArr: AssetRow[] = data.recommendations.slice(0, 5).map((r) => ({
            assetId: r.assetId,
            name: r.name,
            snippet: r.narrativeSnippet,
            tier: r.score >= 0.85 ? 'high' : r.score >= 0.7 ? 'mid' : 'low',
            citationCount: 0, // recommendations 에는 인용 카운트 없음 — 향후 보강
          }))
          setRealAssets(assetsArr)
        }
        setFellbackToHeuristic(!!data.fellbackToHeuristic)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '검수 호출 실패')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [draftReady, projectId])

  // real 데이터 우선, 없으면 fallback (mock)
  const overallScore = realScore ?? fallbackScore
  const lenses = realLenses ?? fallbackLenses
  const recommendedAssets = realAssets ?? fallbackAssets

  const isPass = overallScore >= passThreshold
  const weakCount = lenses.filter((l) => l.status === 'weak').length
  const passCount = lenses.filter((l) => l.status === 'pass').length
  const estimatedBoost = selected.size * 3 // 자산당 3점 가산 (휴리스틱)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-6">
      {/* Status banner — real / fallback / loading */}
      {loading && (
        <div
          className="mb-3 flex items-center gap-2 px-3 py-2 text-[11px]"
          style={{
            background: 'rgba(232,84,26,.06)',
            color: 'var(--primary-orange)',
            border: '1px solid rgba(232,84,26,.25)',
          }}
        >
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          AI 검수 진행 중 · 약 30~60초 소요
        </div>
      )}
      {error && !loading && (
        <div
          className="mb-3 px-3 py-2 text-[11px]"
          style={{
            background: 'rgba(232,84,26,.06)',
            color: 'var(--primary-orange)',
            border: '1px solid rgba(232,84,26,.25)',
          }}
        >
          ● 검수 호출 실패 — 기본 값 표시 중 ({error})
        </div>
      )}
      {fellbackToHeuristic && !loading && !error && (
        <div
          className="mb-3 px-3 py-2 text-[11px]"
          style={{
            background: 'rgba(255,130,4,.06)',
            color: 'var(--action-orange)',
            border: '1px solid rgba(255,130,4,.25)',
          }}
        >
          ● AI 검수 실패 → 휴리스틱 fallback 사용 중 · 1차본 보강 후 재시도 권장
        </div>
      )}
      {!draftReady && !loading && (
        <div
          className="mb-3 px-3 py-2 text-[11px]"
          style={{
            color: 'var(--subtitle-text)',
            border: '1px dashed var(--hairline-strong, #e4dfd6)',
            background: '#ffffff',
          }}
        >
          ● 데모 값 표시 중 · S2 슬롯 채우기 완료 후 자동 검수 호출
        </div>
      )}

      {/* Score banner */}
      <div
        className="mb-5 grid"
        style={{
          gridTemplateColumns: '220px 1fr',
          gap: 2,
          background: 'var(--hairline, #f0ede8)',
        }}
      >
        {/* Left — orange num */}
        <div
          className="p-5 text-center text-white"
          style={{ background: 'var(--primary-orange)' }}
        >
          <div
            className="mb-1 text-[9px] font-semibold uppercase tracking-[1.5px]"
            style={{ opacity: 0.85 }}
          >
            Inspector Score
          </div>
          <div
            className="font-bold italic leading-none tracking-[-1px]"
            style={{ fontSize: '36px' }}
          >
            {overallScore}
            <span
              className="ml-0.5 text-xs font-medium"
              style={{ opacity: 0.85 }}
            >
              /100
            </span>
          </div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.8px]">
            {isPass ? '✓ 통과' : '✗ 미통과'} (임계 {passThreshold})
          </div>
        </div>

        {/* Right — dark info */}
        <div
          className="relative overflow-hidden p-5 text-white"
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
            className="relative mb-2 text-[9px] font-semibold uppercase tracking-[1.5px]"
            style={{ color: 'var(--action-orange)' }}
          >
            <span
              className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
              style={{ background: 'var(--action-orange)' }}
            />
            Inspector · 7 Lens · Auto Review
          </div>
          <h2 className="relative mb-1.5 text-base font-bold tracking-[-0.3px]">
            {isPass
              ? weakCount === 0
                ? '검수 통과 — 모든 lens 안정'
                : '검수 통과 — 약점 보강 권장'
              : '검수 미통과 — 보강 필요'}
          </h2>
          <p
            className="relative max-w-[500px] text-xs leading-[1.6]"
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
        className="mb-2 inline-flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[1.5px]"
        style={{ color: 'var(--primary-orange)' }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: 'var(--primary-orange)' }}
        />
        Inspector · 7 Lens · Detail
      </div>

      <div
        className="mb-5 grid"
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
          className="bg-white p-5"
          style={{ borderTop: '3px solid var(--action-orange)' }}
        >
          <div className="mb-1 flex items-center justify-between">
            <div
              className="flex items-center gap-2.5 text-sm font-bold tracking-[-0.2px]"
              style={{ color: 'var(--dark-charcoal)' }}
            >
              <span
                className="inline-flex h-5 w-5 items-center justify-center text-xs font-bold italic text-white"
                style={{ background: 'var(--action-orange)' }}
              >
                !
              </span>
              차별화 보강 — Brain 자산 추천 {recommendedAssets.length}건
            </div>
            <div
              className="text-[10px] font-bold uppercase tracking-[1.2px]"
              style={{ color: 'var(--action-orange)' }}
            >
              수락 시 +{estimatedBoost} 점
            </div>
          </div>
          <p
            className="mb-3.5 text-xs"
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
          className="mt-5 p-5 text-white"
          style={{
            background: 'var(--dark-charcoal)',
            borderTop: '2px solid var(--primary-orange)',
          }}
        >
          <div
            className="mb-2.5 inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-[1.5px]"
            style={{ color: 'var(--action-orange)' }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--action-orange)' }}
            />
            Inline Diff · 선택 자산 {selected.size}건 추가 시
          </div>
          <div
            className="text-[11px] leading-[1.7] tabular-nums"
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
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onProceedToS4}
          className="inline-flex h-9 items-center bg-white px-3.5 text-[11px] font-semibold uppercase tracking-[0.8px] transition-colors"
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
            className="inline-flex h-9 items-center gap-2 px-4 text-xs font-semibold tracking-[0.2px] text-white transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: 'var(--primary-orange)',
              boxShadow: '0 3px 10px rgba(232,84,26,.22)',
            }}
          >
            {selected.size}건 수락 + 본문 반영
            <span
              className="px-1.5 py-0.5 text-[9px] font-medium"
              style={{ background: 'rgba(255,255,255,.18)' }}
            >
              +{estimatedBoost}
            </span>
            <span className="text-[13px] leading-none">→</span>
          </button>
        )}
      </div>

      <p
        className="mt-4 text-[9px] uppercase tracking-[1.2px]"
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
      className="cursor-pointer bg-white px-3.5 py-3 transition-transform duration-150 hover:-translate-y-0.5"
      style={{
        borderTop: `3px solid ${borderColor}`,
        opacity: isUnknown ? 0.5 : 1,
      }}
    >
      <div className="mb-1.5 flex items-baseline justify-between">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.8px]"
          style={{ color: 'var(--dark-charcoal)' }}
        >
          {lens.name}
        </span>
        <span
          className="text-lg font-bold italic leading-none tabular-nums"
          style={{ color: scoreColor }}
        >
          {lens.score != null ? lens.score : '—'}
        </span>
      </div>
      <div
        className="text-[10px] leading-[1.4]"
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
      className="grid cursor-pointer items-center gap-3 px-3.5 py-3 transition-colors"
      style={{
        background: selected ? 'rgba(232,84,26,.06)' : '#ffffff',
        gridTemplateColumns: '20px 1fr auto',
      }}
    >
      {/* check */}
      <div
        className="relative h-4 w-4"
        style={{
          background: selected ? 'var(--primary-orange)' : '#ffffff',
          border: selected
            ? '2px solid var(--primary-orange)'
            : '2px solid var(--hairline-strong, #e4dfd6)',
        }}
      >
        {selected && (
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-white"
            style={{ lineHeight: 1 }}
          >
            ✓
          </span>
        )}
      </div>

      {/* info */}
      <div className="min-w-0">
        <div
          className="mb-0.5 text-xs font-bold tracking-[-0.1px]"
          style={{ color: 'var(--dark-charcoal)' }}
        >
          {asset.name}
        </div>
        <div
          className="line-clamp-2 text-[11px] leading-[1.45]"
          style={{ color: 'var(--subtitle-text)' }}
        >
          "{asset.snippet}"
        </div>
      </div>

      {/* meta */}
      <div className="flex flex-shrink-0 items-center gap-2">
        <span
          className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[1px]"
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
          className="text-[10px] font-semibold"
          style={{ color: 'var(--subtitle-text)' }}
        >
          인용{' '}
          <strong
            className="text-xs italic"
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

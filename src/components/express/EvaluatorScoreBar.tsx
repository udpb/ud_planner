'use client'

/**
 * EvaluatorScoreBar — 평가위원 시각 점수판 (P1, 2026-05-15)
 *
 * 1차본 헤더 바로 아래에 항상 보이는 compact 점수판.
 * PM 이 매번 "지금 평가위원 앞에서 몇 점 받을 사업인가" 직관적으로 알도록.
 *
 * 데이터 소스:
 *  - B2G 채널: /api/express/eval-simulate (RFP evalCriteria × draft sections 매칭)
 *  - B2B / renewal: Inspector overallScore (7 lens 검수 결과)
 *  - 둘 다 없으면: placeholder "1차본 30% 이상 채우면 점수 표시"
 *
 * Auto-fetch 정책:
 *  - 마운트 시 1회
 *  - draft hash 변경 시 debounce 5초 후 재계산 (B2G 만 — Inspector 는 PM이 명시 실행)
 *
 * 클릭 행동:
 *  - 점수 영역 클릭 → 자세한 EvalSimulatorCard 또는 InspectorReportCard 로 스크롤
 *  - "약한 항목" 클릭 → 해당 섹션·슬롯 점프
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, Loader2, ArrowDown } from 'lucide-react'
import type { Channel } from '@/lib/express/schema'

interface SimulationItem {
  criteriaName: string
  maxPoints: number
  proposalSection: string
  draftSection: string
  completeness: number
  predictedScore: number
  reason: string
}

interface Simulation {
  items: SimulationItem[]
  totalMax: number
  totalPredicted: number
  weightedCompleteness: number
  worstItems: SimulationItem[]
}

interface Props {
  projectId: string
  channel?: Channel
  progressOverall: number
  /** 1차본 hash (변경 감지용) — sections 길이 합산 등 */
  draftSignature: string
  /** Inspector 가 이미 실행됐다면 그 점수 (B2B/renewal fallback) */
  inspectorScore?: number | null
  inspectorWeakLenses?: Array<{ lens: string; score: number }>
  /** 점수판 클릭 시 — 자세한 패널로 스크롤 등 */
  onClickDetails?: () => void
  /** 약한 항목 클릭 시 — 해당 섹션 보강 유도 */
  onJumpToSection?: (sectionKey: string) => void
}

const LENS_KO: Record<string, string> = {
  market: '시장',
  statistics: '통계',
  problem: '문제정의',
  'before-after': 'Before/After',
  'key-messages': '핵심 메시지',
  differentiators: '차별화',
  tone: '톤',
}

export function EvaluatorScoreBar({
  projectId,
  channel,
  progressOverall,
  draftSignature,
  inspectorScore,
  inspectorWeakLenses,
  onClickDetails,
  onJumpToSection,
}: Props) {
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [loading, setLoading] = useState(false)
  const lastSigRef = useRef<string>('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // B2G 채널일 때만 eval-simulate 자동 호출
  const shouldUseB2GSimulator = channel === 'B2G'

  const fetchSimulation = useCallback(async () => {
    if (!shouldUseB2GSimulator) return
    if (progressOverall < 25) return // 너무 일찍은 의미없음
    setLoading(true)
    try {
      const r = await fetch('/api/express/eval-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!r.ok) return
      const data = await r.json()
      if (data.simulation) setSimulation(data.simulation)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [projectId, shouldUseB2GSimulator, progressOverall])

  // 마운트 시 1회 + draft 변경 시 debounce 5초
  useEffect(() => {
    if (!shouldUseB2GSimulator) return
    if (draftSignature === lastSigRef.current) return
    lastSigRef.current = draftSignature

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void fetchSimulation()
    }, 5000)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [draftSignature, fetchSimulation, shouldUseB2GSimulator])

  // 초기 로드 (debounce 무관)
  useEffect(() => {
    if (!shouldUseB2GSimulator) return
    void fetchSimulation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldUseB2GSimulator])

  // ─────────────────────────────────────────
  // 점수 + 약한 항목 결정
  // ─────────────────────────────────────────
  const scoreData = (() => {
    if (shouldUseB2GSimulator && simulation) {
      const score = Math.round(simulation.totalPredicted)
      const max = simulation.totalMax
      const worst = simulation.worstItems.slice(0, 2).map((w) => ({
        label: w.criteriaName,
        loss: Math.round(w.maxPoints - w.predictedScore),
        sectionKey: w.draftSection,
      }))
      return { source: 'B2G' as const, score, max, worst, percent: max > 0 ? (score / max) * 100 : 0 }
    }
    if (inspectorScore != null) {
      const score = Math.round(inspectorScore)
      const worst = (inspectorWeakLenses ?? []).slice(0, 2).map((w) => ({
        label: LENS_KO[w.lens] ?? w.lens,
        loss: Math.max(0, 100 - Math.round(w.score)),
        sectionKey: '',
      }))
      return { source: 'Inspector' as const, score, max: 100, worst, percent: score }
    }
    return null
  })()

  const scoreColor = (pct: number) =>
    pct >= 75
      ? 'text-green-700'
      : pct >= 55
        ? 'text-amber-700'
        : 'text-red-700'
  const barColor = (pct: number) =>
    pct >= 75 ? 'bg-green-500' : pct >= 55 ? 'bg-amber-400' : 'bg-red-400'

  // 점수 없을 때 placeholder
  if (!scoreData) {
    return (
      <div className="border-b bg-muted/20 px-3 py-1.5 sm:px-6">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          <span>
            {progressOverall < 25
              ? `평가위원 시각 점수는 1차본 25% 이상에서 자동 표시 (현재 ${progressOverall}%)`
              : channel === 'B2G'
                ? loading
                  ? '평가 점수 계산 중...'
                  : 'RFP evalCriteria 가 없어 점수 추정 불가 — Inspector 실행 권장'
                : 'Inspector 검수를 실행하면 1차본 품질 점수가 표시됩니다'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="border-b bg-gradient-to-r from-orange-50/20 via-background to-background px-3 py-1.5 sm:px-6 sm:py-2">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={onClickDetails}
          className="group flex items-center gap-2 hover:opacity-80"
          title="자세한 점수 분석 보기"
        >
          <TrendingUp className="h-3.5 w-3.5 text-brand" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {scoreData.source === 'B2G' ? '예상 평가 점수' : '1차본 품질'}
          </span>
          <span
            className={cn(
              'text-base font-bold tabular-nums sm:text-lg',
              scoreColor(scoreData.percent),
            )}
          >
            {scoreData.score}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            / {scoreData.max}
          </span>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </button>

        {/* 진행 바 */}
        <div className="hidden h-1.5 flex-1 overflow-hidden bg-muted/40 sm:block">
          <div
            className={cn('h-full transition-all', barColor(scoreData.percent))}
            style={{ width: `${Math.min(100, scoreData.percent)}%` }}
          />
        </div>

        {/* 약한 항목 Top 2 */}
        {scoreData.worst.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">약한 항목:</span>
            {scoreData.worst.map((w, i) => (
              <button
                key={i}
                type="button"
                onClick={() => w.sectionKey && onJumpToSection?.(w.sectionKey)}
                className={cn(
                  ' border bg-white px-1.5 py-0.5 text-[10px] hover:border-brand/40 hover:text-brand',
                  w.sectionKey && 'cursor-pointer',
                )}
                title={w.sectionKey ? `${w.label} 섹션으로 이동` : w.label}
              >
                {w.label} <span className="text-red-600">−{w.loss}</span>
                {w.sectionKey && <ArrowDown className="-mt-0.5 ml-0.5 inline h-2 w-2" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

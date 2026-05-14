'use client'

/**
 * EvalSimulatorCard — B2G 평가배점 시뮬레이션 카드 (Phase M2, ADR-013).
 *
 * B2G 채널일 때만 렌더 (외부에서 채널 가드).
 * RFP evalCriteria + ExpressDraft.sections 으로 항목별 예상 점수 계산.
 *
 * 표시:
 *   - 전체 예상 점수 / 만점 (오렌지 진행 바)
 *   - 항목별 카드 (배점 큰 순)
 *   - 손실 큰 상위 3 → "이 섹션 보강 시 +N점" 가이드
 *   - "다시 계산" 버튼
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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
  guidance: string[]
}

interface Props {
  projectId: string
  /** 외부에서 자동 호출 여부 — 기본 true */
  autoFetch?: boolean
}

export function EvalSimulatorCard({ projectId, autoFetch = true }: Props) {
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  const fetchSimulation = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const r = await fetch('/api/express/eval-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${r.status}`)
      }
      const data = await r.json()
      setSimulation(data.simulation)
      setFetched(true)
    } catch (err: unknown) {
      toast.error('평가 시뮬 실패: ' + (err instanceof Error ? err.message : '알 수 없음'))
    } finally {
      setLoading(false)
    }
  }, [projectId, loading])

  useEffect(() => {
    if (autoFetch && !fetched) {
      fetchSimulation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch])

  // 평가배점 없으면 (B2B/renewal) 렌더 안 함
  if (fetched && (!simulation || simulation.items.length === 0)) {
    return null
  }

  const pct =
    simulation && simulation.totalMax > 0
      ? Math.round((simulation.totalPredicted / simulation.totalMax) * 100)
      : 0

  const barColor =
    pct >= 80 ? 'bg-primary' : pct >= 60 ? 'bg-amber-400' : 'bg-muted-foreground/40'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <TrendingUp className="h-4 w-4 text-primary" />
          평가배점 시뮬
          <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
            B2G
          </Badge>
        </CardTitle>
        <button
          onClick={fetchSimulation}
          disabled={loading}
          className="text-[10px] text-muted-foreground hover:text-primary disabled:opacity-50"
          title="현재 sections 으로 다시 계산"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
      </CardHeader>
      <CardContent className="space-y-2">
        {!simulation && loading && (
          <div className="text-[10px] text-muted-foreground">계산 중...</div>
        )}
        {simulation && (
          <>
            {/* 총점 바 */}
            <div className="rounded-md border bg-muted/20 p-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  예상 점수
                </span>
                <span className="tabular-nums">
                  <span className="text-lg font-bold">{Math.round(simulation.totalPredicted)}</span>
                  <span className="ml-0.5 text-[10px] text-muted-foreground">
                    / {simulation.totalMax}
                  </span>
                  <span className={cn('ml-1.5 text-[10px] font-semibold', barColor === 'bg-primary' ? 'text-primary' : 'text-amber-700')}>
                    ({pct}%)
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all', barColor)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* 손실 큰 상위 3 (실제 가이드) */}
            {simulation.worstItems.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2">
                <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-amber-900">
                  <AlertCircle className="h-3 w-3" />
                  점수 손실 큰 항목
                </div>
                <ul className="space-y-1 text-[10px]">
                  {simulation.worstItems.map((item, i) => {
                    const loss = Math.round(item.maxPoints * (1 - item.completeness))
                    return (
                      <li key={i} className="rounded bg-white/60 p-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="line-clamp-1 font-medium">{item.criteriaName}</span>
                          <span className="shrink-0 tabular-nums text-amber-800">+{loss}점 가능</span>
                        </div>
                        <div className="mt-0.5 text-muted-foreground">
                          섹션 {item.draftSection} · {item.reason}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* 항목 전체 — 접힘 */}
            {simulation.items.length > simulation.worstItems.length && (
              <details>
                <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                  전체 {simulation.items.length}개 항목 보기
                </summary>
                <ul className="mt-1 space-y-0.5 text-[10px]">
                  {simulation.items.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 rounded px-1.5 py-0.5"
                    >
                      <span className="line-clamp-1">{item.criteriaName}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {Math.round(item.predictedScore)}/{item.maxPoints}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* 가이드 메시지 */}
            {simulation.guidance.length > 1 && (
              <ul className="space-y-0.5 text-[10px] text-muted-foreground">
                {simulation.guidance.slice(1).map((g, i) => (
                  <li key={i}>· {g}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

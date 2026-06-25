'use client'

/**
 * AutoRecommendedPool — Wave V / F1 (ADR-015)
 *
 * 코치 자동 추천 풀 UI.
 *   - mount 시 /api/projects/{id}/recommend-coaches GET
 *   - 점수 desc 카드 그리드 (RecommendationBadge + strengthOneLiner)
 *   - 헤더 "AI 추천 풀 · 필요 N명 × 5 = poolSize명" + "왜 N명?" rationale toggle
 *   - mode='modal' → onPick callback / mode='inline' → onOpenAssignModal CTA
 *   - 에러 케이스: HTML 세션만료, 400 RFP 없음, 503 Supabase, 네트워크 — 분기 메시지
 */

import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { normalizeExpertise } from '@/lib/coaches/expertise-task-map'
import { RecommendationBadge } from './RecommendationBadge'
import {
  POOL_MULTIPLIER,
  type CoachRecommendation,
  type RecommendCoachesResponse,
} from '@/lib/coaches/types'

interface Props {
  projectId: string
  /** 'modal' — coach-assign 검색 모달 내 (onPick 콜백) / 'inline' — StageS4 안 (자체 CTA) */
  mode: 'modal' | 'inline'
  /** 이미 배정된 코치 id (cuid) — 흐림 표시 */
  assignedCoachIds: string[]
  /** mode='modal' 일 때 카드 클릭 시 호출. 호출자가 CoachResult 로 변환. */
  onPick?: (recommendation: CoachRecommendation) => void
  /** mode='inline' 일 때 "검색 모달 열기" CTA 클릭 시 호출 (선택) */
  onOpenAssignModal?: (preselectRecommendation?: CoachRecommendation) => void
  /**
   * BR-WS-15 (additive): 워크스페이스 Live Plan 이 파생한 필요 코치 수 N.
   * 주어지면 헤더의 "필요 N명 × 5 = poolSize"·"왜 N명?" 카운트를 이 값으로 표시한다
   * (커리큘럼 회차 변경에 즉시 정합). **추천 풀 fetch·카드 그리드는 그대로** — 카운트
   * 표기만 ctx 와 맞춘다. 없으면 기존 동작(API 응답 requiredN 사용).
   */
  requiredCountOverride?: number
  className?: string
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; sessionExpired?: boolean; supabaseMissing?: boolean }
  | { kind: 'ready'; data: RecommendCoachesResponse }

const TIER_TONE: Record<string, string> = {
  TIER1: 'bg-green-100 text-green-800 border-green-200',
  TIER2: 'bg-amber-100 text-amber-800 border-amber-200',
  TIER3: 'bg-slate-100 text-slate-700 border-slate-200',
}

export function AutoRecommendedPool({
  projectId,
  mode,
  assignedCoachIds,
  onPick,
  onOpenAssignModal,
  requiredCountOverride,
  className,
}: Props): JSX.Element {
  const [state, setState] = useState<FetchState>({ kind: 'loading' })
  const [rationaleOpen, setRationaleOpen] = useState(false)
  const [refetchTick, setRefetchTick] = useState(0)

  // useEffect 안에서 직접 fetch 수행 — react-hooks/set-state-in-effect 규칙 회피.
  // setState 는 await 이후에만 호출되고, cleanup flag 로 unmount race 방지.
  useEffect(() => {
    let cancelled = false

    async function load(): Promise<FetchState> {
      try {
        const r = await fetch(`/api/projects/${projectId}/recommend-coaches`, {
          method: 'GET',
        })

        // HTML 응답 (세션 만료) 안전 catch
        const contentType = r.headers.get('content-type') ?? ''
        if (contentType.includes('text/html')) {
          return {
            kind: 'error',
            message: '세션 만료 — 새 탭에서 로그인 후 새로고침',
            sessionExpired: true,
          }
        }

        if (!r.ok) {
          let errMessage = '추천 풀 로드 실패'
          try {
            const body = (await r.json()) as { error?: string }
            if (body?.error) errMessage = body.error
          } catch {
            // JSON 파싱 실패 — 기본 메시지 유지
          }
          if (r.status === 400 && errMessage.includes('RFP 분석')) {
            return { kind: 'error', message: errMessage }
          }
          if (r.status === 503) {
            return {
              kind: 'error',
              message: 'Supabase coaches_directory 미설정 — 운영자에게 문의',
              supabaseMissing: true,
            }
          }
          return { kind: 'error', message: errMessage }
        }

        const data = (await r.json()) as RecommendCoachesResponse
        return { kind: 'ready', data }
      } catch {
        return { kind: 'error', message: '추천 풀 로드 실패' }
      }
    }

    load().then((next) => {
      if (!cancelled) setState(next)
    })

    return () => {
      cancelled = true
    }
  }, [projectId, refetchTick])

  const retry = useCallback(() => {
    setState({ kind: 'loading' })
    setRefetchTick((t) => t + 1)
  }, [])

  // ─── loading ───
  if (state.kind === 'loading') {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--primary-orange)' }} />
          AI 추천 풀 로드 중…
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[120px] border border-border bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  // ─── error ───
  if (state.kind === 'error') {
    return (
      <div
        className={cn(
          ' border border-red-200 bg-red-50 p-3 text-sm text-red-800',
          className,
        )}
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p className="font-medium">{state.message}</p>
            {state.sessionExpired && (
              <a
                href="/login"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs underline cursor-pointer"
              >
                새 탭에서 로그인
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {state.supabaseMissing && (
              <p className="text-xs text-red-700">
                관리자에게 coaches_directory sync 요청을 보내주세요.
              </p>
            )}
            {!state.sessionExpired && (
              <button
                type="button"
                onClick={retry}
                className="inline-flex items-center gap-1 border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                다시 시도
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── ready ───
  const { data } = state

  // BR-WS-15: override 있으면 표시 카운트만 Live Plan 값으로 정합(추천 카드 그리드는 그대로).
  const displayRequiredN =
    requiredCountOverride != null && requiredCountOverride > 0
      ? requiredCountOverride
      : data.requiredN
  const displayPoolSize =
    requiredCountOverride != null && requiredCountOverride > 0
      ? requiredCountOverride * POOL_MULTIPLIER
      : data.poolSize

  if (data.recommendations.length === 0) {
    return (
      <div
        className={cn(
          ' border border-border bg-muted/30 p-4 text-sm text-muted-foreground',
          className,
        )}
      >
        <p>
          RFP keywords / detectedTasks 가 비어 추천 풀이 비었습니다. S1 RFP 분석을
          확인하거나, 아래 검색으로 직접 찾기.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4" style={{ color: 'var(--primary-orange)' }} />
          <span>
            AI 추천 풀 · 필요 {displayRequiredN}명 × 5 = {displayPoolSize}명
          </span>
        </div>
        <button
          type="button"
          onClick={() => setRationaleOpen((v) => !v)}
          className="inline-flex items-center gap-1 border border-border bg-white px-2 py-1 text-xs text-muted-foreground hover:border-brand/40 hover:text-foreground cursor-pointer"
        >
          왜 {displayRequiredN}명?
          {rationaleOpen ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* rationale */}
      {rationaleOpen && data.rationale.length > 0 && (
        <ul className=" border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1 list-disc list-inside">
          {data.rationale.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      {/* 카드 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {data.recommendations.map((r) => (
          <RecommendationCard
            key={r.coachId}
            recommendation={r}
            assigned={assignedCoachIds.includes(r.coachId)}
            onClick={() => {
              if (mode === 'modal' && onPick) {
                onPick(r)
              } else if (mode === 'inline' && onOpenAssignModal) {
                onOpenAssignModal(r)
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 카드
// ─────────────────────────────────────────

interface CardProps {
  recommendation: CoachRecommendation
  assigned: boolean
  onClick: () => void
}

function RecommendationCard({ recommendation: r, assigned, onClick }: CardProps): JSX.Element {
  const tierTone = TIER_TONE[r.tier] ?? TIER_TONE.TIER3
  const initial = r.name.charAt(0) || '?'
  const topExpertise = r.expertise.slice(0, 2).map(normalizeExpertise)

  return (
    <div
      role="button"
      tabIndex={assigned ? -1 : 0}
      aria-disabled={assigned}
      onClick={() => {
        if (!assigned) onClick()
      }}
      onKeyDown={(e) => {
        if (assigned) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'relative flex gap-3 border border-border bg-white p-3 text-left transition-all',
        assigned
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:border-brand/40 hover:shadow-sm hover:ring-2 hover:ring-primary/30',
      )}
    >
      {/* 좌측: 사진 / 이니셜 */}
      <div className="shrink-0">
        {r.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.photoUrl}
            alt={r.name}
            className="h-10 w-10 object-cover border border-border"
          />
        ) : (
          <div className="h-10 w-10 bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">
            {initial}
          </div>
        )}
      </div>

      {/* 우측: 정보 */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* line 1: 이름 + tier badge */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-sm truncate">{r.name}</span>
          <span
            className={cn(
              'inline-flex h-4 items-center border px-1 text-[9px] font-semibold shrink-0',
              tierTone,
            )}
          >
            {r.tier}
          </span>
        </div>

        {/* line 2: organization · position */}
        {(r.organization || r.position) && (
          <div className="text-xs text-muted-foreground truncate">
            {[r.organization, r.position].filter(Boolean).join(' · ')}
          </div>
        )}

        {/* line 3: strengthOneLiner */}
        <div className="text-[11px] text-foreground/80 line-clamp-1">
          {r.strengthOneLiner}
        </div>

        {/* line 4: expertise top 2 칩 */}
        {topExpertise.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {topExpertise.map((e, i) => (
              <Badge
                key={i}
                variant="outline"
                className="h-4 px-1 text-[9px] font-normal"
              >
                {e}
              </Badge>
            ))}
          </div>
        )}

        {/* line 5: footer — score badge + lectureRate */}
        <div className="flex items-center justify-between gap-2 mt-1">
          <RecommendationBadge score={r.matchScore} breakdown={r.scoreBreakdown} />
          {r.lectureRateMain != null && r.lectureRateMain > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              강의 {Math.round(r.lectureRateMain / 10000)}만원
            </span>
          )}
        </div>
      </div>

      {/* 이미 배정됨 overlay */}
      {assigned && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/40 pointer-events-none">
          <span className=" border border-border bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
            이미 배정됨
          </span>
        </div>
      )}
    </div>
  )
}

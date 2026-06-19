'use client'

/**
 * AutoResearchCard — F3 (Wave V, ADR-015)
 *
 * AI 자동 리서치 카드. 3 상태 머신 (idle → loading → results).
 *
 * Flow:
 *   1. PM 이 시작 클릭 → POST /api/projects/[id]/auto-research
 *   2. Tier 1 (datacenter-stats cache) 또는 Tier 2 (Gemini Google Search) hits 표시
 *   3. PM 이 [전체 수락] 또는 개별 [✓] → POST /api/projects/[id]/accept-research
 *   4. 거절 시 → [다시 검색] (max 3) / [직접 입력] (외부 LLM 카드) / [취소]
 */

import { useState } from 'react'
import type { JSX } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Sparkles,
  Loader2,
  ExternalLink,
  Check,
  RefreshCw,
  X,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { SeedBadge } from '@/components/projects/auto-seed/SeedBadge'
import type {
  AutoResearchHit,
  AutoResearchResult,
} from '@/lib/research/types'
import { MAX_RESEARCH_ATTEMPT } from '@/lib/research/types'

interface Props {
  projectId: string
  topic: string
  /** 부모 (ExpressShell) 가 보유한 draft — accept-research 호출 시 함께 전송 */
  draft: unknown
  /** PM 이 hits 수락 시 호출 — accept-research 응답의 draft 를 부모에 전달 */
  onAccept: (updatedDraft: unknown) => void
  /** PM 이 폴백 ("수동으로 직접 입력") 요청 시 호출 — 부모가 ExternalLlmCard 로 전환 */
  onFallbackManual: () => void
  /** PM 이 거절 시 호출 — 부모가 카드 닫음 */
  onCancel: () => void
}

type CardState = 'idle' | 'loading' | 'results'

const CONFIDENCE_TONE: Record<AutoResearchHit['confidence'], string> = {
  high: 'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
}

const CONFIDENCE_LABEL: Record<AutoResearchHit['confidence'], string> = {
  high: '신뢰 높음',
  medium: '신뢰 중간',
  low: '신뢰 낮음',
}

export function AutoResearchCard(props: Props): JSX.Element {
  const [state, setState] = useState<CardState>('idle')
  const [result, setResult] = useState<AutoResearchResult | null>(null)
  const [attempt, setAttempt] = useState(1)
  const [error, setError] = useState<string | null>(null)

  async function callAutoResearch(currentAttempt: number) {
    setState('loading')
    setError(null)
    try {
      const r = await fetch(`/api/projects/${props.projectId}/auto-research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: props.projectId,
          topic: props.topic,
          mode: currentAttempt === 1 ? 'auto' : 'retry',
          attempt: currentAttempt,
        }),
      })
      if (r.status === 429) {
        const body = (await r.json().catch(() => null)) as
          | { retryAfterSec?: number }
          | null
        setError(`요청 한도 초과 — ${body?.retryAfterSec ?? 60}초 후 재시도`)
        setState('idle')
        return
      }
      if (r.status === 410) {
        // flag OFF — 기존 외부 LLM 카드로 폴백
        props.onFallbackManual()
        return
      }
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as
          | { error?: string }
          | null
        setError(body?.error ?? '리서치 실패')
        setState('idle')
        return
      }
      const data = (await r.json()) as AutoResearchResult
      setResult(data)
      setState('results')
    } catch (e) {
      setError(e instanceof Error ? e.message : '네트워크 오류')
      setState('idle')
    }
  }

  async function acceptHits(hits: AutoResearchHit[]) {
    if (hits.length === 0) return
    try {
      const r = await fetch(
        `/api/projects/${props.projectId}/accept-research`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: props.projectId,
            draft: props.draft,
            hits,
          }),
        },
      )
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as
          | { error?: string }
          | null
        toast.error(body?.error ?? '저장 실패')
        return
      }
      const data = (await r.json()) as { draft: unknown }
      toast.success(`${hits.length}건의 근거가 sections 에 자동 인용됐어요.`)
      props.onAccept(data.draft)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '네트워크 오류')
    }
  }

  function retry() {
    if (attempt >= MAX_RESEARCH_ATTEMPT) return
    const next = attempt + 1
    setAttempt(next)
    void callAutoResearch(next)
  }

  const isFallback = result?.tier === 'fallback'
  const atMaxAttempts = attempt >= MAX_RESEARCH_ATTEMPT

  return (
    <Card className="border-[color:var(--cyan)]/30 bg-[color:var(--light-beige)]">
      <CardContent className="space-y-3 p-4">
        {/* 헤더 — 모든 state 공통 */}
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-[color:var(--cyan)]" />
          AI 자동 리서치 — {props.topic}
        </div>

        {state === 'idle' && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              데이터 센터 캐시 + 웹 검색으로 정량 자료를 찾아드릴게요.
            </div>
            <ol className="space-y-1 border bg-background/60 p-2.5 text-xs text-foreground/85">
              <li>1. 데이터 센터 11건 통계 우선 매칭</li>
              <li>2. 캐시 부족 시 Gemini Google Search 자동 호출</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-primary"
                onClick={() => void callAutoResearch(attempt)}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                AI 자동 리서치 시작
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={props.onFallbackManual}
              >
                직접 입력 (외부 LLM 카드)
              </Button>
            </div>
          </div>
        )}

        {state === 'loading' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 border bg-background/60 px-3 py-2 text-xs text-foreground/85">
              <Loader2 className="h-4 w-4 animate-spin text-[color:var(--primary-orange)]" />
              {attempt === 1
                ? '데이터 센터 우선 매칭 중...'
                : '웹 자동 검색 중...'}
            </div>
            <div className="text-[11px] text-muted-foreground">
              시도 {attempt}/{MAX_RESEARCH_ATTEMPT}
            </div>
            <Button size="sm" variant="ghost" onClick={props.onCancel}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              취소
            </Button>
          </div>
        )}

        {state === 'results' && result && (
          <div className="space-y-3">
            {/* Tier badge + attempt counter */}
            <div className="flex items-center justify-between">
              {result.tier === 'cache' && (
                <SeedBadge source="AI" label="📚 데이터 센터 캐시" />
              )}
              {result.tier === 'web' && (
                <SeedBadge source="AI" label="🌐 Gemini Google Search" />
              )}
              {result.tier === 'fallback' && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-medium',
                    'bg-red-100 text-red-800 border-red-200',
                  )}
                >
                  <AlertCircle className="h-2.5 w-2.5" />
                  결과 없음 — 수동 폴백 권유
                </span>
              )}
              <div className="text-[11px] text-muted-foreground">
                시도 {attempt}/{MAX_RESEARCH_ATTEMPT}
              </div>
            </div>

            {/* fallback 상태 — 빨강 박스 */}
            {isFallback && (
              <div className="space-y-2 border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <div className="font-medium">
                  데이터 센터·웹 모두 결과 없음. PM 이 직접 확인하시겠어요?
                </div>
                <Button
                  size="sm"
                  className="bg-primary"
                  onClick={props.onFallbackManual}
                >
                  외부 LLM 카드로
                </Button>
              </div>
            )}

            {/* hits 리스트 */}
            {result.hits.length > 0 && (
              <ul className="space-y-2">
                {result.hits.map((hit, idx) => (
                  <li
                    key={`${hit.source}-${hit.year}-${idx}`}
                    className=" border bg-background p-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="font-medium text-foreground/90">
                          {hit.source} · {hit.year}
                        </div>
                        {hit.value && (
                          <div className="font-bold text-base text-[color:var(--primary-orange)]">
                            {hit.value}
                          </div>
                        )}
                        <div className="line-clamp-3 text-foreground/80">
                          {hit.summary}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span
                            className={cn(
                              'inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium',
                              CONFIDENCE_TONE[hit.confidence],
                            )}
                          >
                            {CONFIDENCE_LABEL[hit.confidence]}
                          </span>
                          {hit.sourceUrl && (
                            <a
                              href={hit.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-[color:var(--cyan)] hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              출처 열기
                            </a>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => void acceptHits([hit])}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        수락
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* 하단 액션 bar */}
            <div className="flex flex-wrap gap-2 border-t pt-2">
              {result.hits.length > 0 && !isFallback && (
                <Button
                  size="sm"
                  className="bg-primary"
                  onClick={() => void acceptHits(result.hits)}
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  전체 수락
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={atMaxAttempts}
                onClick={retry}
                title={
                  atMaxAttempts
                    ? '최대 시도 도달 — 수동 폴백 권유'
                    : '다시 검색'
                }
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                다시 검색
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={props.onFallbackManual}
              >
                직접 입력
              </Button>
              <Button size="sm" variant="ghost" onClick={props.onCancel}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                취소
              </Button>
            </div>
            {atMaxAttempts && !isFallback && (
              <div className="text-[11px] text-muted-foreground">
                최대 {MAX_RESEARCH_ATTEMPT}회 시도 도달 — 결과가 미흡하면 직접 입력을 권유드려요.
              </div>
            )}
          </div>
        )}

        {error && (
          <div className=" border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="mr-1 inline h-3 w-3" />
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

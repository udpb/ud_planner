'use client'

/**
 * ImpactForecastClient — 사전 임팩트 forecast 상세 + PM 보정 (Wave M4)
 *
 * 표시:
 *  - 총 사회적 가치 / 수혜자 수 / 예산 대비 비율
 *  - 카테고리별 breakdown (가치 큰 순)
 *  - items 표 (신뢰도 색깔 라벨 + 보정 가능)
 *
 * 액션:
 *  - "다시 계산" (POST) — AI 가 최신 1차본 보고 재생성
 *  - "PM 보정 저장" (PATCH) — items 수정 후 엔진 재계산
 *  - "최종 확정 (lock)" — calibration = pm-locked
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Save, Lock, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface ForecastItem {
  categoryId: string
  itemName?: string
  count: number | null
  hours: number | null
  participants: number | null
  days: number | null
  months: number | null
  revenue: number | null
  newEmployees: number | null
  investmentAmount: number | null
  bizFund: number | null
  coachesTrained: number | null
  eventParticipants: number | null
  spaceArea: number | null
  spaceDuration: number | null
  confidence: 'explicit' | 'derived' | 'estimated'
  rationale: string
  categoryName?: string
  impactTypeName?: string
}

interface BreakdownItem {
  categoryId: string
  value: number
  combinedProxyValue: number
  formulaVariables: string[]
}

interface ForecastSummary {
  id: string
  country: string
  totalSocialValue: number
  beneficiaryCount: number
  calibration: string
  calibrationNote: string | null
  generatedAt: string
  items: ForecastItem[]
  breakdown: BreakdownItem[]
}

interface Category {
  id: string
  name: string
  impactType: string
  formulaVariables: string[]
}

interface Props {
  projectId: string
  country: string
  totalBudgetVat: number | null
  initialForecast: ForecastSummary | null
  categories: Category[]
  configured: boolean
}

const CONF_LABEL: Record<ForecastItem['confidence'], { label: string; color: string }> = {
  explicit: { label: '명시', color: 'bg-green-100 text-green-800 border-green-300' },
  derived: { label: '도출', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  estimated: { label: '추정', color: 'bg-red-100 text-red-800 border-red-300' },
}

const FIELD_LABEL: Record<string, string> = {
  count: '횟수',
  hours: '시간',
  participants: '참여자',
  days: '일수',
  months: '개월',
  revenue: '매출',
  newEmployees: '신규고용',
  investmentAmount: '투자',
  bizFund: '사업화자금',
  coachesTrained: '코치양성',
  eventParticipants: '행사참여',
  spaceArea: '면적',
  spaceDuration: '기간',
}

export function ImpactForecastClient({
  projectId,
  totalBudgetVat,
  initialForecast,
  categories,
  configured,
}: Props) {
  const router = useRouter()
  // forecast 는 서버 source-of-truth 라 state 안 씀 (prop 직접 사용 → router.refresh 후 자동 갱신)
  const forecast = initialForecast
  // editing 은 PM 이 보정하는 작업 영역 — 새 forecast 가 들어오면 sync
  const [editing, setEditing] = useState<ForecastItem[]>(
    initialForecast?.items ?? [],
  )
  useEffect(() => {
    setEditing(initialForecast?.items ?? [])
  }, [initialForecast])
  const [regenerating, setRegenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const categoryMap = new Map(categories.map((c) => [c.id, c]))

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/impact-forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conservative: true }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'unknown')
      toast.success('재생성 완료 — 새로고침')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('재생성 실패: ' + msg.slice(0, 120))
    } finally {
      setRegenerating(false)
    }
  }

  const handleSave = async (lock: boolean) => {
    setSaving(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/impact-forecast`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: editing, lock }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'unknown')
      toast.success(lock ? '최종 확정 저장 ✓' : 'PM 보정 저장 ✓')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('저장 실패: ' + msg.slice(0, 120))
    } finally {
      setSaving(false)
    }
  }

  if (!forecast) {
    return (
      <div className="space-y-3">
        {configured && (
          <Button onClick={handleRegenerate} disabled={regenerating} className="gap-1.5">
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {regenerating ? 'AI 분석 중...' : '사전 임팩트 리포트 생성'}
          </Button>
        )}
      </div>
    )
  }

  const ratio =
    totalBudgetVat && totalBudgetVat > 0
      ? forecast.totalSocialValue / totalBudgetVat
      : null

  const sortedBreakdown = [...forecast.breakdown].sort((a, b) => b.value - a.value)

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <Card className="border-violet-300 bg-violet-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>요약</span>
            <Badge variant="outline" className="text-[10px]">
              {forecast.calibration === 'auto-conservative'
                ? '🤖 AI 보수 추정'
                : forecast.calibration === 'pm-locked'
                  ? '🔒 PM 확정'
                  : '✏ PM 보정'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                총 사회적 가치
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-violet-900">
                {(forecast.totalSocialValue / 100_000_000).toFixed(2)}억원
              </div>
              <div className="text-[10px] tabular-nums text-muted-foreground">
                ₩ {Math.round(forecast.totalSocialValue).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                수혜자 수
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {forecast.beneficiaryCount.toLocaleString()}
                <span className="ml-1 text-sm text-muted-foreground">명</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                예산 대비 SROI
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {ratio === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  `1:${ratio.toFixed(2)}`
                )}
              </div>
              {totalBudgetVat && (
                <div className="text-[10px] tabular-nums text-muted-foreground">
                  예산 ₩ {totalBudgetVat.toLocaleString()}
                </div>
              )}
            </div>
          </div>
          {forecast.calibrationNote && (
            <p className="mt-3 rounded border bg-white/60 p-2 text-[11px] text-muted-foreground">
              <strong>분석 메모:</strong> {forecast.calibrationNote}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 액션 바 */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={regenerating || saving}
          className="gap-1.5"
        >
          {regenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          AI 재계산
        </Button>
        <Button
          size="sm"
          onClick={() => handleSave(false)}
          disabled={saving || regenerating || editing.length === 0}
          className="gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          PM 보정 저장
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => handleSave(true)}
          disabled={saving || regenerating || editing.length === 0}
          className="gap-1.5"
        >
          <Lock className="h-3.5 w-3.5" />
          최종 확정 (lock)
        </Button>
      </div>

      {/* Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <TrendingUp className="h-3.5 w-3.5" />
            카테고리별 사회적 가치 (큰 순)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {sortedBreakdown.map((b, i) => {
              const cat = categoryMap.get(b.categoryId)
              const pct = (b.value / forecast.totalSocialValue) * 100
              return (
                <div key={i} className="text-[11px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>
                      <span className="text-muted-foreground">
                        [{cat?.impactType ?? '?'}]
                      </span>{' '}
                      {cat?.name ?? b.categoryId}
                    </span>
                    <span className="tabular-nums">
                      <strong>₩ {Math.round(b.value).toLocaleString()}</strong>
                      <span className="ml-1 text-muted-foreground">
                        ({pct.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-violet-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Items 보정 표 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">입력 항목 (신뢰도별)</CardTitle>
          <p className="text-[10px] text-muted-foreground">
            <span className="rounded bg-green-100 px-1 text-green-800">명시</span>{' '}
            RFP/1차본 명시 ·{' '}
            <span className="rounded bg-amber-100 px-1 text-amber-800">도출</span>{' '}
            curriculum 도출 ·{' '}
            <span className="rounded bg-red-100 px-1 text-red-800">추정</span> AI 추정
            (0.7 보수 인수 적용됨)
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {editing.map((item, idx) => {
              const cat = categoryMap.get(item.categoryId)
              return (
                <div key={idx} className="rounded border bg-muted/20 p-2 text-[11px]">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={CONF_LABEL[item.confidence].color}
                    >
                      {CONF_LABEL[item.confidence].label}
                    </Badge>
                    <span className="font-medium">
                      {cat?.name ?? item.categoryId}
                    </span>
                    {item.itemName && (
                      <span className="text-muted-foreground">— {item.itemName}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                    {(cat?.formulaVariables ?? []).map((v) => {
                      const val = item[v as keyof ForecastItem]
                      return (
                        <label key={v} className="block">
                          <span className="text-[10px] text-muted-foreground">
                            {FIELD_LABEL[v] ?? v}
                          </span>
                          <Input
                            type="number"
                            value={typeof val === 'number' ? val : ''}
                            onChange={(e) => {
                              const newVal =
                                e.target.value === ''
                                  ? null
                                  : Number(e.target.value)
                              setEditing((cur) =>
                                cur.map((it, i) =>
                                  i === idx ? { ...it, [v]: newVal } : it,
                                ),
                              )
                            }}
                            className="h-6 px-1 text-[11px]"
                          />
                        </label>
                      )
                    })}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                    💡 {item.rationale}
                  </p>
                </div>
              )
            })}
            {editing.length === 0 && (
              <p className="text-xs text-muted-foreground">
                입력 항목 없음 — AI 재계산을 눌러 생성하세요.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground">
        ⓘ 계수는 impact-measurement 시스템 (Supabase) 의 활성 계수와 동일. 사후
        실측 시 같은 계수 사용 → 사전 vs 사후 비교 가능.
      </p>
    </div>
  )
}

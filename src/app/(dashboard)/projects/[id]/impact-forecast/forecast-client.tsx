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
import {
  Loader2,
  RefreshCw,
  Save,
  Lock,
  TrendingUp,
  FileText,
  ExternalLink,
  Info,
} from 'lucide-react'
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
  /** 공식 리포트 핸드오프(impact-measurement 쓰기) 연동 여부 — 미설정 시 안내. */
  handoffConfigured: boolean
}

/** 공식 리포트 핸드오프 결과 — API 성공 시. */
interface OfficialReport {
  sroi: number | null
  reportUrl: string
  shareToken: string
}

/**
 * SROI 정상범위 라벨. ⭐ 렌즈 — 높을수록 좋은 게 아니다. 비율을 줄세우지 않는다.
 *   1:1 미만 = 사회가치 < 투입 / 1:1~1:10 = 통상 범위 / 1:10 초과 = 가정 점검 권장.
 */
function sroiRangeLabel(ratio: number | null): string {
  if (ratio === null) return '예산 미상 — 비율 산출 보류(분해만 본다)'
  if (ratio < 1) return '1:1 미만 — 사회가치가 투입보다 작게 추정됨(가정 점검)'
  if (ratio <= 10) return '1:1~1:10 통상 범위 안'
  return '1:10 초과 — 추정 가정·계수 점검 권장(높다고 더 좋은 게 아님)'
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
  handoffConfigured,
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
  // 공식 리포트 핸드오프 — impact-measurement 쓰기 → /view/{shareToken} 임베드
  const [reporting, setReporting] = useState(false)
  const [official, setOfficial] = useState<OfficialReport | null>(null)

  const categoryMap = new Map(categories.map((c) => [c.id, c]))

  const handleGenerateReport = async () => {
    setReporting(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/impact-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? '공식 리포트 생성 실패')
      setOfficial({
        sroi: data.sroi ?? null,
        reportUrl: data.reportUrl,
        shareToken: data.shareToken,
      })
      toast.success('공식 리포트 생성 완료 — 아래에 임베드됨')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg.slice(0, 160))
    } finally {
      setReporting(false)
    }
  }

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
      <Card className="border-[color:var(--cyan)]/40 bg-[color:var(--light-beige)]">
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
              <div className="mt-1 text-2xl font-bold tabular-nums text-[color:var(--primary-orange)]">
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
                예산 대비 SROI <span className="normal-case">(렌즈)</span>
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

          {/* ⭐ SROI 렌즈 프레이밍 — 높을수록 좋은 게 아니다. 정상범위 + 가정. */}
          <div className="mt-3 flex items-start gap-1.5 border bg-white/60 p-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              <strong>SROI는 비율(렌즈)이지 목표가 아닙니다.</strong> 높을수록 좋은
              게 아니라 분해와 가정을 함께 봅니다. 통상 범위는 1:1~1:10 —{' '}
              <span className="text-foreground">{sroiRangeLabel(ratio)}</span>.
            </span>
          </div>
          {forecast.calibrationNote && (
            <p className="mt-3 border bg-white/60 p-2 text-[11px] text-muted-foreground">
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
                  <div className="mt-0.5 h-1 w-full overflow-hidden bg-muted">
                    <div
                      className="h-full bg-[color:var(--cyan)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 공식 임팩트 리포트 — impact-measurement 핸드오프 + 임베드 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <FileText className="h-3.5 w-3.5" />
            공식 임팩트 리포트
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            위 forecast(렌즈 미리보기)를 impact-measurement 에 기록해 공개 리포트를
            만들고 이 화면 안에서 바로 봅니다. 두 앱을 오갈 필요 없음.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!handoffConfigured ? (
            <div className="border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900">
              <strong>연동 미설정</strong> — 공식 리포트 쓰기 토큰
              (SERVICE_API_TOKEN) 이 없습니다. Vercel 환경변수에 SERVICE_API_TOKEN
              (+필요 시 SROI_SERVICE_URL) 을 추가하면 활성화됩니다. (미리보기는
              위에서 계속 사용 가능)
            </div>
          ) : (
            <>
              <Button
                size="sm"
                onClick={handleGenerateReport}
                disabled={reporting}
                className="gap-1.5"
              >
                {reporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                {official ? '공식 리포트 다시 생성' : '공식 리포트 생성'}
              </Button>

              {official && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted-foreground">
                      공식 리포트 생성됨{' '}
                      {official.sroi !== null && (
                        <>
                          · SROI(렌즈) 1:{official.sroi.toFixed(2)} —{' '}
                          {sroiRangeLabel(official.sroi)}
                        </>
                      )}
                    </span>
                    <a
                      href={official.reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[color:var(--accent)] hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      새 탭 / PDF·공유
                    </a>
                  </div>
                  <iframe
                    src={official.reportUrl}
                    title="공식 임팩트 리포트"
                    className="h-[640px] w-full border bg-white"
                    loading="lazy"
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Items 보정 표 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">입력 항목 (신뢰도별)</CardTitle>
          <p className="text-[10px] text-muted-foreground">
            <span className=" bg-green-100 px-1 text-green-800">명시</span>{' '}
            RFP/1차본 명시 ·{' '}
            <span className=" bg-amber-100 px-1 text-amber-800">도출</span>{' '}
            curriculum 도출 ·{' '}
            <span className=" bg-red-100 px-1 text-red-800">추정</span> AI 추정
            (0.7 보수 인수 적용됨)
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {editing.map((item, idx) => {
              const cat = categoryMap.get(item.categoryId)
              return (
                <div key={idx} className=" border bg-muted/20 p-2 text-[11px]">
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

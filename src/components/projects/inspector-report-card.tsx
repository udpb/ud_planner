'use client'

/**
 * InspectorReportCard — 검수 결과 시각화 (Wave 2 #5, 2026-05-14)
 *
 * 기존 상단 작은 칩 "검수 78점 · 5건" 만으로는 PM 이 어느 렌즈가 약한지 모름.
 * 본 카드:
 *   - 총점 + 채널 가중치 표시
 *   - 7 렌즈 점수 막대 (낮은 순)
 *   - critical/major 이슈 Top 3 (lens · sectionKey · 이슈 · 제안)
 *   - 강점 1~3 (격려)
 *   - 다음 액션 1줄
 *
 * 사용: ExpressShell 의 검수 영역에서 inspectorReport 가 있으면 confirm 패널처럼 표시.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CheckCircle2, AlertTriangle, XCircle, Sparkles, X } from 'lucide-react'

interface InspectorIssue {
  lens: string
  severity: 'critical' | 'major' | 'minor'
  sectionKey?: string
  issue: string
  suggestion: string
}

interface InspectorReport {
  passed: boolean
  overallScore: number
  lensScores?: Record<string, number>
  issues: InspectorIssue[]
  strengths?: string[]
  nextAction: string
  weightedByChannel?: string
}

interface Props {
  report: InspectorReport
  onDismiss?: () => void
  onJumpToSection?: (sectionKey: string) => void
}

const LENS_LABEL: Record<string, string> = {
  market: '시장',
  statistics: '통계',
  problem: '문제정의',
  'before-after': 'Before/After',
  'key-messages': '핵심 메시지',
  differentiators: '차별화',
  tone: '톤·완결성',
}

const SEVERITY_ICON = {
  critical: <XCircle className="h-3 w-3 text-red-600" />,
  major: <AlertTriangle className="h-3 w-3 text-amber-600" />,
  minor: <AlertTriangle className="h-3 w-3 text-muted-foreground" />,
}

const SEVERITY_BG = {
  critical: 'border-red-200 bg-red-50/60',
  major: 'border-amber-200 bg-amber-50/60',
  minor: 'border-muted bg-muted/30',
}

export function InspectorReportCard({ report, onDismiss, onJumpToSection }: Props) {
  const score = Math.round(report.overallScore)
  const scoreColor =
    score >= 80
      ? 'text-green-700'
      : score >= 60
        ? 'text-amber-700'
        : 'text-red-700'
  const barColor =
    score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-400' : 'bg-red-400'

  // 7 렌즈 정렬 — 낮은 순 (약점 먼저)
  const sortedLenses = Object.entries(report.lensScores ?? {})
    .filter(([k]) => k in LENS_LABEL)
    .sort((a, b) => a[1] - b[1])

  // critical/major 이슈 Top 3
  const topIssues = [...report.issues]
    .sort((a, b) => {
      const order = { critical: 0, major: 1, minor: 2 }
      return order[a.severity] - order[b.severity]
    })
    .slice(0, 3)

  return (
    <Card
      className={cn(
        'border-l-4',
        report.passed ? 'border-l-green-500' : 'border-l-amber-500',
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-1.5 text-sm">
            🔍 검수 결과
            {report.passed ? (
              <Badge className="h-4 gap-0.5 bg-green-100 px-1.5 text-[10px] text-green-800">
                <CheckCircle2 className="h-2.5 w-2.5" />
                통과
              </Badge>
            ) : (
              <Badge className="h-4 bg-amber-100 px-1.5 text-[10px] text-amber-800">
                보강 권장
              </Badge>
            )}
          </CardTitle>
          {report.weightedByChannel && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              채널 가중치 적용: {report.weightedByChannel}
            </p>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground"
            title="닫기"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 총점 막대 */}
        <div className="rounded-md border bg-muted/20 p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              종합 점수
            </span>
            <span className="tabular-nums">
              <span className={cn('text-2xl font-bold', scoreColor)}>{score}</span>
              <span className="ml-0.5 text-xs text-muted-foreground">/ 100</span>
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', barColor)}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* 7 렌즈 점수 — 약점 우선 */}
        {sortedLenses.length > 0 && (
          <div>
            <div className="mb-1.5 text-[10px] font-medium text-muted-foreground">
              7 렌즈 (낮은 순)
            </div>
            <div className="space-y-1">
              {sortedLenses.map(([lens, value]) => {
                const v = Math.round(value)
                const color =
                  v >= 80 ? 'bg-green-400' : v >= 60 ? 'bg-amber-300' : 'bg-red-300'
                return (
                  <div key={lens} className="flex items-center gap-2 text-[11px]">
                    <span className="w-20 shrink-0 truncate text-muted-foreground">
                      {LENS_LABEL[lens]}
                    </span>
                    <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full transition-all', color)}
                        style={{ width: `${v}%` }}
                      />
                    </div>
                    <span className="w-7 shrink-0 text-right tabular-nums text-muted-foreground">
                      {v}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* critical/major 이슈 Top 3 */}
        {topIssues.length > 0 && (
          <div>
            <div className="mb-1.5 text-[10px] font-medium text-muted-foreground">
              집중 보강 항목 ({topIssues.length})
            </div>
            <ul className="space-y-1">
              {topIssues.map((iss, i) => (
                <li
                  key={i}
                  className={cn(
                    'rounded-md border p-1.5 text-[11px]',
                    SEVERITY_BG[iss.severity],
                  )}
                >
                  <div className="flex items-center gap-1">
                    {SEVERITY_ICON[iss.severity]}
                    <span className="font-medium">
                      {LENS_LABEL[iss.lens] ?? iss.lens}
                    </span>
                    {iss.sectionKey && iss.sectionKey !== 'overall' && (
                      <button
                        onClick={() => onJumpToSection?.(iss.sectionKey!)}
                        className="ml-auto rounded bg-white/60 px-1 text-[9px] hover:bg-white"
                        title="섹션으로 이동"
                      >
                        섹션 {iss.sectionKey} →
                      </button>
                    )}
                  </div>
                  <div className="mt-0.5 leading-relaxed">{iss.issue}</div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-primary">
                    💡 {iss.suggestion}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 강점 1~3 */}
        {(report.strengths?.length ?? 0) > 0 && (
          <div className="rounded-md border border-green-200 bg-green-50/40 p-2">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-green-800">
              <Sparkles className="h-2.5 w-2.5" />
              잘 된 점
            </div>
            <ul className="space-y-0.5 text-[10px] text-green-900">
              {report.strengths!.slice(0, 3).map((s, i) => (
                <li key={i}>· {s}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 다음 액션 */}
        {report.nextAction && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-2 text-[11px]">
            <span className="font-medium text-primary">👉 다음 액션: </span>
            {report.nextAction}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

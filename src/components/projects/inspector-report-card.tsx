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

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  X,
  BookMarked,
  Plus,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from 'lucide-react'

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

export interface AssetRecommendationUI {
  assetId: string
  name: string
  category: string
  evidenceType: string
  narrativeSnippet: string
  keyNumbers: string[]
  lens: string
  score: number
  reasons: string[]
  /** P2 — lens·자산 기준으로 자동 결정된 추천 섹션 (1~7) */
  suggestedSectionKey: '1' | '2' | '3' | '4' | '5' | '6' | '7'
}

interface Props {
  report: InspectorReport
  onDismiss?: () => void
  onJumpToSection?: (sectionKey: string) => void
  /**
   * 1차본 진척률 (0~100). 50 미만일 때 "본문 미완성" 컨텍스트 배너 노출 —
   * lens 점수가 모두 0 으로 나와도 PM 이 "평가위원 0점" 으로 오해하지 않도록.
   */
  draftProgress?: number
  /**
   * Wave N1 — Inspector 가 약점 lens 별로 추천한 자산 카드.
   * 사용자가 "인용" 클릭 시 onInsertAsset 호출 → ExpressShell 이 narrativeSnippet 을
   * 챗봇 입력창에 넣거나 differentiators 에 자동 수락.
   */
  recommendations?: AssetRecommendationUI[]
  /**
   * P2 — 자산 인용 시 호출. sectionKey 가 주어지면 그 섹션에 narrativeSnippet 자동 추가;
   * 'chat' 이면 챗봇 textarea 에 박는 기존 동작 (PM 직접 정리 모드).
   */
  onInsertAsset?: (
    asset: AssetRecommendationUI,
    target: '1' | '2' | '3' | '4' | '5' | '6' | '7' | 'chat',
  ) => void
}

// P2 — 섹션 라벨 (SECTION_LABELS 와 동일)
const SECTION_LABEL: Record<string, string> = {
  '1': '제안 배경',
  '2': '추진 전략',
  '3': '커리큘럼',
  '4': '코치·운영',
  '5': '예산',
  '6': '임팩트',
  '7': '조직·팀',
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

export function InspectorReportCard({
  report,
  onDismiss,
  onJumpToSection,
  draftProgress,
  recommendations,
  onInsertAsset,
}: Props) {
  const draftIncomplete = typeof draftProgress === 'number' && draftProgress < 50
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
        {/* 본문 미완성 컨텍스트 배너 — 50% 미만에서만 표시 */}
        {draftIncomplete && (
          <div className=" border border-amber-300 bg-amber-50/70 p-2 text-[11px] text-amber-900">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
              <div>
                <span className="font-medium">1차본 {draftProgress}% — 본문이 아직 비어있습니다.</span>
                <span className="ml-1 text-amber-800/80">
                  lens 점수가 0 으로 표시되는 것은 평가위원 점수가 아니라
                  &ldquo;검수할 본문이 부족함&rdquo;을 의미합니다. 챗봇으로 슬롯을 더 채운 뒤 다시 검수해주세요.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 총점 막대 */}
        <div className=" border bg-muted/20 p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              종합 점수
            </span>
            <span className="tabular-nums">
              <span className={cn('text-2xl font-bold', scoreColor)}>{score}</span>
              <span className="ml-0.5 text-xs text-muted-foreground">/ 100</span>
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden bg-muted">
            <div
              className={cn('h-full transition-all', barColor)}
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
                    <div className="flex-1 h-1.5 overflow-hidden bg-muted">
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
                    ' border p-1.5 text-[11px]',
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
                        className="ml-auto bg-white/60 px-1 text-[9px] hover:bg-white"
                        title="섹션으로 이동"
                      >
                        섹션 {iss.sectionKey} →
                      </button>
                    )}
                  </div>
                  <div className="mt-0.5 leading-relaxed">{iss.issue}</div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-brand">
                    💡 {iss.suggestion}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 강점 1~3 */}
        {(report.strengths?.length ?? 0) > 0 && (
          <div className=" border border-green-200 bg-green-50/40 p-2">
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

        {/* Wave U / U6 — 약점 lens 별 자산 추천 (inline diff, hover dropdown 폐지) */}
        {recommendations && recommendations.length > 0 && (
          <div className=" border border-brand/30 bg-brand/5 p-2">
            <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-brand">
              <BookMarked className="h-2.5 w-2.5" />
              이 자산을 인용해 보강하세요 ({recommendations.length})
            </div>
            <ul className="space-y-1.5">
              {recommendations.slice(0, 4).map((rec) => (
                <RecommendationItem
                  key={rec.assetId}
                  rec={rec}
                  onInsert={onInsertAsset}
                />
              ))}
            </ul>
          </div>
        )}

        {/* 다음 액션 */}
        {report.nextAction && (
          <div className=" border border-brand/40 bg-brand/5 p-2 text-[11px]">
            <span className="font-medium text-brand">👉 다음 액션: </span>
            {report.nextAction}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────
// Wave U / U6 — 추천 자산 1건 (inline diff 패널)
//   hover dropdown 폐지. 클릭 → 인라인 expand → 섹션 선택 + 미리보기.
// ─────────────────────────────────────────

function RecommendationItem({
  rec,
  onInsert,
}: {
  rec: AssetRecommendationUI
  onInsert?: (
    asset: AssetRecommendationUI,
    target: '1' | '2' | '3' | '4' | '5' | '6' | '7' | 'chat',
  ) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const matchPct = Math.round(rec.score * 100)
  const matchColor =
    matchPct >= 75
      ? 'bg-[color:var(--green)]/15 text-[color:var(--green)]'
      : matchPct >= 55
        ? 'bg-amber-100 text-amber-800'
        : 'bg-muted text-muted-foreground'
  const primaryReason = rec.reasons.find((r) =>
    /학습|채널|유사도|프로파일|수주|사례/.test(r),
  )
  const secondaryReason = rec.reasons.find(
    (r) => r !== primaryReason && !/카테고리|자산$/.test(r),
  )

  return (
    <li className=" border bg-white/70 p-1.5 text-[11px]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-medium">{rec.name}</span>
            <Badge
              variant="outline"
              className="h-3.5 px-1 text-[9px] text-muted-foreground"
            >
              {LENS_LABEL[rec.lens] ?? rec.lens}
            </Badge>
            <Badge
              variant="outline"
              className="h-3.5 px-1 text-[9px] text-muted-foreground"
              title={`evidence: ${rec.evidenceType} · category: ${rec.category}`}
            >
              {rec.evidenceType} · {rec.category}
            </Badge>
            <span className={cn(' px-1 py-0 text-[9px] font-medium', matchColor)}>
              {matchPct}%
            </span>
          </div>
          {(primaryReason || secondaryReason) && (
            <div className="mt-0.5 text-[10px] text-brand/80">
              ✓ {[primaryReason, secondaryReason].filter(Boolean).join(' · ')}
            </div>
          )}
          <div className="mt-0.5 line-clamp-2 leading-snug text-muted-foreground">
            {rec.narrativeSnippet}
          </div>
          {rec.keyNumbers.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {rec.keyNumbers.slice(0, 3).map((n, i) => (
                <span
                  key={i}
                  className=" bg-brand/10 px-1 py-0 text-[9px] text-brand"
                >
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
        {onInsert && (
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <button
              onClick={() => onInsert(rec, rec.suggestedSectionKey)}
              className="flex items-center gap-1 border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand hover:bg-brand/20"
              title={`섹션 ${rec.suggestedSectionKey} (${SECTION_LABEL[rec.suggestedSectionKey]}) 에 자동 추가`}
            >
              <Plus className="h-2.5 w-2.5" />
              섹션 {rec.suggestedSectionKey}
            </button>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-brand"
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  접기 <ChevronUp className="h-2.5 w-2.5" />
                </>
              ) : (
                <>
                  다른 섹션 · 미리보기 <ChevronDown className="h-2.5 w-2.5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Wave U / U6 — inline expand 패널: 모든 섹션 선택 + 미리보기 */}
      {expanded && onInsert && (
        <div className="mt-2 border border-dashed border-brand/30 bg-brand/5 p-1.5 space-y-1.5">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
            추가할 섹션
          </div>
          <div className="flex flex-wrap gap-1">
            {(['1', '2', '3', '4', '6', '7'] as const).map((s) => {
              const isRecommended = s === rec.suggestedSectionKey
              return (
                <button
                  key={s}
                  onClick={() => {
                    onInsert(rec, s)
                    setExpanded(false)
                  }}
                  className={cn(
                    ' border px-1.5 py-0.5 text-[10px]',
                    isRecommended
                      ? 'border-brand/50 bg-brand/15 font-medium text-brand'
                      : 'border-muted bg-white text-muted-foreground hover:border-brand/40 hover:text-brand',
                  )}
                  title={`섹션 ${s} (${SECTION_LABEL[s]}) 에 narrativeSnippet 추가`}
                >
                  {isRecommended && <Sparkles className="-mt-0.5 mr-0.5 inline h-2.5 w-2.5" />}
                  섹션 {s} · {SECTION_LABEL[s]}
                </button>
              )
            })}
            <button
              onClick={() => {
                onInsert(rec, 'chat')
                setExpanded(false)
              }}
              className=" border border-[color:var(--cyan)]/40 bg-[color:var(--cyan)]/10 px-1.5 py-0.5 text-[10px] text-[color:var(--cyan)] hover:bg-[color:var(--cyan)]/20"
              title="섹션이 아닌 챗봇 입력창에 박기 — PM 이 다듬어 전송"
            >
              <MessageSquare className="-mt-0.5 mr-0.5 inline h-2.5 w-2.5" />
              챗봇에 박기
            </button>
          </div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
            추가될 내용 미리보기
          </div>
          <div className=" border bg-white p-1.5 text-[10px] leading-snug text-foreground/90">
            [{rec.name}] {rec.narrativeSnippet}
          </div>
        </div>
      )}
    </li>
  )
}

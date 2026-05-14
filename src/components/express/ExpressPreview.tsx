'use client'

/**
 * ExpressPreview — 우측 7섹션 점진 미리보기
 *  - 섹션별 채움 상태(⬜→🟦→✅)
 *  - 현재 채우는 섹션 오렌지 하이라이트
 *  - 차별화 자산 토글 (수락/제외)
 *  - 부차 기능 1줄 자동 인용 박스
 *
 * (Phase L Wave L2, ADR-011 §3.2 장치 2·3·6·7)
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  SECTION_LABELS,
  SLOT_LABELS,
  type ExpressDraft,
  type SectionKey,
  type SlotKey,
} from '@/lib/express/schema'
import type { AssetMatch } from '@/lib/asset-registry-types'
import type { AutoCitationsBundle, AutoCitation } from '@/lib/express/auto-citations'
import {
  CheckCircle2,
  Circle,
  Edit3,
  ExternalLink,
  TrendingUp,
  Wallet,
  Users,
  GraduationCap,
} from 'lucide-react'

interface Props {
  draft: ExpressDraft
  matchedAssets: AssetMatch[]
  autoCitations: AutoCitationsBundle
  currentSlot: string | null
  projectId: string
  onToggleDiff: (assetId: string) => void
}

const ALL_SECTIONS: SectionKey[] = ['1', '2', '3', '4', '5', '6', '7']

export function ExpressPreview({
  draft,
  matchedAssets,
  autoCitations,
  currentSlot,
  projectId,
  onToggleDiff,
}: Props) {
  const intent = draft.intent
  const km = draft.keyMessages?.[0] ?? ''
  const headlineText = intent || km || '제안 컨셉을 챗봇에서 작성하면 여기에 한 줄 요약이 표시됩니다.'

  const acceptedDiffCount = draft.differentiators?.filter((d) => d.acceptedByPm).length ?? 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-4 sm:p-5">
        {/* 한 줄 요약 카드 */}
        <Card className="border-l-4 border-l-primary bg-orange-50/30">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              핵심 한 줄
            </div>
            <div className="mt-1 text-base font-semibold leading-snug">{headlineText}</div>
            {draft.beforeAfter?.before && draft.beforeAfter?.after && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md border bg-background p-2">
                  <div className="font-medium text-muted-foreground">Before</div>
                  <div className="mt-0.5 line-clamp-3">{draft.beforeAfter.before}</div>
                </div>
                <div className="rounded-md border bg-background p-2">
                  <div className="font-medium text-primary">After</div>
                  <div className="mt-0.5 line-clamp-3">{draft.beforeAfter.after}</div>
                </div>
              </div>
            )}
            {(draft.keyMessages?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {draft.keyMessages!.map((m, i) => (
                  <Badge key={i} variant="outline" className="bg-background text-xs">
                    {m}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 7 섹션 카드 */}
        <div className="space-y-3">
          {ALL_SECTIONS.map((sec) => {
            const text = draft.sections?.[sec] ?? ''
            const slotKey = `sections.${sec}` as SlotKey
            const isActive = currentSlot === slotKey
            const isFilled = text.length >= 200
            const isPartial = text.length > 0 && text.length < 200

            return (
              <Card
                key={sec}
                className={cn(
                  'transition-all',
                  isActive && 'border-l-4 border-l-primary shadow-md ring-1 ring-primary/30',
                  isFilled && !isActive && 'border-l-4 border-l-green-500',
                )}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    {isFilled ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : isPartial || isActive ? (
                      <Circle className="h-4 w-4 text-primary" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    {SECTION_LABELS[sec]}
                  </CardTitle>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {text.length} / 800
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {text ? (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                      {text}
                    </div>
                  ) : (
                    <div className="text-sm italic text-muted-foreground">
                      (아직 작성 전 — 챗봇이 채워나가요)
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* 차별화 자산 카드 */}
        {(draft.differentiators?.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                차별화 자산
                <Badge variant="outline" className="ml-1 text-xs">
                  수락 {acceptedDiffCount} / {draft.differentiators!.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {draft.differentiators!.map((ref) => {
                const match = matchedAssets.find((m) => m.asset.id === ref.assetId)
                const assetName = match?.asset.name ?? ref.assetId
                return (
                  <div
                    key={ref.assetId}
                    className={cn(
                      'flex items-start gap-3 rounded-md border p-3 text-sm transition-all',
                      ref.acceptedByPm
                        ? 'border-primary/30 bg-orange-50/50'
                        : 'border-muted bg-muted/20',
                    )}
                  >
                    <div className="flex-1">
                      <div className="font-medium">{assetName}</div>
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {ref.narrativeSnippet}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span>{ref.sectionKey}</span>
                        {match && (
                          <span>· 점수 {match.matchScore.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={ref.acceptedByPm ? 'default' : 'outline'}
                      onClick={() => onToggleDiff(ref.assetId)}
                      className="text-xs"
                    >
                      {ref.acceptedByPm ? '수락' : '제외'}
                    </Button>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* 부차 기능 1줄 자동 인용 */}
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">부차 기능 (자동 인용)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            <CitationLine c={autoCitations.sroi} icon={<TrendingUp />} projectId={projectId} />
            <CitationLine c={autoCitations.budget} icon={<Wallet />} projectId={projectId} />
            <CitationLine c={autoCitations.coaches} icon={<Users />} projectId={projectId} />
            <CitationLine
              c={autoCitations.curriculum}
              icon={<GraduationCap />}
              projectId={projectId}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              위 수치는 추정치 — 정밀화는 [정밀 기획 (Deep)] 에서.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 1줄 인용 라인 (Phase L L4 강화)
//  - 신뢰도 색상 (낮으면 회색·중간 노랑·높으면 녹색)
//  - 인용 자산 칩 (있을 때)
//  - 외부 프롬프트 복사 버튼 (있을 때 — coach-finder 등)
//  - rationale tooltip
// ─────────────────────────────────────────

function CitationLine({
  c,
  icon,
  projectId,
}: {
  c: AutoCitation
  icon: React.ReactNode
  projectId: string
}) {
  const conf = c.confidence
  const confColor =
    conf >= 0.6
      ? 'bg-green-100 text-green-800'
      : conf >= 0.4
        ? 'bg-amber-100 text-amber-800'
        : 'bg-muted text-muted-foreground'
  const confLabel = conf >= 0.6 ? '높음' : conf >= 0.4 ? '중간' : '추정'

  const handleCopyPrompt = async () => {
    if (!c.externalPrompt) return
    try {
      await navigator.clipboard.writeText(c.externalPrompt)
      const { toast } = await import('sonner')
      toast.success(`외부 ${c.area} 프롬프트 복사 완료. ChatGPT/coach-finder 에 붙여넣으세요.`)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-1 text-sm" title={c.rationale}>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        <span className="flex-1">{c.oneLiner}</span>
        <span
          className={cn('rounded-md px-1.5 py-0.5 text-[10px] tabular-nums', confColor)}
          title={`신뢰도 ${(conf * 100).toFixed(0)}% — ${c.rationale}`}
        >
          {confLabel} {(conf * 100).toFixed(0)}
        </span>
        <a
          href={`/projects/${projectId}${c.deepLink}`}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Deep <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* 인용 자산 칩 + 외부 프롬프트 복사 버튼 */}
      {(c.citedAssets || c.externalPrompt) && (
        <div className="flex flex-wrap items-center gap-1.5 pl-5">
          {c.citedAssets?.map((a) => (
            <span
              key={a.id}
              className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] text-primary border border-primary/20"
              title={a.id}
            >
              📎 {a.name.length > 22 ? a.name.slice(0, 22) + '…' : a.name}
            </span>
          ))}
          {c.externalPrompt && (
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="rounded-md border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-primary"
              title="외부 LLM 또는 coach-finder 에 붙여넣을 프롬프트 복사"
            >
              📋 외부 프롬프트 복사
            </button>
          )}
        </div>
      )}
    </div>
  )
}

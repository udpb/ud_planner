'use client'
/**
 * BrainPanel — W31 (Phase E)
 *
 * Brain 4+1 영역 통합 UI — PM 이 RFP 업로드 후 즉시 보는 통합 답변 화면.
 *
 * 4 영역 (matchTuple 결과):
 *   1. Messages — 유사 수주 사업의 슬로건·키메시지
 *   2. Contents — 인용할 narrative chunk (인용 클릭 → AssetUsage 자동)
 *   3. Methodology — ud Labs 방법론 자산
 *   4. Cases — 결과보고서·사례 자산
 *   +1 Concepts — Concept ontology 매칭
 *
 * Server props 로 matchTuple 결과를 받음.
 * 인용 클릭 시 /api/express/asset-usage POST.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  MessageSquare,
  FileText,
  BookOpen,
  Briefcase,
  Network,
  Quote,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react'

export interface MessageItem {
  patternId: string
  matchScore: number
  sourceProject: string
  outcome: string
  message: {
    slogan?: string
    keyMessages?: string[]
    beforeAfter?: { before?: string; after?: string }
  }
  breakdown: {
    messageSim: number
    logicSim: number
    contentSim: number
    channelMatch: number
    winRateBonus: number
  }
}

export interface ContentItem {
  assetId: string
  matchScore: number
  mmrScore: number
  sectionHint: string | null | undefined
  sourceTier: string | null | undefined
  narrativeSnippet: string
}

export interface ConceptItem {
  conceptId: string
  name: string
  type: string
  weight: number
  matchedBy: string
  assetCount: number
  matchedKeyword?: string
}

export interface ConceptAssetItem {
  assetId: string
  assetName: string
  assetType: string
  matchedConcept: string
  matchedConceptType: string
  matchScore: number
  isCore: boolean
  sourceTier: string | null | undefined
  narrativeSnippet: string
}

export interface BrainPanelProps {
  projectId: string
  channel: string
  rfpEstimate: {
    contentKeywords: string[]
    logicGraph?: { nodeCount: number; edgeCount: number } | null
  }
  messages: MessageItem[]
  contents: ContentItem[]
  methodologyAssets: ContentItem[]
  caseAssets: ContentItem[]
  matchedConcepts: ConceptItem[]
  conceptAssets: ConceptAssetItem[]
  meta: { elapsedMs: number; totalCandidates: number }
}

const TYPE_COLOR: Record<string, string> = {
  methodology: 'bg-orange-100 text-orange-800 border-orange-200',
  metric: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  persona: 'bg-purple-100 text-purple-800 border-purple-200',
  domain: 'bg-green-100 text-green-800 border-green-200',
  tool: 'bg-amber-100 text-amber-800 border-amber-200',
  partnership: 'bg-red-100 text-red-800 border-red-200',
  framework: 'bg-blue-100 text-blue-800 border-blue-200',
  'event-type': 'bg-pink-100 text-pink-800 border-pink-200',
}

export function BrainPanel(props: BrainPanelProps) {
  const [cited, setCited] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Set<string>>(new Set())

  async function cite(assetId: string, sectionKey?: string) {
    if (cited.has(assetId) || pending.has(assetId)) return
    setPending((p) => new Set(p).add(assetId))
    try {
      const res = await fetch('/api/express/asset-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: props.projectId,
          assetId,
          sectionKey,
          channel: props.channel,
          surface: 'manual',
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCited((c) => new Set(c).add(assetId))
      toast.success('자산 인용 기록됨 (AssetUsage)')
    } catch (e) {
      toast.error(`인용 기록 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setPending((p) => {
        const n = new Set(p)
        n.delete(assetId)
        return n
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* 헤더 — meta */}
      <div className=" border bg-card p-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs">
            <Badge variant="outline" className="text-[10px]">
              channel: {props.channel}
            </Badge>
            <span className="text-muted-foreground">
              {props.meta.elapsedMs}ms ·{' '}
              {props.meta.totalCandidates} candidates
            </span>
          </div>
          <Link
            href="/admin/brain"
            className="text-[11px] text-brand hover:underline"
          >
            Brain Dashboard →
          </Link>
        </div>
        {props.rfpEstimate.contentKeywords.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="text-[10px] text-muted-foreground">RFP keywords:</span>
            {props.rfpEstimate.contentKeywords.slice(0, 12).map((k) => (
              <Badge key={k} variant="outline" className="text-[10px]">
                {k}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* +1: Concepts — Brain Ontology 매칭 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Network className="h-3.5 w-3.5 text-purple-600" />
            +1 Concepts ({props.matchedConcepts.length})
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
              Brain Ontology
            </span>
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            RFP 의 키워드와 Brain의 Concept 매칭 — 핵심 개념 자동 추출
          </p>
        </CardHeader>
        <CardContent>
          {props.matchedConcepts.length === 0 ? (
            <div className=" border border-amber-200 bg-amber-50/40 p-3 text-[11px]">
              ⚠ Brain 이 RFP 키워드와 매칭되는 Concept 을 찾지 못함. 신규 도메인 가능성.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {props.matchedConcepts.slice(0, 20).map((c) => (
                <Badge
                  key={c.conceptId}
                  className={`text-[10px] ${TYPE_COLOR[c.type] || 'bg-gray-100'}`}
                  variant="outline"
                  title={`type: ${c.type} · 자산 ${c.assetCount} · 매칭: ${c.matchedBy}${c.matchedKeyword ? ` (${c.matchedKeyword})` : ''}`}
                >
                  {c.name} <span className="ml-1 opacity-60">{c.assetCount}a</span>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 1. Messages — 유사 수주 사업 슬로건 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
            1. Messages — 유사 수주 사업 슬로건 ({props.messages.length})
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            3-tuple message vector 매칭 결과
          </p>
        </CardHeader>
        <CardContent>
          {props.messages.length === 0 ? (
            <p className="text-xs text-muted-foreground">매칭 없음</p>
          ) : (
            <div className="space-y-2">
              {props.messages.slice(0, 5).map((m) => (
                <div
                  key={m.patternId}
                  className=" border bg-blue-50/30 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${m.outcome === 'won' ? 'border-green-300 bg-green-50' : ''}`}
                        >
                          {m.outcome}
                        </Badge>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {m.sourceProject}
                        </span>
                      </div>
                      {m.message.slogan && (
                        <div className="mb-1 text-xs font-medium italic">
                          “{m.message.slogan}”
                        </div>
                      )}
                      {m.message.keyMessages && m.message.keyMessages.length > 0 && (
                        <ul className="ml-3 list-disc space-y-0.5 text-[11px] text-foreground/80">
                          {m.message.keyMessages.slice(0, 3).map((km, i) => (
                            <li key={i}>{km}</li>
                          ))}
                        </ul>
                      )}
                      {m.message.beforeAfter && (
                        <div className="mt-1.5 text-[10px] text-muted-foreground">
                          {m.message.beforeAfter.before && (
                            <span>Before: {m.message.beforeAfter.before}</span>
                          )}
                          {m.message.beforeAfter.after && (
                            <>
                              {m.message.beforeAfter.before && ' → '}
                              <span>After: {m.message.beforeAfter.after}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-[10px] text-muted-foreground">
                      <div className="font-mono">{m.matchScore.toFixed(3)}</div>
                      <div className="text-[9px]">
                        msg {m.breakdown.messageSim.toFixed(2)} · logic{' '}
                        {m.breakdown.logicSim.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 2. Contents — narrative chunk */}
        <AssetSection
          icon={<FileText className="h-3.5 w-3.5 text-orange-600" />}
          title="2. Contents (제안서 narrative)"
          subtitle="bm25 + cosine + MMR 매칭"
          assets={props.contents}
          cited={cited}
          pending={pending}
          onCite={cite}
        />

        {/* 3. Methodology */}
        <AssetSection
          icon={<BookOpen className="h-3.5 w-3.5 text-green-600" />}
          title="3. Methodology (ud Labs 방법론)"
          subtitle="회사 IP — DOGS·ACTT·5D·IMPACT·UCA 등"
          assets={props.methodologyAssets}
          cited={cited}
          pending={pending}
          onCite={cite}
        />
      </div>

      {/* 4. Cases */}
      <AssetSection
        icon={<Briefcase className="h-3.5 w-3.5 text-pink-600" />}
        title="4. Cases (결과보고서·성공·레슨)"
        subtitle="과거 사업의 핵심 지표·성공 요인·어려운 점"
        assets={props.caseAssets}
        cited={cited}
        pending={pending}
        onCite={cite}
      />

      {/* Concept-matched assets (Brain Ontology 활용) */}
      {props.conceptAssets.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Network className="h-3.5 w-3.5 text-purple-600" />
              Concept 기반 자산 ({props.conceptAssets.length})
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Concept ontology 통해 발견된 추가 자산 (BM25 매칭 외)
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {props.conceptAssets.slice(0, 5).map((a) => (
                <div
                  key={a.assetId}
                  className=" border bg-purple-50/30 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${TYPE_COLOR[a.matchedConceptType] || 'bg-gray-100'}`}
                        >
                          {a.matchedConcept}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          via {a.assetType}
                          {a.isCore && ' · core'}
                        </span>
                      </div>
                      <div className="mb-1 truncate text-xs font-medium">
                        {a.assetName}
                      </div>
                      <div className="line-clamp-2 text-[10px] text-foreground/70">
                        {a.narrativeSnippet}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 text-[10px]">
                      <span className="font-mono text-muted-foreground">
                        {a.matchScore.toFixed(2)}
                      </span>
                      <CiteButton
                        cited={cited.has(a.assetId)}
                        pending={pending.has(a.assetId)}
                        onClick={() => cite(a.assetId)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function AssetSection({
  icon,
  title,
  subtitle,
  assets,
  cited,
  pending,
  onCite,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  assets: ContentItem[]
  cited: Set<string>
  pending: Set<string>
  onCite: (assetId: string, sectionKey?: string) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          {icon}
          {title} ({assets.length})
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        {assets.length === 0 ? (
          <p className="text-xs text-muted-foreground">매칭 없음</p>
        ) : (
          <div className="space-y-2">
            {assets.slice(0, 5).map((a) => (
              <div
                key={a.assetId}
                className=" border bg-card p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-1.5">
                      {a.sourceTier && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${a.sourceTier === 'high' ? 'border-orange-300 bg-orange-50' : ''}`}
                        >
                          {a.sourceTier}
                        </Badge>
                      )}
                      {a.sectionHint && (
                        <Badge variant="outline" className="text-[9px]">
                          §{a.sectionHint}
                        </Badge>
                      )}
                    </div>
                    <div className="line-clamp-3 text-[11px] text-foreground/85">
                      {a.narrativeSnippet}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 text-[10px]">
                    <span className="font-mono text-muted-foreground">
                      {a.matchScore.toFixed(2)}
                    </span>
                    <CiteButton
                      cited={cited.has(a.assetId)}
                      pending={pending.has(a.assetId)}
                      onClick={() => onCite(a.assetId, a.sectionHint ?? undefined)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CiteButton({
  cited,
  pending,
  onClick,
}: {
  cited: boolean
  pending: boolean
  onClick: () => void
}) {
  if (cited) {
    return (
      <span className="inline-flex items-center gap-0.5 border border-green-300 bg-green-50 px-1.5 py-0.5 text-[9px] text-green-700">
        <CheckCircle2 className="h-3 w-3" />
        인용됨
      </span>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-0.5 border border-orange-300 bg-orange-50 px-1.5 py-0.5 text-[9px] text-orange-700 transition hover:bg-orange-100 disabled:opacity-50"
    >
      <Quote className="h-3 w-3" />
      {pending ? '...' : '인용'}
    </button>
  )
}

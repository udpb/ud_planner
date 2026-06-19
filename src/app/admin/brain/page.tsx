/**
 * /admin/brain — W25 (Phase C, Meta-Cognition) ⭐
 *
 * Brain 통합 1 페이지 대시보드.
 *
 * 영역:
 *   1. Summary — DB 카운트 + Coverage
 *   2. Top Concepts — assetCount + patternCount + winRate
 *   3. Channel Imbalance — W24 결과 일부
 *   4. Difficulty Concepts — W27 결과 일부
 *   5. Recent Activity — 최근 ingest + 매핑
 *
 * Server Component — Prisma 직접 조회.
 */

import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import {
  Brain,
  Network,
  Layers,
  TrendingUp,
  AlertCircle,
  Sparkles,
} from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Brain Dashboard | UD Brain' }

interface ConceptRow {
  id: string
  name: string
  type: string
  assetCount: number
  patternCount: number
  winRate: number | null
}

interface ChannelImbalanceRow {
  conceptName: string
  conceptType: string
  majorityChannel: string
  share: number
  channels: string[]
}

interface DifficultyRow {
  conceptName: string
  conceptType: string
  difficultyCount: number
  winCount: number
  gap: number
}

async function getBrainStats() {
  // 1. DB 카운트
  const [
    contentAsset,
    contentAssetStable,
    contentAssetDeveloping,
    concept,
    assetConcept,
    conceptRelation,
    winningPattern,
    patternConcept,
    assetUsage,
    assetUsageLabeled,
  ] = await Promise.all([
    prisma.contentAsset.count(),
    prisma.contentAsset.count({ where: { status: 'stable' } }),
    prisma.contentAsset.count({ where: { status: 'developing' } }),
    prisma.concept.count(),
    prisma.assetConcept.count(),
    prisma.conceptRelation.count(),
    prisma.winningPattern.count(),
    prisma.patternConcept.count(),
    prisma.assetUsage.count(),
    prisma.assetUsage.count({ where: { wonProject: { not: null } } }),
  ])

  // 2. 자산 type 별
  const byAssetType = await prisma.contentAsset.groupBy({
    by: ['assetType'],
    _count: { id: true },
  })

  // 3. local-2026 high count
  const local2026 = await prisma.contentAsset.count({
    where: { sourceType: 'local-2026', sourceTier: 'high' },
  })

  // 4. Concept top — assetCount + patternCount 합산
  const concepts = await prisma.concept.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      assetCount: true,
      patternCount: true,
      winRate: true,
    },
    orderBy: [{ assetCount: 'desc' }, { patternCount: 'desc' }],
    take: 20,
  })
  const topConcepts: ConceptRow[] = concepts.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    assetCount: c.assetCount,
    patternCount: c.patternCount,
    winRate: c.winRate,
  }))

  // 5. Concept type 분포
  const conceptByType = await prisma.concept.groupBy({
    by: ['type'],
    _count: { id: true },
  })

  // 6. 채널 편중 — PatternConcept × WinningPattern
  const patterns = await prisma.winningPattern.findMany({
    select: { id: true, channelType: true },
  })
  const patternById = new Map(patterns.map((p) => [p.id, p.channelType ?? 'B2G']))

  const conceptChannelMap = new Map<string, Map<string, number>>()
  const pcWithPatternId = await prisma.patternConcept.findMany({
    select: {
      patternId: true,
      conceptId: true,
      concept: { select: { name: true, type: true } },
    },
  })
  for (const pc of pcWithPatternId) {
    const ch = patternById.get(pc.patternId) ?? 'B2G'
    if (!conceptChannelMap.has(pc.conceptId)) conceptChannelMap.set(pc.conceptId, new Map())
    const m = conceptChannelMap.get(pc.conceptId)!
    m.set(ch, (m.get(ch) ?? 0) + 1)
  }
  const channelImbalance: ChannelImbalanceRow[] = []
  const conceptMeta = new Map(pcWithPatternId.map((pc) => [pc.conceptId, pc.concept]))
  for (const [cid, m] of conceptChannelMap) {
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0)
    if (total < 3) continue
    let maxCh = ''
    let maxC = 0
    for (const [ch, c] of m) if (c > maxC) (maxCh = ch), (maxC = c)
    const share = maxC / total
    if (share >= 0.8) {
      const cm = conceptMeta.get(cid)
      if (cm) {
        channelImbalance.push({
          conceptName: cm.name,
          conceptType: cm.type,
          majorityChannel: maxCh,
          share: Number(share.toFixed(2)),
          channels: Array.from(m.keys()),
        })
      }
    }
  }
  channelImbalance.sort((a, b) => b.share - a.share)

  // 7. Difficulty concepts (W27 일부 재현)
  const difficultyAssets = await prisma.contentAsset.findMany({
    where: {
      assetType: 'case',
      OR: [
        { name: { contains: '어려운', mode: 'insensitive' } },
        { name: { contains: '레슨', mode: 'insensitive' } },
        { name: { contains: '개선', mode: 'insensitive' } },
        { name: { contains: '리스크', mode: 'insensitive' } },
      ],
    },
    select: {
      concepts: {
        select: {
          conceptId: true,
          concept: { select: { id: true, name: true, type: true } },
        },
      },
    },
  })
  const winAssets = await prisma.contentAsset.findMany({
    where: {
      assetType: 'case',
      OR: [
        { name: { contains: '성공', mode: 'insensitive' } },
        { name: { contains: '핵심', mode: 'insensitive' } },
        { name: { contains: '강점', mode: 'insensitive' } },
      ],
    },
    select: { concepts: { select: { conceptId: true } } },
  })
  const winCount = new Map<string, number>()
  for (const a of winAssets) for (const c of a.concepts) winCount.set(c.conceptId, (winCount.get(c.conceptId) ?? 0) + 1)
  const diffCount = new Map<string, { name: string; type: string; n: number }>()
  for (const a of difficultyAssets) {
    for (const c of a.concepts) {
      const cur = diffCount.get(c.conceptId)
      if (cur) cur.n++
      else diffCount.set(c.conceptId, { name: c.concept.name, type: c.concept.type, n: 1 })
    }
  }
  const difficulty: DifficultyRow[] = []
  for (const [cid, d] of diffCount) {
    if (d.n < 2) continue
    const w = winCount.get(cid) ?? 0
    const gap = d.n - w
    if (gap >= 1) {
      difficulty.push({
        conceptName: d.name,
        conceptType: d.type,
        difficultyCount: d.n,
        winCount: w,
        gap,
      })
    }
  }
  difficulty.sort((a, b) => b.gap - a.gap)

  // 8. 최근 ingest
  const recent = await prisma.contentAsset.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      name: true,
      assetType: true,
      sourceTier: true,
      sourceType: true,
      createdAt: true,
    },
  })

  return {
    summary: {
      contentAsset,
      contentAssetStable,
      contentAssetDeveloping,
      concept,
      assetConcept,
      conceptRelation,
      winningPattern,
      patternConcept,
      assetUsage,
      assetUsageLabeled,
      local2026,
    },
    byAssetType,
    conceptByType,
    topConcepts,
    channelImbalance: channelImbalance.slice(0, 12),
    difficulty: difficulty.slice(0, 10),
    recent,
  }
}

export default async function BrainDashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const data = await getBrainStats()

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="Brain Dashboard (Phase B·C)" />
      <div className="flex-1 overflow-y-auto p-6">
        {/* Top Stats */}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            icon={<Layers className="h-4 w-4 text-brand" />}
            label="ContentAsset"
            value={data.summary.contentAsset}
            sub={`stable ${data.summary.contentAssetStable} · developing ${data.summary.contentAssetDeveloping}`}
          />
          <StatCard
            icon={<Brain className="h-4 w-4 text-blue-600" />}
            label="Concept (Ontology)"
            value={data.summary.concept}
            sub={`AssetConcept ${data.summary.assetConcept}`}
          />
          <StatCard
            icon={<Network className="h-4 w-4 text-purple-600" />}
            label="ConceptRelation"
            value={data.summary.conceptRelation}
            sub={`RDF triple graph`}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4 text-green-600" />}
            label="WinningPattern"
            value={data.summary.winningPattern}
            sub={`PatternConcept ${data.summary.patternConcept}`}
          />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            icon={<Sparkles className="h-4 w-4 text-orange-600" />}
            label="local-2026 high"
            value={data.summary.local2026}
            sub="2026 최신 자료"
            tone="orange"
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4 text-amber-600" />}
            label="AssetUsage"
            value={data.summary.assetUsage}
            sub={`labeled ${data.summary.assetUsageLabeled}`}
          />
          <StatCard
            icon={<Layers className="h-4 w-4 text-muted-foreground" />}
            label="methodology"
            value={data.byAssetType.find((t) => t.assetType === 'methodology')?._count.id ?? 0}
            sub="(자산 type)"
          />
          <StatCard
            icon={<Layers className="h-4 w-4 text-muted-foreground" />}
            label="case + proposal"
            value={(data.byAssetType.find((t) => t.assetType === 'case')?._count.id ?? 0) + (data.byAssetType.find((t) => t.assetType === 'proposal')?._count.id ?? 0)}
            sub="(historical 자산)"
          />
        </div>

        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {/* Top Concepts */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Brain className="h-3.5 w-3.5 text-blue-600" />
                Top Concepts ({data.topConcepts.length}/{data.summary.concept})
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                자산 + 패턴 합산 Top 20 — Brain 의 중심 entity
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-[11px]">
                {data.topConcepts.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 border bg-blue-50/30 p-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <Badge variant="outline" className="h-3.5 px-1 text-[9px]">
                      {c.type}
                    </Badge>
                    <span className="tabular-nums text-muted-foreground">
                      {c.assetCount}a / {c.patternCount}p
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Channel Imbalance */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                Channel 편중 Concept ({data.channelImbalance.length})
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                단일 채널 ≥80% — B2B/B2G 확장 후보
              </p>
            </CardHeader>
            <CardContent>
              {data.channelImbalance.length === 0 ? (
                <p className="text-xs text-muted-foreground">편중 없음 ✓</p>
              ) : (
                <ul className="space-y-1 text-[11px]">
                  {data.channelImbalance.map((c) => (
                    <li
                      key={c.conceptName}
                      className="flex items-center justify-between gap-2 border bg-amber-50/30 p-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate">{c.conceptName}</span>
                      <Badge variant="outline" className="h-3.5 px-1 text-[9px]">
                        {c.conceptType.slice(0, 4)}
                      </Badge>
                      <span className="tabular-nums text-muted-foreground">
                        {c.majorityChannel} {(c.share * 100).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {/* Difficulty Concepts */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                Difficulty Concepts (W27 사후 분석)
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                어려움 자산에 자주 — 성공 자산엔 부족 (gap 우선)
              </p>
            </CardHeader>
            <CardContent>
              {data.difficulty.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  미흡 인사이트 없음 ✓ (또는 데이터 부족)
                </p>
              ) : (
                <ul className="space-y-1 text-[11px]">
                  {data.difficulty.map((d) => (
                    <li
                      key={d.conceptName}
                      className="flex items-center justify-between gap-2 border bg-red-50/30 p-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate">{d.conceptName}</span>
                      <Badge variant="outline" className="h-3.5 px-1 text-[9px]">
                        {d.conceptType.slice(0, 4)}
                      </Badge>
                      <span className="tabular-nums text-muted-foreground">
                        diff {d.difficultyCount} / win {d.winCount} (gap {d.gap})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Recent Ingest */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Sparkles className="h-3.5 w-3.5 text-orange-600" />
                최근 ingest (top 10)
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                Brain 으로 흘러들어온 최신 자산
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-[11px]">
                {data.recent.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 border bg-orange-50/30 p-1.5"
                  >
                    <Link
                      href={`/admin/content-hub/${r.id}/edit`}
                      className="min-w-0 flex-1 truncate hover:text-brand"
                    >
                      {r.name}
                    </Link>
                    <Badge variant="outline" className="h-3.5 px-1 text-[9px]">
                      {r.assetType}
                    </Badge>
                    <span className="tabular-nums text-muted-foreground">
                      {r.sourceType}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Concept by type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Brain className="h-3.5 w-3.5 text-blue-600" />
              Concept 분포 (type별)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.conceptByType
                .sort((a, b) => b._count.id - a._count.id)
                .map((t) => (
                  <Badge key={t.type} variant="outline" className="text-[11px]">
                    {t.type}: {t._count.id}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 flex gap-3 text-[11px]">
          <Link
            href="/admin/brain/graph"
            className=" border bg-purple-50 px-3 py-1.5 hover:bg-purple-100"
          >
            → Concept Graph 시각화 (W26)
          </Link>
          <Link
            href="/admin/asset-insights"
            className=" border bg-gray-50 px-3 py-1.5 hover:bg-gray-100"
          >
            → 자산 인사이트 (Wave N5)
          </Link>
          <Link
            href="/admin/content-hub"
            className=" border bg-gray-50 px-3 py-1.5 hover:bg-gray-100"
          >
            → Content Hub
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  sub?: string
  tone?: 'green' | 'amber' | 'red' | 'gray' | 'orange'
}) {
  const bg =
    tone === 'orange'
      ? 'bg-orange-50/40 border-orange-200'
      : tone === 'green'
        ? 'bg-green-50/40 border-green-200'
        : 'bg-card'
  return (
    <div className={`flex flex-col gap-1 border ${bg} p-3`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

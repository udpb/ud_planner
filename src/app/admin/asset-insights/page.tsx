/**
 * /admin/asset-insights — Wave N5 (2026-05-15)
 *
 * 자산 운영 가시화 — freshness · usage · win-rate · embedding 상태.
 * 월 1회 회고 + 자산 폐기/갱신 결정의 기반.
 *
 * Server Component — Prisma 로 통계 집계 후 한 번에 렌더.
 */

import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { prisma } from '@/lib/prisma'
import { EMBEDDING_MODEL_LABEL } from '@/lib/ai/embedding'
import { Sparkles, AlertTriangle, TrendingUp, RefreshCw, Box } from 'lucide-react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { title: '자산 인사이트 | Content Hub' }

const DAY_MS = 24 * 60 * 60 * 1000

interface FreshRow {
  id: string
  name: string
  category: string
  evidenceType: string
  daysOld: number
}

interface UsageRow {
  assetId: string
  name: string
  total: number
  wins: number
  losses: number
  pending: number
  winRate: number | null
}

async function getInsights() {
  const now = Date.now()
  const cutoff12 = new Date(now - 365 * DAY_MS)
  const cutoff18 = new Date(now - 540 * DAY_MS)

  // freshness
  const allActive = await prisma.contentAsset.findMany({
    where: { status: { not: 'archived' } },
    select: {
      id: true,
      name: true,
      category: true,
      evidenceType: true,
      lastReviewedAt: true,
      embeddingModel: true,
      embeddedAt: true,
    },
  })

  const stale: FreshRow[] = []
  const aging: FreshRow[] = []
  let fresh = 0
  let noEmbedding = 0

  for (const a of allActive) {
    const daysOld = Math.floor((now - a.lastReviewedAt.getTime()) / DAY_MS)
    const row: FreshRow = {
      id: a.id,
      name: a.name,
      category: a.category,
      evidenceType: a.evidenceType,
      daysOld,
    }
    if (a.lastReviewedAt < cutoff18) stale.push(row)
    else if (a.lastReviewedAt < cutoff12) aging.push(row)
    else fresh++

    if (a.embeddingModel !== EMBEDDING_MODEL_LABEL || !a.embeddedAt) noEmbedding++
  }

  stale.sort((a, b) => b.daysOld - a.daysOld)
  aging.sort((a, b) => b.daysOld - a.daysOld)

  // usage + win-rate
  const usageGroups = await prisma.assetUsage.groupBy({
    by: ['assetId', 'wonProject'],
    _count: { id: true },
  })

  const usageMap = new Map<string, { total: number; wins: number; losses: number; pending: number }>()
  for (const row of usageGroups) {
    const cur = usageMap.get(row.assetId) ?? { total: 0, wins: 0, losses: 0, pending: 0 }
    cur.total += row._count.id
    if (row.wonProject === true) cur.wins += row._count.id
    else if (row.wonProject === false) cur.losses += row._count.id
    else cur.pending += row._count.id
    usageMap.set(row.assetId, cur)
  }

  const usageAssetIds = Array.from(usageMap.keys())
  const usageAssets =
    usageAssetIds.length === 0
      ? []
      : await prisma.contentAsset.findMany({
          where: { id: { in: usageAssetIds } },
          select: { id: true, name: true },
        })
  const assetNameMap = new Map(usageAssets.map((a) => [a.id, a.name]))

  const usage: UsageRow[] = Array.from(usageMap.entries())
    .map(([assetId, c]) => {
      const labeled = c.wins + c.losses
      return {
        assetId,
        name: assetNameMap.get(assetId) ?? assetId,
        total: c.total,
        wins: c.wins,
        losses: c.losses,
        pending: c.pending,
        winRate: labeled >= 3 ? c.wins / labeled : null,
      }
    })
    .sort((a, b) => {
      // win-rate 있는 것 우선, 다음 total 많은 순
      if (a.winRate !== null && b.winRate !== null) return b.winRate - a.winRate
      if (a.winRate !== null) return -1
      if (b.winRate !== null) return 1
      return b.total - a.total
    })

  return {
    summary: {
      totalActive: allActive.length,
      fresh,
      aging: aging.length,
      stale: stale.length,
      noEmbedding,
    },
    stale,
    aging,
    usage,
  }
}

export default async function AssetInsightsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  // 자산 인사이트는 PM 도 열람 가능 (보기만 — 자산 편집은 별도 페이지에서 권한 체크)

  const data = await getInsights()

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="자산 인사이트 (Wave N5)" />
      <div className="flex-1 overflow-y-auto p-6">
        {/* Summary 4 카드 */}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard
            icon={<Sparkles className="h-4 w-4 text-green-600" />}
            label="신선 (< 12개월)"
            value={data.summary.fresh}
            of={data.summary.totalActive}
            tone="green"
          />
          <SummaryCard
            icon={<TrendingUp className="h-4 w-4 text-amber-600" />}
            label="중간 (12~18개월)"
            value={data.summary.aging}
            of={data.summary.totalActive}
            tone="amber"
          />
          <SummaryCard
            icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
            label="묵음 (> 18개월)"
            value={data.summary.stale}
            of={data.summary.totalActive}
            tone="red"
          />
          <SummaryCard
            icon={<Box className="h-4 w-4 text-muted-foreground" />}
            label="임베딩 미생성"
            value={data.summary.noEmbedding}
            of={data.summary.totalActive}
            tone="gray"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 묵은 자산 — stale */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                묵은 자산 ({data.stale.length})
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                18개월 넘게 검토 안 됨 — 정량 자산이면 수치 갱신 필수
              </p>
            </CardHeader>
            <CardContent>
              {data.stale.length === 0 ? (
                <p className="text-xs text-muted-foreground">묵은 자산 없음 ✓</p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto text-[11px]">
                  {data.stale.slice(0, 30).map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded border bg-red-50/30 p-1.5"
                    >
                      <Link
                        href={`/admin/content-hub/${a.id}/edit`}
                        className="min-w-0 flex-1 truncate hover:text-primary"
                      >
                        {a.name}
                      </Link>
                      <Badge
                        variant="outline"
                        className="h-3.5 px-1 text-[9px]"
                      >
                        {a.evidenceType}
                      </Badge>
                      <span className="tabular-nums text-muted-foreground">
                        {a.daysOld}일
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 중간 — aging */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <RefreshCw className="h-3.5 w-3.5 text-amber-600" />
                갱신 권장 ({data.aging.length})
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                12~18개월 — 다음 분기 회고 대상
              </p>
            </CardHeader>
            <CardContent>
              {data.aging.length === 0 ? (
                <p className="text-xs text-muted-foreground">갱신 권장 없음 ✓</p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto text-[11px]">
                  {data.aging.slice(0, 30).map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded border bg-amber-50/30 p-1.5"
                    >
                      <Link
                        href={`/admin/content-hub/${a.id}/edit`}
                        className="min-w-0 flex-1 truncate hover:text-primary"
                      >
                        {a.name}
                      </Link>
                      <span className="tabular-nums text-muted-foreground">
                        {a.daysOld}일
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Usage / Win-rate */}
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              자산 사용 + 수주 성과 ({data.usage.length})
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">
              라벨 3건 이상이어야 winRate 표시. 가산점 (asset-recommender) 학습
              데이터.
            </p>
          </CardHeader>
          <CardContent>
            {data.usage.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                아직 자산 사용 기록 없음 — Inspector 추천 카드에서 인용 클릭 시
                기록 시작.
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto rounded-md border">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted/40">
                    <tr>
                      <th className="px-2 py-1 text-left">자산</th>
                      <th className="px-2 py-1 text-right">사용</th>
                      <th className="px-2 py-1 text-right">수주</th>
                      <th className="px-2 py-1 text-right">탈락</th>
                      <th className="px-2 py-1 text-right">미정</th>
                      <th className="px-2 py-1 text-right">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.usage.map((u) => (
                      <tr
                        key={u.assetId}
                        className="border-t hover:bg-muted/20"
                      >
                        <td className="px-2 py-1">
                          <Link
                            href={`/admin/content-hub/${u.assetId}/edit`}
                            className="hover:text-primary"
                          >
                            {u.name}
                          </Link>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {u.total}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-green-700">
                          {u.wins}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-red-600">
                          {u.losses}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                          {u.pending}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {u.winRate === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={
                                u.winRate >= 0.7
                                  ? 'font-medium text-green-700'
                                  : u.winRate >= 0.4
                                    ? 'text-amber-700'
                                    : 'text-red-600'
                              }
                            >
                              {Math.round(u.winRate * 100)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// SummaryCard
// ─────────────────────────────────────────
function SummaryCard({
  icon,
  label,
  value,
  of,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  of: number
  tone: 'green' | 'amber' | 'red' | 'gray'
}) {
  const ring =
    tone === 'green'
      ? 'border-green-200 bg-green-50/30'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50/30'
        : tone === 'red'
          ? 'border-red-200 bg-red-50/30'
          : 'border-muted bg-muted/20'
  return (
    <Card className={ring}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-2xl font-bold tabular-nums">{value}</span>
          {of > 0 && (
            <span className="text-xs text-muted-foreground">/ {of}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

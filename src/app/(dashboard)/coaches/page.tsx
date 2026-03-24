import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: '코치 DB' }

const TIER_LABEL: Record<string, string> = {
  TIER1: '파트너코치',
  TIER2: '전문코치',
  TIER3: '글로벌/컨설턴트',
}
const TIER_VARIANT: Record<string, string> = {
  TIER1: 'default',
  TIER2: 'secondary',
  TIER3: 'outline',
}

interface SearchParams {
  q?: string
  tier?: string
  category?: string
  page?: string
}

async function getCoaches(params: SearchParams) {
  const page = Number(params.page ?? 1)
  const take = 20
  const skip = (page - 1) * take

  const where: any = { isActive: true }
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: 'insensitive' } },
      { organization: { contains: params.q, mode: 'insensitive' } },
      { mainField: { contains: params.q, mode: 'insensitive' } },
    ]
  }
  if (params.tier) where.tier = params.tier
  if (params.category) where.category = params.category

  const [coaches, total] = await Promise.all([
    prisma.coach.findMany({
      where,
      select: {
        id: true,
        name: true,
        organization: true,
        position: true,
        tier: true,
        category: true,
        mainField: true,
        expertise: true,
        satisfactionAvg: true,
        collaborationCount: true,
        isActive: true,
        lectureRateMain: true,
        coachRateMain: true,
      },
      orderBy: [{ tier: 'asc' }, { collaborationCount: 'desc' }],
      skip,
      take,
    }),
    prisma.coach.count({ where }),
  ])

  return { coaches, total, page, totalPages: Math.ceil(total / take) }
}

export default async function CoachesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const { coaches, total, page, totalPages } = await getCoaches(params)

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="코치 DB" />
      <div className="flex-1 overflow-y-auto p-6">
        {/* 필터 바 */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <form className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={params.q}
                placeholder="이름, 기관, 전문분야 검색..."
                className="pl-9"
              />
            </div>
            <select
              name="tier"
              defaultValue={params.tier}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">전체 티어</option>
              <option value="TIER1">파트너코치</option>
              <option value="TIER2">전문코치</option>
              <option value="TIER3">글로벌/컨설턴트</option>
            </select>
            <Button type="submit" size="sm">검색</Button>
          </form>

          <form action="/api/coaches/sync" method="POST">
            <Button type="submit" variant="outline" size="sm" className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              GitHub 동기화
            </Button>
          </form>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          총 <strong>{total}</strong>명 (활성 코치)
        </p>

        {/* 코치 테이블 */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">이름</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">소속/직함</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">티어</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">전문분야</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">만족도</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">협업횟수</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">강의단가</th>
                  </tr>
                </thead>
                <tbody>
                  {coaches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground">
                        코치가 없습니다. GitHub에서 동기화하거나 직접 추가해주세요.
                      </td>
                    </tr>
                  ) : (
                    coaches.map((coach) => (
                      <tr key={coach.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Link
                            href={`/coaches/${coach.id}`}
                            className="font-medium hover:underline"
                          >
                            {coach.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <div className="leading-tight">
                            <div>{coach.organization ?? '—'}</div>
                            {coach.position && (
                              <div className="text-xs">{coach.position}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={TIER_VARIANT[coach.tier] as any}>
                            {TIER_LABEL[coach.tier]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {coach.expertise.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {coach.expertise.length > 3 && (
                              <span className="text-xs text-muted-foreground">+{coach.expertise.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {coach.satisfactionAvg ? coach.satisfactionAvg.toFixed(1) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {coach.collaborationCount}회
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {coach.lectureRateMain
                            ? `${(coach.lectureRateMain / 10000).toFixed(0)}만`
                            : '미설정'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            {page > 1 && (
              <Link
                href={`/coaches?${new URLSearchParams({ ...params, page: String(page - 1) })}`}
                className="text-sm text-muted-foreground hover:underline"
              >
                이전
              </Link>
            )}
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/coaches?${new URLSearchParams({ ...params, page: String(page + 1) })}`}
                className="text-sm text-muted-foreground hover:underline"
              >
                다음
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

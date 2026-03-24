import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, FolderKanban, BookOpen, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: '대시보드' }

async function getStats() {
  const [coachCount, projectCount, moduleCount, activeProjects] = await Promise.all([
    prisma.coach.count({ where: { isActive: true } }),
    prisma.project.count(),
    prisma.module.count({ where: { isActive: true } }),
    prisma.project.findMany({
      where: { status: { in: ['DRAFT', 'PROPOSAL', 'IN_PROGRESS'] } },
      select: {
        id: true,
        name: true,
        client: true,
        status: true,
        projectStartDate: true,
        totalBudgetVat: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ])
  return { coachCount, projectCount, moduleCount, activeProjects }
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '기획중',
  PROPOSAL: '제안서',
  SUBMITTED: '제출완료',
  IN_PROGRESS: '운영중',
  COMPLETED: '완료',
  LOST: '미수주',
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'secondary',
  PROPOSAL: 'outline',
  SUBMITTED: 'default',
  IN_PROGRESS: 'default',
  COMPLETED: 'secondary',
  LOST: 'destructive',
}

export default async function DashboardPage() {
  const { coachCount, projectCount, moduleCount, activeProjects } = await getStats()

  const stats = [
    { label: '활성 코치', value: coachCount, icon: Users, href: '/coaches' },
    { label: '전체 프로젝트', value: projectCount, icon: FolderKanban, href: '/projects' },
    { label: '교육 모듈', value: moduleCount, icon: BookOpen, href: '/modules' },
    { label: '진행중 프로젝트', value: activeProjects.length, icon: TrendingUp, href: '/projects' },
  ]

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="대시보드" />
      <div className="flex-1 overflow-y-auto p-6">
        {/* 통계 카드 */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, href }) => (
            <Link key={label} href={href}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{value.toLocaleString()}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* 최근 프로젝트 */}
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">최근 프로젝트</h2>
            <Link href="/projects" className="text-xs text-muted-foreground hover:underline">
              전체 보기
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              {activeProjects.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  프로젝트가 없습니다.{' '}
                  <Link href="/projects/new" className="underline">새 프로젝트 만들기</Link>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">프로젝트</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">발주기관</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">상태</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">예산</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeProjects.map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{p.client}</td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_COLOR[p.status] as any}>
                            {STATUS_LABEL[p.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {p.totalBudgetVat
                            ? `${(p.totalBudgetVat / 1_0000_0000).toFixed(1)}억`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

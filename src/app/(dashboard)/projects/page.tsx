import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: '프로젝트' }

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '기획중',
  PROPOSAL: '제안서',
  SUBMITTED: '제출완료',
  IN_PROGRESS: '운영중',
  COMPLETED: '완료',
  LOST: '미수주',
}
const STATUS_VARIANT: Record<string, string> = {
  DRAFT: 'secondary',
  PROPOSAL: 'outline',
  SUBMITTED: 'default',
  IN_PROGRESS: 'default',
  COMPLETED: 'secondary',
  LOST: 'destructive',
}

interface SearchParams {
  status?: string
}

async function getProjects(params: SearchParams) {
  const where: any = {}
  if (params.status) where.status = params.status

  return prisma.project.findMany({
    where,
    select: {
      id: true,
      name: true,
      client: true,
      status: true,
      projectType: true,
      totalBudgetVat: true,
      eduStartDate: true,
      eduEndDate: true,
      pm: { select: { name: true } },
      _count: {
        select: { coachAssignments: true, participants: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const projects = await getProjects(params)

  const statusOptions = ['DRAFT', 'PROPOSAL', 'SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'LOST']

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="프로젝트" />
      <div className="flex-1 overflow-y-auto p-6">
        {/* 상단 액션바 */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex gap-1">
            <Link href="/projects">
              <Button variant={!params.status ? 'default' : 'ghost'} size="sm">전체</Button>
            </Link>
            {statusOptions.map((s) => (
              <Link key={s} href={`/projects?status=${s}`}>
                <Button variant={params.status === s ? 'default' : 'ghost'} size="sm">
                  {STATUS_LABEL[s]}
                </Button>
              </Link>
            ))}
          </div>
          <div className="ml-auto">
            <Link href="/projects/new">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                새 프로젝트
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">프로젝트</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">발주기관</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">유형</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">상태</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">교육기간</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">예산(VAT포함)</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">코치</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">참여자</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">PM</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-muted-foreground">
                        프로젝트가 없습니다.{' '}
                        <Link href="/projects/new" className="underline">새 프로젝트 만들기</Link>
                      </td>
                    </tr>
                  ) : (
                    projects.map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{p.client}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{p.projectType}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANT[p.status] as any}>
                            {STATUS_LABEL[p.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs">
                          {p.eduStartDate && p.eduEndDate
                            ? `${p.eduStartDate.toLocaleDateString('ko')} ~ ${p.eduEndDate.toLocaleDateString('ko')}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {p.totalBudgetVat
                            ? `${p.totalBudgetVat.toLocaleString()}원`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {p._count.coachAssignments}명
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {p._count.participants}명
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.pm?.name ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

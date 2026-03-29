import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { ProjectEditForm } from './project-edit-form'
import { CoachAssign } from './coach-assign'
import { ProjectAiWrapper } from './project-ai-wrapper'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '기획중', PROPOSAL: '제안서', SUBMITTED: '제출완료',
  IN_PROGRESS: '운영중', COMPLETED: '완료', LOST: '미수주',
}
const ROLE_LABEL: Record<string, string> = {
  MAIN_COACH: '메인 코치', SUB_COACH: '보조 코치', LECTURER: '강사(메인)',
  SUB_LECTURER: '강사(보조)', SPECIAL_LECTURER: '특강 연사', JUDGE: '심사위원', PM_OPS: '운영 PM',
}

async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      pm: { select: { name: true, email: true } },
      budget: { include: { items: { orderBy: { wbsCode: 'asc' } } } },
      coachAssignments: {
        include: { coach: { select: { id: true, name: true, tier: true, organization: true } } },
      },
      curriculum: { orderBy: { order: 'asc' } },
      tasks: {
        where: { status: { not: 'DONE' } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 10,
      },
      proposalSections: { orderBy: { sectionNo: 'asc' } },
      _count: { select: { participants: true } },
    },
  })
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await prisma.project.findUnique({ where: { id }, select: { name: true } })
  return { title: project?.name ?? '프로젝트' }
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const totalCoachFee = project.coachAssignments.reduce((s, a) => s + (a.totalFee ?? 0), 0)
  const marginRate = project.budget?.marginRate ?? 0

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title={project.name} />
      <div className="flex-1 overflow-y-auto p-6">
        {/* 2-컬럼 레이아웃: 왼쪽 메인, 오른쪽 AI 패널 */}
        <div className="flex gap-6">
          <div className="min-w-0 flex-1">
        {/* 헤더 요약 */}
        <div className="mb-6 flex flex-wrap items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge>{STATUS_LABEL[project.status]}</Badge>
              <Badge variant="outline">{project.projectType}</Badge>
              <span className="text-sm text-muted-foreground">{project.client}</span>
              <ProjectEditForm project={project} />
            </div>
            <h2 className="mt-1 text-xl font-bold">{project.name}</h2>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">총 예산</p>
              <p className="text-base font-bold">
                {project.totalBudgetVat
                  ? `${(project.totalBudgetVat / 1e8).toFixed(2)}억`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">코치 사례비</p>
              <p className="text-base font-bold">
                {totalCoachFee > 0 ? `${(totalCoachFee / 10000).toFixed(0)}만` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">마진율</p>
              <p className="text-base font-bold">{marginRate > 0 ? `${marginRate.toFixed(1)}%` : '—'}</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="coaches">
          <TabsList>
            <TabsTrigger value="coaches">코치 배정 ({project.coachAssignments.length})</TabsTrigger>
            <TabsTrigger value="curriculum">커리큘럼 ({project.curriculum.length})</TabsTrigger>
            <TabsTrigger value="budget">예산</TabsTrigger>
            <TabsTrigger value="tasks">태스크 ({project.tasks.length})</TabsTrigger>
          </TabsList>

          {/* ── 코치 배정 탭 ── */}
          <TabsContent value="coaches" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm">배정 코치</CardTitle>
                <CoachAssign
                  projectId={project.id}
                  assignedCoachIds={project.coachAssignments.map((a) => a.coach.id)}
                />
              </CardHeader>
              <CardContent className="p-0">
                {project.coachAssignments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">배정된 코치가 없습니다.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">코치</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">역할</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">세션수</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">단가(시간당)</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">총 사례비</th>
                        <th className="px-4 py-2 text-center font-medium text-muted-foreground">확정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.coachAssignments.map((a) => (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{a.coach.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{ROLE_LABEL[a.role]}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{a.sessions}회</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {a.agreedRate ? `${a.agreedRate.toLocaleString()}원` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {a.totalFee ? `${a.totalFee.toLocaleString()}원` : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {a.confirmed ? '✅' : '⏳'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 커리큘럼 탭 ── */}
          <TabsContent value="curriculum" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {project.curriculum.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">커리큘럼이 없습니다.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">회차</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">세션명</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">일시</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">시간</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">장소</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.curriculum.map((c) => (
                        <tr
                          key={c.id}
                          className={`border-b last:border-0 hover:bg-muted/30 ${c.isActionWeek ? 'bg-amber-50' : ''}`}
                        >
                          <td className="px-4 py-3 tabular-nums">{c.sessionNo}회차</td>
                          <td className="px-4 py-3 font-medium">
                            {c.title}
                            {c.isTheory && (
                              <Badge variant="outline" className="ml-2 text-xs">이론</Badge>
                            )}
                            {c.isActionWeek && (
                              <Badge className="ml-2 text-xs bg-amber-500">Action Week</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
                            {c.date ? c.date.toLocaleDateString('ko') : '—'}
                            {c.startTime && ` ${c.startTime}`}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{c.durationHours}h</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {c.isOnline ? '온라인' : (c.venue ?? '—')}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{c.notes ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 예산 탭 ── */}
          <TabsContent value="budget" className="mt-4">
            {!project.budget ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  예산이 설정되지 않았습니다.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'PC (인건비성)', value: project.budget.pcTotal },
                    { label: 'AC (사업실비)', value: project.budget.acTotal },
                    { label: '마진', value: project.budget.margin },
                    { label: '마진율', value: null, rate: project.budget.marginRate },
                  ].map(({ label, value, rate }) => (
                    <Card key={label}>
                      <CardContent className="py-4 text-center">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-1 text-lg font-bold">
                          {rate !== undefined
                            ? `${rate.toFixed(1)}%`
                            : value
                            ? `${(value / 10000).toFixed(0)}만원`
                            : '—'}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">WBS 코드</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">항목</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">유형</th>
                          <th className="px-4 py-2 text-right font-medium text-muted-foreground">단가</th>
                          <th className="px-4 py-2 text-right font-medium text-muted-foreground">수량</th>
                          <th className="px-4 py-2 text-right font-medium text-muted-foreground">금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.budget.items.map((item) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.wbsCode}</td>
                            <td className="px-4 py-2.5">{item.name}</td>
                            <td className="px-4 py-2.5">
                              <Badge variant={item.type === 'PC' ? 'default' : 'secondary'}>{item.type}</Badge>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{item.unitPrice.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{item.quantity}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-medium">{item.amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ── 태스크 탭 ── */}
          <TabsContent value="tasks" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {project.tasks.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">미완료 태스크가 없습니다.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">제목</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">카테고리</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">상태</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">마감일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.tasks.map((t) => (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{t.title}</td>
                          <td className="px-4 py-3 text-muted-foreground">{t.category ?? '—'}</td>
                          <td className="px-4 py-3">
                            <Badge variant={t.status === 'BLOCKED' ? 'destructive' : 'outline'}>
                              {t.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs">
                            {t.dueDate ? t.dueDate.toLocaleDateString('ko') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
          </div>{/* end main col */}

          {/* AI 사이드 패널 */}
          <ProjectAiWrapper
            projectId={project.id}
            initialRfpParsed={project.rfpParsed as any}
            initialLogicModel={project.logicModel as any}
            curriculum={project.curriculum}
            proposalSections={project.proposalSections}
          />
        </div>{/* end 2-col */}
      </div>
    </div>
  )
}

import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ProjectEditForm } from './project-edit-form'
import { CoachAssign } from './coach-assign'
import { BudgetDashboard } from './budget-dashboard'
import { CurriculumBoard } from './curriculum-board'
import { PipelineNav, type PipelineStep } from './pipeline-nav'
import { StepRfp } from './step-rfp'
import { StepImpact } from './step-impact'
import { StepProposal } from './step-proposal'
import { PlanningScorecard } from '@/components/projects/planning-scorecard'
import { ScoreBar } from '@/modules/predicted-score/score-bar'
import { DataFlowBanner } from '@/components/projects/data-flow-banner'
import { calculatePlanningScore } from '@/lib/planning-score'
import { buildPipelineContext } from '@/lib/pipeline-context'
import { PmGuidePanel } from '@/modules/pm-guide/panel'
import { resolvePmGuide } from '@/modules/pm-guide/resolve'
import type { StepKey } from '@/modules/pm-guide/types'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '기획중', PROPOSAL: '제안서', SUBMITTED: '제출완료',
  IN_PROGRESS: '운영중', COMPLETED: '완료', LOST: '미수주',
}
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  PROPOSAL: 'bg-blue-100 text-blue-800 border-blue-200',
  SUBMITTED: 'bg-violet-100 text-violet-800 border-violet-200',
  IN_PROGRESS: 'bg-green-100 text-green-800 border-green-200',
  COMPLETED: 'bg-gray-100 text-gray-700 border-gray-200',
  LOST: 'bg-red-100 text-red-700 border-red-200',
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
        take: 20,
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
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ step?: string }>
}) {
  const { id } = await params
  const { step = 'rfp' } = await searchParams
  const [project, context] = await Promise.all([
    getProject(id),
    buildPipelineContext(id).catch(() => null),
  ])
  if (!project) notFound()

  const totalCoachFee = project.coachAssignments.reduce((s, a) => s + (a.totalFee ?? 0), 0)
  const marginRate = project.budget?.marginRate ?? 0

  // PM 가이드 콘텐츠 resolve (2026-04-20: rfp 포함 — 티키타카 리서치 카드 때문)
  const PM_GUIDE_STEPS: StepKey[] = [
    'rfp',
    'curriculum',
    'coaches',
    'budget',
    'impact',
    'proposal',
  ]
  const pmGuide = context && PM_GUIDE_STEPS.includes(step as StepKey)
    ? await resolvePmGuide(step as StepKey, context).catch(() => null)
    : null

  // 기획 품질 스코어 계산
  const planningScore = calculatePlanningScore({
    rfpParsed: project.rfpParsed,
    logicModel: project.logicModel,
    curriculumCount: project.curriculum.length,
    curriculumItems: project.curriculum.map((c) => ({
      isTheory: c.isTheory,
      isActionWeek: c.isActionWeek,
    })),
    coachAssignmentCount: project.coachAssignments.length,
    budget: project.budget ? { marginRate: project.budget.marginRate } : null,
    proposalSectionCount: project.proposalSections.length,
  })

  // ADR-001: 스텝 순서 = rfp → curriculum → coaches → budget → impact → proposal
  // ADR-008 (2026-04-23): Step 4·5 의미 레이어 재정렬 — budget=② Input, impact=⑤ Outcome+SROI
  const steps: PipelineStep[] = [
    {
      key: 'rfp',
      label: 'RFP 분석',
      sublabel: project.rfpParsed ? '완료' : '미완료',
      done: !!project.rfpParsed,
    },
    {
      key: 'curriculum',
      label: '커리큘럼',
      sublabel: project.curriculum.length > 0 ? `${project.curriculum.length}회차` : '미작성',
      done: project.curriculum.length > 0,
    },
    {
      key: 'coaches',
      label: '코치 배정',
      sublabel: project.coachAssignments.length > 0 ? `${project.coachAssignments.length}명` : '미배정',
      done: project.coachAssignments.length > 0,
    },
    {
      key: 'budget',
      label: '예산 설계',
      sublabel: project.budget
        ? `마진 ${marginRate.toFixed(1)}%`
        : '미작성',
      done: !!project.budget,
    },
    {
      key: 'impact',
      label: '임팩트 + SROI',
      sublabel: project.logicModel
        ? project.sroiForecast
          ? 'Logic Model + SROI'
          : 'Logic Model ✓ · SROI 미산정'
        : '미완료',
      done: !!project.logicModel && !!project.sroiForecast,
    },
    {
      key: 'proposal',
      label: '제안서',
      sublabel: project.proposalSections.length > 0
        ? `${project.proposalSections.length}/7 섹션`
        : '미생성',
      done: project.proposalSections.length >= 7,
    },
  ]

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title={project.name} />

      {/* Sticky top bar: project meta + pipeline */}
      <div className="sticky top-0 z-20 border-b bg-background">
        {/* Project meta strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-6 py-2.5">
          <span
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs font-medium',
              STATUS_COLOR[project.status],
            )}
          >
            {STATUS_LABEL[project.status]}
          </span>
          <Badge variant="outline" className="text-xs">{project.projectType}</Badge>
          <span className="text-sm text-muted-foreground">{project.client}</span>

          <div className="ml-auto flex items-center gap-5">
            <div className="text-sm">
              <span className="text-muted-foreground">총 예산 </span>
              <span className="font-semibold">
                {project.totalBudgetVat ? `${(project.totalBudgetVat / 1e8).toFixed(2)}억` : '—'}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">코치 </span>
              <span className="font-semibold">
                {totalCoachFee > 0 ? `${(totalCoachFee / 10000).toFixed(0)}만원` : '—'}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">마진 </span>
              <span
                className={cn(
                  'font-semibold',
                  marginRate > 0 && marginRate < 10
                    ? 'text-red-600'
                    : marginRate >= 10
                      ? 'text-green-600'
                      : '',
                )}
              >
                {marginRate > 0 ? `${marginRate.toFixed(1)}%` : '—'}
              </span>
            </div>
            <ProjectEditForm project={project} />
          </div>
        </div>

        {/* Pipeline stepper */}
        <div className="px-6">
          <PipelineNav steps={steps} current={step} />
        </div>
      </div>

      {/* Predicted score bar (evalStrategy 기반 예상 점수) */}
      <ScoreBar projectId={project.id} />

      {/* Planning quality scorecard */}
      <PlanningScorecard score={planningScore} />

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── Step 1: RFP 분석 + 기획 방향 ── */}
        {step === 'rfp' && (
          <div className="space-y-4">
            <StepRfp
              projectId={project.id}
              initialParsed={project.rfpParsed as any}
              initialRfpSlice={{
                proposalBackground: project.proposalBackground,
                proposalConcept: project.proposalConcept,
                keyPlanningPoints: Array.isArray(project.keyPlanningPoints)
                  ? (project.keyPlanningPoints as string[])
                  : null,
                confirmedAt:
                  project.proposalBackground || project.proposalConcept
                    ? project.updatedAt.toISOString()
                    : null,
              }}
              initialProfile={(project.programProfile as any) ?? null}
              initialRenewalContext={(project.renewalContext as any) ?? null}
            />
            {/*
              Step 1 은 3컬럼 내부 구조라 우측 사이드바 대신 하단 전폭에
              PM 가이드(리서치 요청 카드 중심) 를 렌더한다.
            */}
            {pmGuide && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
                <div className="hidden xl:block" />
                <PmGuidePanel
                  content={pmGuide}
                  projectId={project.id}
                  stepKey="rfp"
                />
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: 커리큘럼 ── */}
        {step === 'curriculum' && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
            <CurriculumBoard
              projectId={project.id}
              initialItems={project.curriculum.map((c) => ({
                id: c.id,
                sessionNo: c.sessionNo,
                title: c.title,
                durationHours: c.durationHours,
                lectureMinutes: (c as any).lectureMinutes ?? 15,
                practiceMinutes: (c as any).practiceMinutes ?? 35,
                isTheory: c.isTheory,
                isActionWeek: c.isActionWeek,
                isCoaching1on1: (c as any).isCoaching1on1 ?? false,
                isLocked: (c as any).isLocked ?? false,
                date: c.date,
                venue: c.venue,
                isOnline: c.isOnline,
                notes: c.notes,
                order: c.order,
              }))}
              rfpKeywords={(project.rfpParsed as any)?.keywords ?? []}
              rfpObjectives={(project.rfpParsed as any)?.objectives ?? []}
              logicModelActivities={(project.logicModel as any)?.activity ?? []}
              supplyPrice={project.supplyPrice ?? 0}
              coachAssignmentCount={project.coachAssignments.length}
              rfpSlice={context?.rfp}
              strategySlice={context?.strategy}
            />
            {pmGuide && (
              <PmGuidePanel
                content={pmGuide}
                projectId={project.id}
                stepKey="curriculum"
              />
            )}
          </div>
        )}

        {/* ── Step 3: 코치 배정 ── */}
        {step === 'coaches' && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              {/* 이전 스텝 요약 배너 (Step 1·2 → Step 3) */}
              <DataFlowBanner
                fromStep="Step 1·2"
                toStep="Step 3 코치 배정"
                items={(() => {
                  const rfp = context?.rfp
                  const curri = context?.curriculum
                  const sessionCount = curri?.sessions.length ?? 0
                  const actionWeekCount = curri?.sessions.filter((s) => s.isActionWeek).length ?? 0
                  const coachingCount = curri?.sessions.filter((s) => s.isCoaching1on1).length ?? 0
                  return [
                    {
                      label: '제안 컨셉',
                      value: rfp?.proposalConcept ?? '미확정',
                      matched: !!rfp?.proposalConcept,
                      detail: rfp?.proposalConcept
                        ? undefined
                        : 'Step 1 에서 컨셉을 확정하세요',
                    },
                    {
                      label: '총 세션 수',
                      value: sessionCount > 0 ? `${sessionCount}회차` : '미작성',
                      matched: sessionCount > 0,
                      detail: sessionCount > 0 ? undefined : 'Step 2 커리큘럼 먼저 확정',
                    },
                    {
                      label: 'Action Week',
                      value: sessionCount > 0 ? `${actionWeekCount}회` : '—',
                      matched: actionWeekCount > 0,
                      detail:
                        sessionCount > 0 && actionWeekCount === 0
                          ? '실행 중심 교육 — Action Week 1회 이상 권장'
                          : undefined,
                    },
                    {
                      label: '1:1 코칭',
                      value: sessionCount > 0 ? `${coachingCount}회` : '—',
                      matched: coachingCount > 0,
                    },
                  ]
                })()}
              />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">코치 배정</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    역할과 사례비를 설정하고 코치를 확정합니다.
                  </p>
                </div>
                <CoachAssign
                  projectId={project.id}
                  assignedCoachIds={project.coachAssignments.map((a) => a.coach.id)}
                />
              </div>

              <Card>
                <CardContent className="p-0">
                  {project.coachAssignments.length === 0 ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                      <p>배정된 코치가 없습니다.</p>
                      <p className="text-xs">위 버튼으로 코치를 추가하세요.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">코치</th>
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">소속</th>
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">역할</th>
                          <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">세션수</th>
                          <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">단가(시간)</th>
                          <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">총 사례비</th>
                          <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">확정</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.coachAssignments.map((a) => (
                          <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium">{a.coach.name}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{a.coach.organization ?? '—'}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-xs">{ROLE_LABEL[a.role]}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{a.sessions}회</td>
                            <td className="px-4 py-3 text-right tabular-nums text-xs">
                              {a.agreedRate ? `${a.agreedRate.toLocaleString()}원` : '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold">
                              {a.totalFee ? `${a.totalFee.toLocaleString()}원` : '—'}
                            </td>
                            <td className="px-4 py-3 text-center text-base">
                              {a.confirmed ? '✅' : '⏳'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/20">
                          <td colSpan={5} className="px-4 py-2.5 text-right text-sm font-medium text-muted-foreground">
                            합계
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-bold text-primary">
                            {totalCoachFee.toLocaleString()}원
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </CardContent>
              </Card>
            </div>
            {pmGuide && (
              <PmGuidePanel
                content={pmGuide}
                projectId={project.id}
                stepKey="coaches"
              />
            )}
          </div>
        )}

        {/* ── Step 4: 예산 설계 (② Input · ADR-008) ── */}
        {step === 'budget' && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
            <BudgetDashboard
              projectId={project.id}
              initialBudget={project.budget ? {
                pcTotal: project.budget.pcTotal,
                acTotal: project.budget.acTotal,
                margin: project.budget.margin,
                marginRate: project.budget.marginRate,
                marginWarning: project.budget.marginRate < 10,
                supplyPrice: project.supplyPrice ?? 0,
                totalBudgetVat: project.totalBudgetVat ?? 0,
              } : null}
              initialPcItems={[]}
              initialAcItems={project.budget?.items.filter((i) => i.type === 'AC').map((i) => ({
                id: i.id,
                wbsCode: i.wbsCode,
                category: i.category,
                name: i.name,
                unit: i.unit ?? '',
                unitPrice: i.unitPrice,
                quantity: i.quantity,
                amount: i.amount,
                isEstimated: i.notes?.includes('추정') ?? false,
              })) ?? []}
              curriculumSlice={context?.curriculum}
              coachesSlice={context?.coaches}
            />
            {pmGuide && (
              <PmGuidePanel
                content={pmGuide}
                projectId={project.id}
                stepKey="budget"
              />
            )}
          </div>
        )}

        {/* ── Step 5: 임팩트 + SROI Forecast (⑤ Outcome 수렴 · ADR-008) ── */}
        {step === 'impact' && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
            <StepImpact
              projectId={project.id}
              rfpParsed={project.rfpParsed as any}
              initialLogicModel={project.logicModel as any}
              curriculumSlice={context?.curriculum}
              coachesSlice={context?.coaches}
              budgetSlice={context?.budget}
              autoExtracted={context?.impact?.autoExtracted}
              context={context ?? undefined}
            />
            {pmGuide && (
              <PmGuidePanel
                content={pmGuide}
                projectId={project.id}
                stepKey="impact"
              />
            )}
          </div>
        )}

        {/* ── Step 6: 제안서 ── */}
        {step === 'proposal' && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
            <StepProposal
              projectId={project.id}
              hasLogicModel={!!project.logicModel}
              initialSections={project.proposalSections as any}
              evalCriteria={(project.rfpParsed as any)?.evalCriteria ?? []}
              pipelineContext={context}
            />
            {pmGuide && (
              <PmGuidePanel
                content={pmGuide}
                projectId={project.id}
                stepKey="proposal"
              />
            )}
          </div>
        )}

      </div>
    </div>
  )
}

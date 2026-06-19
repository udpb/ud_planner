'use client'

/**
 * StageS4 — 정밀 편집 (Wave V / F0)
 *
 * 펼침 시: 커리큘럼 + 코치 + 예산 + 제안서 4 영역 세로 스택.
 * F0 에선 단순 스택 (디자인 정밀화는 F5). 각 영역은 기존 컴포넌트 그대로.
 *
 * 4 영역 각각에 "영역 헤더 + 기존 컴포넌트" 형태로 구성.
 */

import type { ComponentProps } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { CurriculumBoard } from '@/app/(dashboard)/projects/[id]/curriculum-board'
import { CoachAssign } from '@/app/(dashboard)/projects/[id]/coach-assign'
import { BudgetDashboard } from '@/app/(dashboard)/projects/[id]/budget-dashboard'
import { StepProposal } from '@/app/(dashboard)/projects/[id]/step-proposal'
import { AutoRecommendedPool } from '@/components/projects/coaches/AutoRecommendedPool'
import { Calendar, Users, Wallet, FileText } from 'lucide-react'

interface Props {
  curriculumProps: ComponentProps<typeof CurriculumBoard>
  coachAssignProps: ComponentProps<typeof CoachAssign>
  budgetProps: ComponentProps<typeof BudgetDashboard>
  proposalProps: ComponentProps<typeof StepProposal>
  /** 코치 배정 현황 요약 (assignedCoachIds 외에 표시할 메타) */
  coachSummary?: {
    count: number
    totalFee: number
  }
}

export function StageS4({
  curriculumProps,
  coachAssignProps,
  budgetProps,
  proposalProps,
  coachSummary,
}: Props) {
  return (
    <div className="space-y-6">
      {/* ① 커리큘럼 */}
      <section>
        <SectionHeader
          icon={<Calendar className="h-4 w-4 text-brand" />}
          title="① 커리큘럼 설계"
          description="회차별 주제·이론/실습·Action Week 구성"
        />
        <div className="mt-3">
          <CurriculumBoard {...curriculumProps} />
        </div>
      </section>

      {/* ② 코치 배정 */}
      <section>
        <SectionHeader
          icon={<Users className="h-4 w-4 text-brand" />}
          title="② 코치 배정"
          description="역할·사례비 설정 + 코치 확정"
          extra={
            coachSummary && coachSummary.count > 0 ? (
              <Badge variant="outline" className="text-xs">
                {coachSummary.count}명 · {(coachSummary.totalFee / 10000).toFixed(0)}만원
              </Badge>
            ) : null
          }
        />
        {/* F1 (ADR-015) — AI 자동 추천 풀 inline.
            카드 클릭 → 모달 안의 같은 풀에서 선택하도록 안내 (CoachAssign controlled open 은 F5).
            F0 의 알려진 limitation (배정 테이블 inline X) 은 F5 에서 통합. */}
        <div className="mt-3">
          <AutoRecommendedPool
            projectId={coachAssignProps.projectId}
            mode="inline"
            assignedCoachIds={coachAssignProps.assignedCoachIds}
            onOpenAssignModal={(rec) => {
              toast.info(
                rec
                  ? `"${rec.name}" 선택 — 아래 [코치 배정] 버튼으로 모달 열어 확정`
                  : '아래 [코치 배정] 버튼으로 모달 열기',
                { duration: 4000 },
              )
            }}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <CoachAssign {...coachAssignProps} />
        </div>
      </section>

      {/* ③ 예산 */}
      <section>
        <SectionHeader
          icon={<Wallet className="h-4 w-4 text-brand" />}
          title="③ 예산 설계"
          description="AC/PC 항목 + 마진율 + 발주처 템플릿"
        />
        <div className="mt-3">
          <BudgetDashboard {...budgetProps} />
        </div>
      </section>

      {/* ④ 제안서 */}
      <section>
        <SectionHeader
          icon={<FileText className="h-4 w-4 text-brand" />}
          title="④ 제안서 (7섹션)"
          description="Express 1차본 시드 위에 정밀 편집"
        />
        <div className="mt-3">
          <StepProposal {...proposalProps} />
        </div>
      </section>
    </div>
  )
}

function SectionHeader({
  icon,
  title,
  description,
  extra,
}: {
  icon: React.ReactNode
  title: string
  description: string
  extra?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between border-brand-left">
      <div>
        <h3 className="flex items-center gap-1.5 text-base font-semibold">
          {icon}
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {extra}
    </div>
  )
}

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
import { Badge } from '@/components/ui/badge'
import { CurriculumBoard } from '@/app/(dashboard)/projects/[id]/curriculum-board'
import { CoachAssign } from '@/app/(dashboard)/projects/[id]/coach-assign'
import { BudgetDashboard } from '@/app/(dashboard)/projects/[id]/budget-dashboard'
import { StepProposal } from '@/app/(dashboard)/projects/[id]/step-proposal'
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
          icon={<Calendar className="h-4 w-4 text-primary" />}
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
          icon={<Users className="h-4 w-4 text-primary" />}
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
        <div className="mt-3 flex justify-end">
          <CoachAssign {...coachAssignProps} />
        </div>
        {/* 배정된 코치 테이블은 기존 page.tsx 의 inline 코드에 있음 — F0 에선 코치 배정 액션 버튼만 노출하고 테이블은 S4 펼침의 다른 영역으로 분리하지 않음. 사용자가 ?step=coaches 로 점프하면 기존 페이지에서 확인 가능. F5 에서 통합. */}
      </section>

      {/* ③ 예산 */}
      <section>
        <SectionHeader
          icon={<Wallet className="h-4 w-4 text-primary" />}
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
          icon={<FileText className="h-4 w-4 text-primary" />}
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

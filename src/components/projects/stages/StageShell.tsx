'use client'

/**
 * StageShell — Wave V / F0 (ADR-015, 2026-05-20)
 *
 * 5 Stage Progressive Disclosure 의 단일 진입점.
 *
 * 서버 page.tsx 가 prisma 로드 + ExpressShell 의 초기 props 준비 후 본 컴포넌트
 * 한 줄로 호출. 본 컴포넌트는 client (StageLayout 의 manualOverride state 가
 * client) 하지만 props 는 모두 server-prepared plain object.
 *
 * F0 결정 사항 (ADR-015 H 섹션):
 *   - currentStage 자동 판정 (server 에서 prop 으로 전달)
 *   - manualOverride 는 localStorage (StageLayout 내부)
 *   - ?step= query 가 들어오면 mount 시 1회 해당 stage 펼침
 *   - PipelineNav 와 sticky bar 는 page.tsx 가 그대로 유지 (StageShell 밖)
 */

import { useCallback, useMemo } from 'react'
import type { ComponentProps } from 'react'
import { stageSummary, type StageId } from './stage-mapping'
import { StageLayout } from './StageLayout'
import { StageS1 } from './StageS1'
import { StageS2 } from './StageS2'
import { StageS3 } from './StageS3'
import { StageS4 } from './StageS4'
import { StageS5 } from './StageS5'
import type { StepRfp } from '@/app/(dashboard)/projects/[id]/step-rfp'
import type { ExpressShell } from '@/components/express/ExpressShell'
import type { CurriculumBoard } from '@/app/(dashboard)/projects/[id]/curriculum-board'
import type { CoachAssign } from '@/app/(dashboard)/projects/[id]/coach-assign'
import type { BudgetDashboard } from '@/app/(dashboard)/projects/[id]/budget-dashboard'
import type { StepProposal } from '@/app/(dashboard)/projects/[id]/step-proposal'

interface Props {
  projectId: string

  /** Server 가 결정한 자동 활성 stage. mount 후엔 StageLayout 의 manualOverride 가 우선. */
  initialStage: StageId

  /** ?step= query 가 들어왔을 때 매핑된 stage (있으면 mount 시 추가 펼침). */
  initialOverrideStage: StageId | null

  /** Stage 별 1줄 sticky 요약 input */
  summaryInput: Parameters<typeof stageSummary>[1]

  /** 5 stage 의 done 여부 (server 가 판정) */
  doneFlags: Record<StageId, boolean>

  /** 각 Stage 가 받을 props (server-prepared) */
  stepRfpProps: ComponentProps<typeof StepRfp>
  expressShellProps: ComponentProps<typeof ExpressShell>
  curriculumProps: ComponentProps<typeof CurriculumBoard>
  coachAssignProps: ComponentProps<typeof CoachAssign>
  budgetProps: ComponentProps<typeof BudgetDashboard>
  proposalProps: ComponentProps<typeof StepProposal>
  /** S4 의 코치 요약 (배지) */
  coachSummary?: { count: number; totalFee: number }
  /** S5 의 임팩트 forecast */
  impactForecast?: {
    id: string
    totalSocialValue: number
    beneficiaryCount?: number | null
    calibration: string
    isStale: boolean
  } | null
  /** S5 의 proposal 완성 여부 (7섹션) */
  proposalReady: boolean
  /** S3 의 Express 진행률 (검수 가능 여부 판단) */
  draftProgressOverall?: number
  /** S3 의 Express 1차본 승인 여부 */
  isExpressCompleted?: boolean
}

export function StageShell(props: Props) {
  // currentStage 는 props.initialStage 그대로 (server 판정 결과).
  // (F0 에선 client 가 stage 를 재계산하지 않음 — server 가 모든 데이터 가짐.
  //  manualOverride 만 client.)
  const currentStage = props.initialStage

  // S3 의 "S2 로 이동" 콜백
  const handleJumpToS2 = useCallback(() => {
    // StageLayout 의 manualOverride 를 S2='expanded' 로 설정하려면 부모가
    // 직접 control 해야 하지만 F0 에선 ?step= query 로 우회 (URL 변경).
    // 또는 단순히 페이지 새로고침으로 currentStage 가 S2 가 되면 자동 펼침.
    // F0 minimal: URL 에 ?step=rfp 같은 우회 X — 사용자가 S2 카드 직접 클릭하는 게 명확.
    // 그래도 jumping UX 를 위해 S2 ID 카드로 scroll.
    if (typeof window === 'undefined') return
    const el = document.querySelector('[data-stage-id="S2"]')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // 5 stage data 준비 (StageLayout 이 받는 형식)
  const stages = useMemo(
    () => ({
      S1: {
        summary: stageSummary('S1', props.summaryInput),
        done: props.doneFlags.S1,
        content: <StageS1 stepRfpProps={props.stepRfpProps} />,
      },
      S2: {
        summary: stageSummary('S2', props.summaryInput),
        done: props.doneFlags.S2,
        content: <StageS2 expressShellProps={props.expressShellProps} />,
      },
      S3: {
        summary: stageSummary('S3', props.summaryInput),
        done: props.doneFlags.S3,
        content: (
          <StageS3
            onJumpToS2={handleJumpToS2}
            draftProgressOverall={props.draftProgressOverall}
            isExpressCompleted={props.isExpressCompleted}
          />
        ),
      },
      S4: {
        summary: stageSummary('S4', props.summaryInput),
        done: props.doneFlags.S4,
        content: (
          <StageS4
            curriculumProps={props.curriculumProps}
            coachAssignProps={props.coachAssignProps}
            budgetProps={props.budgetProps}
            proposalProps={props.proposalProps}
            coachSummary={props.coachSummary}
          />
        ),
      },
      S5: {
        summary: stageSummary('S5', props.summaryInput),
        done: props.doneFlags.S5,
        content: (
          <StageS5
            projectId={props.projectId}
            impactForecast={props.impactForecast}
            proposalReady={props.proposalReady}
          />
        ),
      },
    }),
    [props, handleJumpToS2],
  )

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <StageLayout
        currentStage={currentStage}
        initialOverrideStage={props.initialOverrideStage}
        stages={stages}
        projectId={props.projectId}
      />
    </div>
  )
}

// computeCurrentStage / computeStageDoneFlags 는 모두 server/client 양쪽에서
// 호출되는 pure 함수라 stage-mapping.ts 로 이동 (2026-05-22 fix).
// page.tsx 가 본 모듈에서 import 하면 'use client' 격리로 인해
// "client function from the server" 런타임 에러 발생.

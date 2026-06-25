'use client'

/**
 * ProgramWorkspace — 전폭 2-pane 워크스페이스 셸 (ADR-029, BR-WS-5)
 *
 * `/projects/[id]` 단일 진입점. 옛 3단계 세로 아코디언을 **전폭 2-pane + 상단 고정
 * 파이프라인 스텝퍼**로 교체(사용자 확정 목업 `fullwidth_chat_canvas_workspace`):
 *
 *   ┌─ 상단: WorkspacePipeline (5단계 고정 스텝퍼) ──────────────────────┐
 *   │ RFP 분석 → 프로그램 기획 → 코치 매칭 → 예산 자동화 → SROI 예측        │
 *   ├──────────────────┬────────────────────────────────────────────────┤
 *   │ 좌(~40%): 대화     │ 우(~60%): 현재 단계 캔버스                        │
 *   │ WorkspaceChat     │ (StageS1+PlanningIntent / ProgramDesignFlow /   │
 *   │ (단계 넘어 이어짐)  │  AutoRecommendedPool / budget placeholder /     │
 *   │ 내부 스크롤        │  ImpactForecastClient) — 내부 스크롤            │
 *   └──────────────────┴────────────────────────────────────────────────┘
 *
 * 풀 높이(페이지 스크롤 X, 각 pane 내부 스크롤). 스텝 클릭 → 우 캔버스만 전환,
 * 좌 대화는 유지. currentStage 는 client state(server 자동 판정으로 초기화 +
 * ?stage=/?step= 1회 선택 호환).
 *
 * ⚠️ 단계 컴포넌트·엔진 내부 재구현 0 — 임베드·배치만. 대화는 이번엔 **응답까지**
 * (캔버스 직접 변경은 BR-WS-6). 점수판·게이트 stepper 신설 없음.
 *
 * 디자인킷 260529: accent #F05519 1개, radius 0, NanumHuman/Poppins.
 */

import { useMemo, useRef, useState, type ReactNode } from 'react'

import { StageS1 } from '@/components/projects/stages/StageS1'
import { ProgramDesignFlow } from '@/app/(dashboard)/projects/[id]/program-design/_components/program-design-flow'
import { ImpactForecastClient } from '@/app/(dashboard)/projects/[id]/impact-forecast/forecast-client'
import { AutoRecommendedPool } from '@/components/projects/coaches/AutoRecommendedPool'
import { BudgetCalcCanvas } from './BudgetCalcCanvas'
import {
  WorkspacePlanProvider,
  useWorkspacePlan,
} from './WorkspacePlanContext'
import { PlanningIntent } from './PlanningIntent'
import { WorkspacePipeline } from './WorkspacePipeline'
import { WorkspaceChat } from './WorkspaceChat'
import type { PlanningIntentDraft } from '@/lib/program-design/planning-intent'
import type { PlanSession } from '@/lib/program-design/plan-types'
import type { SessionOp } from '@/lib/program-design/session-ops'
import type { StageOp } from '@/lib/program-design/stage-ops'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type {
  BudgetChannel,
  BudgetRules,
} from '@/lib/program-design/budget-calc'

import {
  WORKSPACE_STAGE_DESCRIPTIONS,
  WORKSPACE_STAGE_LABELS,
  type WorkspaceStageId,
} from './workspace-stages'

import type { ComponentProps } from 'react'

interface Props {
  projectId: string
  /** 자동 활성 stage (server 판정) — client state 초기값. */
  currentStage: WorkspaceStageId
  /** ?stage=/?step= 진입 시 1회 선택할 stage (있으면 currentStage 보다 우선). */
  initialOverrideStage: WorkspaceStageId | null
  /** 5 stage 의 done 여부 (server 판정) — 스텝퍼 체크 표시. */
  doneFlags: Record<WorkspaceStageId, boolean>
  /** 5 stage 의 1줄 요약 (server 판정) — 대화 맥락 + 캔버스 헤더 보조. */
  summaries: Record<WorkspaceStageId, string>

  /** RFP 분석 — StageS1(StepRfp) props */
  stepRfpProps: ComponentProps<typeof StageS1>['stepRfpProps']
  /** 프로그램 기획 — ProgramDesignFlow props (rfpPreview 없으면 안내 표시) */
  designProps: ComponentProps<typeof ProgramDesignFlow> | null
  /** RFP 분석(발주처 의도) — PlanningIntent props */
  intentProps: {
    initialDraft: PlanningIntentDraft
    hasSavedIntent: boolean
    hasRfp: boolean
  }
  /** SROI 예측 — ImpactForecastClient props */
  impactProps: ComponentProps<typeof ImpactForecastClient>

  /**
   * BR-WS-15: 단계 간 라이브 연동 초기값 (server 조립). WorkspacePlanProvider 가
   * 받아 Live Plan 을 시드 — 커리큘럼 회차 변경 → 코치수·예산 적산 실시간 재계산.
   */
  planContext: {
    /** 저장된 1차안 회차표(있으면) — Live Plan 초기 sessions. */
    initialSessions: PlanSession[] | null
    /** RFP 파싱(있으면) — 코치수 휴리스틱·예산 채널 추정 토대. */
    rfp: RfpParsed | null
    /** 총예산 R(VAT 포함). 없으면 0. */
    totalBudget: number
    /** 적산 채널(B2G/B2B) — projectType 파생(server). */
    channel: BudgetChannel
    /** 교육 기간(개월) — eduStartDate~eduEndDate 파생(server). */
    durationMonths: number
    /** 단가표(budget-rules.json) — server 로드(client live calcBudget 용). */
    budgetRules: BudgetRules | null
  }
}

// ─────────────────────────────────────────────────────────────────
// 캔버스 헤더 (단계 라벨 + 1줄 설명) — 차분한 띠 1개. 점수·게이트 없음.
// ─────────────────────────────────────────────────────────────────

function CanvasHeader({ stage }: { stage: WorkspaceStageId }) {
  return (
    <div className="shrink-0 border-b px-6 py-3">
      <h2 className="text-sm font-bold">{WORKSPACE_STAGE_LABELS[stage]}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {WORKSPACE_STAGE_DESCRIPTIONS[stage]}
      </p>
    </div>
  )
}

/**
 * 외곽 = Provider 설치(BR-WS-15). Live Plan 시드(planContext)를 받아 감싼 뒤,
 * 실제 셸은 useWorkspacePlan 을 쓰는 WorkspaceInner 가 그린다.
 */
export function ProgramWorkspace(props: Props) {
  const { planContext } = props
  return (
    <WorkspacePlanProvider
      initialSessions={planContext.initialSessions}
      rfp={planContext.rfp}
      totalBudget={planContext.totalBudget}
      channel={planContext.channel}
      durationMonths={planContext.durationMonths}
      budgetRules={planContext.budgetRules}
    >
      <WorkspaceInner {...props} />
    </WorkspacePlanProvider>
  )
}

function WorkspaceInner({
  projectId,
  currentStage,
  initialOverrideStage,
  doneFlags,
  summaries,
  stepRfpProps,
  designProps,
  intentProps,
  impactProps,
}: Props) {
  // BR-WS-15: 공유 Live Plan — 회차(sessions)/필요 코치 수(coachCount) 단일 소스.
  // BR-WS-19: 비회차(T4/T5) 단계(stages)도 동일 소스에서 — 대화 동봉 근거.
  const { sessions, setSessions, stages, setStages, coachCount } =
    useWorkspacePlan()

  // 활성 stage = client state. server 자동 판정 + ?stage= 1회 선택으로 초기화.
  const [stage, setStage] = useState<WorkspaceStageId>(
    initialOverrideStage ?? currentStage,
  )

  // ── BR-WS-6/19 배선: 대화 ↔ 기획 캔버스 (design 단계 한정) ──
  // 대화가 해석한 ops 를 ProgramDesignFlow 로 전달 — id 는 단조 증가 카운터(Date.now 금지).
  // sessions 구조면 SessionOp[], 비회차 구조면 StageOp[] (flow 가 effectiveStructure.kind 로 분기).
  const [incomingOps, setIncomingOps] = useState<{
    id: string
    ops: (SessionOp | StageOp)[]
  } | null>(null)
  const opsSeq = useRef(0)
  const handleOps = (ops: (SessionOp | StageOp)[]) => {
    opsSeq.current += 1
    setIncomingOps({ id: `ops-${opsSeq.current}`, ops })
  }

  // 단계별 우 캔버스 — 전부 기존 컴포넌트 조립/임베드만(내부 재구현 0).
  const canvas: Record<WorkspaceStageId, ReactNode> = useMemo(
    () => ({
      // RFP 분석 = StageS1(RFP 분석 화면) + PlanningIntent(발주처 의도=기획의도)
      rfp: (
        <div className="space-y-6">
          <StageS1 stepRfpProps={stepRfpProps} />
          <PlanningIntent
            projectId={projectId}
            hasRfp={intentProps.hasRfp}
            initialDraft={intentProps.initialDraft}
            hasSavedIntent={intentProps.hasSavedIntent}
          />
        </div>
      ),
      // 프로그램 기획 = ProgramDesignFlow (rfpPreview 없으면 안내)
      // BR-WS-6: 회차 목록 보고(onSessionsChange) + 대화 ops 수신(incomingOps) 인렛 배선.
      // BR-WS-15: onSessionsChange → ctx.setSessions (Live Plan) → coachCount·예산 파생.
      design: designProps ? (
        <ProgramDesignFlow
          {...designProps}
          onSessionsChange={setSessions}
          onStagesChange={setStages}
          incomingOps={incomingOps}
        />
      ) : (
        <div
          style={{
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--accent)',
            background: 'var(--neutral-90)',
            padding: 16,
            maxWidth: 880,
            fontSize: 13,
            color: 'var(--soft-ink)',
            lineHeight: 1.6,
          }}
        >
          <strong style={{ fontWeight: 700 }}>RFP 분석이 먼저 필요합니다.</strong>
          {'  '}프로그램 기획은 RFP 핵심(목표·대상·기간·예산) 위에서 시작합니다 — 위{' '}
          <strong>RFP 분석</strong> 단계에서 RFP 를 먼저 업로드·분석한 뒤 진행하세요.
        </div>
      ),
      // 코치 매칭 = AutoRecommendedPool (inline 모드, 자체 CTA)
      // BR-WS-15: requiredCountOverride=ctx.coachCount — 커리큘럼 회차 변경 즉시 반영.
      coach: (
        <AutoRecommendedPool
          projectId={projectId}
          mode="inline"
          assignedCoachIds={[]}
          requiredCountOverride={coachCount}
        />
      ),
      // 예산 자동화 — BR-WS-15: ctx(sessions·coachCount·예산·채널·기간·단가표)로 client
      // live calcBudget. 회차 변경 → 적산·마진 실시간 재계산(API fetch 제거).
      budget: <BudgetCalcCanvas />,
      // SROI 예측 = ImpactForecastClient
      sroi: <ImpactForecastClient {...impactProps} />,
    }),
    [
      projectId,
      stepRfpProps,
      designProps,
      intentProps,
      impactProps,
      incomingOps,
      setSessions,
      setStages,
      coachCount,
    ],
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-h-0">
      {/* 상단 고정 파이프라인 스텝퍼 */}
      <WorkspacePipeline
        currentStage={stage}
        doneFlags={doneFlags}
        onSelect={setStage}
      />

      {/* 본문 = 전폭 2-pane, 풀 높이 (페이지 스크롤 X, 각 pane 내부 스크롤) */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* 좌 360px 고정 : 대화 (단계 넘어 이어짐) — 캔버스 flex-1 넓게 (BR-WS-16) */}
        <div className="hidden w-[360px] shrink-0 md:block">
          <WorkspaceChat
            projectId={projectId}
            stage={stage}
            contextSummary={summaries[stage]}
            // BR-WS-6: design 단계일 때만 현재 회차 목록 동봉 + ops 수신.
            // BR-WS-15: 회차 목록은 Live Plan(ctx.sessions) 단일 소스.
            sessions={stage === 'design' ? sessions : null}
            // BR-WS-19: 비회차(T4/T5) 구조면 stages 동봉 — structureKind 로 분기.
            // sessions·stages 는 동시에 값을 갖지 않음(flow 가 kind 로 하나만 보고).
            stages={stage === 'design' ? stages : null}
            structureKind={stage === 'design' && stages ? 'nonsession' : 'sessions'}
            onOps={stage === 'design' ? handleOps : undefined}
          />
        </div>

        {/* 우 ~60% : 현재 단계 캔버스 (내부 스크롤) */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <CanvasHeader stage={stage} />
          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            {canvas[stage]}
          </div>
        </div>
      </div>
    </div>
  )
}

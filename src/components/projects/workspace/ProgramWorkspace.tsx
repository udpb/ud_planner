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
import { PlanningIntent } from './PlanningIntent'
import { WorkspacePipeline } from './WorkspacePipeline'
import { WorkspaceChat } from './WorkspaceChat'
import type { PlanningIntentDraft } from '@/lib/program-design/planning-intent'
import type { PlanSession } from '@/lib/program-design/plan-types'
import type { SessionOp } from '@/lib/program-design/session-ops'

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

export function ProgramWorkspace({
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
  // 활성 stage = client state. server 자동 판정 + ?stage= 1회 선택으로 초기화.
  const [stage, setStage] = useState<WorkspaceStageId>(
    initialOverrideStage ?? currentStage,
  )

  // ── BR-WS-6 배선: 대화 ↔ 커리큘럼 캔버스 (design 단계 한정) ──
  // ProgramDesignFlow 가 보고한 현재 회차 목록(대화 매칭 근거).
  const [designSessions, setDesignSessions] = useState<PlanSession[] | null>(null)
  // 대화가 해석한 ops 를 ProgramDesignFlow 로 전달 — id 는 단조 증가 카운터(Date.now 금지).
  const [incomingOps, setIncomingOps] = useState<{ id: string; ops: SessionOp[] } | null>(null)
  const opsSeq = useRef(0)
  const handleOps = (ops: SessionOp[]) => {
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
      design: designProps ? (
        <ProgramDesignFlow
          {...designProps}
          onSessionsChange={setDesignSessions}
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
      coach: (
        <AutoRecommendedPool
          projectId={projectId}
          mode="inline"
          assignedCoachIds={[]}
        />
      ),
      // 예산 자동화 — 캔버스 컴포넌트 미연결(budget-dashboard 는 server-assembled
      // PC/AC 데이터 필요, load-workspace 무변경 범위 밖). 클린 placeholder + 보고.
      budget: (
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
          <strong style={{ fontWeight: 700 }}>예산 자동화 — 자동 적산 (준비 중)</strong>
          <p style={{ marginTop: 8 }}>
            커리큘럼 + 코치 위에서 강사·운영·자산·기획비를 자동 적산해 총사업비·마진을
            산출하는 단계입니다. 이 단계의 캔버스 연결은 후속 브리프에서 추가됩니다.
          </p>
        </div>
      ),
      // SROI 예측 = ImpactForecastClient
      sroi: <ImpactForecastClient {...impactProps} />,
    }),
    [projectId, stepRfpProps, designProps, intentProps, impactProps, incomingOps],
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
        {/* 좌 ~40% : 대화 (단계 넘어 이어짐) */}
        <div className="hidden w-2/5 max-w-[520px] shrink-0 md:block">
          <WorkspaceChat
            projectId={projectId}
            stage={stage}
            contextSummary={summaries[stage]}
            // BR-WS-6: design 단계일 때만 현재 회차 목록 동봉 + ops 수신.
            sessions={stage === 'design' ? designSessions : null}
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

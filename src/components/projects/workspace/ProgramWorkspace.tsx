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

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { StageS1 } from '@/components/projects/stages/StageS1'
import { ProgramDesignFlow } from '@/app/(dashboard)/projects/[id]/program-design/_components/program-design-flow'
import { ImpactForecastClient } from '@/app/(dashboard)/projects/[id]/impact-forecast/forecast-client'
import { AutoRecommendedPool } from '@/components/projects/coaches/AutoRecommendedPool'
import { SelectedTeamPanel } from '@/components/projects/coaches/SelectedTeamPanel'
import { CoachAssign } from '@/app/(dashboard)/projects/[id]/coach-assign'
import { BudgetCalcCanvas } from './BudgetCalcCanvas'
import {
  WorkspacePlanProvider,
  useWorkspacePlan,
} from './WorkspacePlanContext'
import { PlanningIntent } from './PlanningIntent'
import { WorkspacePipeline } from './WorkspacePipeline'
import { WorkspaceChat } from './WorkspaceChat'
import { ConceptChat } from './ConceptChat'
import { ConceptCanvas } from './ConceptCanvas'
import type { PlanningIntentDraft } from '@/lib/program-design/planning-intent'
import type {
  WorkspaceChatMessage,
  CoachTeamMember,
} from '@/lib/projects/load-workspace'
import type { PlanSession } from '@/lib/program-design/plan-types'
import type { SessionOp } from '@/lib/program-design/session-ops'
import type { StageOp } from '@/lib/program-design/stage-ops'
import type { BudgetOp } from '@/lib/program-design/budget-ops'
import type { CoachOp } from '@/lib/coaches/coach-ops'
import type {
  ConceptShape,
  ConceptPick,
} from '@/lib/program-design/concept-synth'
import { toast } from 'sonner'
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
   * BR-WS-23: 코치 선발팀(CoachAssignment 로스터) — SSR hydrate 초기값.
   * SelectedTeamPanel 초기값 + assignedCoachIds 초기 파생. 배정/제거 후 client 재fetch.
   */
  coachTeam: CoachTeamMember[]

  /**
   * BR-WS-20: 서버 복원 대화 메시지(loadWorkspace 가 expressTurnsCache 에서 가드 통과분).
   * WorkspaceChat 의 initialMessages 로 전달 — 마운트 1회 시드. 없으면 null(welcome 시작).
   */
  initialChatMessages: WorkspaceChatMessage[] | null

  /**
   * ADR-031 W2: 저장된 컨셉(strategicNotes.concept). null 이면 design 단계가 **컨셉부터**
   * 열린다(좌 ConceptChat + 우 ConceptCanvas). 값이 있으면 확정됨 → 기존 구조(WorkspaceChat +
   * ProgramDesignFlow) + 상단 win-theme 핀. client "다시 잡기"로 재진입 가능.
   */
  savedConcept: ConceptShape | null

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
  coachTeam,
  initialChatMessages,
  savedConcept,
}: Props) {
  // BR-WS-15: 공유 Live Plan — 회차(sessions)/필요 코치 수(coachCount) 단일 소스.
  // BR-WS-19: 비회차(T4/T5) 단계(stages)도 동일 소스에서 — 대화 동봉 근거.
  const {
    sessions,
    setSessions,
    stages,
    setStages,
    coachCount,
    budgetLines,
    coachPool,
    setCoachPool,
    coachTeam: coachTeamRefs,
    setCoachTeam,
  } = useWorkspacePlan()

  // 활성 stage = client state. server 자동 판정 + ?stage= 1회 선택으로 초기화.
  const [stage, setStage] = useState<WorkspaceStageId>(
    initialOverrideStage ?? currentStage,
  )

  // ── ADR-031 W2: 컨셉-퍼스트 design 단계 배선 ──
  // 확정 컨셉 = client state(저장된 것으로 시드 + 확정/재진입으로 갱신). null = 컨셉 단계 활성.
  const [concept, setConcept] = useState<ConceptShape | null>(savedConcept)
  // 좌 대화가 누적한 picks(우 ConceptCanvas 가 좁혀온 경로로 읽음) — lift.
  const [conceptPicks, setConceptPicks] = useState<ConceptPick[]>([])
  // 좌 대화가 조립(assemble)한 컨셉 — 확정 전 우 캔버스 표시용(저장 전 단계).
  const [draftConcept, setDraftConcept] = useState<ConceptShape | null>(null)
  // "다시 잡기" — 확정된 컨셉을 무시하고 컨셉 단계 재진입(client 토글). 저장은 그대로 둠.
  const [reConcept, setReConcept] = useState(false)
  // design 단계에서 컨셉 단계 활성 여부: 확정 컨셉 없음 또는 "다시 잡기" 토글.
  const conceptPhaseActive = !concept || reConcept

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

  // ADR-031 W2: 좌 ConceptCanvas 확정(PUT 성공) → 컨셉 단계 종료 → ProgramDesignFlow 진행.
  const handleConceptConfirmed = (c: ConceptShape) => {
    setConcept(c)
    setReConcept(false)
    setDraftConcept(null)
  }
  // "컨셉 다시 잡기" — 확정 컨셉 유지(저장은 그대로)하되 단계 재진입. 대화/캔버스 초기화.
  const handleReConcept = () => {
    setReConcept(true)
    setConceptPicks([])
    setDraftConcept(null)
  }

  // ── BR-WS-22 배선: 대화 ↔ 예산 캔버스 (budget 단계 한정) — design 과 **별도 채널** ──
  // 서로 안 섞이게 incomingOps(design)와 분리된 budgetIncomingOps 를 둔다. id 단조 증가.
  const [budgetIncomingOps, setBudgetIncomingOps] = useState<{
    id: string
    ops: BudgetOp[]
  } | null>(null)
  const budgetOpsSeq = useRef(0)
  const handleBudgetOps = (ops: BudgetOp[]) => {
    budgetOpsSeq.current += 1
    setBudgetIncomingOps({ id: `budget-ops-${budgetOpsSeq.current}`, ops })
  }

  // ── BR-WS-23 배선: 코치 선발팀 ↔ 추천 풀 ──
  // assignedCoachIds 는 SSR 로스터(coachTeam)에서 초기 파생 → 추천 풀 회색처리 실값.
  // SelectedTeamPanel 이 제거/재fetch 후 onChange 로 최신 coachId 배열을 돌려준다.
  const [assignedCoachIds, setAssignedCoachIds] = useState<string[]>(() =>
    coachTeam.map((m) => m.coachId),
  )
  // 외부 트리거 — 추천/CoachAssign 모달에서 배정 후 패널 재fetch 신호. ++ 로 발화.
  // router.refresh 비의존(워크스페이스는 client 셸). 모달이 닫혀 window 가 focus 를
  // 되찾으면(=배정 종료 가능성) coach 단계에서 1회 재fetch — 무편집 비침투 배선.
  const [coachRefreshSignal, setCoachRefreshSignal] = useState(0)
  const bumpCoachRefresh = () => setCoachRefreshSignal((n) => n + 1)
  useEffect(() => {
    if (stage !== 'coach') return
    const onFocus = () => bumpCoachRefresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [stage])

  // ── BR-WS-24 배선: 대화 → 코치 배정/교체/제거 (coach 단계 한정) — **서버 영속** ──
  // design/budget 의 client override 와 달리, 코치 op 는 기존 coach-assignments API 로 영속한다:
  //   assign → POST · remove → DELETE · swap → DELETE 후 POST. 각 op 후 모아서 1회 로스터 재fetch.
  // route 가 이미 knownIds 로 환각 coachId/assignmentId 를 걸러 보내므로, 여기선 fetch 만.
  // 이중적용 가드: 진행 중이면(coachApplyingRef) 추가 클릭 무시. 실패는 토스트(롤백 불필요 — 서버가 진실).
  const coachApplyingRef = useRef(false)
  const handleCoachOps = (ops: CoachOp[]) => {
    if (ops.length === 0) return
    if (coachApplyingRef.current) return // 진행 중 — 이중 클릭/연속 적용 차단.
    coachApplyingRef.current = true
    void (async () => {
      let okCount = 0
      let failCount = 0
      // 풀의 coachRateMain 으로 agreedRate 기본 보정(op 에 없으면). 양수만 전송(POST schema positive).
      const rateOf = (coachId: string): number | undefined => {
        const m = coachPool.find((c) => c.coachId === coachId)
        return m && m.coachRateMain != null && m.coachRateMain > 0 ? m.coachRateMain : undefined
      }
      const postAssign = async (
        coachId: string,
        role: string,
        agreedRate: number | undefined,
      ): Promise<boolean> => {
        const rate = agreedRate ?? rateOf(coachId)
        const r = await fetch('/api/coach-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            coachId,
            role,
            ...(typeof rate === 'number' && rate > 0 ? { agreedRate: rate } : {}),
          }),
        })
        return r.ok
      }
      const deleteAssignment = async (assignmentId: string): Promise<boolean> => {
        const r = await fetch(`/api/coach-assignments?id=${assignmentId}`, {
          method: 'DELETE',
        })
        return r.ok
      }

      for (const op of ops) {
        try {
          if (op.op === 'assign') {
            if (await postAssign(op.coachId, op.role, op.agreedRate)) okCount++
            else failCount++
          } else if (op.op === 'remove') {
            if (await deleteAssignment(op.assignmentId)) okCount++
            else failCount++
          } else {
            // swap — 먼저 제거, 성공 시 배정. 제거 실패면 배정 시도 안 함(부분 적용 최소화).
            const removed = await deleteAssignment(op.removeAssignmentId)
            if (!removed) {
              failCount++
              continue
            }
            if (await postAssign(op.addCoachId, op.role, op.agreedRate)) okCount++
            else failCount++
          }
        } catch {
          failCount++
        }
      }

      // 모은 변경을 1회 로스터 재fetch 로 반영(SelectedTeamPanel → onChange/onTeamChange 로 동기화).
      bumpCoachRefresh()
      coachApplyingRef.current = false

      if (okCount > 0 && failCount === 0) {
        toast.success(`코치 ${okCount}건 반영했어요.`)
      } else if (okCount > 0 && failCount > 0) {
        toast.warning(`${okCount}건 반영, ${failCount}건 실패. 선발팀을 확인해 주세요.`)
      } else {
        toast.error('코치 배정 반영에 실패했습니다. 잠시 후 다시 시도해주세요.')
      }
    })()
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
        <div className="space-y-4">
          {/* ADR-031 W2: 확정 컨셉 win-theme 한 줄 핀 + "다시 잡기". */}
          {concept && (
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 12,
                border: '1px solid var(--line)',
                borderLeft: '3px solid var(--accent)',
                background: 'var(--neutral-90)',
                padding: '10px 14px',
                maxWidth: 880,
              }}
            >
              <span
                style={{
                  flex: '0 0 auto',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                }}
              >
                컨셉
              </span>
              <span
                style={{
                  flex: '1 1 auto',
                  minWidth: 0,
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  lineHeight: 1.5,
                  wordBreak: 'keep-all',
                }}
              >
                {concept.winTheme}
              </span>
              <button
                type="button"
                onClick={handleReConcept}
                style={{
                  flex: '0 0 auto',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                다시 잡기
              </button>
            </div>
          )}
          <ProgramDesignFlow
            {...designProps}
            onSessionsChange={setSessions}
            onStagesChange={setStages}
            incomingOps={incomingOps}
          />
        </div>
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
      // 코치 매칭 = 선발팀 패널(BR-WS-23) + 코치 배정 모달 + 추천 풀(inline).
      // BR-WS-23: 선발팀(CoachAssignment 로스터)을 표시·제거 + 추천 풀에 실 assignedCoachIds.
      // BR-WS-15: requiredCountOverride=ctx.coachCount — 커리큘럼 회차 변경 즉시 반영.
      coach: (
        <div className="space-y-4">
          {/* 선발팀 — SSR hydrate 초기값 + 외부 신호/제거 시 GET 재fetch */}
          <SelectedTeamPanel
            projectId={projectId}
            initialTeam={coachTeam}
            requiredCount={coachCount}
            refreshSignal={coachRefreshSignal}
            onChange={setAssignedCoachIds}
            // BR-WS-24: 선발팀 전체 메타를 Live Plan 에 보고 — 대화가 remove/swap 근거로 사용.
            onTeamChange={setCoachTeam}
          />

          {/* 코치 배정 모달(자체 트리거 버튼 + 검색·추천 풀 내장). 닫힌 뒤 window focus →
              상단 effect 가 refreshSignal++ 로 선발팀 재fetch. CoachAssign 내부 무변경. */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              추천 풀에서 후보를 보고, <span className="font-medium text-foreground">코치 배정</span> 으로 역할·단가와 함께 선발하세요.
            </p>
            <CoachAssign
              projectId={projectId}
              assignedCoachIds={assignedCoachIds}
            />
          </div>

          {/* AI 추천 풀 — 실 assignedCoachIds 전달(배정된 코치 회색처리). */}
          {/* BR-WS-24: 추천 풀 ready 시 Live Plan 에 보고 — 대화가 assign/swap 근거로 사용. */}
          <AutoRecommendedPool
            projectId={projectId}
            mode="inline"
            assignedCoachIds={assignedCoachIds}
            requiredCountOverride={coachCount}
            onPoolLoaded={(pool) =>
              setCoachPool(
                pool.map((c) => ({
                  coachId: c.coachId,
                  name: c.name,
                  coachRateMain: c.coachRateMain,
                  strengthOneLiner: c.strengthOneLiner,
                  matchScore: c.matchScore,
                })),
              )
            }
          />
        </div>
      ),
      // 예산 자동화 — BR-WS-15: ctx(sessions·coachCount·예산·채널·기간·단가표)로 client
      // live calcBudget. 회차 변경 → 적산·마진 실시간 재계산(API fetch 제거).
      // BR-WS-22: 대화 → 라인 override(budgetIncomingOps) 수신 인렛. design 채널과 분리.
      budget: <BudgetCalcCanvas incomingOps={budgetIncomingOps} />,
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
      budgetIncomingOps,
      setSessions,
      setStages,
      setCoachPool,
      setCoachTeam,
      coachCount,
      coachTeam,
      assignedCoachIds,
      coachRefreshSignal,
      concept,
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
      {stage === 'design' && conceptPhaseActive ? (
        // ── ADR-031 W2: design 단계가 컨셉부터 — 좌 ConceptChat / 우 ConceptCanvas ──
        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="hidden w-[360px] shrink-0 md:block">
            <ConceptChat
              projectId={projectId}
              picks={conceptPicks}
              onPicksChange={setConceptPicks}
              onConcept={setDraftConcept}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <CanvasHeader stage={stage} />
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              <ConceptCanvas
                projectId={projectId}
                picks={conceptPicks}
                concept={draftConcept}
                onConfirmed={handleConceptConfirmed}
              />
            </div>
          </div>
        </div>
      ) : (
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
            // BR-WS-22: budget 단계일 때만 현재 적산 라인 동봉(context 단일 소스).
            budgetLines={stage === 'budget' ? budgetLines : null}
            // BR-WS-24: coach 단계일 때만 추천 풀·선발팀·필요수 동봉(context 단일 소스 — 환각 방지).
            coachPool={stage === 'coach' ? coachPool : null}
            coachTeam={stage === 'coach' ? coachTeamRefs : null}
            requiredN={stage === 'coach' ? coachCount : null}
            // BR-WS-22/24: design ↔ budget ↔ coach 별도 ops 채널. 서로 안 섞임. 단계가 runtime
            // 타입을 보장(design→Session/Stage, budget→Budget, coach→Coach)하므로 forward 클로저로 좁혀 전달.
            onOps={
              stage === 'design'
                ? (ops) => handleOps(ops as (SessionOp | StageOp)[])
                : stage === 'budget'
                  ? (ops) => handleBudgetOps(ops as BudgetOp[])
                  : stage === 'coach'
                    ? (ops) => handleCoachOps(ops as CoachOp[])
                    : undefined
            }
            // BR-WS-20: 서버 복원 대화(마운트 1회 시드). 없으면 welcome 시작.
            initialMessages={initialChatMessages}
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
      )}
    </div>
  )
}

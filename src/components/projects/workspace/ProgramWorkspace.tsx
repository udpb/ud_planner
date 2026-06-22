'use client'

/**
 * ProgramWorkspace — 정본 3단계 워크스페이스 셸 (ADR-029, BR-WS-1)
 *
 * `/projects/[id]` 단일 진입점. 3단계 아코디언(점진 공개):
 *   ① RFP 분석   = StageS1 (StepRfp 래핑)
 *   ② 프로그램 설계 = ProgramDesignFlow (P2 설계 캔버스) ⭐ spine
 *   ③ 임팩트     = ImpactForecastClient (P1 볼트인)
 *
 * StageLayout/StageShell(ADR-015, S1~S5 하드코딩) 의 **패턴을 차용**하되, 3단계
 * 라벨이 달라 StageCard(StageId=S1~S5 키 고정)를 직접 못 쓰므로 동일 톤의 경량
 * 카드를 인라인으로 둔다. manualOverride localStorage 영속 + currentStage 자동
 * 펼침 + ?stage=/?step= 1회 펼침은 StageLayout 동작을 그대로 복제.
 *
 * 엔진·각 단계 컴포넌트 재구현 0 — 전부 조립/임베드만.
 * 디자인: shadcn Card + ud-design-system 토큰. Action Orange 는 활성 stage 만.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import {
  ChevronDown,
  ChevronUp,
  CircleDot,
  CheckCircle2,
  Circle,
} from 'lucide-react'

import { StageS1 } from '@/components/projects/stages/StageS1'
import { ProgramDesignFlow } from '@/app/(dashboard)/projects/[id]/program-design/_components/program-design-flow'
import { ImpactForecastClient } from '@/app/(dashboard)/projects/[id]/impact-forecast/forecast-client'

import {
  WORKSPACE_STAGE_IDS,
  WORKSPACE_STAGE_LABELS,
  WORKSPACE_STAGE_DESCRIPTIONS,
  type WorkspaceStageId,
} from './workspace-stages'

import type { ComponentProps } from 'react'

type StageExpandState = 'expanded' | 'collapsed' | null
type OverridesMap = Partial<Record<WorkspaceStageId, StageExpandState>>

const LS_KEY_PREFIX = 'ud-workspace-stages-'

// ─────────────────────────────────────────────────────────────────
// localStorage 영속 (StageLayout 와 동일 로직)
// ─────────────────────────────────────────────────────────────────

function loadOverrides(projectId: string): OverridesMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LS_KEY_PREFIX + projectId)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const result: OverridesMap = {}
    for (const id of WORKSPACE_STAGE_IDS) {
      const v = (parsed as Record<string, unknown>)[id]
      if (v === 'expanded' || v === 'collapsed' || v === null) {
        result[id] = v
      }
    }
    return result
  } catch {
    return {}
  }
}

function saveOverrides(projectId: string, overrides: OverridesMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      LS_KEY_PREFIX + projectId,
      JSON.stringify(overrides),
    )
  } catch {
    // quota 초과 등 — 무시
  }
}

// ─────────────────────────────────────────────────────────────────
// 단일 stage 카드 (StageCard 톤 복제 — 3 stage 라벨)
// ─────────────────────────────────────────────────────────────────

function WorkspaceStageCard({
  id,
  index,
  active,
  done,
  manualOverride,
  summary,
  children,
  onToggle,
}: {
  id: WorkspaceStageId
  index: number
  active: boolean
  done: boolean
  manualOverride: StageExpandState
  summary: string
  children: ReactNode
  onToggle: (next: StageExpandState) => void
}) {
  const expanded =
    manualOverride === 'expanded'
      ? true
      : manualOverride === 'collapsed'
        ? false
        : active

  const label = WORKSPACE_STAGE_LABELS[id]
  const description = WORKSPACE_STAGE_DESCRIPTIONS[id]

  const stateIcon = done ? (
    <CheckCircle2 className="h-4 w-4 text-green-600" />
  ) : active ? (
    <CircleDot className="h-4 w-4 text-brand" />
  ) : (
    <Circle className="h-4 w-4 text-muted-foreground/60" />
  )

  return (
    <Card
      className={cn(
        'transition-all',
        expanded
          ? active
            ? 'border-brand/40 shadow-sm'
            : 'border-border'
          : 'border-border bg-muted/30',
      )}
      data-stage-id={id}
      data-stage-active={active ? 'true' : 'false'}
      data-stage-expanded={expanded ? 'true' : 'false'}
    >
      <button
        type="button"
        onClick={() => onToggle(expanded ? 'collapsed' : 'expanded')}
        aria-expanded={expanded}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
          'hover:bg-muted/50',
          expanded && 'border-b',
        )}
      >
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold',
            done
              ? 'bg-green-500 text-white'
              : active
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                : 'border border-border bg-muted text-muted-foreground',
          )}
          aria-hidden
        >
          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-sm font-semibold',
                expanded || active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            {active && !expanded && (
              <span className="bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
                현재 단계
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {expanded ? description : summary}
          </div>
        </div>

        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          {stateIcon}
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      {expanded && <div className="p-4">{children}</div>}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────
// ProgramWorkspace
// ─────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  /** 자동 활성 stage (server 판정) */
  currentStage: WorkspaceStageId
  /** ?stage=/?step= 진입 시 1회 펼칠 stage */
  initialOverrideStage: WorkspaceStageId | null
  /** 3 stage 의 done 여부 (server 판정) */
  doneFlags: Record<WorkspaceStageId, boolean>
  /** 3 stage 의 1줄 sticky 요약 (server 판정) */
  summaries: Record<WorkspaceStageId, string>

  /** ① RFP — StageS1(StepRfp) props */
  stepRfpProps: ComponentProps<typeof StageS1>['stepRfpProps']
  /** ② 설계 — ProgramDesignFlow props (rfpPreview 없으면 안내 표시) */
  designProps: ComponentProps<typeof ProgramDesignFlow> | null
  /** ③ 임팩트 — ImpactForecastClient props */
  impactProps: ComponentProps<typeof ImpactForecastClient>
}

export function ProgramWorkspace({
  projectId,
  currentStage,
  initialOverrideStage,
  doneFlags,
  summaries,
  stepRfpProps,
  designProps,
  impactProps,
}: Props) {
  const [overrides, setOverrides] = useState<OverridesMap>(() => {
    if (typeof window === 'undefined') return {}
    const loaded = loadOverrides(projectId)
    if (initialOverrideStage) {
      loaded[initialOverrideStage] = 'expanded'
    }
    return loaded
  })

  const handleToggle = useCallback(
    (id: WorkspaceStageId, next: StageExpandState) => {
      setOverrides((prev) => {
        const updated: OverridesMap = { ...prev, [id]: next }
        saveOverrides(projectId, updated)
        return updated
      })
    },
    [projectId],
  )

  const content: Record<WorkspaceStageId, ReactNode> = useMemo(
    () => ({
      rfp: <StageS1 stepRfpProps={stepRfpProps} />,
      design: designProps ? (
        <ProgramDesignFlow {...designProps} />
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
          {'  '}프로그램 설계는 RFP 핵심(목표·대상·기간·예산) 위에서 시작합니다 — 위
          ① RFP 분석 단계에서 RFP 를 먼저 업로드·분석한 뒤 진행하세요.
        </div>
      ),
      impact: <ImpactForecastClient {...impactProps} />,
    }),
    [stepRfpProps, designProps, impactProps],
  )

  const stageList = useMemo(
    () =>
      WORKSPACE_STAGE_IDS.map((id, idx) => ({
        id,
        index: idx + 1,
        active: id === currentStage,
        done: doneFlags[id],
        summary: summaries[id],
        manualOverride: overrides[id] ?? null,
        content: content[id],
      })),
    [currentStage, doneFlags, summaries, overrides, content],
  )

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-3">
        {stageList.map((s) => (
          <WorkspaceStageCard
            key={s.id}
            id={s.id}
            index={s.index}
            active={s.active}
            done={s.done}
            manualOverride={s.manualOverride}
            summary={s.summary}
            onToggle={(next) => handleToggle(s.id, next)}
          >
            {s.content}
          </WorkspaceStageCard>
        ))}
      </div>
    </div>
  )
}

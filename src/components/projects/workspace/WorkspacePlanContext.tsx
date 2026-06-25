'use client'

/**
 * WorkspacePlanContext — 단계 간 라이브 연동 공유 상태 (BR-WS-15 / SI-thread)
 *
 * 각 단계 캔버스가 따로 놀던 문제(예산이 커리큘럼 회차를 못 받아 "0회차 → 마진
 * 80.9%")를 푼다. **워크스페이스 공유 Live Plan** 한 곳에 커리큘럼 회차(sessions)를
 * 두고, 거기서 코치 필요수·예산 적산 입력을 파생해 ④ 코치 매칭 / ⑤ 예산 자동화가
 * 구독하면 **회차 변경이 즉시 따라온다.**
 *
 *   ② 커리큘럼(ProgramDesignFlow onSessionsChange) → ctx.setSessions
 *     → coachCount = estimateRequiredCoaches({rfp, curriculum}) (useMemo 파생)
 *     → ④ AutoRecommendedPool(requiredCountOverride) + ⑤ BudgetCalcCanvas 가 즉시 갱신.
 *
 * ⚠️ 순수 파생만 — 저장/네트워크 없음. estimateRequiredCoaches·calcBudget 로직은
 *    무변경(사용만). rfp/rules 없으면 graceful(코치수 휴리스틱 fallback, 예산 0 안내).
 *
 * Source: .claude/agent-briefs/BR-WS-15-stage-thread.md
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { estimateRequiredCoaches } from '@/lib/coaches/required-count'
import type { PlanSession } from '@/lib/program-design/plan-types'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type {
  BudgetChannel,
  BudgetRules,
} from '@/lib/program-design/budget-calc'

// ─────────────────────────────────────────────────────────────────
// PlanSession(설계 회차) → required-count 의 curriculum 입력 매핑.
//
// estimateRequiredCoaches 는 1:1 코칭/Action Week 플래그만 본다(로직 무변경).
// 설계 캔버스의 PlanSession 에는 그 플래그가 없으므로 kind/title 로 파생한다:
//   - isCoaching1on1 = kind === 'coaching' (코칭 회차)
//   - isActionWeek   = kind 가 event/milestone 또는 title 에 액션위크/실행/action.
// ─────────────────────────────────────────────────────────────────

const ACTION_WEEK_RE = /액션\s*위크|실행\s*주|action\s*week/i

function toRequiredCountCurriculum(
  sessions: PlanSession[] | null,
): Array<{ isCoaching1on1: boolean; isActionWeek: boolean }> | undefined {
  if (!sessions) return undefined
  return sessions.map((s) => ({
    isCoaching1on1: s.kind === 'coaching',
    isActionWeek:
      s.kind === 'event' ||
      s.kind === 'milestone' ||
      ACTION_WEEK_RE.test(s.title ?? ''),
  }))
}

// ─────────────────────────────────────────────────────────────────
// Context 값
// ─────────────────────────────────────────────────────────────────

export interface WorkspacePlanContextValue {
  /** 현재 커리큘럼 회차(설계 캔버스 보고분). sessions 구조 아니면 null. */
  sessions: PlanSession[] | null
  /** ② 설계 캔버스의 onSessionsChange 가 호출 — Live Plan 갱신. */
  setSessions: (sessions: PlanSession[] | null) => void

  /** RFP 파싱 결과(있으면) — coachCount 휴리스틱·예산 채널 추정 토대. */
  rfp: RfpParsed | null
  /** 총예산 R(VAT 포함). 없으면 0(예산 캔버스가 안내). */
  totalBudget: number
  /** 적산 채널(B2G/B2B). */
  channel: BudgetChannel
  /** 교육 기간(개월) — eduStartDate~eduEndDate 파생(server). */
  durationMonths: number
  /** 단가표(budget-rules.json) — server 가 로드해 주입(client live calcBudget 용). */
  budgetRules: BudgetRules | null

  /** ▷ 파생: 필요 코치 수 N (sessions/ rfp 변하면 재계산). */
  coachCount: number
  /** ▷ 파생: 필요 코치 수 N 추정 근거(PM "왜 N명?"). */
  coachRationale: string[]
}

const WorkspacePlanContext = createContext<WorkspacePlanContextValue | null>(
  null,
)

// ─────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────

export interface WorkspacePlanProviderProps {
  /** 초기 회차(load-workspace 의 savedPlan 회차표 — 없으면 null). */
  initialSessions: PlanSession[] | null
  rfp: RfpParsed | null
  totalBudget: number
  channel: BudgetChannel
  durationMonths: number
  budgetRules: BudgetRules | null
  children: ReactNode
}

export function WorkspacePlanProvider({
  initialSessions,
  rfp,
  totalBudget,
  channel,
  durationMonths,
  budgetRules,
  children,
}: WorkspacePlanProviderProps) {
  const [sessions, setSessions] = useState<PlanSession[] | null>(
    initialSessions,
  )

  // 파생: 필요 코치 수 N (sessions/rfp 기반). rfp 없으면 코치수 산정 불가 → 1.
  const { coachCount, coachRationale } = useMemo(() => {
    if (!rfp) return { coachCount: 1, coachRationale: [] as string[] }
    const { n, rationale } = estimateRequiredCoaches({
      rfp,
      curriculum: toRequiredCountCurriculum(sessions),
    })
    return { coachCount: n, coachRationale: rationale }
  }, [rfp, sessions])

  const value = useMemo<WorkspacePlanContextValue>(
    () => ({
      sessions,
      setSessions,
      rfp,
      totalBudget,
      channel,
      durationMonths,
      budgetRules,
      coachCount,
      coachRationale,
    }),
    [
      sessions,
      rfp,
      totalBudget,
      channel,
      durationMonths,
      budgetRules,
      coachCount,
      coachRationale,
    ],
  )

  return (
    <WorkspacePlanContext.Provider value={value}>
      {children}
    </WorkspacePlanContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────────
// hook
// ─────────────────────────────────────────────────────────────────

/**
 * Live Plan 공유 상태 구독. Provider 밖에서 호출하면 throw(배선 누락 조기 검출).
 */
export function useWorkspacePlan(): WorkspacePlanContextValue {
  const ctx = useContext(WorkspacePlanContext)
  if (!ctx) {
    throw new Error(
      'useWorkspacePlan 은 WorkspacePlanProvider 안에서만 사용할 수 있습니다.',
    )
  }
  return ctx
}

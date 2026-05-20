'use client'

/**
 * StageLayout — Wave V / F0 (ADR-015, 2026-05-20)
 *
 * 5 StageCard (S1~S5) 를 세로 스택으로 배치 + 펼침/접힘 manualOverride 관리.
 * localStorage 로 PM 토글 상태 영속 (페이지 이동·새로고침 후 복원).
 *
 * 자동 활성 stage 는 computeCurrentStage 가 결정 (server 에서 prop 전달).
 * PM 수동 펼침/접힘은 manualOverride 로 덮어쓰기.
 *
 * Multi-expanded UX: PM 이 여러 카드를 동시에 펼칠 수 있음. 활성 stage 는
 * auto 펼침, 다른 카드는 클릭 시 펼침.
 */

import { useCallback, useState, useMemo } from 'react'
import { StageCard, type StageExpandState } from './StageCard'
import { STAGE_IDS, type StageId } from './stage-mapping'

interface StageData {
  /** 접힘 시 sticky 1줄 */
  summary: string
  /** 완료 여부 (체크 아이콘 표시) */
  done: boolean
  /** 펼침 시 본문 */
  content: React.ReactNode
}

interface Props {
  /** computeCurrentStage 결과 — 자동 활성 stage 1개 */
  currentStage: StageId
  /** ?step= query 가 들어왔을 때 1회 펼치는 stage (있으면 mount 시 manualOverride 초기화) */
  initialOverrideStage?: StageId | null
  /** 5 stage 의 data — server 에서 미리 준비 */
  stages: Record<StageId, StageData>
  /** localStorage 키 namespacing 용 (project id) */
  projectId: string
}

type OverridesMap = Partial<Record<StageId, StageExpandState>>

const LS_KEY_PREFIX = 'ud-v3-stages-'

function loadOverrides(projectId: string): OverridesMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LS_KEY_PREFIX + projectId)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    // 값 검증 — 'expanded' | 'collapsed' | null 만 허용
    const result: OverridesMap = {}
    for (const id of STAGE_IDS) {
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
    window.localStorage.setItem(LS_KEY_PREFIX + projectId, JSON.stringify(overrides))
  } catch {
    // localStorage quota 초과 등 — 무시
  }
}

export function StageLayout({
  currentStage,
  initialOverrideStage,
  stages,
  projectId,
}: Props) {
  // 초기 manualOverride — localStorage 복원 + initialOverrideStage (?step= 진입 시).
  //
  // initialOverrideStage 가 mount 후 바뀌는 경우 (URL ?step 동적 변경) 는
  // page.tsx 가 server component 라 URL 변경 시 자동 remount → useState
  // initializer 가 다시 실행되어 자연스럽게 새 값 반영. useEffect 로 동기화
  // 불필요 (react-hooks/set-state-in-effect rule 회피).
  const [overrides, setOverrides] = useState<OverridesMap>(() => {
    if (typeof window === 'undefined') return {}
    const loaded = loadOverrides(projectId)
    if (initialOverrideStage) {
      loaded[initialOverrideStage] = 'expanded'
    }
    return loaded
  })

  const handleToggle = useCallback(
    (id: StageId, next: StageExpandState) => {
      setOverrides((prev) => {
        const updated: OverridesMap = { ...prev, [id]: next }
        saveOverrides(projectId, updated)
        return updated
      })
    },
    [projectId],
  )

  // Stage 별 active 결정 — currentStage 만 active=true
  const stageList = useMemo(
    () =>
      STAGE_IDS.map((id, idx) => ({
        id,
        index: idx + 1,
        active: id === currentStage,
        ...stages[id],
        manualOverride: overrides[id] ?? null,
      })),
    [currentStage, stages, overrides],
  )

  return (
    <div className="space-y-3">
      {stageList.map((s) => (
        <StageCard
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
        </StageCard>
      ))}
    </div>
  )
}

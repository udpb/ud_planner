'use client'

/**
 * SelectedTeamPanel — 코치 선발팀 표시·제거 (BR-WS-23)
 *
 * 워크스페이스 코치 단계가 *추천 풀*만 보이던 갭을 메운다. 이 패널은 이 프로젝트의
 * `CoachAssignment` rows("선발팀")를 보여주고, 각 멤버를 제거할 수 있게 한다.
 *
 *   - 초기값 = SSR(load-workspace)이 hydrate 한 `initialTeam`.
 *   - 배정/제거 후엔 GET `/api/projects/{id}/coach-assignments` 로 재fetch
 *     (router.refresh 비의존 — 워크스페이스는 client 셸이라 server 재렌더가
 *      client stage state 를 못 깬다).
 *   - 외부(추천 풀에서 배정) → `refreshSignal` prop 을 증가시키면 재fetch.
 *   - 멤버 제거 → DELETE `/api/coach-assignments?id=` → 재fetch + `onChange`.
 *
 * 새 모델 0 — 기존 API(POST/DELETE)·CoachAssignment 재사용. 표시·배선만.
 * 디자인킷 260529: accent #F05519 1개, radius 0, 틴트 박스. 제거는 절제(텍스트 버튼).
 */

import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Loader2, Trash2, CheckCircle2, Users } from 'lucide-react'
import type { CoachTeamMember } from '@/lib/projects/load-workspace'

interface Props {
  projectId: string
  /** SSR hydrate 한 초기 로스터. 이후엔 GET 재fetch 가 권위 소스. */
  initialTeam: CoachTeamMember[]
  /**
   * 필요 코치 수(Live Plan coachCount) — "n/N명" 진척 표시. 0/없으면 진척 숨김.
   */
  requiredCount?: number
  /**
   * 외부 트리거 — 값이 바뀌면 GET 재fetch (추천 풀에서 배정 직후 부모가 ++).
   * 초기 마운트(0)에선 재fetch 안 함(initialTeam 사용).
   */
  refreshSignal?: number
  /**
   * 로스터 변동 시(제거 성공·재fetch 완료) 호출 — 부모가 assignedCoachIds 동기화.
   * 최신 coachId 배열을 넘긴다.
   */
  onChange?: (coachIds: string[]) => void
}

const ROLE_LABEL: Record<string, string> = {
  MAIN_COACH: '메인 코치',
  SUB_COACH: '보조 코치',
  LECTURER: '강사(메인)',
  SUB_LECTURER: '강사(보조)',
  SPECIAL_LECTURER: '특강 연사',
  JUDGE: '심사위원',
  PM_OPS: '운영 PM',
}

const TIER_LABEL: Record<string, string> = {
  TIER1: '베테랑코치',
  TIER2: 'UD코치',
  TIER3: '외부풀',
}

export function SelectedTeamPanel({
  projectId,
  initialTeam,
  requiredCount,
  refreshSignal = 0,
  onChange,
}: Props): JSX.Element {
  const [team, setTeam] = useState<CoachTeamMember[]>(initialTeam)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // 부모가 넘기는 onChange 는 effect 의존성에 넣지 않는다(매 렌더 새 함수 가능).
  // 최신 참조를 ref 없이 안전하게 쓰려고 refetch 안에서만 호출.
  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/projects/${projectId}/coach-assignments`, {
        method: 'GET',
      })
      const contentType = r.headers.get('content-type') ?? ''
      if (contentType.includes('text/html')) {
        setError('세션 만료 — 새 탭에서 로그인 후 새로고침')
        return
      }
      if (!r.ok) {
        setError('선발팀 로드 실패')
        return
      }
      const data = (await r.json()) as { team?: CoachTeamMember[] }
      const next = Array.isArray(data.team) ? data.team : []
      setTeam(next)
      onChange?.(next.map((m) => m.coachId))
    } catch {
      setError('선발팀 로드 실패')
    } finally {
      setLoading(false)
    }
    // onChange 는 의존성에서 제외(매 렌더 새 함수일 수 있음 — 내부에서 최신 호출).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // 외부 트리거(refreshSignal>0)에서만 재fetch. 초기(0)는 initialTeam 사용.
  useEffect(() => {
    if (refreshSignal > 0) {
      void refetch()
    }
  }, [refreshSignal, refetch])

  const handleRemove = useCallback(
    async (assignmentId: string) => {
      setRemovingId(assignmentId)
      setError(null)
      try {
        const r = await fetch(`/api/coach-assignments?id=${assignmentId}`, {
          method: 'DELETE',
        })
        if (!r.ok) {
          setError('코치 제거 실패')
          return
        }
        await refetch()
      } catch {
        setError('코치 제거 실패')
      } finally {
        setRemovingId(null)
      }
    },
    [refetch],
  )

  const showProgress = requiredCount != null && requiredCount > 0

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderLeft: '3px solid var(--accent)',
        background: 'var(--neutral-90)',
      }}
    >
      {/* 헤더 */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-2.5"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <div className="flex items-center gap-2 text-sm font-bold">
          <Users className="h-4 w-4" style={{ color: 'var(--accent)' }} />
          <span>선발팀</span>
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        {showProgress && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {team.length}/{requiredCount}명
          </span>
        )}
      </div>

      {error && (
        <p className="px-4 pt-2 text-xs text-destructive">{error}</p>
      )}

      {/* 본문 */}
      {team.length === 0 ? (
        <p className="px-4 py-4 text-xs leading-relaxed text-muted-foreground">
          아직 선발된 코치가 없습니다 — 아래 추천 풀에서 카드를 클릭하거나{' '}
          <span className="font-medium text-foreground">코치 배정</span> 으로
          추가하세요.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
          {team.map((m) => {
            const rate = m.agreedRate ?? m.coach.coachRateMain ?? m.coach.lectureRateMain
            return (
              <li
                key={m.assignmentId}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                {/* 이니셜 */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-muted text-sm font-semibold text-muted-foreground">
                  {m.coach.name.charAt(0) || '?'}
                </div>

                {/* 정보 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">
                      {m.coach.name}
                    </span>
                    <span className="shrink-0 border border-border px-1 text-[9px] font-semibold text-muted-foreground">
                      {TIER_LABEL[m.coach.tier] ?? m.coach.tier}
                    </span>
                    {m.confirmed && (
                      <span
                        className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium"
                        style={{ color: 'var(--accent)' }}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        확정
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{ROLE_LABEL[m.role] ?? m.role}</span>
                    {rate != null && rate > 0 && (
                      <span className="tabular-nums">
                        단가 {Math.round(rate / 10000)}만원
                      </span>
                    )}
                    {m.sessions > 0 && <span>{m.sessions}회</span>}
                  </div>
                </div>

                {/* 제거 — 절제(텍스트/아이콘 버튼) */}
                <button
                  type="button"
                  onClick={() => handleRemove(m.assignmentId)}
                  disabled={removingId === m.assignmentId}
                  className="inline-flex shrink-0 items-center gap-1 px-1.5 py-1 text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50 cursor-pointer"
                  aria-label={`${m.coach.name} 제거`}
                >
                  {removingId === m.assignmentId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

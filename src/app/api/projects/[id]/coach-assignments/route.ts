/**
 * /api/projects/[id]/coach-assignments — 프로젝트 코치 선발팀 로스터 (BR-WS-23)
 *
 * 워크스페이스 코치 단계가 *추천 풀*만 보이고 **선발된 팀**(기존 CoachAssignment
 * rows)이 안 보이던 갭을 메운다. 이 GET 은 프로젝트에 배정된 CoachAssignment 를
 * coach 메타와 함께 정제해 반환 — SelectedTeamPanel 이 SSR hydrate 후 배정/제거 시
 * 이 엔드포인트로 재fetch 한다(router.refresh 비의존 — 워크스페이스는 client 셸).
 *
 * 새 모델 0 — 기존 `CoachAssignment` findMany 만. 스키마 변경 0(읽기 전용).
 *
 * 인증: requireProjectAccess (workspace-chat / planning-intent route 미러 —
 *   PM 본인/미배정/ADMIN·DIRECTOR/dev 우회). AI 호출 없음(순수 조회).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** 선발팀 한 멤버 — SelectedTeamPanel 이 소비하는 정제 형태(roster row). */
export interface CoachTeamMember {
  /** CoachAssignment.id — 제거(DELETE) 키. */
  assignmentId: string
  /** Coach.id (cuid) — assignedCoachIds 흐림 표시용. */
  coachId: string
  role: string
  sessions: number
  agreedRate: number | null
  totalFee: number | null
  netFee: number | null
  confirmed: boolean
  coach: {
    id: string
    name: string
    tier: string
    expertise: string[]
    regions: string[]
    coachRateMain: number | null
    lectureRateMain: number | null
  }
}

// ─────────────────────────────────────────────────────────────────
// GET — 프로젝트 코치 선발팀 로스터 (CoachAssignment rows + coach 메타)
// ─────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  try {
    const rows = await prisma.coachAssignment.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        coachId: true,
        role: true,
        sessions: true,
        agreedRate: true,
        totalFee: true,
        netFee: true,
        confirmed: true,
        coach: {
          select: {
            id: true,
            name: true,
            tier: true,
            expertise: true,
            regions: true,
            coachRateMain: true,
            lectureRateMain: true,
          },
        },
      },
    })

    const team: CoachTeamMember[] = rows.map((r) => ({
      assignmentId: r.id,
      coachId: r.coachId,
      role: r.role,
      sessions: r.sessions,
      agreedRate: r.agreedRate,
      totalFee: r.totalFee,
      netFee: r.netFee,
      confirmed: r.confirmed,
      coach: {
        id: r.coach.id,
        name: r.coach.name,
        tier: r.coach.tier,
        expertise: r.coach.expertise,
        regions: r.coach.regions,
        coachRateMain: r.coach.coachRateMain,
        lectureRateMain: r.coach.lectureRateMain,
      },
    }))

    return NextResponse.json({ team })
  } catch (err) {
    console.error('[coach-assignments] 로스터 로드 실패:', err)
    return NextResponse.json(
      { error: '코치 선발팀 로드에 실패했습니다.' },
      { status: 500 },
    )
  }
}

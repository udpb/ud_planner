/**
 * GET /api/projects/[id]/recommend-coaches
 *
 * Wave V / F1 (ADR-015) — 필요 코치 수 N 추정 + N×5 추천 풀 반환.
 *
 * 절차:
 *   1. requireProjectAccess (PM 본인 / 미배정 / ADMIN·DIRECTOR / dev 우회)
 *   2. Project.rfpParsed + programProfile + curriculum 조회
 *   3. estimateRequiredCoaches → N + rationale
 *   4. getCoachesCached (5분 cache) → 715명 풀
 *   5. recommendCoaches (pure) → 점수 desc 상위 5N
 *   6. Prisma Coach 테이블에서 coachId(cuid) + lectureRateMain + coachRateMain enrich
 *      — sync 안 된 코치는 제외
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import {
  getCoachesCached,
  isSupabaseCoachSourceAvailable,
} from '@/lib/coaches/supabase-source'
import { estimateRequiredCoaches } from '@/lib/coaches/required-count'
import { recommendCoaches } from '@/lib/coaches/coach-recommender'
import type { RecommendCoachesResponse } from '@/lib/coaches/types'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  if (!isSupabaseCoachSourceAvailable()) {
    return NextResponse.json(
      { error: 'Supabase coaches_directory 미설정' },
      { status: 503 },
    )
  }

  // Project + RFP + curriculum 조회
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      rfpParsed: true,
      programProfile: true,
      curriculum: {
        select: { isCoaching1on1: true, isActionWeek: true },
      },
    },
  })
  if (!project || !project.rfpParsed) {
    return NextResponse.json(
      { error: 'RFP 분석 먼저 진행해주세요' },
      { status: 400 },
    )
  }

  const rfp = project.rfpParsed as unknown as RfpParsed
  const profile = (project.programProfile as unknown as ProgramProfile) ?? undefined

  // N 추정
  const { n: requiredN, rationale } = estimateRequiredCoaches({
    rfp,
    curriculum: project.curriculum.map((c) => ({
      isCoaching1on1: (c as { isCoaching1on1?: boolean }).isCoaching1on1 ?? false,
      isActionWeek: c.isActionWeek,
    })),
  })

  // 715명 풀 fetch (5분 cache)
  const coaches = await getCoachesCached()

  // 점수 계산 + top 5N
  const recommendations = recommendCoaches({
    rfp,
    profile,
    requiredN,
    coaches,
  })

  // Prisma 에서 coachId (cuid) + 단가 enrich
  const githubIds = recommendations
    .map((r) => r.githubId)
    .filter((id): id is number => id !== null)

  let prismaCoaches: Array<{
    id: string
    githubId: number | null
    lectureRateMain: number | null
    coachRateMain: number | null
  }> = []
  if (githubIds.length > 0) {
    prismaCoaches = await prisma.coach.findMany({
      where: { githubId: { in: githubIds } },
      select: {
        id: true,
        githubId: true,
        lectureRateMain: true,
        coachRateMain: true,
      },
    })
  }

  // recommendations 의 각 항목에 coachId + 단가 매핑
  const prismaByGithubId = new Map(prismaCoaches.map((c) => [c.githubId, c]))
  const enriched = recommendations
    .map((r) => {
      if (r.githubId == null) return null // Prisma 매핑 불가
      const p = prismaByGithubId.get(r.githubId)
      if (!p) return null // sync 안 된 코치 — 제외
      return {
        ...r,
        coachId: p.id,
        lectureRateMain: p.lectureRateMain,
        coachRateMain: p.coachRateMain,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const response: RecommendCoachesResponse = {
    requiredN,
    rationale,
    recommendations: enriched,
    poolSize: enriched.length,
    generatedAt: new Date().toISOString(),
  }

  return NextResponse.json(response)
}

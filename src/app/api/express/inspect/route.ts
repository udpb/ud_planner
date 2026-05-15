/**
 * POST /api/express/inspect
 *
 * 1차본 자동 검수 — 7 렌즈로 평가위원 시각 분석.
 * 사용자 명시 요청 (2026-04-27): "검수 에이전트를 통해서 답변 퀄리티가 잘 출력되는지 점검"
 *
 * Body: { projectId, draft? }
 * Response: { report: InspectorReport, fellbackToHeuristic: boolean }
 *
 * 관련: docs/architecture/express-mode.md §8.3
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { ExpressDraftSchema } from '@/lib/express/schema'
import { inspectDraft, heuristicInspect } from '@/lib/express/inspector'
import {
  recommendAssetsForWeakLenses,
  pickWeakLenses,
} from '@/lib/express/asset-recommender'
import type { ProgramProfile } from '@/lib/program-profile'

const BodySchema = z.object({
  projectId: z.string().min(1),
  draft: z.unknown().optional(),
})

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
    }
    const { projectId } = parsed.data

    const access = await requireProjectAccess(projectId)
    if (!access.ok) return access.response!

    // Draft 로드 — body 우선, 없으면 DB
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { expressDraft: true, programProfile: true },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const candidate = parsed.data.draft ?? project.expressDraft
    const draftValidation = ExpressDraftSchema.safeParse(candidate)
    if (!draftValidation.success) {
      return NextResponse.json(
        { error: 'ExpressDraft 가 유효하지 않음', issues: draftValidation.error.issues.slice(0, 5) },
        { status: 400 },
      )
    }
    const draft = draftValidation.data

    // Phase M2: 채널 가중치 적용 (autoDiagnosis.channel 또는 confirmedByPm 기반)
    const channel = draft.meta?.autoDiagnosis?.channel?.detected

    // LLM 검수 시도
    let report
    let fellbackToHeuristic = false
    try {
      report = await inspectDraft(draft, { channel })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[/api/express/inspect] LLM 실패 → 휴리스틱 fallback:', msg)
      report = heuristicInspect(draft)
      fellbackToHeuristic = true
    }

    // Wave N1 — 약점 lens 별 자산 추천 (휴리스틱 fallback 일 땐 lensScores 없을 수 있어서 issues 기반 폴백)
    // Wave N4 — channel + semanticQuery (draft.intent + Before) 전달
    let recommendations: Awaited<ReturnType<typeof recommendAssetsForWeakLenses>> = []
    try {
      const weakLenses = pickWeakLenses(report)
      if (weakLenses.length > 0) {
        // semantic query: 의도 + Before 합쳐서 자산 의미 매칭 강화
        const semanticParts: string[] = []
        if (draft.intent) semanticParts.push(draft.intent)
        if (draft.beforeAfter?.before) semanticParts.push(draft.beforeAfter.before)
        if (draft.keyMessages?.length)
          semanticParts.push(draft.keyMessages.join(' '))
        const semanticQuery = semanticParts.join('\n').slice(0, 1500)

        recommendations = await recommendAssetsForWeakLenses({
          weakLenses,
          programProfile: project.programProfile as ProgramProfile | null,
          channel,
          semanticQuery: semanticQuery.length > 20 ? semanticQuery : undefined,
        })
      }
    } catch (err: unknown) {
      // 추천은 비필수 — 실패해도 검수 결과는 반환
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[/api/express/inspect] asset 추천 실패 (무시):', msg)
    }

    return NextResponse.json({ report, recommendations, fellbackToHeuristic })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/express/inspect] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

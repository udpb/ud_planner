/**
 * POST /api/projects/[id]/auto-research
 *
 * Wave V / F3 (ADR-015) — 외부 리서치 자동화 entry.
 *
 * 절차 (F1 recommend-coaches 패턴):
 *   1. requireProjectAccess (PM 본인 / 미배정 / ADMIN·DIRECTOR / dev 우회)
 *   2. EXPRESS_PARADIGM_V3 feature flag — OFF 시 410
 *   3. Rate limit — IP 별 분당 5회 (외부 호출 비용 보수)
 *   4. body 검증 (AutoResearchRequestSchema) + attempt 상한 (MAX_RESEARCH_ATTEMPT=3)
 *   5. Project.rfpParsed + programProfile + expressDraft 조회
 *   6. universes 추정 (profile 우선, 없으면 suggestActpreneurUniverses)
 *   7. excludeSources — 기존 evidenceRefs.source 추출 (dedupe)
 *   8. autoResearch (Tier 1 cache → Tier 2 Gemini grounding → Tier 3 fallback)
 *   9. zod 응답 검증 + 반환
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { isExpressParadigmV3 } from '@/lib/feature-flags'
import { autoResearch } from '@/lib/research/auto-researcher'
import {
  AutoResearchRequestSchema,
  MAX_RESEARCH_ATTEMPT,
  AutoResearchResultSchema,
} from '@/lib/research/types'
import {
  suggestActpreneurUniverses,
  type ProgramProfile,
} from '@/lib/program-profile'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Gemini grounding 최대 ~25초

// Rate limit — 분당 5회 (외부 호출 비용 보수)
const AUTO_RESEARCH_RATE_LIMIT = { limit: 5, windowMs: 60_000 } as const

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // 1. Auth
  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  // 2. Feature flag — flag OFF 시 410 (gone)
  if (!isExpressParadigmV3()) {
    return NextResponse.json(
      { error: 'F3 auto-research 는 EXPRESS_PARADIGM_V3 활성 시만 사용 가능합니다.' },
      { status: 410 },
    )
  }

  // 3. Rate limit (IP + user 기반)
  const userId = access.userId ?? 'anon'
  const limitKey = `auto-research:${userId}:${getClientIp(req)}`
  const rl = checkRateLimit({ key: limitKey, ...AUTO_RESEARCH_RATE_LIMIT })
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: 'RATE_LIMIT',
        message: `요청 한도 초과. ${rl.retryAfterSec}초 후 재시도.`,
        retryAfterSec: rl.retryAfterSec,
      },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  // 4. Body validation
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = AutoResearchRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { topic, attempt } = parsed.data

  if (attempt > MAX_RESEARCH_ATTEMPT) {
    return NextResponse.json(
      { error: `최대 ${MAX_RESEARCH_ATTEMPT}회까지 retry 가능.` },
      { status: 400 },
    )
  }

  // 5. Project 로딩
  const project = await prisma.project.findUnique({
    where: { id },
    select: { rfpParsed: true, programProfile: true, expressDraft: true },
  })
  if (!project || !project.rfpParsed) {
    return NextResponse.json(
      { error: 'RFP 분석 먼저 진행해주세요.' },
      { status: 400 },
    )
  }
  const rfp = project.rfpParsed as unknown as RfpParsed
  const profile =
    (project.programProfile as unknown as ProgramProfile) ?? undefined

  // 6. universes 추정 — profile 우선, 없으면 RFP 기반 휴리스틱
  const universes =
    profile?.actpreneurUniverses ??
    suggestActpreneurUniverses({
      keywords: rfp.keywords,
      targetStage: rfp.targetStage,
      targetSegment: rfp.targetAudience,
      detectedTasks: rfp.detectedTasks,
    })

  // 7. excludeSources — 기존 evidenceRefs 의 source 추출 (dedupe)
  type ExpressDraftShape = { evidenceRefs?: Array<{ source?: string }> }
  const draftRaw = project.expressDraft as ExpressDraftShape | null
  const existingSources = (draftRaw?.evidenceRefs ?? [])
    .map((r) => r.source)
    .filter((s): s is string => !!s)

  // 8. autoResearch 호출
  const result = await autoResearch({
    topic,
    rfp,
    universes,
    attempt,
    excludeSources: existingSources,
  })

  // 9. zod 응답 검증 + 반환
  const validated = AutoResearchResultSchema.safeParse(result)
  if (!validated.success) {
    // autoResearch 가 잘못된 모양 반환 — 코드 버그. log + 500.
    console.error('[auto-research] result validation failed', {
      issues: validated.error.issues,
      topic,
    })
    return NextResponse.json(
      { error: 'Internal: autoResearch result validation failed' },
      { status: 500 },
    )
  }

  return NextResponse.json(validated.data)
}

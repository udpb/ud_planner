/**
 * POST /api/projects/[id]/accept-research
 *
 * Wave V / F3 (ADR-015) — PM 이 수락한 AutoResearchHit 을 draft 에 누적.
 *
 * 책임:
 *   1. evidenceRefs 에 hits 누적 (fetchedVia='auto-research', max 15)
 *   2. sections.* 본문에 inline citation 마커 자동 박음 — 규칙 기반 (AI 판단 X)
 *   3. Project.expressDraft JSON 갱신 + 갱신된 draft 반환
 *
 * section 자동 결정은 hit.source/summary/value 의 키워드 매칭 (pickSectionForHit).
 * 다른 라우트와 패턴 동일: requireProjectAccess → rate-limit → body 검증 → 처리 → 저장.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { checkRateLimit, getClientIp, AI_RATE_LIMIT } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import {
  ExpressDraftSchema,
  type ExpressDraft,
  type SectionKey,
} from '@/lib/express/schema'
import {
  AcceptResearchRequestSchema,
  type AutoResearchHit,
} from '@/lib/research/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

/**
 * hit 의 source/summary/value 키워드 → section 자동 결정 (규칙 기반).
 * - 성과/KPI/임팩트 키워드 → '6' (기대 성과)
 * - 사례/벤치마크/해외 키워드 → '2' (추진 전략)
 * - 대상/참여자/운영 키워드 → '3' (커리큘럼)
 * - 정부/제도/시장/규모/전망 키워드 → '1' (제안 배경)
 * - 기본 fallback: '1'
 */
function pickSectionForHit(hit: AutoResearchHit): SectionKey {
  const haystack = (
    hit.source +
    ' ' +
    hit.summary +
    ' ' +
    (hit.value ?? '')
  ).toLowerCase()

  if (/성과|kpi|효과|roi|sroi|임팩트|impact/.test(haystack)) return '6'
  if (/벤치마크|사례|해외|유사|글로벌|아시아|벤치/.test(haystack)) return '2'
  if (/대상|참여자|운영|진행|회차/.test(haystack)) return '3'
  if (/정부|제도|법|정책|지원사업|시장|규모|전망/.test(haystack)) return '1'

  return '1' // fallback
}

/**
 * hit 을 inline citation 마커로 변환.
 * URL 있으면 [근거: source | year | url], 없으면 [근거: source | year]
 */
function formatHitCitation(hit: AutoResearchHit): string {
  if (hit.sourceUrl) {
    return `[근거: ${hit.source} | ${hit.year} | ${hit.sourceUrl}]`
  }
  return `[근거: ${hit.source} | ${hit.year}]`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // 1. Auth
  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  // 2. Rate limit (IP + user 기반 — 분당 10회, AI_RATE_LIMIT 표준)
  const userId = access.userId ?? 'anon'
  const limitKey = `accept-research:${userId}:${getClientIp(req)}`
  const rl = checkRateLimit({ key: limitKey, ...AI_RATE_LIMIT })
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

  // 3. Body validation
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = AcceptResearchRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { draft: rawDraft, hits } = parsed.data

  // 4. draft 자체 zod 검증 (AcceptResearchRequestSchema 가 draft 는 unknown 으로 받음)
  const draftParsed = ExpressDraftSchema.safeParse(rawDraft)
  if (!draftParsed.success) {
    return NextResponse.json(
      { error: 'Invalid draft', issues: draftParsed.error.issues },
      { status: 400 },
    )
  }
  const draft = draftParsed.data

  // 5. evidenceRefs 에 hits 누적 (max 15)
  const newEvidence = hits.map((h) => ({
    topic: h.topic,
    source: h.source,
    summary: h.summary,
    fetchedVia: 'auto-research' as const,
    capturedAt: new Date().toISOString(),
  }))
  const updatedEvidence = [...(draft.evidenceRefs ?? []), ...newEvidence].slice(
    0,
    15,
  )

  // 6. sections 에 inline citation 자동 박음
  const updatedSections: Record<string, string> = { ...(draft.sections ?? {}) }
  for (const hit of hits) {
    const sectionKey = pickSectionForHit(hit)
    const citation = formatHitCitation(hit)
    const existing = updatedSections[sectionKey] ?? ''
    // 동일 source 이 이미 있으면 skip
    if (existing.includes(`[근거: ${hit.source}`)) continue
    // 추가 — 본문 끝에 한 줄 추가
    const addition =
      (existing && existing.length > 0 ? '\n\n' : '') +
      `${hit.summary} ${citation}`
    updatedSections[sectionKey] = (existing + addition).slice(0, 2000)
  }

  // 7. draft 갱신
  const updatedDraft: ExpressDraft = {
    ...draft,
    evidenceRefs: updatedEvidence,
    sections: updatedSections as ExpressDraft['sections'],
    meta: {
      ...draft.meta,
      lastUpdatedAt: new Date().toISOString(),
    },
  }

  // 8. DB 저장 — Project.expressDraft JSON
  await prisma.project.update({
    where: { id },
    data: { expressDraft: updatedDraft as never },
  })

  return NextResponse.json({ draft: updatedDraft })
}

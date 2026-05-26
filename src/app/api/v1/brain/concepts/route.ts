/**
 * GET /api/v1/brain/concepts — W32 (Phase E)
 *
 * Public Concept Ontology API — Brain의 Concept 목록 + 관계 조회.
 *
 * Auth: Bearer <BRAIN_PUBLIC_API_TOKEN>
 *
 * Query:
 *   ?type=methodology | metric | persona | domain | tool | partnership | framework | event-type
 *   ?limit=50 (max 200)
 *   ?withRelations=true — 각 Concept 의 ConceptRelation 포함
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireBrainApiAuth, brainApiRateLimit, getClientKey } from '@/lib/api/brain-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = requireBrainApiAuth(req)
  if (!auth.ok) return auth.response!

  const key = getClientKey(req, auth.token)
  const rl = brainApiRateLimit(key, 60, 60_000)
  if (!rl.ok) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000)
    return NextResponse.json(
      { error: 'RATE_LIMIT', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || undefined
  const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '50', 10))
  const withRelations = searchParams.get('withRelations') === 'true'

  const concepts = await prisma.concept.findMany({
    where: type ? { type } : undefined,
    orderBy: [{ assetCount: 'desc' }, { patternCount: 'desc' }],
    take: limit,
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      aliases: true,
      assetCount: true,
      patternCount: true,
      usageCount: true,
      winRate: true,
    },
  })

  let relations: { fromId: string; toId: string; strength: number; coOccurCount: number }[] = []
  if (withRelations) {
    const conceptIds = concepts.map((c) => c.id)
    relations = await prisma.conceptRelation.findMany({
      where: {
        OR: [{ fromId: { in: conceptIds } }, { toId: { in: conceptIds } }],
        strength: { gte: 0.15 },
      },
      orderBy: { strength: 'desc' },
      take: 200,
      select: {
        fromId: true,
        toId: true,
        strength: true,
        coOccurCount: true,
      },
    })
  }

  return NextResponse.json(
    {
      ok: true,
      concepts,
      ...(withRelations && { relations }),
      meta: {
        count: concepts.length,
        type: type ?? 'all',
      },
    },
    {
      headers: {
        'X-RateLimit-Remaining': String(rl.remaining),
        'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
      },
    },
  )
}

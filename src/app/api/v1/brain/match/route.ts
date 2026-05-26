/**
 * POST /api/v1/brain/match — W32 (Phase E)
 *
 * Public Brain Matching API — 외부 시스템에서 RFP 텍스트 보내면
 * Brain 4+1 영역 매칭 결과 반환.
 *
 * Auth: Bearer <BRAIN_PUBLIC_API_TOKEN>
 *
 * Request:
 *   POST /api/v1/brain/match
 *   Authorization: Bearer xxx
 *   Content-Type: application/json
 *   {
 *     "rfp": { "text": "...", "keywords"?: string[] },
 *     "channel": "B2G" | "B2B" | "renewal",
 *     "limit"?: number (default 5, max 10)
 *   }
 *
 * Response:
 *   { ok, channel, messages, contents, methodologyAssets, caseAssets,
 *     matchedConcepts, conceptAssets, meta }
 *
 * Rate limit: 60/min per (token + IP).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireBrainApiAuth, brainApiRateLimit, getClientKey } from '@/lib/api/brain-auth'
import { matchTuple } from '@/lib/inference/match-tuple'
import { ChannelSchema } from '@/lib/inference/types'
import { log } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BodySchema = z.object({
  rfp: z.object({
    text: z.string().min(200).max(200_000),
    keywords: z.array(z.string()).optional(),
    objectives: z.array(z.string()).optional(),
  }),
  channel: ChannelSchema,
  limit: z.number().int().min(1).max(10).optional(),
})

export async function POST(req: NextRequest) {
  const startedAt = Date.now()

  // 1. Auth
  const auth = requireBrainApiAuth(req)
  if (!auth.ok) return auth.response!

  // 2. Rate limit
  const key = getClientKey(req, auth.token)
  const rl = brainApiRateLimit(key, 60, 60_000)
  if (!rl.ok) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000)
    return NextResponse.json(
      { error: 'RATE_LIMIT', message: `60 req/min 초과. ${retryAfter}초 후 재시도.`, retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  // 3. Body 검증
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION',
        issues: parsed.error.issues.slice(0, 5).map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 },
    )
  }

  const input = parsed.data
  log.info('api', '[brain/match] 요청', {
    channel: input.channel,
    rfpChars: input.rfp.text.length,
    keywordsCount: input.rfp.keywords?.length ?? 0,
  })

  // 4. matchTuple
  try {
    const result = await matchTuple({
      rfp: input.rfp,
      profile: null,
      channel: input.channel,
      limit: input.limit ?? 5,
    })

    return NextResponse.json(
      {
        ok: true,
        channel: input.channel,
        messages: result.messages.map((m) => ({
          patternId: m.patternId,
          matchScore: Number(m.matchScore.toFixed(4)),
          sourceProject: m.sourceProject,
          outcome: m.outcome,
          message: m.message,
          breakdown: m.breakdown,
        })),
        contents: result.contents.map((c) => ({
          assetId: c.assetId,
          matchScore: Number(c.matchScore.toFixed(4)),
          sectionHint: c.sectionHint,
          sourceTier: c.sourceTier,
          narrativeSnippet: c.narrativeSnippet,
        })),
        methodologyAssets: result.methodologyAssets.map((c) => ({
          assetId: c.assetId,
          matchScore: Number(c.matchScore.toFixed(4)),
          sectionHint: c.sectionHint,
          sourceTier: c.sourceTier,
          narrativeSnippet: c.narrativeSnippet,
        })),
        caseAssets: result.caseAssets.map((c) => ({
          assetId: c.assetId,
          matchScore: Number(c.matchScore.toFixed(4)),
          sectionHint: c.sectionHint,
          sourceTier: c.sourceTier,
          narrativeSnippet: c.narrativeSnippet,
        })),
        matchedConcepts: result.matchedConcepts.map((c) => ({
          conceptId: c.conceptId,
          name: c.name,
          type: c.type,
          assetCount: c.assetCount,
          matchedBy: c.matchedBy,
        })),
        conceptAssets: result.conceptAssets.slice(0, 10).map((c) => ({
          assetId: c.assetId,
          assetName: c.assetName,
          assetType: c.assetType,
          matchedConcept: c.matchedConcept,
          matchScore: Number(c.matchScore.toFixed(4)),
          narrativeSnippet: c.narrativeSnippet,
        })),
        meta: {
          totalCandidates: result.totalCandidates,
          elapsedMs: Date.now() - startedAt,
        },
      },
      {
        headers: {
          'X-RateLimit-Remaining': String(rl.remaining),
          'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
        },
      },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('api', '[brain/match] 실패', { err: msg })
    return NextResponse.json(
      { error: 'MATCH_FAILED', message: msg.slice(0, 300) },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/v1/brain/match',
    auth: 'Bearer <BRAIN_PUBLIC_API_TOKEN>',
    rateLimit: '60 req/min per (token+IP)',
    body: {
      rfp: { text: 'string (200~200000 chars)', keywords: 'string[] (optional)' },
      channel: 'B2G | B2B | renewal',
      limit: 'number (1~10, default 5)',
    },
  })
}

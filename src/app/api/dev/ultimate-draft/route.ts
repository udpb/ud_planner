/**
 * /api/dev/ultimate-draft — produceUltimateDraft E2E 실행 (M4 A/B 검증용).
 *
 * dev 모드 + E2E_SECRET 헤더에서만. production 404.
 * RFP 를 body 로 받아 전체 1차본 + slideSpecs 생성 → ExpressDraft 반환.
 *
 * 사용:
 *   curl -X POST localhost:3002/api/dev/ultimate-draft \
 *     -H "x-e2e-secret: dev-e2e-secret-key" -H "Content-Type: application/json" \
 *     -d @rfp.json
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertDevAccess } from '../route'
import { produceUltimateDraft } from '@/lib/express/produce-ultimate-draft'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const guard = assertDevAccess(req)
  if (guard) return guard

  try {
    const body = await req.json()
    const rfp = body.rfp as RfpParsed
    const channel = (body.channel ?? 'B2G') as 'B2G' | 'B2B' | 'renewal'
    const slotInputs = (body.slotInputs ?? []) as Array<{ slot: string; pmInput: string }>

    if (!rfp || !rfp.projectName) {
      return NextResponse.json({ error: 'rfp.projectName required' }, { status: 400 })
    }

    const progressLog: string[] = []
    const result = await produceUltimateDraft({
      rfp,
      channel,
      slotInputs,
      pmInputs: body.pmInputs ?? null,
      onProgress: (step, detail) => {
        progressLog.push(`[${step}] ${detail}`)
      },
    })

    return NextResponse.json({
      ok: true,
      draft: result.draft,
      slideSpecCount: Array.isArray(result.draft.slideSpecs) ? result.draft.slideSpecs.length : 0,
      metrics: result.metrics,
      inspection: result.inspection
        ? { passed: result.inspection.passed, overallScore: result.inspection.overallScore }
        : null,
      verificationSummary: result.verificationSummary,
      progressLog,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack?.slice(0, 800) : undefined
    console.error('[/api/dev/ultimate-draft] error:', msg)
    return NextResponse.json({ error: msg, stack }, { status: 500 })
  }
}

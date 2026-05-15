/**
 * POST /api/admin/ingest-web — Wave N2 (2026-05-15)
 *
 * URL 받아 → 본문 추출 → Gemini 가 ContentAsset 후보 JSON 제안 → 응답.
 * **저장은 자동으로 하지 않음** — 담당자가 `/admin/content-hub/new?prefill=...`
 * 화면에서 확인 후 저장 (Wave N2 도구 정책).
 *
 * Body: { url, hint?, autoSave? }
 *   - autoSave=true 일 때만 즉시 ContentAsset.create (대량 bulk import 시나리오)
 *
 * Response:
 *   { proposal: AssetProposal, page: { title, url, truncated }, savedId?: string }
 *   또는 { skipped: true, reason: string }
 *
 * 인증: ADMIN | DIRECTOR
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  fetchPageText,
  proposeAssetFromText,
} from '@/lib/ingest/web-ingester'

const BodySchema = z.object({
  url: z.string().url(),
  hint: z.string().max(500).optional(),
  autoSave: z.boolean().optional(),
  /** autoSave=true 시 status (기본 developing — 담당자 검토 대기) */
  initialStatus: z.enum(['stable', 'developing', 'archived']).optional(),
})

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // 인증
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user || (role !== 'ADMIN' && role !== 'DIRECTOR')) {
    return NextResponse.json(
      { error: 'Forbidden — ADMIN/DIRECTOR 역할 필요' },
      { status: 403 },
    )
  }
  const userId = (session.user as { id?: string }).id

  try {
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.issues },
        { status: 400 },
      )
    }
    const { url, hint, autoSave, initialStatus } = parsed.data

    // 1) 페이지 fetch
    const page = await fetchPageText(url)
    if (!page.text || page.text.length < 100) {
      return NextResponse.json({
        skipped: true,
        reason: '본문이 너무 짧음 (< 100자)',
        page: { url: page.url, title: page.title },
      })
    }

    // 2) AI 자산 제안
    const proposal = await proposeAssetFromText(page, { hint })
    if (!proposal) {
      return NextResponse.json({
        skipped: true,
        reason: '자산화 부적절 또는 AI 응답 형식 오류',
        page: { url: page.url, title: page.title, truncated: page.truncated },
      })
    }

    // 3) autoSave 시 즉시 저장 (status=developing 권장)
    let savedId: string | undefined
    if (autoSave) {
      const status = initialStatus ?? 'developing'
      const created = await prisma.contentAsset.create({
        data: {
          name: proposal.name,
          category: proposal.category,
          applicableSections: proposal.applicableSections as unknown as object,
          valueChainStage: proposal.valueChainStage,
          evidenceType: proposal.evidenceType,
          keywords: proposal.keywords as unknown as object,
          narrativeSnippet: proposal.narrativeSnippet,
          keyNumbers: proposal.keyNumbers as unknown as object,
          status,
          version: 1,
          sourceReferences: [url] as unknown as object,
          lastReviewedAt: new Date(),
          createdById: userId,
          updatedById: userId,
        },
        select: { id: true },
      })
      savedId = created.id
    }

    return NextResponse.json({
      proposal,
      page: { url: page.url, title: page.title, truncated: page.truncated },
      savedId,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/admin/ingest-web] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

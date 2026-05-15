/**
 * POST /api/admin/embed-assets — Wave N4 (2026-05-15)
 *
 * embedding 이 없거나 다른 모델로 생성된 ContentAsset 들에 대해 임베딩
 * 일괄 생성. 100건 batch 단위 + 0.5초 slack.
 *
 * Body: { force?: boolean, limit?: number }
 *  - force=true: 모든 자산 재임베딩
 *  - limit: 처리 개수 cap (기본 200, max 1000)
 *
 * 인증: ADMIN | DIRECTOR
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  generateEmbeddings,
  buildAssetEmbeddingText,
  EMBEDDING_MODEL_LABEL,
} from '@/lib/ai/embedding'

const BodySchema = z.object({
  force: z.boolean().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
})

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user || (role !== 'ADMIN' && role !== 'DIRECTOR')) {
    return NextResponse.json(
      { error: 'Forbidden — ADMIN/DIRECTOR 역할 필요' },
      { status: 403 },
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const { force, limit = 200 } = parsed.data

    const where = force
      ? { status: { not: 'archived' as const } }
      : {
          status: { not: 'archived' as const },
          OR: [
            { embeddedAt: null },
            { embeddingModel: { not: EMBEDDING_MODEL_LABEL } },
          ],
        }

    const assets = await prisma.contentAsset.findMany({
      where,
      select: {
        id: true,
        name: true,
        narrativeSnippet: true,
        keywords: true,
        keyNumbers: true,
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    })

    if (assets.length === 0) {
      return NextResponse.json({
        ok: true,
        message: '임베딩 필요한 자산 0건',
        processed: 0,
      })
    }

    let processed = 0
    let errors = 0
    const BATCH = 50
    for (let i = 0; i < assets.length; i += BATCH) {
      const slice = assets.slice(i, i + BATCH)
      try {
        const texts = slice.map((a) =>
          buildAssetEmbeddingText({
            name: a.name,
            narrativeSnippet: a.narrativeSnippet,
            keywords: a.keywords as string[] | null,
            keyNumbers: a.keyNumbers as string[] | null,
          }),
        )
        const embeddings = await generateEmbeddings(texts)
        const now = new Date()
        await prisma.$transaction(
          slice.map((a, j) =>
            prisma.contentAsset.update({
              where: { id: a.id },
              data: {
                embedding: embeddings[j],
                embeddingModel: EMBEDDING_MODEL_LABEL,
                embeddedAt: now,
              },
            }),
          ),
        )
        processed += slice.length
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[embed-assets] batch ${i} 실패:`, msg)
        errors += slice.length
      }
      // rate limit slack
      await new Promise((r) => setTimeout(r, 500))
    }

    return NextResponse.json({
      ok: true,
      processed,
      errors,
      total: assets.length,
      model: EMBEDDING_MODEL_LABEL,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/admin/embed-assets] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

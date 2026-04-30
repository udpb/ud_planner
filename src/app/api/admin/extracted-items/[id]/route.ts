/**
 * /api/admin/extracted-items/[id]
 *
 * POST { action: 'approve' | 'reject' | 'edit', payload?, reviewNotes? }
 *
 * approve: ExtractedItem.status='approved' + ContentAsset 자동 생성
 *          (targetAsset 'winning_pattern' 등 → ContentAsset 으로 매핑)
 * reject:  status='rejected' + reviewNotes 저장
 * edit:    payload 갱신
 *
 * 인증: ADMIN | DIRECTOR
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const PostBodySchema = z.object({
  action: z.enum(['approve', 'reject', 'edit']),
  reviewNotes: z.string().max(500).optional(),
  /** edit 시 payload 갱신용 */
  payload: z
    .object({
      name: z.string().min(2).max(120).optional(),
      narrativeSnippet: z.string().min(40).max(800).optional(),
      keywords: z.array(z.string()).optional(),
      keyNumbers: z.array(z.string()).optional(),
    })
    .optional(),
})

async function ensureAdmin(): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, status: 401, error: 'Not authenticated' }
  const role = (session.user as { role?: string }).role
  if (role !== 'ADMIN' && role !== 'DIRECTOR') {
    return { ok: false, status: 403, error: 'Forbidden — ADMIN/DIRECTOR' }
  }
  const userId = (session.user as { id?: string }).id ?? session.user.email ?? 'unknown'
  return { ok: true, userId }
}

// targetAsset → ContentAsset 의 valueChainStage / category / evidenceType 매핑
const TARGET_TO_ASSET_META: Record<
  string,
  { category: string; valueChainStage: string; evidenceType: string }
> = {
  winning_pattern: {
    category: 'methodology',
    valueChainStage: 'output',
    evidenceType: 'case',
  },
  curriculum_archetype: {
    category: 'framework',
    valueChainStage: 'activity',
    evidenceType: 'methodology',
  },
  evaluator_question: {
    category: 'data',
    valueChainStage: 'output',
    evidenceType: 'structural',
  },
  strategy_note: {
    category: 'data',
    valueChainStage: 'input',
    evidenceType: 'case',
  },
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await ensureAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const { id } = await params
  try {
    const body = await req.json()
    const parsed = PostBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.issues },
        { status: 400 },
      )
    }
    const { action, reviewNotes, payload: editPayload } = parsed.data

    const item = await prisma.extractedItem.findUnique({
      where: { id },
      include: { job: true },
    })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // edit 액션
    if (action === 'edit') {
      if (!editPayload) {
        return NextResponse.json({ error: 'edit 액션은 payload 필수' }, { status: 400 })
      }
      const merged = { ...(item.payload as object), ...editPayload }
      await prisma.extractedItem.update({
        where: { id },
        data: {
          payload: merged as unknown as object,
          status: 'edited',
          reviewNotes: reviewNotes ?? null,
        },
      })
      return NextResponse.json({ ok: true, status: 'edited' })
    }

    // reject 액션
    if (action === 'reject') {
      await prisma.extractedItem.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewNotes: reviewNotes ?? null,
        },
      })
      return NextResponse.json({ ok: true, status: 'rejected' })
    }

    // approve 액션 — ContentAsset 생성
    if (action === 'approve') {
      const meta = TARGET_TO_ASSET_META[item.targetAsset]
      if (!meta) {
        return NextResponse.json(
          { error: `알 수 없는 targetAsset: ${item.targetAsset}` },
          { status: 400 },
        )
      }

      const payload = item.payload as {
        name?: string
        narrativeSnippet?: string
        keywords?: string[]
        keyNumbers?: string[]
      }
      if (!payload?.name || !payload?.narrativeSnippet) {
        return NextResponse.json({ error: 'payload.name / narrativeSnippet 누락' }, { status: 400 })
      }

      // 새 ContentAsset id — interview-{jobId 6자}-{itemId 6자}
      const newAssetId = `interview-${item.jobId.slice(0, 6)}-${item.id.slice(0, 6)}`

      const created = await prisma.contentAsset.upsert({
        where: { id: newAssetId },
        create: {
          id: newAssetId,
          name: payload.name,
          category: meta.category,
          parentId: null,
          applicableSections: ['proposal-background', 'curriculum'] as unknown as object,
          valueChainStage: meta.valueChainStage,
          evidenceType: meta.evidenceType,
          keywords: (payload.keywords ?? []) as unknown as object,
          narrativeSnippet: payload.narrativeSnippet,
          keyNumbers: (payload.keyNumbers ?? []) as unknown as object,
          status: 'developing', // 새 자산 — 검토 후 stable 승격
          version: 1,
          sourceReferences: [`interview://${item.jobId}`] as unknown as object,
          lastReviewedAt: new Date(),
        },
        update: {
          name: payload.name,
          narrativeSnippet: payload.narrativeSnippet,
          keywords: (payload.keywords ?? []) as unknown as object,
          keyNumbers: (payload.keyNumbers ?? []) as unknown as object,
          lastReviewedAt: new Date(),
        },
      })

      await prisma.extractedItem.update({
        where: { id },
        data: {
          status: 'approved',
          appliedAt: new Date(),
          appliedId: created.id,
          reviewNotes: reviewNotes ?? null,
        },
      })

      return NextResponse.json({
        ok: true,
        status: 'approved',
        createdAssetId: created.id,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/admin/extracted-items/[id]] POST error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

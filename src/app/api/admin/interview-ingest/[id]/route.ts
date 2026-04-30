/**
 * /api/admin/interview-ingest/[id]
 *
 * GET: 단일 IngestionJob + ExtractedItem 목록 조회
 * POST { action: 'process' }: AI 추출 트리거 → ExtractedItem 생성 + status='review'
 *
 * 인증: ADMIN | DIRECTOR
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractFromInterview } from '@/lib/interview-extractor/extract'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await ensureAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const { id } = await params
  try {
    const job = await prisma.ingestionJob.findUnique({
      where: { id },
      include: { extractedItems: { orderBy: { confidence: 'desc' } } },
    })
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true, job })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

const PostActionSchema = z.object({
  action: z.enum(['process']),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await ensureAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const { id } = await params
  try {
    const body = await req.json().catch(() => ({}))
    const parsed = PostActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const job = await prisma.ingestionJob.findUnique({ where: { id } })
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (job.kind !== 'strategy_interview') {
      return NextResponse.json({ error: 'Not a strategy_interview job' }, { status: 400 })
    }
    if (job.status !== 'queued' && job.status !== 'failed') {
      return NextResponse.json(
        { error: `Cannot process — current status: ${job.status}` },
        { status: 400 },
      )
    }

    const meta = job.metadata as {
      projectName?: string
      outcome?: string
      intervieweeName?: string
      client?: string | null
      domain?: string | null
      rawText?: string
    }
    const rawText = typeof meta.rawText === 'string' ? meta.rawText : ''
    if (!rawText) {
      return NextResponse.json({ error: 'metadata.rawText 가 비어있음' }, { status: 400 })
    }

    // status: queued → processing
    await prisma.ingestionJob.update({
      where: { id },
      data: { status: 'processing' },
    })

    // AI 추출
    const result = await extractFromInterview({
      rawText,
      meta: {
        projectName: meta.projectName ?? '(미상)',
        outcome: meta.outcome ?? 'won',
        intervieweeName: meta.intervieweeName ?? '(미상)',
        client: meta.client ?? null,
        domain: meta.domain ?? null,
      },
    })

    if (!result.ok || !result.result) {
      await prisma.ingestionJob.update({
        where: { id },
        data: {
          status: 'failed',
          error: result.error ?? 'extract failed',
          processedAt: new Date(),
        },
      })
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    }

    // ExtractedItem 생성 + status: processing → review
    const candidates = result.result.candidates
    await prisma.$transaction(async (tx) => {
      // 기존 pending items 삭제 (재처리 시)
      await tx.extractedItem.deleteMany({
        where: { jobId: id, status: 'pending' },
      })
      for (const c of candidates) {
        await tx.extractedItem.create({
          data: {
            jobId: id,
            targetAsset: c.targetAsset,
            payload: c.payload as unknown as object,
            confidence: c.confidence,
            status: 'pending',
          },
        })
      }
      await tx.ingestionJob.update({
        where: { id },
        data: {
          status: 'review',
          processedAt: new Date(),
          metadata: {
            ...(meta as object),
            aiSummary: result.result?.summary ?? '',
            aiRedFlags: result.result?.redFlags ?? [],
            aiProvider: result.aiProvider,
            aiModel: result.aiModel,
          } as unknown as object,
        },
      })
    })

    return NextResponse.json({
      ok: true,
      candidatesCount: candidates.length,
      summary: result.result.summary,
      redFlags: result.result.redFlags,
      aiProvider: result.aiProvider,
      aiModel: result.aiModel,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/admin/interview-ingest/[id] POST] error:', msg)
    // 실패 시 status 복원
    try {
      await prisma.ingestionJob.update({
        where: { id },
        data: { status: 'failed', error: msg.slice(0, 500), processedAt: new Date() },
      })
    } catch {
      // ignore
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

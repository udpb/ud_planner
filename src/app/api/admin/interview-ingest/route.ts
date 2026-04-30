/**
 * /api/admin/interview-ingest
 *
 * Phase I4 — 수주 후 PM 전략 인터뷰 자동 자산화 (PoC).
 * IngestionJob 모델 재활용 (kind='strategy_interview').
 *
 * POST: 인터뷰 텍스트 + 메타 → IngestionJob 생성 (status='queued')
 *       추후 처리 (AI 요약·자산 추출) 는 별도 워커 (Phase I4 후속)
 *
 * GET:  목록 조회
 *
 * 인증: ADMIN | DIRECTOR
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const PostBodySchema = z.object({
  /** 사업명 또는 프로젝트 ID */
  projectName: z.string().min(2).max(200),
  /** 수주 여부 */
  outcome: z.enum(['won', 'lost', 'cancelled']),
  /** 인터뷰 대상 PM */
  intervieweeName: z.string().min(1).max(80),
  /** 인터뷰 텍스트 (자유 형식) */
  rawText: z.string().min(50, '인터뷰 텍스트는 최소 50자'),
  /** 사업 영역 (선택) */
  domain: z.string().optional(),
  /** 발주 기관 (선택) */
  client: z.string().optional(),
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

export async function POST(req: NextRequest) {
  const guard = await ensureAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  try {
    const body = await req.json()
    const parsed = PostBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.issues },
        { status: 400 },
      )
    }
    const { projectName, outcome, intervieweeName, rawText, domain, client } = parsed.data

    const job = await prisma.ingestionJob.create({
      data: {
        kind: 'strategy_interview',
        status: 'queued',
        uploadedBy: guard.userId,
        metadata: {
          projectName,
          outcome,
          intervieweeName,
          rawText,
          domain: domain ?? null,
          client: client ?? null,
          rawTextLength: rawText.length,
        },
      },
    })

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      status: job.status,
      uploadedAt: job.uploadedAt.toISOString(),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/admin/interview-ingest] POST error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET() {
  const guard = await ensureAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  try {
    const jobs = await prisma.ingestionJob.findMany({
      where: { kind: 'strategy_interview' },
      orderBy: { uploadedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        metadata: true,
        uploadedBy: true,
        uploadedAt: true,
        processedAt: true,
        approvedAt: true,
        error: true,
      },
    })

    return NextResponse.json({ ok: true, jobs })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/admin/interview-ingest] GET error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * PATCH /api/ingest/jobs/[id]/review — ExtractedItem 승인/편집/거부
 *
 * Phase D1: Admin 이 검토 후 액션 수행.
 * - approve: WinningPattern INSERT + ExtractedItem.status = "approved"
 * - edit:    payload 편집 → WinningPattern INSERT + status = "edited"
 * - reject:  status = "rejected" + reviewNotes
 *
 * 자동 승인 절대 금지 (ADR-003).
 *
 * 관련 문서: docs/architecture/ingestion.md §4
 */

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type ReviewAction = 'approve' | 'edit' | 'reject'

interface ReviewRequestBody {
  extractedItemId: string
  action: ReviewAction
  /** edit 시 수정된 payload */
  payload?: {
    snippet?: string
    whyItWorks?: string
    tags?: string[]
    sectionKey?: string
  }
  /** reject 시 사유 또는 edit 시 메모 */
  notes?: string
}

function isValidAction(value: unknown): value is ReviewAction {
  return typeof value === 'string' && ['approve', 'edit', 'reject'].includes(value)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 인증 체크
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { id: jobId } = await params

    // body 파싱
    const body: unknown = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const {
      extractedItemId,
      action,
      payload: editedPayload,
      notes,
    } = body as ReviewRequestBody

    if (!extractedItemId || typeof extractedItemId !== 'string') {
      return NextResponse.json({ error: 'extractedItemId 가 필요합니다.' }, { status: 400 })
    }
    if (!isValidAction(action)) {
      return NextResponse.json(
        { error: 'action 은 approve / edit / reject 중 하나여야 합니다.' },
        { status: 400 },
      )
    }

    // ExtractedItem 조회 + job 검증
    const item = await prisma.extractedItem.findUnique({
      where: { id: extractedItemId },
      include: { job: true },
    })
    if (!item) {
      return NextResponse.json({ error: 'ExtractedItem 을 찾을 수 없습니다.' }, { status: 404 })
    }
    if (item.jobId !== jobId) {
      return NextResponse.json(
        { error: 'ExtractedItem 이 이 IngestionJob 에 속하지 않습니다.' },
        { status: 400 },
      )
    }
    if (item.status !== 'pending') {
      return NextResponse.json(
        { error: `이미 처리된 항목입니다. (status: ${item.status})` },
        { status: 409 },
      )
    }

    const payload = item.payload as Record<string, unknown>

    // ── reject ──
    if (action === 'reject') {
      await prisma.extractedItem.update({
        where: { id: extractedItemId },
        data: {
          status: 'rejected',
          reviewNotes: typeof notes === 'string' ? notes : null,
          appliedAt: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        action: 'rejected',
        extractedItemId,
      })
    }

    // ── approve / edit ──
    // 편집된 payload 적용 (edit 시)
    const finalPayload = action === 'edit' && editedPayload
      ? { ...payload, ...editedPayload }
      : payload

    const sectionKey = String(finalPayload['sectionKey'] ?? 'other')
    const snippet = String(finalPayload['snippet'] ?? '')
    const whyItWorks = String(finalPayload['whyItWorks'] ?? '')
    const tags = Array.isArray(finalPayload['tags'])
      ? (finalPayload['tags'] as unknown[]).map(String)
      : []
    const sourceProject = String(finalPayload['sourceProject'] ?? '')
    const sourceClient = finalPayload['sourceClient']
      ? String(finalPayload['sourceClient'])
      : null
    const outcome = String(finalPayload['outcome'] ?? 'pending')
    const techEvalScore = typeof finalPayload['techEvalScore'] === 'number'
      ? finalPayload['techEvalScore']
      : null

    // WinningPattern 생성
    const winningPattern = await prisma.winningPattern.create({
      data: {
        sourceProject,
        sourceClient,
        ingestionJobId: jobId,
        extractedItemId,
        sectionKey,
        channelType: null, // 추후 ChannelPreset 연결 시 보강
        outcome,
        techEvalScore,
        snippet,
        whyItWorks,
        tags,
        approvedBy: session.user.id,
      },
    })

    // ExtractedItem 상태 업데이트
    await prisma.extractedItem.update({
      where: { id: extractedItemId },
      data: {
        status: action === 'edit' ? 'edited' : 'approved',
        payload: action === 'edit' ? (finalPayload as unknown as Prisma.InputJsonValue) : undefined,
        reviewNotes: typeof notes === 'string' ? notes : null,
        appliedAt: new Date(),
        appliedId: winningPattern.id,
        appliedWinningPatternId: winningPattern.id,
      },
    })

    // job 의 모든 ExtractedItem 이 처리됐으면 job status 업데이트
    const pendingCount = await prisma.extractedItem.count({
      where: { jobId, status: 'pending' },
    })
    if (pendingCount === 0) {
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: session.user.id,
        },
      })
    }

    return NextResponse.json({
      success: true,
      action: action === 'edit' ? 'edited' : 'approved',
      extractedItemId,
      winningPatternId: winningPattern.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '검토 처리 실패'
    console.error('Ingestion review 에러:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

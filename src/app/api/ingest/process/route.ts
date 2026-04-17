/**
 * POST /api/ingest/process — IngestionJob 처리 트리거
 *
 * Phase D1: 특정 jobId 의 proposal-ingest 워커를 동기로 실행합니다.
 * 인증 필수. Admin/PM 역할 권장 (현재는 로그인 유저면 실행 가능).
 *
 * 서버리스 제약 고려:
 * - Vercel 의 경우 10초 제한 → 큰 PDF 는 타임아웃 가능.
 * - TODO: 비동기 큐 (Inngest/BullMQ) 전환 예정 (Phase F).
 * - 현재는 동기 호출로 구현, 50p PDF 기준 30~60초 소요 예상.
 *
 * 관련 문서: docs/architecture/ingestion.md, ADR-003
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { processIngestionJob } from '@/lib/ingestion/workers/proposal-ingest'

interface ProcessRequestBody {
  jobId: string
}

export async function POST(req: NextRequest) {
  try {
    // 인증 체크
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    // body 파싱
    const body: unknown = await req.json()
    if (!body || typeof body !== 'object' || !('jobId' in body)) {
      return NextResponse.json(
        { error: 'jobId 가 필요합니다. 예: { "jobId": "cuid..." }' },
        { status: 400 },
      )
    }

    const { jobId } = body as ProcessRequestBody
    if (typeof jobId !== 'string' || !jobId.trim()) {
      return NextResponse.json(
        { error: 'jobId 는 비어있지 않은 문자열이어야 합니다.' },
        { status: 400 },
      )
    }

    // 워커 실행 (동기)
    // TODO: Vercel 10s 제한 대응 — 큰 PDF 는 섹션별 분할 호출 또는 비동기 큐로 전환 필요
    const result = await processIngestionJob(jobId.trim())

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      sectionsProcessed: result.sectionsProcessed,
      extractedItemIds: result.extractedItemIds,
      durationMs: result.durationMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '처리 실패'
    console.error('Ingestion process 에러:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

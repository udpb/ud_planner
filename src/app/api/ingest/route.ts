/**
 * POST /api/ingest — 자료 업로드 (Phase A: 파일 저장 + 레코드 생성만)
 * GET  /api/ingest — 최근 IngestionJob 목록 (기본 10건)
 *
 * Phase A 제약:
 * - AI 호출 / 파일 파싱 / 추출 로직 없음
 * - status 는 "queued" 로 고정
 * - 실제 처리는 Phase D 워커에서
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { saveIngestionFile } from '@/lib/ingestion/save-file'
import {
  INGESTION_KINDS,
  type IngestionJobSummary,
  type IngestionKind,
  type IngestionStatus,
} from '@/lib/ingestion/types'

function isIngestionKind(value: unknown): value is IngestionKind {
  return typeof value === 'string' && (INGESTION_KINDS as readonly string[]).includes(value)
}

function safeParseMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'multipart/form-data 형식으로 전송하세요.' },
        { status: 400 },
      )
    }

    const formData = await req.formData()
    const kindRaw = formData.get('kind')
    if (!isIngestionKind(kindRaw)) {
      return NextResponse.json(
        { error: `kind 는 다음 중 하나여야 합니다: ${INGESTION_KINDS.join(', ')}` },
        { status: 400 },
      )
    }
    const kind: IngestionKind = kindRaw

    const file = formData.get('file')
    const sourceUrlRaw = formData.get('sourceUrl')
    const sourceUrl =
      typeof sourceUrlRaw === 'string' && sourceUrlRaw.trim() ? sourceUrlRaw.trim() : null

    const hasFile = file instanceof File && file.size > 0
    if (!hasFile && !sourceUrl) {
      return NextResponse.json(
        { error: '파일 또는 sourceUrl 중 최소 하나는 필요합니다.' },
        { status: 400 },
      )
    }

    const metadata = safeParseMetadata(formData.get('metadata'))

    // 1) IngestionJob 레코드 먼저 생성 (id 확보)
    const job = await prisma.ingestionJob.create({
      data: {
        kind,
        sourceUrl,
        // Prisma 의 InputJsonValue 와 Record<string, unknown> 호환을 위해 캐스트
        // (프로젝트 내 다른 Json 필드도 동일 패턴 사용 — src/lib/planning-agent/state.ts)
        metadata: metadata as any,
        status: 'queued' satisfies IngestionStatus,
        uploadedBy: session.user.id,
      },
    })

    // 2) 파일이 있으면 storage 에 저장 후 sourceFile 업데이트
    let sourceFile: string | null = null
    if (hasFile) {
      try {
        const saved = await saveIngestionFile(job.id, file as File)
        sourceFile = saved.storagePath
        await prisma.ingestionJob.update({
          where: { id: job.id },
          data: { sourceFile },
        })
      } catch (err) {
        // 파일 저장 실패 시 job 상태를 failed 로
        const message = err instanceof Error ? err.message : '파일 저장 실패'
        await prisma.ingestionJob.update({
          where: { id: job.id },
          data: { status: 'failed', error: message },
        })
        return NextResponse.json(
          { error: `파일 저장 실패: ${message}` },
          { status: 500 },
        )
      }
    }

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        uploadedAt: job.uploadedAt.toISOString(),
        sourceFile,
      },
      { status: 201 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    console.error('Ingestion 업로드 에러:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 50)
    const kindFilterRaw = searchParams.get('kind')
    const kindFilter = isIngestionKind(kindFilterRaw) ? kindFilterRaw : undefined

    const jobs = await prisma.ingestionJob.findMany({
      where: kindFilter ? { kind: kindFilter } : undefined,
      orderBy: { uploadedAt: 'desc' },
      take: limit,
    })

    const summaries: IngestionJobSummary[] = jobs.map((j) => ({
      id: j.id,
      kind: j.kind as IngestionKind,
      status: j.status as IngestionStatus,
      metadata: (j.metadata ?? {}) as Record<string, unknown>,
      sourceFile: j.sourceFile,
      sourceUrl: j.sourceUrl,
      uploadedAt: j.uploadedAt.toISOString(),
      uploadedBy: j.uploadedBy,
    }))

    return NextResponse.json({ jobs: summaries })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    console.error('Ingestion 조회 에러:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

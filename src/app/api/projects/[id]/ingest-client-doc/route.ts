/**
 * POST /api/projects/[id]/ingest-client-doc
 *
 * 발주처 공식 문서 (PDF 또는 텍스트) 업로드 → AI 가 키워드·정책·실적 자동 추출
 * → Project.strategicNotes.clientOfficialDoc 에 저장 (Phase M3-2, ADR-013).
 *
 * Body 형식:
 *   multipart/form-data:
 *     - file: PDF 파일 (필수)
 *     - sourceLabel?: string — 출처 표기 ("연세대 중장기 계획서" 등)
 *   application/json:
 *     - text: 본문 텍스트 (PDF 없이 직접 붙여넣기 케이스)
 *     - sourceLabel?: string
 *
 * Response: { extraction: ClientDocExtraction, savedTo: 'strategicNotes.clientOfficialDoc' }
 *
 * 후속 사용:
 *   - Express turn AI 가 formatStrategicNotes() 로 자동 주입 → keyMessages·sections 생성에 반영
 *   - Deep Track Step 1 가이드 (PMGuidePanel) 가 동일하게 활용
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/logger'
import { extractClientDoc } from '@/lib/ai/client-doc-extractor'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { extractText } = await import('unpdf')
  const result = await extractText(new Uint8Array(buffer))
  return (result.text ?? []).join('\n\n')
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  const project = await prisma.project.findUnique({
    where: { id },
    select: { client: true, strategicNotes: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  let text = ''
  let sourceLabel = ''
  try {
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      sourceLabel = (formData.get('sourceLabel') as string) ?? ''
      if (file) {
        const buffer = Buffer.from(await file.arrayBuffer())
        text = await extractTextFromPdf(buffer)
        if (!sourceLabel) sourceLabel = file.name
      }
    } else {
      const body = (await req.json()) as { text?: string; sourceLabel?: string }
      text = body.text ?? ''
      sourceLabel = body.sourceLabel ?? ''
    }
  } catch (err) {
    log.error('ingest-client-doc', err, { stage: 'parse-body' })
    return NextResponse.json({ error: 'body 파싱 실패' }, { status: 400 })
  }

  if (!text || text.trim().length < 100) {
    return NextResponse.json(
      { error: '본문이 너무 짧습니다 (100자 이상 필요)' },
      { status: 400 },
    )
  }

  // AI 추출
  let extraction
  try {
    extraction = await extractClientDoc({ clientName: project.client, text })
  } catch (err) {
    log.error('ingest-client-doc', err, { projectId: id, stage: 'ai-extract' })
    return NextResponse.json(
      { error: 'AI 추출 실패: ' + (err instanceof Error ? err.message : '알 수 없음') },
      { status: 502 },
    )
  }

  // strategicNotes.clientOfficialDoc 머지
  const prevNotes = (project.strategicNotes as unknown as StrategicNotes | null) ?? {}
  const nextNotes: StrategicNotes = {
    ...prevNotes,
    clientOfficialDoc: {
      keywords: extraction.keywords,
      policies: extraction.policies,
      track: extraction.track,
      sourceLabel: sourceLabel || prevNotes.clientOfficialDoc?.sourceLabel,
      extractedAt: new Date().toISOString(),
    },
  }

  await prisma.project.update({
    where: { id },
    data: { strategicNotes: nextNotes as unknown as object },
  })

  log.info('ingest-client-doc', '발주처 공식 문서 추출 완료', {
    projectId: id,
    sourceLabel,
    keywords: extraction.keywords.length,
    policies: extraction.policies.length,
    track: extraction.track.length,
  })

  return NextResponse.json({
    extraction,
    savedTo: 'strategicNotes.clientOfficialDoc',
  })
}

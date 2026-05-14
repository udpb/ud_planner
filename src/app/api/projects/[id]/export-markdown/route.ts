/**
 * GET /api/projects/[id]/export-markdown
 *
 * Express 1차본 → 깔끔한 `.md` 파일 다운로드 (Phase M3-1a, ADR-013).
 *
 * 응답:
 *   - Content-Type: text/markdown; charset=utf-8
 *   - Content-Disposition: attachment; filename="<safeName>_1차본.md"
 *
 * 후속 (M3-1b):
 *   - PPT (pptxgenjs) — AI 동적 슬라이드 분할 + UD 브랜드 디자인
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ExpressDraftSchema } from '@/lib/express/schema'
import { renderExpressMarkdown } from '@/lib/express/render-markdown'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      name: true,
      client: true,
      totalBudgetVat: true,
      supplyPrice: true,
      eduStartDate: true,
      eduEndDate: true,
      expressDraft: true,
      strategicNotes: true,
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Draft 파싱
  const parsed = ExpressDraftSchema.safeParse(project.expressDraft)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Express draft 가 비어있거나 손상됨' },
      { status: 400 },
    )
  }

  const notes = project.strategicNotes as unknown as StrategicNotes | null

  const markdown = renderExpressMarkdown({
    project: {
      name: project.name,
      client: project.client,
      totalBudgetVat: project.totalBudgetVat,
      supplyPrice: project.supplyPrice,
      eduStartDate: project.eduStartDate,
      eduEndDate: project.eduEndDate,
    },
    draft: parsed.data,
    clientOfficialDoc: notes?.clientOfficialDoc,
  })

  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
  const filename = `${safeName}_1차본.md`

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })
}

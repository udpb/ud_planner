/**
 * GET /api/express/export-pptx?projectId=... — M3 (2026-05-31)
 *
 * Project.expressDraft → PowerPoint(.pptx) 파일 다운로드.
 * PM 이 받아서 직접 편집 가능한 시작점 (화면 미리보기의 .pptx 버전).
 *
 * 동작:
 *   - 권한 확인 (requireProjectAccess)
 *   - expressDraft 로드 → buildPptx → .pptx 바이너리 응답
 *   - Content-Disposition: attachment; filename="<projectName>.pptx"
 *
 * 관련: src/lib/diagrams/pptx-builder.ts · docs/journey/2026-05-31-*-MASTER.md (M3)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { ExpressDraftSchema } from '@/lib/express/schema'
import { buildPptx } from '@/lib/diagrams/pptx-builder'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const access = await requireProjectAccess(projectId)
    if (!access.ok) return access.response!

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, client: true, expressDraft: true },
    })
    if (!project?.expressDraft) {
      return NextResponse.json(
        { error: 'expressDraft 없음 — Express 1차본 작성 후 다시 시도' },
        { status: 400 },
      )
    }

    const parsed = ExpressDraftSchema.safeParse(project.expressDraft)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'expressDraft invalid', issues: parsed.error.issues.slice(0, 5) },
        { status: 500 },
      )
    }
    const draft = parsed.data

    const buf = await buildPptx({
      projectName: project.name,
      clientName: project.client,
      intent: draft.intent,
      sections: draft.sections as Record<string, string> | undefined,
      slideSpecs: Array.isArray(draft.slideSpecs)
        ? (draft.slideSpecs as unknown as Parameters<typeof buildPptx>[0]['slideSpecs'])
        : undefined,
    })

    // 파일명 — 한글/특수문자 안전 처리 (RFC 5987)
    const safeName = (project.name ?? 'proposal').replace(/[^\w가-힣\-]+/g, '_').slice(0, 80)
    const encoded = encodeURIComponent(`${safeName}.pptx`)

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="proposal.pptx"; filename*=UTF-8''${encoded}`,
        'Content-Length': String(buf.length),
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/express/export-pptx] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const { items } = await req.json() as { items: Array<{ id: string; order: number; sessionNo: number }> }

    await prisma.$transaction(
      items.map((item) =>
        prisma.curriculumItem.update({
          where: { id: item.id },
          data: { order: item.order, sessionNo: item.sessionNo },
        })
      )
    )

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

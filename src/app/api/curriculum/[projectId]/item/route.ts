import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    await params // projectId not needed here — item id is unique
    const { id, ...data } = await req.json()

    const allowed = ['isLocked', 'lectureMinutes', 'practiceMinutes', 'date', 'venue', 'isOnline', 'notes', 'title']
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([key]) => allowed.includes(key))
    )

    const item = await prisma.curriculumItem.update({ where: { id }, data: updateData })
    return NextResponse.json({ ok: true, item })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

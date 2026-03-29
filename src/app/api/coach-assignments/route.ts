import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const Schema = z.object({
  projectId: z.string(),
  coachId: z.string(),
  role: z.enum(['MAIN_COACH', 'SUB_COACH', 'LECTURER', 'SUB_LECTURER', 'SPECIAL_LECTURER', 'JUDGE', 'PM_OPS']),
  sessions: z.number().int().positive().default(1),
  hoursPerSession: z.number().positive().default(5),
  totalHours: z.number().positive().optional(),
  agreedRate: z.number().positive().optional(),
  totalFee: z.number().positive().optional(),
  taxRate: z.number().optional(),
  netFee: z.number().optional(),
  notes: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = Schema.parse(await req.json())

    const assignment = await prisma.coachAssignment.upsert({
      where: {
        projectId_coachId_role: {
          projectId: body.projectId,
          coachId: body.coachId,
          role: body.role,
        },
      },
      update: body,
      create: body,
    })

    return NextResponse.json(assignment, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.coachAssignment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

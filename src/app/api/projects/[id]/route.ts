import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  client: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'PROPOSAL', 'SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'LOST']).optional(),
  projectType: z.enum(['B2G', 'B2B']).optional(),
  totalBudgetVat: z.number().positive().nullable().optional(),
  supplyPrice: z.number().positive().nullable().optional(),
  eduStartDate: z.string().nullable().optional(),
  eduEndDate: z.string().nullable().optional(),
  projectStartDate: z.string().nullable().optional(),
  projectEndDate: z.string().nullable().optional(),
  pmId: z.string().nullable().optional(),
  impactGoal: z.string().nullable().optional(),
  logicModel: z.any().optional(),
  rfpRaw: z.string().nullable().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pm: { select: { id: true, name: true, email: true } },
      budget: { include: { items: { orderBy: { wbsCode: 'asc' } } } },
      coachAssignments: {
        include: {
          coach: { select: { id: true, name: true, tier: true, organization: true, lectureRateMain: true } },
        },
      },
      curriculum: { orderBy: { order: 'asc' } },
      tasks: { orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }] },
      participants: { orderBy: { createdAt: 'asc' } },
      proposalSections: { orderBy: { sectionNo: 'asc' } },
      _count: { select: { participants: true } },
    },
  })

  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json(project)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const parsed = UpdateProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { eduStartDate, eduEndDate, projectStartDate, projectEndDate, ...rest } = parsed.data

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...rest,
      ...(eduStartDate !== undefined && { eduStartDate: eduStartDate ? new Date(eduStartDate) : null }),
      ...(eduEndDate !== undefined && { eduEndDate: eduEndDate ? new Date(eduEndDate) : null }),
      ...(projectStartDate !== undefined && { projectStartDate: projectStartDate ? new Date(projectStartDate) : null }),
      ...(projectEndDate !== undefined && { projectEndDate: projectEndDate ? new Date(projectEndDate) : null }),
    },
  })

  return NextResponse.json(project)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  await prisma.project.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

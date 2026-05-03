import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Phase Bridge 1: Supabase mirror is now centralized in the Prisma client
// extension (see src/lib/prisma.ts) — fires automatically on every project
// create/update regardless of which API route triggered it. No per-route
// hook needed here.

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  client: z.string().min(1),
  projectType: z.enum(['B2G', 'B2B']).default('B2G'),
  totalBudgetVat: z.number().positive().optional(),
  supplyPrice: z.number().positive().optional(),
  eduStartDate: z.string().optional(),
  eduEndDate: z.string().optional(),
  projectStartDate: z.string().optional(),
  projectEndDate: z.string().optional(),
  pmId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const q = searchParams.get('q')

  const where: any = {}
  if (status) where.status = status
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { client: { contains: q, mode: 'insensitive' } },
    ]
  }

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      name: true,
      client: true,
      status: true,
      projectType: true,
      totalBudgetVat: true,
      eduStartDate: true,
      eduEndDate: true,
      updatedAt: true,
      pm: { select: { name: true } },
      _count: { select: { coachAssignments: true, participants: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const parsed = CreateProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { eduStartDate, eduEndDate, projectStartDate, projectEndDate, ...rest } = parsed.data

  const project = await prisma.project.create({
    data: {
      ...rest,
      eduStartDate: eduStartDate ? new Date(eduStartDate) : undefined,
      eduEndDate: eduEndDate ? new Date(eduEndDate) : undefined,
      projectStartDate: projectStartDate ? new Date(projectStartDate) : undefined,
      projectEndDate: projectEndDate ? new Date(projectEndDate) : undefined,
    },
  })
  // Supabase mirror fires automatically inside prisma extension.

  return NextResponse.json(project, { status: 201 })
}

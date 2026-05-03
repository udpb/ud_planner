import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { syncProjectToSupabase } from '@/lib/supabase-sync'

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

  // Phase Bridge 1: mirror to Supabase business_plans (best-effort).
  // Failure here MUST NOT break the response; the user's project is saved
  // either way. See src/lib/supabase-sync.ts and INTEGRATED_ARCHITECTURE.md.
  void syncProjectToSupabase(project).then((res) => {
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[POST /api/projects] supabase mirror skipped', {
        projectId: project.id,
        reason: res.reason,
      })
    }
  })

  return NextResponse.json(project, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const ModuleSchema = z.object({
  moduleCode: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['TECH_EDU', 'STARTUP_EDU', 'CAPSTONE', 'MENTORING', 'NETWORKING', 'EVENT', 'ACTION_WEEK', 'SPECIAL_LECTURE']),
  method: z.enum(['LECTURE', 'WORKSHOP', 'PRACTICE', 'MENTORING', 'MIXED', 'ACTION_WEEK', 'ONLINE']),
  durationHours: z.number().positive(),
  difficulty: z.enum(['INTRO', 'MID', 'ADVANCED']).default('INTRO'),
  keywordTags: z.array(z.string()).default([]),
  objectives: z.array(z.string()).default([]),
  contents: z.array(z.string()).default([]),
  practices: z.array(z.string()).default([]),
  equipment: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  targetStages: z.array(z.string()).default([]),
  targetPresets: z.array(z.string()).default([]),
  impactQ54Mapping: z.array(z.string()).default([]),
  skills5D: z.array(z.string()).default([]),
  acttTargets: z.array(z.string()).default([]),
  aiRatio: z.number().min(0).max(100).default(0),
  expertRatio: z.number().min(0).max(100).default(100),
  prerequisites: z.array(z.string()).default([]),
  outcomeTypes: z.array(z.string()).default([]),
  isTheory: z.boolean().default(false),
  minParticipants: z.number().int().positive().default(5),
  maxParticipants: z.number().int().positive().default(50),
})

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const category = searchParams.get('category')

  const where: any = { isActive: true }
  if (category) where.category = category
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { moduleCode: { contains: q, mode: 'insensitive' } },
    ]
  }

  const modules = await prisma.module.findMany({ where, orderBy: { moduleCode: 'asc' } })
  return NextResponse.json({ modules })
}

export async function POST(req: NextRequest) {
  try {
    const body = ModuleSchema.parse(await req.json())
    const module = await prisma.module.upsert({
      where: { moduleCode: body.moduleCode },
      update: body,
      create: body,
    })
    return NextResponse.json(module, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.module.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ ok: true })
}

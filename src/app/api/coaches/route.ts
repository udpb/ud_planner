import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const expertise = searchParams.get('expertise')
  const region = searchParams.get('region')
  const tier = searchParams.get('tier')
  const category = searchParams.get('category')
  const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 100)
  const offset = Number(searchParams.get('offset') ?? '0')

  const where: any = { isActive: true }

  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { organization: { contains: q, mode: 'insensitive' } },
      { intro: { contains: q, mode: 'insensitive' } },
      { expertise: { has: q } },
    ]
  }
  if (expertise) {
    const tags = expertise.split(',').filter(Boolean)
    if (tags.length) where.expertise = { hasSome: tags }
  }
  if (region) where.regions = { has: region }
  if (tier) where.tier = tier
  if (category) where.category = category

  const [coaches, total] = await Promise.all([
    prisma.coach.findMany({
      where,
      select: {
        id: true,
        githubId: true,
        name: true,
        organization: true,
        position: true,
        tier: true,
        category: true,
        expertise: true,
        regions: true,
        roles: true,
        photoUrl: true,
        careerYears: true,
        satisfactionAvg: true,
        collaborationCount: true,
        intro: true,
        lectureRateMain: true,
        coachRateMain: true,
        specialLectureRate: true,
        country: true,
        language: true,
        overseas: true,
        industries: true,
      },
      orderBy: [
        { tier: 'asc' },
        { collaborationCount: 'desc' },
        { satisfactionAvg: 'desc' },
      ],
      take: limit,
      skip: offset,
    }),
    prisma.coach.count({ where }),
  ])

  return NextResponse.json({ coaches, total, limit, offset })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CoachCategory, CoachTier, TaxType } from '@prisma/client'

function toArray(val: any): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string') return val.split(/[,，;|]/).map((s) => s.trim()).filter(Boolean)
  return [String(val)]
}

function mapCoach(raw: any) {
  const cat = (raw.category ?? raw.coach_category ?? '').toLowerCase()
  let category: CoachCategory = 'COACH'
  if (cat.includes('파트너') || cat.includes('partner')) category = 'PARTNER_COACH'
  else if (cat.includes('글로벌') || cat.includes('global')) category = 'GLOBAL_COACH'
  else if (cat.includes('컨설턴트') || cat.includes('consultant')) category = 'CONSULTANT'
  else if (cat.includes('투자') || cat.includes('investor')) category = 'INVESTOR'

  const collab = Number(raw.underdogs_collab_count ?? raw.collab_count ?? 0)
  const sat = Number(raw.satisfaction_avg ?? raw.satisfaction ?? 0)
  let tier: CoachTier = 'TIER2'
  if (collab >= 3 && sat >= 4.5) tier = 'TIER1'
  else if (raw.overseas || raw.is_global) tier = 'TIER3'

  return {
    githubId: raw.id ? Number(raw.id) : undefined,
    name: raw.name ?? '',
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    gender: raw.gender ?? null,
    location: raw.location ?? null,
    regions: toArray(raw.regions ?? raw.region),
    organization: raw.organization ?? raw.company ?? null,
    position: raw.position ?? raw.title ?? null,
    industries: toArray(raw.industries ?? raw.industry),
    expertise: toArray(raw.expertise ?? raw.expert_tags ?? raw.tags),
    roles: toArray(raw.roles ?? raw.role),
    overseas: Boolean(raw.overseas ?? raw.is_global),
    overseasDetail: raw.overseas_detail ?? null,
    toolsSkills: raw.tools_skills ?? raw.skills ?? null,
    intro: raw.intro ?? raw.introduction ?? null,
    careerHistory: raw.career_history ?? raw.career ?? null,
    education: raw.education ?? null,
    underdogsHistory: raw.underdogs_history ?? null,
    currentWork: raw.current_work ?? null,
    careerYears: raw.career_years ? Number(raw.career_years) : null,
    careerYearsRaw: raw.career_years_raw ?? String(raw.career_years ?? ''),
    photoUrl: raw.photo_url ?? raw.photo ?? null,
    businessType: raw.business_type ?? null,
    country: raw.country ?? '한국',
    language: toArray(raw.language ?? raw.languages ?? ['한국어']),
    hasStartup: Boolean(raw.has_startup ?? raw.startup),
    isActive: raw.is_active !== false,
    mainField: raw.main_field ?? null,
    category,
    tier,
    satisfactionAvg: sat || null,
    collaborationCount: collab,
    onlineAvailable: raw.online_available !== false,
    minLeadTimeDays: Number(raw.min_lead_time_days ?? 7),
    availableDays: toArray(raw.available_days),
    taxType: 'BUSINESS' as TaxType,
  }
}

export async function POST() {
  const repo = process.env.GITHUB_COACHES_REPO ?? 'underdogs-org/coaches-db'
  const branch = process.env.GITHUB_COACHES_BRANCH ?? 'main'
  const file = process.env.GITHUB_COACHES_FILE ?? 'coaches_db.json'
  const token = process.env.GITHUB_TOKEN

  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${file}`
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let rawCoaches: any[]
  try {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      return NextResponse.json({ error: `GitHub fetch 실패: ${res.status}` }, { status: 502 })
    }
    rawCoaches = await res.json()
  } catch {
    return NextResponse.json({ error: 'GitHub에 연결할 수 없습니다.' }, { status: 502 })
  }

  let upserted = 0
  let skipped = 0

  for (const raw of rawCoaches) {
    const data = mapCoach(raw)
    if (!data.name) { skipped++; continue }

    try {
      if (data.githubId) {
        await prisma.coach.upsert({
          where: { githubId: data.githubId },
          update: data,
          create: data,
        })
      } else {
        const existing = await prisma.coach.findFirst({
          where: { name: data.name, email: data.email ?? undefined },
        })
        if (existing) {
          await prisma.coach.update({ where: { id: existing.id }, data })
        } else {
          await prisma.coach.create({ data })
        }
      }
      upserted++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ ok: true, upserted, skipped })
}

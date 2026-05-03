/**
 * 코치 DB 동기화 스크립트 (Phase 4-coach-integration, 2026-05-03)
 *
 * Source-of-truth: Supabase `public.coaches_directory`
 *   - coach-finder 가 직접 update 하는 단일 source.
 *   - ud-ops 는 service-role 키로 read-only 동기화.
 *
 * Fallback: GitHub raw JSON (`underdogs-org/coaches-db`)
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE 미설정 시.
 *
 * 실행:
 *   npm run sync:coaches
 *   (또는) npx tsx scripts/sync-coaches.ts
 *
 * 환경변수 (둘 중 한 쌍이라도 있어야 함):
 *   - Primary:  SUPABASE_URL + SUPABASE_SERVICE_ROLE
 *   - Fallback: GITHUB_TOKEN + GITHUB_COACHES_REPO + GITHUB_COACHES_FILE
 */

import 'dotenv/config'
import { PrismaClient, CoachCategory, CoachTier, TaxType } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createClient } from '@supabase/supabase-js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ─────────────────────────────────────────
// 1. Source: Supabase 우선 / GitHub fallback
// ─────────────────────────────────────────

interface RawCoach {
  // Supabase coaches_directory 또는 GitHub coaches_db.json 어떤 형태든 받을 수 있게
  [key: string]: unknown
}

async function fetchFromSupabase(): Promise<RawCoach[]> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return []

  console.log(`📡 Supabase coaches_directory fetch (${url})`)
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase
    .from('coaches_directory')
    .select(
      'id,external_id,name,email,phone,gender,location,country,regions,organization,position,industries,expertise,roles,language,overseas,overseas_detail,intro,career_history,education,underdogs_history,current_work,tools_skills,career_years,career_years_raw,photo_url,photo_filename,tier,category,business_type,status',
    )
    .eq('status', 'active')
    .order('name', { ascending: true })

  if (error) throw new Error(`Supabase fetch 실패: ${error.message}`)
  return (data ?? []) as RawCoach[]
}

async function fetchFromGitHub(): Promise<RawCoach[]> {
  const repo = process.env.GITHUB_COACHES_REPO ?? 'underdogs-org/coaches-db'
  const branch = process.env.GITHUB_COACHES_BRANCH ?? 'main'
  const file = process.env.GITHUB_COACHES_FILE ?? 'coaches_db.json'
  const token = process.env.GITHUB_TOKEN

  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${file}`
  console.log(`📡 GitHub fallback fetch (${url})`)

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`GitHub fetch 실패: ${res.status} ${url}`)
  return (await res.json()) as RawCoach[]
}

async function fetchCoaches(): Promise<{ rows: RawCoach[]; source: 'supabase' | 'github' }> {
  // Supabase 우선
  if (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) {
    try {
      const rows = await fetchFromSupabase()
      if (rows.length > 0) return { rows, source: 'supabase' }
      console.warn('⚠️  Supabase 응답 0건 — GitHub fallback 시도')
    } catch (e) {
      console.warn(`⚠️  Supabase fetch 실패: ${(e as Error).message} — GitHub fallback`)
    }
  }
  const rows = await fetchFromGitHub()
  return { rows, source: 'github' }
}

// ─────────────────────────────────────────
// 2. raw → Prisma upsert 데이터 매퍼 (양쪽 source 호환)
// ─────────────────────────────────────────

function toArray(val: unknown): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string') return val.split(/[,，;|]/).map((s) => s.trim()).filter(Boolean)
  return [String(val)]
}

function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim().length > 0) return v
    if (typeof v === 'number') return String(v)
  }
  return null
}

function pickNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && !Number.isNaN(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  }
  return null
}

function mapCoach(raw: RawCoach) {
  // category: Supabase string OR GitHub category 한글 키워드
  const catRaw = String(raw.category ?? raw.coach_category ?? '').toLowerCase()
  let category: CoachCategory = 'COACH'
  if (catRaw.includes('파트너') || catRaw.includes('partner')) category = 'PARTNER_COACH'
  else if (catRaw.includes('글로벌') || catRaw.includes('global')) category = 'GLOBAL_COACH'
  else if (catRaw.includes('컨설턴트') || catRaw.includes('consultant')) category = 'CONSULTANT'
  else if (catRaw.includes('투자') || catRaw.includes('investor')) category = 'INVESTOR'

  // tier: Supabase text "1"/"2"/"3"/"S"/"A" OR GitHub computed
  let tier: CoachTier = 'TIER2'
  const tierRaw = raw.tier
  if (tierRaw != null && tierRaw !== '') {
    const n = Number(tierRaw)
    if (n === 1) tier = 'TIER1'
    else if (n === 2) tier = 'TIER2'
    else if (n === 3) tier = 'TIER3'
    else {
      const upper = String(tierRaw).trim().toUpperCase()
      if (upper === 'S') tier = 'TIER1'
      else if (upper === 'A') tier = 'TIER2'
      else tier = 'TIER3'
    }
  } else {
    // GitHub 형식: 협업 횟수 + 만족도로 tier 추론
    const collab = Number(raw.underdogs_collab_count ?? raw.collab_count ?? 0)
    const sat = Number(raw.satisfaction_avg ?? raw.satisfaction ?? 0)
    if (collab >= 3 && sat >= 4.5) tier = 'TIER1'
    else if (raw.overseas || raw.is_global) tier = 'TIER3'
  }

  // githubId: Supabase external_id (numeric string) OR GitHub id
  const externalId = raw.external_id ?? raw.id
  const githubIdNum =
    externalId != null && /^\d+$/.test(String(externalId)) ? Number(externalId) : undefined

  return {
    githubId: githubIdNum,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.phone),
    gender: pickStr(raw.gender),
    location: pickStr(raw.location),
    regions: toArray(raw.regions ?? raw.region),
    organization: pickStr(raw.organization, raw.company),
    position: pickStr(raw.position, raw.title),
    industries: toArray(raw.industries ?? raw.industry),
    expertise: toArray(raw.expertise ?? raw.expert_tags ?? raw.tags),
    roles: toArray(raw.roles ?? raw.role),
    overseas: Boolean(raw.overseas ?? raw.is_global),
    overseasDetail: pickStr(raw.overseas_detail),
    toolsSkills: pickStr(raw.tools_skills, raw.skills),
    intro: pickStr(raw.intro, raw.introduction),
    careerHistory: pickStr(raw.career_history, raw.career),
    education: pickStr(raw.education),
    underdogsHistory: pickStr(raw.underdogs_history),
    currentWork: pickStr(raw.current_work),
    careerYears: pickNum(raw.career_years),
    careerYearsRaw: pickStr(raw.career_years_raw, raw.career_years) ?? '',
    photoUrl: pickStr(raw.photo_url, raw.photo),
    businessType: pickStr(raw.business_type),
    country: pickStr(raw.country) ?? '한국',
    language: toArray(raw.language ?? raw.languages ?? ['한국어']),
    hasStartup: Boolean(raw.has_startup ?? raw.startup),
    // Supabase 는 status='active', GitHub 는 is_active=true (둘 다 default true)
    isActive: raw.status != null ? raw.status === 'active' : raw.is_active !== false,
    mainField: pickStr(raw.main_field),
    category,
    tier,
    satisfactionAvg: pickNum(raw.satisfaction_avg, raw.satisfaction),
    collaborationCount: pickNum(raw.underdogs_collab_count, raw.collab_count) ?? 0,
    impactMethodLevel: pickStr(raw.impact_method_level),
    lectureStyle: pickStr(raw.lecture_style),
    hasInvestExp: Boolean(raw.has_invest_exp ?? raw.invest_experience),
    onlineAvailable: raw.online_available !== false,
    minLeadTimeDays: pickNum(raw.min_lead_time_days) ?? 7,
    availableDays: toArray(raw.available_days),
    taxType: 'BUSINESS' as TaxType,
  }
}

// ─────────────────────────────────────────
// 3. 메인
// ─────────────────────────────────────────

async function main() {
  const t0 = Date.now()
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔄 Coach DB 동기화')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const { rows, source } = await fetchCoaches()
  console.log(`✅ ${source === 'supabase' ? 'Supabase' : 'GitHub'} 에서 ${rows.length}명 로드`)

  let upserted = 0
  let skipped = 0
  const errors: string[] = []

  for (const raw of rows) {
    const data = mapCoach(raw)
    if (!data.name) {
      skipped++
      continue
    }

    try {
      if (data.githubId) {
        await prisma.coach.upsert({
          where: { githubId: data.githubId },
          update: data,
          create: data,
        })
      } else {
        // githubId 없으면 이름+이메일로 매칭
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
    } catch (e) {
      skipped++
      errors.push(`${data.name}: ${(e as Error).message}`)
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`✅ ${upserted}명 upsert, ⚠️ ${skipped}명 skip (${Date.now() - t0}ms)`)
  if (errors.length > 0) {
    console.log(`\n실패 ${errors.length}건 (최대 5건 표시):`)
    for (const e of errors.slice(0, 5)) console.log(`   - ${e}`)
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
  .catch((e) => {
    console.error('❌ sync 실패:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

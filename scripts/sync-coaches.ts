/**
 * GitHub 코치 DB 동기화 스크립트
 * 실행: npx tsx scripts/sync-coaches.ts
 *
 * 환경변수:
 *   GITHUB_TOKEN       — GitHub PAT (repo:read)
 *   GITHUB_COACHES_REPO — "org/repo"
 *   GITHUB_COACHES_FILE — JSON 파일 경로 (기본: coaches_db.json)
 */

import 'dotenv/config'
import { PrismaClient, CoachCategory, CoachTier } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ── GitHub raw 파일 fetch ──────────────────────────────────────────────────
async function fetchCoachesJson(): Promise<any[]> {
  const repo = process.env.GITHUB_COACHES_REPO ?? 'underdogs-org/coaches-db'
  const branch = process.env.GITHUB_COACHES_BRANCH ?? 'main'
  const file = process.env.GITHUB_COACHES_FILE ?? 'coaches_db.json'
  const token = process.env.GITHUB_TOKEN

  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${file}`
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`GitHub fetch 실패: ${res.status} ${url}`)
  return res.json()
}

// ── raw JSON → Prisma upsert 데이터 변환 ─────────────────────────────────
function mapCoach(raw: any) {
  // category 결정
  let category: CoachCategory = 'COACH'
  const cat = (raw.category ?? raw.coach_category ?? '').toLowerCase()
  if (cat.includes('파트너') || cat.includes('partner')) category = 'PARTNER_COACH'
  else if (cat.includes('글로벌') || cat.includes('global')) category = 'GLOBAL_COACH'
  else if (cat.includes('컨설턴트') || cat.includes('consultant')) category = 'CONSULTANT'
  else if (cat.includes('투자') || cat.includes('investor')) category = 'INVESTOR'

  // tier 결정 (협업 횟수 + 평점 기준)
  const collabCount = Number(raw.underdogs_collab_count ?? raw.collab_count ?? 0)
  const satisfaction = Number(raw.satisfaction_avg ?? raw.satisfaction ?? 0)
  let tier: CoachTier = 'TIER2'
  if (collabCount >= 3 && satisfaction >= 4.5) tier = 'TIER1'
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
    satisfactionAvg: satisfaction || null,
    collaborationCount: collabCount,
    impactMethodLevel: raw.impact_method_level ?? null,
    lectureStyle: raw.lecture_style ?? null,
    hasInvestExp: Boolean(raw.has_invest_exp ?? raw.invest_experience),
    onlineAvailable: raw.online_available !== false,
    minLeadTimeDays: Number(raw.min_lead_time_days ?? 7),
    availableDays: toArray(raw.available_days),
  }
}

function toArray(val: any): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string') return val.split(/[,，;|]/).map((s) => s.trim()).filter(Boolean)
  return [String(val)]
}

// ── 메인 ────────────────────────────────────────────────────────────────
async function main() {
  console.log('⬇️  GitHub에서 코치 데이터 fetch 중...')
  const rawCoaches = await fetchCoachesJson()
  console.log(`   총 ${rawCoaches.length}명 로드`)

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
      console.error(`   ❌ ${data.name} 처리 실패:`, e)
      skipped++
    }
  }

  console.log(`✅ 완료: ${upserted}명 upsert, ${skipped}명 skip`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

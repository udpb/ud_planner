/**
 * coaches_db.json → PostgreSQL 마이그레이션 스크립트
 * 실행: npx tsx scripts/migrate-coaches-json.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const COACHES_JSON_PATH = resolve(
  'C:/Users/USER/.gemini/antigravity/scratch/underdogs-coach-finder/python-service/coaches_db.json'
)

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// tier 숫자 → enum
function mapTier(tier: number): 'TIER1' | 'TIER2' | 'TIER3' {
  if (tier === 1) return 'TIER1'
  if (tier === 2) return 'TIER2'
  return 'TIER3'
}

// category 한국어 → enum
function mapCategory(cat: string): 'PARTNER_COACH' | 'COACH' | 'GLOBAL_COACH' | 'CONSULTANT' | 'INVESTOR' {
  switch (cat) {
    case '파트너코치': return 'PARTNER_COACH'
    case '코치': return 'COACH'
    case '글로벌코치': return 'GLOBAL_COACH'
    case '컨설턴트': return 'CONSULTANT'
    case '투자사': return 'INVESTOR'
    case '인턴코치': return 'COACH' // 인턴코치는 COACH로 매핑
    default: return 'COACH'
  }
}

function safeStr(v: any): string | null {
  if (v === null || v === undefined || v === '') return null
  return String(v).trim() || null
}

function safeInt(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : Math.round(n)
}

function safeArr(v: any): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  return String(v).split(',').map((s) => s.trim()).filter(Boolean)
}

async function main() {
  console.log('🚀 coaches_db.json → PostgreSQL 마이그레이션 시작\n')

  const raw = readFileSync(COACHES_JSON_PATH, 'utf-8')
  const coaches: any[] = JSON.parse(raw)
  console.log(`📦 총 ${coaches.length}개 코치 레코드 발견\n`)

  let created = 0
  let updated = 0
  let errors = 0

  for (const c of coaches) {
    try {
      const data = {
        githubId: c.id,
        name: c.name ?? '이름 없음',
        email: safeStr(c.email),
        phone: safeStr(c.phone),
        gender: safeStr(c.gender),
        location: safeStr(c.location),
        regions: safeArr(c.regions),
        organization: safeStr(c.organization),
        position: safeStr(c.position),
        industries: safeArr(c.industries),
        expertise: safeArr(c.expertise),
        roles: safeArr(c.roles),
        overseas: c.overseas === true,
        overseasDetail: safeStr(c.overseas_detail),
        toolsSkills: safeStr(c.tools_skills),
        intro: safeStr(c.intro),
        careerHistory: safeStr(c.career_history),
        education: safeStr(c.education),
        underdogsHistory: safeStr(c.underdogs_history),
        currentWork: safeStr(c.current_work),
        careerYears: safeInt(c.career_years),
        careerYearsRaw: safeStr(c.career_years_raw),
        photoUrl: safeStr(c.photo_url),
        businessType: safeStr(c.business_type),
        country: c.country ?? '한국',
        language: safeArr(c.language || '한국어'),
        hasStartup: c.has_startup === true,
        isActive: c.is_active !== false,
        mainField: safeStr(c.main_field),
        category: mapCategory(c.category ?? '코치'),
        tier: mapTier(c.tier ?? 2),
      }

      const result = await prisma.coach.upsert({
        where: { githubId: c.id },
        update: data,
        create: data,
      })

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        created++
      } else {
        updated++
      }
    } catch (e: any) {
      errors++
      console.error(`  ❌ Coach #${c.id} (${c.name}): ${e.message}`)
    }
  }

  console.log('\n✅ 마이그레이션 완료!')
  console.log(`   신규 생성: ${created}`)
  console.log(`   업데이트: ${updated}`)
  console.log(`   에러: ${errors}`)
  console.log(`   총: ${coaches.length}`)

  // 통계
  const stats = await prisma.coach.groupBy({
    by: ['tier'],
    _count: true,
  })
  console.log('\n📊 Tier별 분포:')
  for (const s of stats) {
    console.log(`   ${s.tier}: ${s._count}명`)
  }

  const catStats = await prisma.coach.groupBy({
    by: ['category'],
    _count: true,
  })
  console.log('\n📊 Category별 분포:')
  for (const s of catStats) {
    console.log(`   ${s.category}: ${s._count}명`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

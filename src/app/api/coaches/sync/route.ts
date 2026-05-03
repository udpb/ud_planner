/**
 * POST /api/coaches/sync
 *
 * Supabase `coaches_directory` (coach-finder 와 동일 source) 또는 GitHub raw JSON 에서
 * Coach 데이터를 fetch → ud-ops 의 Prisma `Coach` 테이블에 upsert.
 *
 * Source 우선순위 (Phase 4-coach-integration, 2026-05-03):
 *   1. Supabase  — SUPABASE_URL + SUPABASE_SERVICE_ROLE 설정 시 (coach-finder 동기 source)
 *   2. GitHub    — fallback (`underdogs-org/coaches-db`)
 *
 * 호출 경로:
 *   1. /admin/metrics 의 "Coach Sync" 버튼 (CoachSyncButton)
 *   2. CLI: `npm run sync:coaches`  (scripts/sync-coaches.ts 가 동일 로직)
 *   3. Admin/PM 수동 POST
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CoachCategory, CoachTier, TaxType } from '@prisma/client'
import {
  fetchCoachesFromSupabase,
  isSupabaseCoachSourceAvailable,
  invalidateCoachCache,
} from '@/lib/coaches/supabase-source'
import { log } from '@/lib/logger'

// ─────────────────────────────────────────
// GitHub fallback (Supabase 미설정 시)
// ─────────────────────────────────────────

interface RawCoach {
  [key: string]: unknown
}

async function fetchFromGitHub(): Promise<RawCoach[]> {
  const repo = process.env.GITHUB_COACHES_REPO ?? 'underdogs-org/coaches-db'
  const branch = process.env.GITHUB_COACHES_BRANCH ?? 'main'
  const file = process.env.GITHUB_COACHES_FILE ?? 'coaches_db.json'
  const token = process.env.GITHUB_TOKEN

  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${file}`
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`GitHub fetch 실패: ${res.status}`)
  return (await res.json()) as RawCoach[]
}

// ─────────────────────────────────────────
// GitHub raw → Prisma 데이터 매퍼 (Supabase 는 supabase-source.ts 의 rowToCoach 사용)
// ─────────────────────────────────────────

function toArray(val: unknown): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string') return val.split(/[,，;|]/).map((s) => s.trim()).filter(Boolean)
  return [String(val)]
}

function mapGithubCoach(raw: RawCoach) {
  const cat = String(raw.category ?? raw.coach_category ?? '').toLowerCase()
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
    name: String(raw.name ?? ''),
    email: (raw.email as string) ?? null,
    phone: (raw.phone as string) ?? null,
    gender: (raw.gender as string) ?? null,
    location: (raw.location as string) ?? null,
    regions: toArray(raw.regions ?? raw.region),
    organization: (raw.organization as string) ?? (raw.company as string) ?? null,
    position: (raw.position as string) ?? (raw.title as string) ?? null,
    industries: toArray(raw.industries ?? raw.industry),
    expertise: toArray(raw.expertise ?? raw.expert_tags ?? raw.tags),
    roles: toArray(raw.roles ?? raw.role),
    overseas: Boolean(raw.overseas ?? raw.is_global),
    overseasDetail: (raw.overseas_detail as string) ?? null,
    toolsSkills: (raw.tools_skills as string) ?? (raw.skills as string) ?? null,
    intro: (raw.intro as string) ?? (raw.introduction as string) ?? null,
    careerHistory: (raw.career_history as string) ?? (raw.career as string) ?? null,
    education: (raw.education as string) ?? null,
    underdogsHistory: (raw.underdogs_history as string) ?? null,
    currentWork: (raw.current_work as string) ?? null,
    careerYears: raw.career_years ? Number(raw.career_years) : null,
    careerYearsRaw: (raw.career_years_raw as string) ?? String(raw.career_years ?? ''),
    photoUrl: (raw.photo_url as string) ?? (raw.photo as string) ?? null,
    businessType: (raw.business_type as string) ?? null,
    country: (raw.country as string) ?? '한국',
    language: toArray(raw.language ?? raw.languages ?? ['한국어']),
    hasStartup: Boolean(raw.has_startup ?? raw.startup),
    isActive: raw.is_active !== false,
    mainField: (raw.main_field as string) ?? null,
    category,
    tier,
    satisfactionAvg: sat || null,
    collaborationCount: collab,
    impactMethodLevel: (raw.impact_method_level as string) ?? null,
    lectureStyle: (raw.lecture_style as string) ?? null,
    hasInvestExp: Boolean(raw.has_invest_exp ?? raw.invest_experience),
    onlineAvailable: raw.online_available !== false,
    minLeadTimeDays: Number(raw.min_lead_time_days ?? 7),
    availableDays: toArray(raw.available_days),
    taxType: 'BUSINESS' as TaxType,
  }
}

// ─────────────────────────────────────────
// 메인 핸들러
// ─────────────────────────────────────────

export async function POST() {
  const t0 = Date.now()
  let coaches: ReturnType<typeof mapGithubCoach>[] = []
  let source: 'supabase' | 'github' = 'github'

  // 1. Supabase 우선
  if (isSupabaseCoachSourceAvailable()) {
    try {
      const supabaseCoaches = await fetchCoachesFromSupabase({ activeOnly: true })
      // MappedCoach 는 이미 Prisma upsert 호환 형태
      coaches = supabaseCoaches as unknown as ReturnType<typeof mapGithubCoach>[]
      source = 'supabase'
      log.info('coach-sync', 'Supabase fetch OK', { rows: coaches.length })
    } catch (err) {
      log.warn('coach-sync', 'Supabase fetch 실패 → GitHub fallback', {
        error: (err as Error).message.slice(0, 200),
      })
    }
  }

  // 2. GitHub fallback
  if (coaches.length === 0) {
    try {
      const rawCoaches = await fetchFromGitHub()
      coaches = rawCoaches.map(mapGithubCoach)
      source = 'github'
      log.info('coach-sync', 'GitHub fetch OK', { rows: coaches.length })
    } catch (err) {
      log.error('coach-sync', err)
      return NextResponse.json(
        {
          error:
            'Supabase 와 GitHub 둘 다 fetch 실패. SUPABASE_URL + SUPABASE_SERVICE_ROLE 또는 GITHUB_TOKEN 환경변수를 확인하세요.',
        },
        { status: 502 },
      )
    }
  }

  // 3. Prisma upsert
  let upserted = 0
  let skipped = 0

  for (const data of coaches) {
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

  // 4. live cache invalidate (다음 read 가 fresh data 가져가도록)
  invalidateCoachCache()

  log.info('coach-sync', 'sync 완료', {
    source,
    upserted,
    skipped,
    ms: Date.now() - t0,
  })

  return NextResponse.json({
    ok: true,
    source,
    upserted,
    skipped,
    durationMs: Date.now() - t0,
  })
}

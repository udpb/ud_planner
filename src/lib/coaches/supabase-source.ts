/**
 * coach-finder Supabase 와 동일한 source-of-truth 에서 코치 데이터 fetch
 * (Phase 4-coach-integration, 2026-05-03)
 *
 * 구조:
 *   ┌─────────────────────────────┐
 *   │  Supabase coaches_directory │  ← coach-finder 가 update
 *   └─────────────┬───────────────┘
 *                 │ service-role read
 *      ┌──────────┴──────────┐
 *      │                     │
 *   coach-finder         ud-ops (이 모듈)
 *   /api/coaches         scripts/sync-coaches.ts
 *                        /api/coaches/sync
 *                        /api/coaches/live  (캐시된 직접 read)
 *
 * 매핑:
 *   coach-finder 의 `api/_lib/supabaseAdmin.ts::rowToCoach` 와 동일 컬럼 입력 가정.
 *   ud-ops Coach Prisma 모델로 normalize → upsert 가능한 데이터 반환.
 *
 * server-only — service-role 키 노출 금지.
 */

import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CoachCategory, CoachTier, TaxType } from '@prisma/client'
import { log } from '@/lib/logger'

// ─────────────────────────────────────────
// 1. Supabase admin client (싱글톤)
// ─────────────────────────────────────────

let cached: SupabaseClient | null = null

export function isSupabaseCoachSourceAvailable(): boolean {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  return Boolean(url && key)
}

function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase coach source 미설정. SUPABASE_URL + SUPABASE_SERVICE_ROLE 환경변수 필요. ' +
        '(coach-finder 와 동일 키 사용 — 단일 source-of-truth)',
    )
  }

  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}

// ─────────────────────────────────────────
// 2. coaches_directory Row 타입 (coach-finder 와 동기)
// ─────────────────────────────────────────

export interface CoachDirectoryRow {
  id: string // uuid (Supabase 내부 PK)
  external_id: string | null // legacy numeric id (ud-ops Coach.githubId 와 매칭)
  name: string
  email: string | null
  phone: string | null
  gender: string | null
  location: string | null
  country: string | null
  regions: string[] | null
  organization: string | null
  position: string | null
  industries: string[] | null
  expertise: string[] | null
  roles: string[] | null
  language: string | null
  overseas: boolean | null
  overseas_detail: string | null
  intro: string | null
  career_history: string | null
  education: string | null
  underdogs_history: string | null
  current_work: string | null
  tools_skills: string | null
  career_years: number | null
  career_years_raw: string | null
  photo_url: string | null
  photo_filename: string | null
  tier: string | null
  category: string | null
  business_type: string | null
  status: string
}

// 본 모듈에서 select 하는 컬럼 — coach-finder 와 동일
const COACH_SELECT_COLUMNS = [
  'id',
  'external_id',
  'name',
  'email',
  'phone',
  'gender',
  'location',
  'country',
  'regions',
  'organization',
  'position',
  'industries',
  'expertise',
  'roles',
  'language',
  'overseas',
  'overseas_detail',
  'intro',
  'career_history',
  'education',
  'underdogs_history',
  'current_work',
  'tools_skills',
  'career_years',
  'career_years_raw',
  'photo_url',
  'photo_filename',
  'tier',
  'category',
  'business_type',
  'status',
].join(',')

// ─────────────────────────────────────────
// 3. row → ud-ops Coach Prisma 데이터 매퍼
// ─────────────────────────────────────────

export interface MappedCoach {
  // Coach 모델의 핵심 필드 (upsert 가능 형태)
  githubId?: number // external_id 가 numeric 일 때만
  name: string
  email: string | null
  phone: string | null
  gender: string | null
  location: string | null
  regions: string[]
  organization: string | null
  position: string | null
  industries: string[]
  expertise: string[]
  roles: string[]
  overseas: boolean
  overseasDetail: string | null
  toolsSkills: string | null
  intro: string | null
  careerHistory: string | null
  education: string | null
  underdogsHistory: string | null
  currentWork: string | null
  careerYears: number | null
  careerYearsRaw: string
  photoUrl: string | null
  businessType: string | null
  country: string
  language: string[]
  isActive: boolean
  category: CoachCategory
  tier: CoachTier
  // Supabase 에 없는 필드 (ud-ops 자체) — 기본값
  hasStartup: boolean
  mainField: string | null
  satisfactionAvg: number | null
  collaborationCount: number
  impactMethodLevel: string | null
  lectureStyle: string | null
  hasInvestExp: boolean
  onlineAvailable: boolean
  minLeadTimeDays: number
  availableDays: string[]
  taxType: TaxType
}

export function rowToCoach(r: CoachDirectoryRow): MappedCoach {
  // external_id → githubId (numeric only)
  const githubId =
    r.external_id != null && /^\d+$/.test(r.external_id) ? Number(r.external_id) : undefined

  // category 추론 (한글 + 영문 키워드)
  const cat = (r.category ?? '').toLowerCase()
  let category: CoachCategory = 'COACH'
  if (cat.includes('파트너') || cat.includes('partner')) category = 'PARTNER_COACH'
  else if (cat.includes('글로벌') || cat.includes('global')) category = 'GLOBAL_COACH'
  else if (cat.includes('컨설턴트') || cat.includes('consultant')) category = 'CONSULTANT'
  else if (cat.includes('투자') || cat.includes('investor')) category = 'INVESTOR'

  // tier — Supabase text "1"/"2"/"3"/"S"/"A" → CoachTier enum
  let tier: CoachTier = 'TIER2'
  if (r.tier) {
    const n = Number(r.tier)
    if (n === 1) tier = 'TIER1'
    else if (n === 2) tier = 'TIER2'
    else if (n === 3) tier = 'TIER3'
    else {
      const upper = r.tier.trim().toUpperCase()
      if (upper === 'S') tier = 'TIER1'
      else if (upper === 'A') tier = 'TIER2'
      else tier = 'TIER3'
    }
  } else if (r.overseas) {
    tier = 'TIER3'
  }

  // language: text or string[]
  const language = Array.isArray(r.language)
    ? (r.language as unknown as string[])
    : r.language
      ? [r.language]
      : ['한국어']

  return {
    githubId,
    name: r.name ?? '',
    email: r.email,
    phone: r.phone,
    gender: r.gender,
    location: r.location,
    regions: r.regions ?? [],
    organization: r.organization,
    position: r.position,
    industries: r.industries ?? [],
    expertise: r.expertise ?? [],
    roles: r.roles ?? [],
    overseas: !!r.overseas,
    overseasDetail: r.overseas_detail,
    toolsSkills: r.tools_skills,
    intro: r.intro,
    careerHistory: r.career_history,
    education: r.education,
    underdogsHistory: r.underdogs_history,
    currentWork: r.current_work,
    careerYears: r.career_years,
    careerYearsRaw: r.career_years_raw ?? String(r.career_years ?? ''),
    photoUrl: r.photo_url,
    businessType: r.business_type,
    country: r.country ?? '한국',
    language,
    isActive: r.status === 'active',
    category,
    tier,
    // Supabase 에 없는 필드 → 기본값
    hasStartup: false,
    mainField: null,
    satisfactionAvg: null,
    collaborationCount: 0,
    impactMethodLevel: null,
    lectureStyle: null,
    hasInvestExp: false,
    onlineAvailable: true,
    minLeadTimeDays: 7,
    availableDays: [],
    taxType: 'BUSINESS',
  }
}

// ─────────────────────────────────────────
// 4. 메인 fetch 함수
// ─────────────────────────────────────────

export interface FetchCoachesOptions {
  /** false 면 inactive 도 포함 (default: true — coach-finder 와 동일) */
  activeOnly?: boolean
  /** 디버깅용 한정 (default: 무한) */
  limit?: number
}

/**
 * Supabase 에서 코치 전체를 fetch.
 * 호출자: scripts/sync-coaches.ts, /api/coaches/sync, /api/coaches/live (캐시)
 */
export async function fetchCoachesFromSupabase(
  options: FetchCoachesOptions = {},
): Promise<MappedCoach[]> {
  const { activeOnly = true, limit } = options
  const t0 = Date.now()

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('coaches_directory')
    .select(COACH_SELECT_COLUMNS)
    .order('name', { ascending: true })

  if (activeOnly) query = query.eq('status', 'active')
  if (limit) query = query.limit(limit)

  const { data, error } = await query

  if (error) {
    log.error('coach-supabase', 'Supabase fetch 실패', {
      message: error.message,
      hint: error.hint ?? undefined,
    })
    throw new Error(`Supabase coaches fetch 실패: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as CoachDirectoryRow[]
  const mapped = rows.map(rowToCoach)

  log.info('coach-supabase', '✓ fetch 성공', {
    rows: mapped.length,
    activeOnly,
    ms: Date.now() - t0,
  })

  return mapped
}

// ─────────────────────────────────────────
// 5. 캐시 (호출 방식 — 5분 TTL)
// ─────────────────────────────────────────

interface Cache {
  fetchedAt: number
  data: MappedCoach[]
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5분
let liveCache: Cache | null = null

/**
 * 캐시된 read — 5분 안 동안은 같은 데이터 반환.
 * /admin/metrics, PipelineContext build 등에서 사용 권장.
 *
 * Prisma Coach 테이블을 우회하려는 게 아니라, "Supabase 가 진짜 source" 라는
 * 의도를 코드 차원에서 보여주는 phase 1 도입. ud-ops 의 로컬 Coach 테이블은
 * 여전히 PipelineContext / CoachAssignment FK 용으로 유지 (sync 로 채움).
 */
export async function getCoachesCached(): Promise<MappedCoach[]> {
  const now = Date.now()
  if (liveCache && now - liveCache.fetchedAt < CACHE_TTL_MS) {
    return liveCache.data
  }
  const data = await fetchCoachesFromSupabase()
  liveCache = { fetchedAt: now, data }
  return data
}

export function invalidateCoachCache(): void {
  liveCache = null
}

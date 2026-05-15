/**
 * Impact Measurement DB read-only client (Wave M1, 2026-05-15)
 *
 * impact-measurement (별개 프로덕트) 의 DB 에 read-only 자격으로 접속.
 * `pg` 직접 사용 — Prisma schema 별도 정의 안 함 (3 테이블만 SELECT).
 *
 * 환경변수: `IMPACT_MEASUREMENT_DATABASE_URL`
 *   - 미설정 시 모든 함수가 throw → 호출 측에서 graceful fallback 책임.
 *
 * 캐시:
 *   - 카테고리 + 계수는 자주 안 바뀌므로 5분 TTL 메모리 캐시.
 *   - serverless cold start 마다 캐시 비워짐 (의도). DB hit 최소화 + 신선도.
 *
 * 보안:
 *   - role 은 SELECT 만 가진 ud_planner_reader 권장.
 *   - 환경변수 노출은 server-only (Next.js process.env, 클라 번들 X).
 */

import 'server-only'
import { Pool } from 'pg'
import type {
  ImpactType,
  ImpactCategory,
  Coefficient,
  EducationItemField,
} from './types'

// ─────────────────────────────────────────
// 0. Connection pool — 모듈 단위 lazy init
// ─────────────────────────────────────────

let _pool: Pool | null = null

function getPool(): Pool {
  if (_pool) return _pool
  const url = process.env.IMPACT_MEASUREMENT_DATABASE_URL
  if (!url) {
    throw new ImpactDbNotConfiguredError(
      'IMPACT_MEASUREMENT_DATABASE_URL 환경변수 미설정 — impact-measurement DB 미연결',
    )
  }
  _pool = new Pool({
    connectionString: url,
    max: 3, // serverless 환경 — 작은 pool
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  // 연결 실패 핸들 (process crash 방지)
  _pool.on('error', (err) => {
    console.error('[impact-db] pool error:', err.message)
  })
  return _pool
}

export class ImpactDbNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImpactDbNotConfiguredError'
  }
}

/** ud-planner 안에서 "impact 엔진 사용 가능한가" 검사용 */
export function isImpactDbConfigured(): boolean {
  return !!process.env.IMPACT_MEASUREMENT_DATABASE_URL
}

// ─────────────────────────────────────────
// 1. 메모리 캐시 (5분 TTL)
// ─────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const cache = new Map<string, CacheEntry<unknown>>()

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

function cacheSet<T>(key: string, data: T): T {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return data
}

/** 테스트 / 즉시 갱신용 */
export function invalidateImpactCache(): void {
  cache.clear()
}

// ─────────────────────────────────────────
// 2. 카테고리 + 임팩트 유형 (join)
// ─────────────────────────────────────────

/**
 * 활성 카테고리 + 부모 ImpactType 조인.
 * impact-measurement schema 의 모델명: impact_categories / impact_types (snake_case 테이블).
 */
export async function listActiveCategories(): Promise<ImpactCategory[]> {
  const cached = cacheGet<ImpactCategory[]>('categories')
  if (cached) return cached

  const pool = getPool()
  const result = await pool.query<{
    id: string
    impact_type_id: string
    name: string
    name_en: string | null
    description: string | null
    formula_variables: EducationItemField[]
    display_order: number
    is_active: boolean
    it_id: string
    it_name: string
    it_name_en: string | null
    it_description: string | null
    it_display_order: number
    it_is_active: boolean
  }>(`
    SELECT
      c.id, c."impactTypeId" AS impact_type_id, c.name, c."nameEn" AS name_en,
      c.description, c."formulaVariables" AS formula_variables,
      c."displayOrder" AS display_order, c."isActive" AS is_active,
      t.id AS it_id, t.name AS it_name, t."nameEn" AS it_name_en,
      t.description AS it_description, t."displayOrder" AS it_display_order,
      t."isActive" AS it_is_active
    FROM impact_categories c
    INNER JOIN impact_types t ON t.id = c."impactTypeId"
    WHERE c."isActive" = true AND t."isActive" = true
    ORDER BY t."displayOrder", c."displayOrder"
  `)

  const categories: ImpactCategory[] = result.rows.map((r) => ({
    id: r.id,
    impactTypeId: r.impact_type_id,
    name: r.name,
    nameEn: r.name_en,
    description: r.description,
    formulaVariables: r.formula_variables ?? [],
    displayOrder: r.display_order,
    isActive: r.is_active,
    impactType: {
      id: r.it_id,
      name: r.it_name,
      nameEn: r.it_name_en,
      description: r.it_description,
      displayOrder: r.it_display_order,
      isActive: r.it_is_active,
    },
  }))

  return cacheSet('categories', categories)
}

/** 카테고리 ID 로 단건 — listActiveCategories 캐시 활용 */
export async function getCategoryById(
  id: string,
): Promise<ImpactCategory | null> {
  const all = await listActiveCategories()
  return all.find((c) => c.id === id) ?? null
}

// ─────────────────────────────────────────
// 3. 계수 (국가별, 현재 버전)
// ─────────────────────────────────────────

/**
 * 한 국가의 현재 활성 계수 전체.
 * country: 'KR' (한국) / 'JP' / 'ID' / 'IN' 등 impact-measurement 기준 ISO-2.
 */
export async function listCurrentCoefficients(
  country: string,
): Promise<Coefficient[]> {
  const cacheKey = `coefficients:${country}`
  const cached = cacheGet<Coefficient[]>(cacheKey)
  if (cached) return cached

  const pool = getPool()
  const result = await pool.query<{
    id: string
    categoryId: string
    country: string
    proxyValue: string // Decimal → string from pg
    currency: string
    role: string
    localProxyValue: string | null
    localCurrency: string | null
    exchangeRate: string | null
    reference: string
    version: string
    effectiveDate: Date
    isCurrent: boolean
    displayOrder: number
  }>(
    `
    SELECT id, "categoryId", country, "proxyValue", currency, role,
           "localProxyValue", "localCurrency", "exchangeRate",
           reference, version, "effectiveDate", "isCurrent", "displayOrder"
    FROM coefficients
    WHERE country = $1 AND "isCurrent" = true
    ORDER BY "displayOrder"
  `,
    [country],
  )

  const coefficients: Coefficient[] = result.rows.map((r) => ({
    id: r.id,
    categoryId: r.categoryId,
    country: r.country,
    proxyValue: Number(r.proxyValue),
    currency: r.currency,
    role: (r.role as 'primary' | 'adjustment') || 'primary',
    localProxyValue: r.localProxyValue != null ? Number(r.localProxyValue) : null,
    localCurrency: r.localCurrency,
    exchangeRate: r.exchangeRate != null ? Number(r.exchangeRate) : null,
    reference: r.reference,
    version: r.version,
    effectiveDate: r.effectiveDate.toISOString(),
    isCurrent: r.isCurrent,
    displayOrder: r.displayOrder,
  }))

  return cacheSet(cacheKey, coefficients)
}

// ─────────────────────────────────────────
// 4. 헬퍼 — 한 카테고리에 대한 계수 (primary + adjustment)
// ─────────────────────────────────────────

export interface CategoryCoefficients {
  primary: Coefficient
  adjustments: Coefficient[]
}

/**
 * 한 카테고리·국가 조합의 계수 묶음.
 * primary 1건 + adjustment N건 (0 가능).
 */
export async function getCoefficientsForCategory(
  categoryId: string,
  country: string,
): Promise<CategoryCoefficients | null> {
  const all = await listCurrentCoefficients(country)
  const forCat = all.filter((c) => c.categoryId === categoryId)
  if (forCat.length === 0) return null
  const primary = forCat.find((c) => c.role === 'primary')
  if (!primary) return null
  const adjustments = forCat.filter((c) => c.role === 'adjustment')
  return { primary, adjustments }
}

// ─────────────────────────────────────────
// 5. 한국 매핑 — impact-measurement 의 country 코드 vs ud-planner 의 country
// ─────────────────────────────────────────

/**
 * ud-planner 의 `Project.sroiCountry` 는 한국어 ('한국' / '일본') 인 반면
 * impact-measurement 는 ISO-2 ('KR' / 'JP'). 양방향 매핑.
 */
export function toImpactCountry(udCountry: string | null | undefined): string {
  if (!udCountry) return 'KR'
  const map: Record<string, string> = {
    한국: 'KR',
    일본: 'JP',
    인도: 'IN',
    인도네시아: 'ID',
    KR: 'KR',
    JP: 'JP',
    IN: 'IN',
    ID: 'ID',
  }
  return map[udCountry] ?? 'KR'
}

export function fromImpactCountry(impactCountry: string): string {
  const map: Record<string, string> = {
    KR: '한국',
    JP: '일본',
    IN: '인도',
    ID: '인도네시아',
  }
  return map[impactCountry] ?? impactCountry
}

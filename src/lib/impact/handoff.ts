/**
 * impact/handoff.ts — impact-measurement 공식 리포트 핸드오프 (BR-IMPACT-1, 2026-06-22)
 *
 * **역할**: 이미 계산된 `ImpactForecast`(Wave M forecast 정본)를 impact-measurement
 *   서비스에 **prediction 으로 쓰기**(POST) → 공개 리포트(`/view/{shareToken}`) 핸드오프.
 *
 * ⭐ 이 파일은 BR-SROI-1 `src/lib/sroi/client.ts` 의 **predict 호출(쓰기)만** 흡수한 것이다.
 *    계수 읽기·로컬 SROI 계산은 Wave M `impact/{db,forecast,engine}` 가 정본 → 중복 제거.
 *
 * ⭐ **SROI = 렌즈, 높을수록 좋은 게 아님** — 이 모듈에는 비율 최대화/랭킹 함수가 없다.
 *    응답의 sroi 는 보조 렌즈(없으면 null)로 그대로 전달만 한다.
 *
 * ⭐ **결과변수(고용·투자·창업전환) 추측 생성 금지** — 항목은 forecast 의 itemsJson
 *    (AI 매핑 + confidence/보수보정 거친 값)을 그대로 매핑한다. 여기서 새로 만들지 않는다.
 *
 * ⭐ graceful 필수 — env(SERVICE_API_TOKEN·SROI_SERVICE_URL) 없거나, 네트워크/4xx-5xx/
 *    타임아웃이면 **null 반환 + log.warn**. throw 금지(앱이 죽으면 안 됨).
 *    토큰은 env 에서만 읽고 코드/로그/커밋에 절대 넣지 않는다.
 */

import 'server-only'

import { prisma } from '@/lib/prisma'
import { log } from '@/lib/logger'
import { fromImpactCountry } from './db'
import type { ForecastItemWithMeta, EducationItemField } from './types'

const SCOPE = 'impact-handoff'

/** 라이브 호출 타임아웃 (ms). 무한 대기 방지 — 느리면 graceful null. */
const REQUEST_TIMEOUT_MS = 8_000

/** env 미지정 시 기본 서비스 URL (BR-IMPACT-1 §Prerequisites). */
const DEFAULT_SERVICE_URL = 'https://impact-measurement-udi.vercel.app'

// ─────────────────────────────────────────
// 서비스 계약 타입 (impact-measurement POST predict)
//   계약 출처: impact-measurement `feat/service-api`. shape 는 서비스 소유 — 느슨하게 받는다.
// ─────────────────────────────────────────

/** predict 요청 1항목. categoryId 만 필수, 변수는 카테고리 formulaVariables 에 맞춰 채운다. */
export interface PredictItem {
  categoryId: string
  count?: number
  hours?: number
  participants?: number
  days?: number
  months?: number
  revenue?: number
  newEmployees?: number
  investmentAmount?: number
  bizFund?: number
  coachesTrained?: number
  eventParticipants?: number
  spaceArea?: number
  spaceDuration?: number
}

export interface PredictRequest {
  externalProjectId: string
  title: string
  country?: string
  budget?: number
  programType?: string
  totalParticipants?: number
  items: PredictItem[]
}

/** 서비스가 내려주는 카테고리별 분해(있으면). shape 는 서비스 소유. */
export interface PredictBreakdownEntry {
  categoryId: string
  categoryName?: string
  value?: number
  [k: string]: unknown
}

export interface PredictResponse {
  measurementId: string
  totalSocialValue: number
  beneficiaryCount: number
  /** SROI = Σ 사회가치 / 예산. 예산 0/미상이면 서비스가 null 일 수 있다. (렌즈 — 최대화 X) */
  sroi: number | null
  breakdown: PredictBreakdownEntry[]
  reportUrl: string
  shareToken: string
}

/** requestOfficialReport 결과 — 공식 리포트 핸드오프 성공 시. */
export interface OfficialReportHandoff {
  /** 렌즈 — 높을수록 좋은 게 아니다. null 가능(예산 미상). */
  sroi: number | null
  /** 공개 리포트 URL — `{SROI_SERVICE_URL}/view/{shareToken}` (임베드 가능). */
  reportUrl: string
  shareToken: string
}

// ─────────────────────────────────────────
// 서비스 설정 (env)
// ─────────────────────────────────────────

interface ServiceConfig {
  baseUrl: string
  token: string
}

/**
 * env 에서 서비스 설정. **토큰 없으면 null**(graceful — 핸드오프 비활성).
 *   - SROI_SERVICE_URL : 미지정 시 DEFAULT_SERVICE_URL.
 *   - SERVICE_API_TOKEN: 없으면 null(쓰기 불가). 토큰은 헤더에만, 로그 비노출.
 */
function getServiceConfig(): ServiceConfig | null {
  const token = process.env.SERVICE_API_TOKEN?.trim()
  if (!token) return null
  const baseUrl = (
    process.env.SROI_SERVICE_URL?.trim() || DEFAULT_SERVICE_URL
  ).replace(/\/+$/, '')
  return { baseUrl, token }
}

/** UI/route 에서 "공식 리포트 핸드오프 가능한가" 검사용 (graceful 안내 분기). */
export function isHandoffConfigured(): boolean {
  return !!process.env.SERVICE_API_TOKEN?.trim()
}

// ─────────────────────────────────────────
// forecast itemsJson → predict items 매핑
// ─────────────────────────────────────────

/** PredictItem 이 받는 14 정량 필드(categoryId 제외). EducationItemField 와 정렬. */
const QUANT_FIELDS: EducationItemField[] = [
  'count',
  'hours',
  'participants',
  'days',
  'months',
  'revenue',
  'newEmployees',
  'investmentAmount',
  'bizFund',
  'coachesTrained',
  'eventParticipants',
  'spaceArea',
  'spaceDuration',
]

/**
 * forecast 의 itemsJson(ForecastItemWithMeta[]) → PredictItem[].
 *
 * ⭐ forecast 가 이미 AI 매핑 + confidence/보수보정(0.7×)을 거친 값이다 — 여기서 새 추정
 *    생성 없음. null/0 필드는 제외(서비스가 변수 없는 카테고리를 곱 1 처리하도록).
 *    confidence/rationale 같은 메타는 predict 계약에 없으므로 전달 안 함.
 */
export function forecastItemsToPredictItems(
  items: ForecastItemWithMeta[],
): PredictItem[] {
  return items.map((it) => {
    const out: PredictItem = { categoryId: it.categoryId }
    for (const f of QUANT_FIELDS) {
      const v = it[f]
      // null/undefined 제외. 0 도 의미 없는 곱이라 제외(서비스가 미제공 = 곱 1 처리).
      if (typeof v === 'number' && Number.isFinite(v) && v !== 0) {
        out[f] = v
      }
    }
    return out
  })
}

// ─────────────────────────────────────────
// 메인 — 공식 리포트 핸드오프
// ─────────────────────────────────────────

/**
 * requestOfficialReport — 프로젝트의 기존 `ImpactForecast`(forecast 정본)를 매핑해
 *   impact-measurement 의 predict 를 호출하고 sroi·reportUrl·shareToken 을 반환한다.
 *
 * 절차:
 *   1. env(서비스 설정) 없으면 → null (graceful). UI/route 가 "연동 미설정" 안내.
 *   2. 프로젝트 + ImpactForecast 로드. forecast 없으면 → null (먼저 forecastImpact 필요).
 *   3. itemsJson → PredictItem[] 매핑(추측 생성 0). items 0건이면 → null.
 *   4. POST predict (Bearer, 8s 타임아웃). 실패(네트워크/4xx-5xx/파싱) → null + log.warn.
 *
 * @returns {sroi, reportUrl, shareToken} | null — 실패·미설정은 전부 null(throw 금지).
 */
export async function requestOfficialReport(
  projectId: string,
): Promise<OfficialReportHandoff | null> {
  const cfg = getServiceConfig()
  if (!cfg) {
    log.warn(SCOPE, 'SERVICE_API_TOKEN 미설정 — 공식 리포트 핸드오프 비활성(graceful null)', {
      projectId,
    })
    return null
  }

  // 1) forecast 정본 로드 (재계산 없음 — Wave M 결과 재사용)
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      sroiCountry: true,
      totalBudgetVat: true,
      impactForecast: true,
    },
  })
  if (!project) {
    log.warn(SCOPE, '프로젝트 없음 — 핸드오프 생략', { projectId })
    return null
  }
  const forecast = project.impactForecast
  if (!forecast) {
    log.warn(
      SCOPE,
      'ImpactForecast 없음 — forecastImpact 먼저 필요(핸드오프 생략, graceful null)',
      { projectId },
    )
    return null
  }

  // 2) itemsJson → predict items (추측 생성 0)
  const forecastItems =
    (forecast.itemsJson as unknown as ForecastItemWithMeta[]) ?? []
  const items = forecastItemsToPredictItems(forecastItems)
  if (items.length === 0) {
    log.warn(SCOPE, '매핑된 predict item 0건 — 핸드오프 생략(graceful null)', {
      projectId,
    })
    return null
  }

  // 3) 요청 본문 — country 는 forecast 가 저장한 ISO-2 그대로 사용.
  const budget = project.totalBudgetVat ?? undefined
  const body: PredictRequest = {
    externalProjectId: projectId,
    title: `${project.name} — 사전 임팩트`,
    country: forecast.country,
    budget: budget && budget > 0 ? budget : undefined,
    totalParticipants: forecast.beneficiaryCount || undefined,
    items,
  }

  // 4) POST predict (Bearer · 8s 타임아웃 · graceful)
  const res = await postPredict(cfg, body, projectId)
  if (!res) return null

  return { sroi: res.sroi, reportUrl: res.reportUrl, shareToken: res.shareToken }
}

// ─────────────────────────────────────────
// 라이브 POST (graceful)
// ─────────────────────────────────────────

/**
 * POST /api/v1/measurements/predict — Bearer + JSON + 타임아웃.
 * 실패 경로(4xx/5xx/네트워크/타임아웃/파싱)는 전부 null(throw 금지). 토큰은 헤더에만.
 */
async function postPredict(
  cfg: ServiceConfig,
  body: PredictRequest,
  projectId: string,
): Promise<PredictResponse | null> {
  const url = `${cfg.baseUrl}/api/v1/measurements/predict`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      log.warn(SCOPE, `predict — 서비스 ${res.status} 응답(graceful null)`, {
        projectId,
        status: res.status,
        bodySnippet: text.slice(0, 200),
        ms: Date.now() - startedAt,
      })
      return null
    }
    const json = (await res.json()) as PredictResponse
    if (!json?.reportUrl || !json?.shareToken) {
      log.warn(SCOPE, 'predict — 응답에 reportUrl/shareToken 없음(graceful null)', {
        projectId,
        ms: Date.now() - startedAt,
      })
      return null
    }
    log.info(SCOPE, 'predict — 성공', {
      projectId,
      ms: Date.now() - startedAt,
    })
    return json
  } catch (err: unknown) {
    const aborted = (err as { name?: string })?.name === 'AbortError'
    log.warn(
      SCOPE,
      `predict — ${aborted ? '타임아웃' : '네트워크/파싱 실패'}(graceful null)`,
      {
        projectId,
        ms: Date.now() - startedAt,
        error: String((err as { message?: string })?.message ?? err).slice(0, 200),
      },
    )
    return null
  } finally {
    clearTimeout(timer)
  }
}

// fromImpactCountry 재노출 — UI 가 ISO-2 country 를 한국어로 표시할 때 사용(중복 정리 일환).
export { fromImpactCountry }

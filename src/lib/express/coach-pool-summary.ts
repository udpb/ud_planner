/**
 * Coach/Speaker Pool Summary — P6 (2026-05-31)
 *
 * "Coach만 있는게 아니야" — Express 는 그동안 715명 coaches_directory 풀을 한 번도
 * 조회하지 않고 PM 타이핑 코치 + "800명" 보일러플레이트만 썼다. 이 모듈이 사업 도메인에
 * 맞는 코치/연사 풀 **깊이**를 집계해 §4(운영 체계)·차별화에 실제 데이터로 투입한다.
 *
 * 원칙:
 *   - PII-safe(집합 통계만 — 개인 실명 노출 X). asset-registry 의 'human=집합' 철학과 일치.
 *   - RFP 키워드·도메인과 expertise·industries 매칭으로 "관련 도메인 N명" 깊이 산출.
 *   - Supabase 미가용·오류 시 graceful(빈 결과) — 호출부는 일반 문구로 degrade.
 *
 * 관련: src/lib/coaches/supabase-source.ts (getCoachesCached) · slot-guide.ts §4
 */

import 'server-only'

import type { RfpParsed } from '@/lib/ai/parse-rfp'

export interface CoachPoolSummary {
  /** 전체 활성 코치 수 */
  totalActive: number
  /** RFP 도메인 매칭 코치 수 */
  matchedCount: number
  /** 매칭 코치 평균 경력(년) — 0 이면 미상 */
  avgCareerYears: number
  /** 상위 전문 영역 (빈도순, 최대 6) */
  topExpertise: string[]
  /** 해외 경험 보유 코치 수 (글로벌 진출형 사업 신호) */
  overseasCount: number
  /** 권역 커버리지 (최대 6) */
  regions: string[]
  /** §4·차별화 프롬프트에 바로 박는 1~2문장 요약 (없으면 '') */
  promptLine: string
}

const EMPTY: CoachPoolSummary = {
  totalActive: 0,
  matchedCount: 0,
  avgCareerYears: 0,
  topExpertise: [],
  overseasCount: 0,
  regions: [],
  promptLine: '',
}

function tokenize(rfp: RfpParsed): string[] {
  const raw = [
    ...(rfp.keywords ?? []),
    ...(rfp.targetStage ?? []),
    rfp.targetAudience ?? '',
    rfp.region ?? '',
  ]
  return raw
    .flatMap((s) => String(s).split(/[\s,·/]+/))
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2)
}

/**
 * RFP 도메인에 맞는 코치/연사 풀 깊이 집계. PII-safe.
 * Supabase 미가용·오류 시 EMPTY 반환 (호출부 graceful degrade).
 */
export async function summarizeCoachPool(rfp: RfpParsed): Promise<CoachPoolSummary> {
  try {
    const { isSupabaseCoachSourceAvailable, getCoachesCached } = await import(
      '@/lib/coaches/supabase-source'
    )
    if (!isSupabaseCoachSourceAvailable()) return EMPTY
    const coaches = (await getCoachesCached()).filter((c) => c.isActive)
    if (coaches.length === 0) return EMPTY

    const tokens = tokenize(rfp)
    const exprFreq = new Map<string, number>()
    const regionSet = new Set<string>()
    let matchedCount = 0
    let overseasCount = 0
    let careerSum = 0
    let careerN = 0

    for (const c of coaches) {
      const haystack = [...(c.expertise ?? []), ...(c.industries ?? []), ...(c.roles ?? [])]
        .join(' ')
        .toLowerCase()
      const isMatch =
        tokens.length === 0 ? false : tokens.some((t) => haystack.includes(t))
      if (isMatch) {
        matchedCount++
        if (c.overseas) overseasCount++
        if (typeof c.careerYears === 'number' && c.careerYears > 0) {
          careerSum += c.careerYears
          careerN++
        }
        for (const e of c.expertise ?? []) {
          const k = e.trim()
          if (k) exprFreq.set(k, (exprFreq.get(k) ?? 0) + 1)
        }
        for (const r of c.regions ?? []) {
          if (r && regionSet.size < 12) regionSet.add(r)
        }
      }
    }

    const topExpertise = Array.from(exprFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k]) => k)
    const avgCareerYears = careerN > 0 ? Math.round(careerSum / careerN) : 0
    const regions = Array.from(regionSet).slice(0, 6)

    let promptLine = ''
    if (matchedCount > 0) {
      // P15(패널): 매칭 N명을 '전원 투입'으로 쓰면 비현실적 → 자문/예비 풀로, 전담은 소수 정예.
      const parts = [`도메인 매칭 가능 코치 ${matchedCount}명 보유(전체 ${coaches.length}명 풀) — 이 중 전담 소수 정예(예: 3~6인) 투입 + 나머지는 분야별 자문·매칭 예비군`]
      if (avgCareerYears > 0) parts.push(`매칭군 평균 경력 ${avgCareerYears}년`)
      if (topExpertise.length > 0) parts.push(`주요 전문: ${topExpertise.slice(0, 4).join('·')}`)
      if (overseasCount > 0) parts.push(`해외 경험 ${overseasCount}명`)
      promptLine = parts.join(' · ') + '\n→ §4 작성 시 "N명 전원 투입"이 아니라 "전담 PM+핵심 코치 소수 + 도메인 자문단" 구조로 현실성 있게.'
    } else {
      // 매칭 0 이어도 전체 규모는 사실 — 보일러플레이트 대신 실측 총원 제공
      promptLine = `전체 ${coaches.length}명 활성 코치 풀 보유 (도메인 직접 매칭은 PM 보정 권장)`
    }

    return {
      totalActive: coaches.length,
      matchedCount,
      avgCareerYears,
      topExpertise,
      overseasCount,
      regions,
      promptLine,
    }
  } catch (e) {
    console.warn('[coach-pool-summary] 조회 실패 → 일반 문구 degrade:', e instanceof Error ? e.message : e)
    return EMPTY
  }
}

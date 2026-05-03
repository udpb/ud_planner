/**
 * 유사 프로젝트 검색 — B2
 *
 * 결정론적 스코어링 (AI 호출 없음):
 *   - Jaccard keyword overlap (키워드·목표) : w = 0.40
 *   - client exact match                    : w = 0.30
 *   - budget similarity (±100%)             : w = 0.20
 *   - targetStage match                     : w = 0.10
 *
 * 출력 타입: `SimilarProject` (src/lib/pipeline-context.ts §1.2)
 *
 * 성능: 후보 100건 샘플링 (updatedAt desc) → 인메모리 스코어링 → top N.
 * 확장: Phase F+ 에서 임베딩 기반 semantic similarity 로 업그레이드 예정.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { SimilarProject } from '@/lib/pipeline-context'

// ─────────────────────────────────────────
// 옵션 / 상수
// ─────────────────────────────────────────

export interface SimilarProjectSearchOptions {
  /** 반환할 top N (기본 5) */
  topN?: number
  /** 이 점수 미만은 제외 (기본 0.2) */
  minScore?: number
  /** 수주 실패 프로젝트도 포함할지 (기본 true — 반면교사) */
  includeLost?: boolean
}

export const SIMILARITY_WEIGHTS = {
  keywords: 0.4,
  client: 0.3,
  budget: 0.2,
  target: 0.1,
} as const

/** DB 후보 샘플링 상한 (전체 스캔 방지) */
const CANDIDATE_SAMPLE_LIMIT = 100

// ─────────────────────────────────────────
// 스코어 컴포넌트 (각 0~1)
// ─────────────────────────────────────────

/** 대소문자·공백 무시 Jaccard 유사도 */
export function keywordOverlap(a: string[] | null | undefined, b: string[] | null | undefined): number {
  const normalize = (arr: string[] | null | undefined) =>
    (arr ?? [])
      .map((s) => (s ?? '').toString().toLowerCase().trim())
      .filter((s) => s.length > 0)

  const setA = new Set(normalize(a))
  const setB = new Set(normalize(b))

  if (setA.size === 0 && setB.size === 0) return 0

  let intersection = 0
  for (const x of setA) {
    if (setB.has(x)) intersection += 1
  }
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

/** 발주처 완전 일치 (대소문자·공백 무시). 부분일치는 0.5 */
export function clientMatch(a: string | null | undefined, b: string | null | undefined): number {
  const na = (a ?? '').toString().toLowerCase().trim()
  const nb = (b ?? '').toString().toLowerCase().trim()
  if (!na || !nb) return 0
  if (na === nb) return 1
  // 한쪽이 다른 쪽의 부분 문자열이면 약한 매치 (예: "서울시" ⊂ "서울특별시 일자리청")
  if (na.includes(nb) || nb.includes(na)) return 0.5
  return 0
}

/**
 * 예산 유사도 — 절대 차이 / 큰 값 의 비율을 1 에서 뺌.
 *   동일 예산 → 1
 *   100% 차이 → 0
 *   한쪽이라도 null/0 → 0
 */
export function budgetSimilarity(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null || b == null) return 0
  if (a <= 0 || b <= 0) return 0
  const diff = Math.abs(a - b) / Math.max(a, b)
  return Math.max(0, 1 - diff)
}

/**
 * 대상자 단계 매치 — RfpParsed.targetStage 는 string[].
 * Jaccard 유사도로 계산 (완전 일치면 1).
 */
export function targetStageMatch(
  a: string[] | null | undefined,
  b: string[] | null | undefined,
): number {
  return keywordOverlap(a, b)
}

// ─────────────────────────────────────────
// 후보 메타 → 스코어
// ─────────────────────────────────────────

export interface SimilarityCandidate {
  rfpParsed: RfpParsed | null
  client: string | null
  supplyPrice: number | null
}

export interface SimilarityBreakdown {
  total: number
  keywords: number
  client: number
  budget: number
  target: number
}

/** 기준 프로젝트 vs 후보 프로젝트의 각 컴포넌트 점수 + 가중 합산 */
export function scoreSimilarity(
  baseRfp: RfpParsed,
  baseBudget: number | null,
  candidate: SimilarityCandidate,
): SimilarityBreakdown {
  const candRfp = candidate.rfpParsed
  const candBudget = candidate.supplyPrice

  // 키워드·목표 합쳐서 Jaccard (둘 다 비어있으면 0)
  const baseKw = [...(baseRfp.keywords ?? []), ...(baseRfp.objectives ?? [])]
  const candKw = candRfp ? [...(candRfp.keywords ?? []), ...(candRfp.objectives ?? [])] : []

  const kw = keywordOverlap(baseKw, candKw)
  const cl = clientMatch(baseRfp.client, candidate.client ?? candRfp?.client ?? null)
  const bg = budgetSimilarity(baseBudget, candBudget)
  const tg = targetStageMatch(baseRfp.targetStage, candRfp?.targetStage)

  const total =
    SIMILARITY_WEIGHTS.keywords * kw +
    SIMILARITY_WEIGHTS.client * cl +
    SIMILARITY_WEIGHTS.budget * bg +
    SIMILARITY_WEIGHTS.target * tg

  return { total, keywords: kw, client: cl, budget: bg, target: tg }
}

/** 점수 breakdown → 사람이 읽을 수 있는 매칭 사유 */
function buildMatchReasons(b: SimilarityBreakdown): string[] {
  const reasons: string[] = []
  if (b.client >= 1) reasons.push('발주처 일치')
  else if (b.client > 0) reasons.push('발주처 부분 일치')

  if (b.keywords >= 0.5) reasons.push(`키워드·목표 높은 겹침 (${(b.keywords * 100).toFixed(0)}%)`)
  else if (b.keywords > 0) reasons.push(`키워드·목표 일부 겹침 (${(b.keywords * 100).toFixed(0)}%)`)

  if (b.budget >= 0.75) reasons.push('예산 규모 유사')
  else if (b.budget > 0) reasons.push(`예산 규모 차이 ${((1 - b.budget) * 100).toFixed(0)}%`)

  if (b.target >= 0.5) reasons.push('대상자 단계 일치')
  else if (b.target > 0) reasons.push('대상자 단계 일부 겹침')

  return reasons
}

// ─────────────────────────────────────────
// 메인 검색 함수
// ─────────────────────────────────────────

/**
 * 기준 프로젝트의 RFP 특성을 바탕으로 과거 유사 프로젝트 top N 반환.
 *
 * @param projectId  기준 프로젝트 id
 * @param options    topN / minScore / includeLost
 * @returns          점수 높은 순으로 정렬된 SimilarProject 배열
 *                   (기준 프로젝트에 rfpParsed 가 없거나 조회 실패 시 빈 배열)
 */
export async function findSimilarProjects(
  projectId: string,
  options: SimilarProjectSearchOptions = {},
): Promise<SimilarProject[]> {
  const { topN = 5, minScore = 0.2, includeLost = true } = options

  // 1. 기준 프로젝트 조회
  const base = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      rfpParsed: true,
      supplyPrice: true,
      totalBudgetVat: true,
    },
  })

  if (!base) return []
  const baseRfp = base.rfpParsed as unknown as RfpParsed | null
  if (!baseRfp) return []

  // 예산 비교는 supplyPrice 우선, 없으면 totalBudgetVat 차선 (일관성 위해 같은 기준 사용)
  const baseBudget: number | null = base.supplyPrice ?? base.totalBudgetVat ?? baseRfp.supplyPrice ?? null

  // 2. 후보 샘플링 — 최근 수정순 100건, rfpParsed 있는 것만, 자기 자신 제외
  const candidateWhere: Prisma.ProjectWhereInput = {
    id: { not: projectId },
    rfpParsed: { not: Prisma.JsonNull },
  }
  if (!includeLost) {
    candidateWhere.status = { not: 'LOST' }
  }

  const candidates = await prisma.project.findMany({
    where: candidateWhere,
    select: {
      id: true,
      name: true,
      client: true,
      status: true,
      rfpParsed: true,
      supplyPrice: true,
      totalBudgetVat: true,
      isBidWon: true,
      techEvalScore: true,
      // B0 가 추가하는 신규 필드 — schema 미존재 시 Prisma Client 타입에서도 누락됨.
      // 타입 안전성 유지 위해 optional select 로 가정하고, 접근 시 undefined 방어.
    },
    orderBy: { updatedAt: 'desc' },
    take: CANDIDATE_SAMPLE_LIMIT,
  })

  // 3. 스코어링
  type Scored = {
    project: (typeof candidates)[number]
    breakdown: SimilarityBreakdown
  }
  const scored: Scored[] = candidates.map((p) => {
    const rfpParsed = p.rfpParsed as unknown as RfpParsed | null
    const breakdown = scoreSimilarity(baseRfp, baseBudget, {
      rfpParsed,
      client: p.client ?? null,
      supplyPrice: p.supplyPrice ?? p.totalBudgetVat ?? null,
    })
    return { project: p, breakdown }
  })

  // 4. minScore 필터 + 상위 N 정렬
  const filtered = scored
    .filter((s) => s.breakdown.total >= minScore)
    .sort((a, b) => b.breakdown.total - a.breakdown.total)
    .slice(0, topN)

  // 5. SimilarProject 타입으로 매핑 (data-contract.md §1.2 + Phase A 실용 필드 결합)
  return filtered.map(({ project, breakdown }) => {
    const isBidWon = project.isBidWon ?? null
    // won 유도: isBidWon 우선. 없으면 status 기반.
    const won: boolean | null =
      isBidWon !== null
        ? isBidWon
        : project.status === 'COMPLETED' || project.status === 'IN_PROGRESS' || project.status === 'SUBMITTED'
          ? true
          : project.status === 'LOST'
            ? false
            : null
    // B0 proposalConcept 필드 — schema 에 있을 수도 없을 수도. 접근 시 undefined 방어.
    const keyStrategy =
      (project as { proposalConcept?: string | null }).proposalConcept ?? null

    return {
      projectId: project.id,
      name: project.name,
      client: project.client ?? null,
      similarity: Number(breakdown.total.toFixed(4)),
      matchReasons: buildMatchReasons(breakdown),
      // data-contract.md §1.2 신규 필드
      budget: project.supplyPrice ?? project.totalBudgetVat ?? null,
      won,
      keyStrategy,
      // Phase A 실용 필드
      isBidWon: isBidWon === null ? undefined : isBidWon,
      techEvalScore: project.techEvalScore ?? undefined,
    }
  })
}

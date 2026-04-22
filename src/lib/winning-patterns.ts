/**
 * WinningPattern Query Helper — 당선 패턴 검색
 *
 * Phase D1: 승인된 WinningPattern 을 조건 기반으로 검색.
 * Phase D3 pm-guide 가 소비.
 * Phase E (ADR-006): ProgramProfile 기반 유사도 매칭 지원 추가.
 *
 * 관련 문서:
 *   - docs/architecture/quality-gates.md §1 Gate 3 (당선 패턴 대조)
 *   - docs/architecture/ingestion.md §3.1
 *   - docs/architecture/program-profile.md §5.2 (similarity weights)
 *   - docs/decisions/006-program-profile.md
 */

import { prisma } from '@/lib/prisma'
import type { ProposalSectionKey } from '@/lib/pipeline-context'
import {
  profileSimilarity,
  type ProgramProfile,
} from '@/lib/program-profile'

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────

export interface WinningPatternRecord {
  id: string
  sourceProject: string
  sourceClient: string | null
  sectionKey: string
  channelType: string | null
  outcome: string
  techEvalScore: number | null
  snippet: string
  whyItWorks: string
  tags: string[]
  createdAt: Date
  approvedBy: string | null
  /**
   * Phase E: 현재 프로파일과의 유사도 점수 (0~1).
   * `profile` 옵션을 넘겼을 때만 채워짐. 그 외에는 undefined.
   */
  similarity?: number
  /**
   * Phase E: "왜 이 케이스가 유사한가" 를 PM 에게 설명할 수 있는 짧은 구절 1~3개.
   * 예: ["같은 방법론(로컬브랜드)", "같은 발주처(기초지자체)", "예산 규모 유사"].
   * `profile` 옵션을 넘겼을 때만 채워짐.
   */
  matchReasons?: string[]
}

export interface FindWinningPatternsOptions {
  /** 섹션 키로 필터 */
  sectionKey?: ProposalSectionKey | string
  /** 채널 타입 (B2G, B2B, renewal) */
  channelType?: string
  /** 수주 여부 (won, lost, pending) */
  outcome?: string
  /** 태그 중 하나라도 포함하는 패턴 (Postgres array overlap) */
  tags?: string[]
  /** 최대 반환 건수 (기본 10) */
  limit?: number
  /**
   * Phase E: 현재 사업의 ProgramProfile.
   * 지정 시 `sourceProfile IS NOT NULL` 후보만 조회하고, profileSimilarity 로
   * 재정렬한 뒤 `minSimilarity` 미만 레코드는 제외한다.
   */
  profile?: ProgramProfile
  /**
   * Phase E: 유사도 임계값 (기본 0.35).
   * `profile` 가 주어졌을 때만 적용.
   */
  minSimilarity?: number
}

// ─────────────────────────────────────────
// 메인 쿼리
// ─────────────────────────────────────────

/**
 * WinningPattern 테이블을 조건 기반으로 검색합니다.
 *
 * - `profile` 미지정 (legacy): where 조건대로 createdAt 역순 반환.
 * - `profile` 지정 (Phase E): `sourceProfile IS NOT NULL` 후보를 폭넓게 가져와
 *   profileSimilarity 로 재정렬, `minSimilarity` 이상만 상위 limit 건 반환.
 *
 * @param options - 필터 조건. 모든 필드 optional.
 * @returns WinningPatternRecord[] (legacy: 최신 순 / profile 모드: 유사도 내림차순)
 */
export async function findWinningPatterns(
  options: FindWinningPatternsOptions = {},
): Promise<WinningPatternRecord[]> {
  const {
    sectionKey,
    channelType,
    outcome,
    tags,
    limit = 10,
    profile,
    minSimilarity = 0.35,
  } = options

  const where: Record<string, unknown> = {}

  if (sectionKey) {
    where['sectionKey'] = sectionKey
  }
  if (channelType) {
    where['channelType'] = channelType
  }
  if (outcome) {
    where['outcome'] = outcome
  }
  if (tags && tags.length > 0) {
    // Prisma String[] — hasSome
    where['tags'] = { hasSome: tags }
  }

  // Phase E: 프로파일 모드 — sourceProfile 있는 후보만 수집.
  if (profile) {
    where['sourceProfile'] = { not: null }
  }

  // 프로파일 모드에서는 후보를 넓게 가져와 메모리 랭킹 (최대 50).
  // legacy 모드에서는 기존 동작 유지.
  const takeCandidates = profile
    ? Math.min(Math.max(limit * 5, 20), 50)
    : Math.min(limit, 50)

  const patterns = await prisma.winningPattern.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: takeCandidates,
  })

  const records: WinningPatternRecord[] = patterns.map((p) => ({
    id: p.id,
    sourceProject: p.sourceProject,
    sourceClient: p.sourceClient,
    sectionKey: p.sectionKey,
    channelType: p.channelType,
    outcome: p.outcome,
    techEvalScore: p.techEvalScore,
    snippet: p.snippet,
    whyItWorks: p.whyItWorks,
    tags: p.tags,
    createdAt: p.createdAt,
    approvedBy: p.approvedBy,
  }))

  // legacy 경로: 유사도 미적용, 최신순 limit 건.
  if (!profile) {
    return records.slice(0, limit)
  }

  // Phase E: 프로파일 모드 — 유사도 계산·필터·정렬.
  interface Ranked {
    record: WinningPatternRecord
    sim: number
  }

  const ranked: Ranked[] = []
  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i]
    const base = records[i]
    if (!p || !base) continue
    const sourceProfile = p.sourceProfile as unknown
    if (!sourceProfile || typeof sourceProfile !== 'object') continue
    const src = sourceProfile as ProgramProfile
    const sim = profileSimilarity(profile, src)
    if (sim < minSimilarity) continue
    const matchReasons = buildMatchReasons(profile, src)
    ranked.push({ record: { ...base, similarity: sim, matchReasons }, sim })
  }

  ranked.sort((a, b) => b.sim - a.sim)
  return ranked.slice(0, limit).map((x) => x.record)
}

/**
 * 두 프로파일의 공통점 중 PM 에게 "왜 유사한가" 를 설명할 가장 설득력 있는
 * 1~3개 구절을 생성. similarity 점수만으로는 추상적이라 배경을 함께 제시.
 *
 * 우선순위:
 *   1. 같은 methodology
 *   2. 같은 channel (type + clientTier)
 *   3. 같은 targetStage
 *   4. 같은 geography 또는 겹치는 businessDomain
 *   5. 같은 selection.style 또는 같은 primaryImpact
 *   6. 유사 예산 tier
 *
 * 각 구절은 "같은 A(값)" 또는 "유사 A(값)" 형식. 배점 프레임 없이
 * 간결하게 — UI 에서 한 줄 요약으로 쓰기 좋게 유지한다.
 */
function buildMatchReasons(a: ProgramProfile, b: ProgramProfile): string[] {
  const reasons: string[] = []

  if (a.methodology.primary === b.methodology.primary) {
    reasons.push(`같은 방법론(${a.methodology.primary})`)
  }
  if (a.channel.type === b.channel.type && a.channel.clientTier === b.channel.clientTier) {
    reasons.push(`같은 발주처(${a.channel.clientTier})`)
  } else if (a.channel.type === b.channel.type) {
    reasons.push(`같은 채널(${a.channel.type})`)
  }
  if (a.targetStage === b.targetStage) {
    reasons.push(`같은 대상 단계(${a.targetStage})`)
  }

  // 부족하면 지역/도메인/심사/임팩트 보강
  if (reasons.length < 3 && a.targetSegment.geography === b.targetSegment.geography) {
    reasons.push(`같은 지역성(${a.targetSegment.geography})`)
  }
  if (reasons.length < 3) {
    const overlap = a.targetSegment.businessDomain.filter((d) =>
      b.targetSegment.businessDomain.includes(d),
    )
    if (overlap.length > 0 && overlap[0] !== 'ALL') {
      reasons.push(`같은 분야(${overlap[0]})`)
    }
  }
  if (reasons.length < 3 && a.selection.style === b.selection.style) {
    reasons.push(`같은 심사 방식(${a.selection.style})`)
  }
  if (reasons.length < 3) {
    const impactOverlap = a.primaryImpact.filter((i) => b.primaryImpact.includes(i))
    if (impactOverlap.length > 0) {
      reasons.push(`같은 주 임팩트(${impactOverlap[0]})`)
    }
  }
  if (reasons.length < 3 && a.scale.budgetTier === b.scale.budgetTier) {
    reasons.push(`예산 규모 유사(${a.scale.budgetTier})`)
  }

  return reasons.slice(0, 3)
}

/**
 * 특정 섹션 키와 수주 성공 패턴만 검색하는 편의 함수.
 * Gate 3a 당선 패턴 대조에서 사용.
 */
export async function findWonPatternsBySection(
  sectionKey: ProposalSectionKey | string,
  limit = 5,
): Promise<WinningPatternRecord[]> {
  return findWinningPatterns({
    sectionKey,
    outcome: 'won',
    limit,
  })
}

/**
 * WinningPattern Query Helper — 당선 패턴 검색
 *
 * Phase D1: 승인된 WinningPattern 을 조건 기반으로 검색.
 * Phase D3 pm-guide 가 소비 예정.
 *
 * 관련 문서:
 *   - docs/architecture/quality-gates.md §1 Gate 3 (당선 패턴 대조)
 *   - docs/architecture/ingestion.md §3.1
 */

import { prisma } from '@/lib/prisma'
import type { ProposalSectionKey } from '@/lib/pipeline-context'

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
}

// ─────────────────────────────────────────
// 메인 쿼리
// ─────────────────────────────────────────

/**
 * WinningPattern 테이블을 조건 기반으로 검색합니다.
 *
 * @param options - 필터 조건. 모든 필드 optional.
 * @returns WinningPatternRecord[] (최신 순)
 */
export async function findWinningPatterns(
  options: FindWinningPatternsOptions = {},
): Promise<WinningPatternRecord[]> {
  const { sectionKey, channelType, outcome, tags, limit = 10 } = options

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

  const patterns = await prisma.winningPattern.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 50),
  })

  return patterns.map((p) => ({
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

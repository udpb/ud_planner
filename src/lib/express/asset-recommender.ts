/**
 * Asset Recommender — Inspector 약점 lens 별 자산 추천 (Wave N1, 2026-05-15)
 *
 * Inspector 가 "lens 약함" 만 말하고 끝나면 PM 이 다음 액션을 매번 직접 찾아야 함.
 * 본 모듈: weak lens → ContentAsset Top 3 추천 → "이 자산을 인용해보세요" 카드.
 *
 * 매칭 흐름:
 *   1. lens → 후보 evidenceType + 후보 category 매핑 (LENS_TO_ASSET_PROFILE)
 *   2. ContentAsset 풀에서 (a) evidenceType 일치 (b) category 일치 인 자산만 필터
 *   3. programProfile 적합도 점수 + (Wave N4: usage 가산점) 합산 → 정렬
 *   4. 같은 자산이 여러 lens 에 추천될 수 있음 (UI 가 dedup)
 *
 * tone lens 는 자산 무관 (스타일 이슈) — 추천 스킵.
 *
 * 관련: ADR-009 (Asset Registry) · ADR-010 (Content Hub) · inspector.ts
 */

import 'server-only'

import { prisma } from '@/lib/prisma'
import type { InspectorIssue } from './inspector'
import type {
  AssetCategory,
  EvidenceType,
} from '@/lib/asset-registry-types'
import type { ProgramProfile } from '@/lib/program-profile'
import {
  generateEmbedding,
  cosineSimilarity,
  EMBEDDING_MODEL_LABEL,
} from '@/lib/ai/embedding'

// Wave N4 — 채널별 자산 가중치 (Inspector 가중치와 별개, 자산 score 직접 곱)
type Channel = 'B2G' | 'B2B' | 'renewal'

const CHANNEL_ASSET_WEIGHTS: Record<
  Channel,
  Partial<Record<AssetCategory, number>>
> = {
  B2G: {
    data: 1.3, // 정책 통계·발주처 데이터 강
    methodology: 1.1,
    framework: 1.0,
    content: 0.9,
    product: 0.9,
    human: 0.9,
  },
  B2B: {
    product: 1.3, // 자체 솔루션·LMS 강
    human: 1.2,
    content: 1.1,
    framework: 1.0,
    data: 0.8,
    methodology: 0.9,
  },
  renewal: {
    data: 1.3, // 직전 성과 데이터 강
    human: 1.1,
    content: 1.0,
    methodology: 1.0,
    framework: 0.9,
    product: 1.0,
  },
}

// ─────────────────────────────────────────
// 1. lens → 자산 프로파일 매핑
// ─────────────────────────────────────────

/**
 * lens 별로 어떤 evidenceType · category 의 자산이 보강책이 되는지.
 *
 * 가중치 (relative):
 *  - 1.0 = 핵심 매칭 (시장 lens 약함 → quantitative + data 가 정답)
 *  - 0.7 = 보조 매칭 (시장 lens 에 framework 도 도움됨)
 *  - 0.0 = 매칭 안 함
 */
interface LensAssetProfile {
  evidenceTypes: Partial<Record<EvidenceType, number>>
  categories: Partial<Record<AssetCategory, number>>
  hint: string // PM 카드에 보일 이유
}

const LENS_TO_ASSET_PROFILE: Record<
  Exclude<InspectorIssue['lens'], 'tone'>,
  LensAssetProfile
> = {
  market: {
    evidenceTypes: { quantitative: 1.0, structural: 0.5 },
    categories: { data: 1.0, framework: 0.7, methodology: 0.4 },
    hint: '시장 규모·정책 통계 자산을 인용해 평가위원 시각 수치 확보',
  },
  statistics: {
    evidenceTypes: { quantitative: 1.0, case: 0.5 },
    categories: { data: 1.0, content: 0.5 },
    hint: '정량 KPI·연도별 통계 자산 인용',
  },
  problem: {
    evidenceTypes: { case: 1.0, structural: 0.8, quantitative: 0.5 },
    categories: { data: 0.8, methodology: 0.8, framework: 0.7, content: 0.5 },
    hint: 'Before 절박성 보강 — 알럼나이 사례·고객사 문제 데이터',
  },
  'before-after': {
    evidenceTypes: { case: 1.0, methodology: 1.0, structural: 0.6 },
    categories: { framework: 1.0, methodology: 0.9, content: 0.6, data: 0.5 },
    hint: 'After 변화 측정 가능한 프레임·SROI 산정 자산',
  },
  'key-messages': {
    evidenceTypes: { structural: 1.0, methodology: 0.8 },
    categories: { framework: 1.0, methodology: 0.7, content: 0.5 },
    hint: '메시지 구조 프레임 (제1원칙·완결성 3조건 등)',
  },
  differentiators: {
    evidenceTypes: { case: 1.0, structural: 1.0, methodology: 0.7 },
    categories: { product: 1.0, human: 1.0, content: 0.9, data: 0.5 },
    hint: '언더독스만의 자산 — 코치 풀·LMS·알럼나이·IMPACT 모듈',
  },
}

// ─────────────────────────────────────────
// 2. 추천 결과 타입
// ─────────────────────────────────────────

export interface AssetRecommendation {
  assetId: string
  name: string
  category: AssetCategory
  evidenceType: EvidenceType
  narrativeSnippet: string
  keyNumbers: string[]
  lens: string
  score: number
  reasons: string[]
  /**
   * P2 — 이 자산을 어느 SectionKey ('1'~'7') 에 넣으면 가장 자연스러운가.
   * lens 기반 default + 자산의 applicableSections 와 교차 검증.
   * UI 가 "+ 섹션 N 에 인용" 라벨로 표시 + 한 클릭 자동 추가.
   */
  suggestedSectionKey: '1' | '2' | '3' | '4' | '5' | '6' | '7'
}

// P2 — lens → 가장 적합한 섹션 매핑 (asset.applicableSections 와 교차해서 최종 결정)
const LENS_TO_DEFAULT_SECTION: Record<
  Exclude<InspectorIssue['lens'], 'tone'>,
  '1' | '2' | '3' | '4' | '5' | '6' | '7'
> = {
  market: '1', // 제안 배경 — 시장 통계
  statistics: '1', // 제안 배경 — 정량 수치
  problem: '1', // 제안 배경 — 문제정의
  'before-after': '6', // 임팩트 — Before/After
  'key-messages': '2', // 추진 전략 — 메시지 구조
  differentiators: '4', // 커리큘럼/코치 — 자체 자산 차별화
}

/** asset-registry 의 applicableSections → SectionKey 매핑 */
const ASSET_SECTION_KEY_MAP: Record<string, '1' | '2' | '3' | '4' | '5' | '6' | '7'> = {
  'proposal-background': '1',
  curriculum: '3',
  coaches: '4',
  budget: '5',
  impact: '6',
  'org-team': '7',
  other: '2',
}

function pickSuggestedSection(
  lens: Exclude<InspectorIssue['lens'], 'tone'>,
  applicableSections: string[],
): '1' | '2' | '3' | '4' | '5' | '6' | '7' {
  const lensDefault = LENS_TO_DEFAULT_SECTION[lens]
  // 자산의 applicableSections 중 lens default 가 있으면 우선
  for (const s of applicableSections) {
    const mapped = ASSET_SECTION_KEY_MAP[s]
    if (mapped === lensDefault) return mapped
  }
  // 아니면 자산의 첫 번째 applicableSections
  for (const s of applicableSections) {
    const mapped = ASSET_SECTION_KEY_MAP[s]
    if (mapped) return mapped
  }
  return lensDefault
}

// ─────────────────────────────────────────
// 3. 핵심 함수
// ─────────────────────────────────────────

interface RecommendParams {
  /** Inspector 가 약점이라고 본 lens 들 (낮은 순) */
  weakLenses: InspectorIssue['lens'][]
  /** 프로젝트 ProgramProfile (적합도 가산점) */
  programProfile?: ProgramProfile | null
  /** lens 당 최대 추천 개수 */
  topNPerLens?: number
  /** 전체 결과 cap */
  totalLimit?: number
  /** 채널 가중치 (Wave N4) */
  channel?: Channel
  /**
   * Wave N4 — 의미 매칭용 query 텍스트. 보통 draft.intent 또는 RFP 키워드.
   * 주어지면 vector cosine similarity 가 점수에 합산됨.
   */
  semanticQuery?: string
}

export async function recommendAssetsForWeakLenses(
  params: RecommendParams,
): Promise<AssetRecommendation[]> {
  const {
    weakLenses,
    programProfile,
    topNPerLens = 3,
    totalLimit = 6,
    channel,
    semanticQuery,
  } = params

  // tone lens 제거
  const targetLenses = weakLenses.filter(
    (l): l is Exclude<InspectorIssue['lens'], 'tone'> => l !== 'tone',
  )
  if (targetLenses.length === 0) return []

  // Wave N4 — semantic query → embedding (실패 시 vector 가산 0 으로 fallback)
  let queryVec: number[] | null = null
  if (semanticQuery && semanticQuery.trim().length > 0) {
    try {
      queryVec = await generateEmbedding(semanticQuery)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[asset-recommender] semantic query embedding 실패 (무시):', msg)
    }
  }

  // 한 번에 모든 stable 자산 로드 (자산 수 < 1000 가정)
  const dbAssets = await prisma.contentAsset.findMany({
    where: { status: 'stable' },
    select: {
      id: true,
      name: true,
      category: true,
      evidenceType: true,
      narrativeSnippet: true,
      keyNumbers: true,
      keywords: true,
      programProfileFit: true,
      applicableSections: true,
      valueChainStage: true,
      embedding: true,
      embeddingModel: true,
    },
  })

  // Wave N4 — Win/Loss 가산점 (자산별 wonProject ratio)
  // assetUsage 의 wonProject=true / 총 라벨 ≥3건 인 자산만 가산
  const winLossMap = await loadWinLossMap()

  // lens 별 dedup 위한 set
  const pickedAssetIds = new Set<string>()
  const results: AssetRecommendation[] = []

  for (const lens of targetLenses) {
    const profile = LENS_TO_ASSET_PROFILE[lens]
    const scored = dbAssets
      .map((asset) => {
        const evScore = profile.evidenceTypes[asset.evidenceType as EvidenceType] ?? 0
        const catScore = profile.categories[asset.category as AssetCategory] ?? 0
        if (evScore === 0 && catScore === 0) return null

        // 기본 점수: evidence (50%) + category (30%) + vector (20%)
        // vector 없으면 evidence/category 비중 75/25 (rescale)
        const base = 0.5 * evScore + 0.3 * catScore

        // ProgramProfile 적합도 가산점 (최대 +0.2)
        const profileBonus = computeProfileBonus(
          asset.programProfileFit as Partial<ProgramProfile> | null,
          programProfile,
        )

        // Wave N4 — vector 유사도 (queryVec 있고 자산 embedding 있을 때)
        let vectorScore = 0
        let vectorUsed = false
        if (
          queryVec &&
          Array.isArray(asset.embedding) &&
          asset.embedding.length > 0 &&
          asset.embeddingModel === EMBEDDING_MODEL_LABEL
        ) {
          vectorScore = Math.max(0, cosineSimilarity(queryVec, asset.embedding))
          vectorUsed = true
        }

        // Wave N4 — 채널 가중치 (자산 category 별)
        const chWeight = channel
          ? CHANNEL_ASSET_WEIGHTS[channel][asset.category as AssetCategory] ?? 1
          : 1

        // Wave N4 + C-7 — Win/Loss 가산점 (채널별 + time decay + Laplace smoothing)
        const wl = winLossMap.get(asset.id)
        const wlBonus = wl
          ? channel && wl.perChannel[channel] !== undefined
            ? wl.perChannel[channel]!
            : wl.overall
          : 0

        // 합산 — base * chWeight + vector + profile + winloss
        const raw =
          base * chWeight +
          0.2 * vectorScore +
          profileBonus +
          wlBonus
        const totalScore = Math.min(1, raw)

        const reasons: string[] = []
        if (evScore >= 0.8) reasons.push(`${EVIDENCE_LABEL[asset.evidenceType as EvidenceType] ?? asset.evidenceType} 자산`)
        if (catScore >= 0.8) reasons.push(`${CATEGORY_LABEL[asset.category as AssetCategory] ?? asset.category} 카테고리`)
        if (profileBonus >= 0.1) reasons.push('프로파일 강 적합')
        if (vectorUsed && vectorScore >= 0.6) reasons.push(`의미 유사도 ${Math.round(vectorScore * 100)}%`)
        if (chWeight > 1.1 && channel) reasons.push(`${channel} 채널 강 가중`)
        if (wlBonus > 0) {
          const channelLabel =
            channel && wl?.perChannel[channel] !== undefined
              ? `${channel} 채널`
              : '과거 사례'
          reasons.push(`${channelLabel} 학습 +${Math.round(wlBonus * 100)}%`)
        }

        return {
          asset,
          score: totalScore,
          reasons,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.score - a.score)

    let count = 0
    for (const { asset, score, reasons } of scored) {
      if (count >= topNPerLens) break
      if (pickedAssetIds.has(asset.id)) continue
      pickedAssetIds.add(asset.id)
      const applicable = (asset.applicableSections as string[]) ?? []
      results.push({
        assetId: asset.id,
        name: asset.name,
        category: asset.category as AssetCategory,
        evidenceType: asset.evidenceType as EvidenceType,
        narrativeSnippet: asset.narrativeSnippet,
        keyNumbers: ((asset.keyNumbers as string[]) ?? []) as string[],
        lens,
        score,
        reasons: [...reasons, profile.hint],
        suggestedSectionKey: pickSuggestedSection(lens, applicable),
      })
      count++
      if (results.length >= totalLimit) break
    }
    if (results.length >= totalLimit) break
  }

  return results.sort((a, b) => b.score - a.score)
}

// ─────────────────────────────────────────
// 4. 헬퍼 — programProfile 부분 일치 점수
// ─────────────────────────────────────────

/**
 * Wave N4 + C-7 (2026-05-15 후속) — 자산별 채널별 Win/Loss 가산점 맵.
 *
 * 룰:
 *  1. 채널별로 분리 (B2G · B2B · renewal) — 같은 자산이라도 채널마다 효력 다름
 *  2. Time decay — 최근 사용이 가산점에 더 강하게 영향 (half-life 1년)
 *  3. TechScore 가중 — 높은 점수로 수주된 자산은 더 강하게 학습
 *  4. Laplace smoothing — 표본 작을 때 극단값 방지 (α=1)
 *  5. 가산값: rate > 0.5 일 때 (rate-0.5) × 0.3 (max +0.15). 낮으면 0.
 *
 * 호출자가 project 의 channel 을 함께 주면 그 채널의 학습률 우선,
 * 없으면 overall (모든 채널 합산) 사용.
 */
interface ChannelWinRates {
  /** 채널별 가산점 (이미 weight 적용 + smoothing 처리됨) */
  perChannel: Partial<Record<Channel, number>>
  /** 채널 무관 overall (fallback) */
  overall: number
  /** 가중 표본 수 (UI 표시용) */
  effectiveSampleSize: number
}

async function loadWinLossMap(): Promise<Map<string, ChannelWinRates>> {
  // 라벨된 (wonProject 결정됨) 사용 이력만
  const rows = await prisma.assetUsage.findMany({
    where: { wonProject: { not: null } },
    select: {
      assetId: true,
      wonProject: true,
      channel: true,
      techScore: true,
      createdAt: true,
    },
  })
  if (rows.length === 0) return new Map()

  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000
  const HALF_LIFE_DAYS = 365 // 1년 반감기

  // 누적 (assetId, channel) 별
  type Acc = { weightedWins: number; weightedTotal: number; rawCount: number }
  const byChannel = new Map<string, Map<Channel | 'overall', Acc>>()

  for (const row of rows) {
    const ageDays = Math.max(0, (now - row.createdAt.getTime()) / DAY_MS)
    const timeWeight = Math.exp(-ageDays / HALF_LIFE_DAYS) // 1.0 ~ 0 (1yr=0.37, 2yr=0.13)

    // techScore 가중 (85+ 가 strong signal)
    const ts = row.techScore ?? null
    const tsWeight = ts == null ? 1 : ts >= 85 ? 1 : ts >= 70 ? 0.7 : 0.4

    const w = timeWeight * tsWeight
    const won = row.wonProject ? 1 : 0
    const ch =
      row.channel === 'B2G' || row.channel === 'B2B' || row.channel === 'renewal'
        ? (row.channel as Channel)
        : null

    if (!byChannel.has(row.assetId))
      byChannel.set(row.assetId, new Map())
    const m = byChannel.get(row.assetId)!

    // per channel
    if (ch) {
      const cur = m.get(ch) ?? { weightedWins: 0, weightedTotal: 0, rawCount: 0 }
      cur.weightedWins += w * won
      cur.weightedTotal += w
      cur.rawCount++
      m.set(ch, cur)
    }
    // overall (모든 채널 합)
    const o = m.get('overall') ?? { weightedWins: 0, weightedTotal: 0, rawCount: 0 }
    o.weightedWins += w * won
    o.weightedTotal += w
    o.rawCount++
    m.set('overall', o)
  }

  // Laplace smoothing + bonus 변환
  const ALPHA = 1
  const out = new Map<string, ChannelWinRates>()
  for (const [assetId, m] of byChannel) {
    const overallAcc = m.get('overall')
    if (!overallAcc || overallAcc.rawCount < 2) continue // 표본 너무 적으면 skip

    const smoothedRate = (acc: Acc) =>
      (acc.weightedWins + ALPHA) / (acc.weightedTotal + 2 * ALPHA)
    const toBonus = (rate: number) => Math.max(0, (rate - 0.5) * 0.3)

    const perChannel: Partial<Record<Channel, number>> = {}
    for (const ch of ['B2G', 'B2B', 'renewal'] as Channel[]) {
      const acc = m.get(ch)
      if (!acc || acc.rawCount < 2) continue
      perChannel[ch] = toBonus(smoothedRate(acc))
    }
    const overall = toBonus(smoothedRate(overallAcc))
    out.set(assetId, {
      perChannel,
      overall,
      effectiveSampleSize: overallAcc.weightedTotal,
    })
  }
  return out
}

function computeProfileBonus(
  assetFit: Partial<ProgramProfile> | null | undefined,
  projectProfile: ProgramProfile | null | undefined,
): number {
  if (!assetFit || !projectProfile) return 0

  // 단순 일치 카운트 / 비교 키 수 (최대 0.2)
  const keys = Object.keys(assetFit) as (keyof ProgramProfile)[]
  if (keys.length === 0) return 0

  let matched = 0
  let compared = 0
  for (const k of keys) {
    const av = assetFit[k]
    const pv = projectProfile[k]
    if (av === undefined || pv === undefined) continue
    compared++
    if (Array.isArray(av) && Array.isArray(pv)) {
      if (av.some((x) => pv.includes(x as never))) matched++
    } else if (av === pv) {
      matched++
    }
  }

  if (compared === 0) return 0
  return 0.2 * (matched / compared)
}

const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  quantitative: '정량',
  structural: '구조',
  case: '사례',
  methodology: '방법론',
}

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  methodology: '방법론',
  content: '콘텐츠',
  product: '프로덕트',
  human: '휴먼',
  data: '데이터',
  framework: '프레임워크',
}

/**
 * Inspector 리포트 → 약점 lens 배열 (낮은 점수 순, score < 60).
 *
 * lensScores 가 비어있으면 issues 의 severity 기반으로 추출.
 */
export function pickWeakLenses(
  report: { lensScores?: Record<string, number>; issues: InspectorIssue[] },
): InspectorIssue['lens'][] {
  // lensScores 가 채워져 있으면 점수 낮은 순
  if (report.lensScores && Object.keys(report.lensScores).length > 0) {
    return Object.entries(report.lensScores)
      .filter(([k, v]) => v < 60 && k !== 'tone' && k in LENS_TO_ASSET_PROFILE)
      .sort((a, b) => a[1] - b[1])
      .map(([k]) => k as InspectorIssue['lens'])
  }
  // fallback: issues 의 lens (critical → major → minor 순, dedup)
  const seen = new Set<string>()
  const sorted = [...report.issues].sort((a, b) => {
    const order = { critical: 0, major: 1, minor: 2 }
    return order[a.severity] - order[b.severity]
  })
  const out: InspectorIssue['lens'][] = []
  for (const iss of sorted) {
    if (iss.lens === 'tone') continue
    if (seen.has(iss.lens)) continue
    seen.add(iss.lens)
    out.push(iss.lens)
  }
  return out
}

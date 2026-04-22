/**
 * simulate-pm-guide.ts — Phase E pm-guide 유사도 매칭 시뮬레이션 (DB 없이)
 *
 * 목적:
 *   새 RFP 시나리오 3종에 대해 ProgramProfile 기반 유사도 매칭이
 *   실제로 PM 에게 도움이 되는 Top 5 레퍼런스를 만드는지 검증.
 *
 * 실행:
 *   npx tsx scripts/simulate-pm-guide.ts
 *
 * 구성:
 *   1) prisma/seed-program-profiles.ts 의 CASE_SEEDS 10건을 메모리로 로드
 *   2) 3개 시나리오(A/B/C) ProgramProfile 정의 → normalizeProfile 통과
 *   3) profileSimilarity() 로 Top 5 산출, 축별 기여도 분해 출력
 *   4) 제1원칙 렌즈 체크리스트 출력
 */

import {
  normalizeProfile,
  profileSimilarity,
  PROFILE_SIMILARITY_WEIGHTS,
  BUDGET_TIER_VALUES,
  type ProgramProfile,
  type BudgetTier,
} from '../src/lib/program-profile'
import { CASE_SEEDS } from '../prisma/seed-program-profiles'

// ─────────────────────────────────────────
// 축별 기여도 분해 (profileSimilarity 를 재현·분해)
// ─────────────────────────────────────────

interface AxisBreakdown {
  methodology: number
  businessDomain: number
  targetStage: number
  channel: number
  formats: number
  selection: number
  geography: number
  scale: number
  primaryImpact: number
  total: number
}

function axisBreakdown(a: ProgramProfile, b: ProgramProfile): AxisBreakdown {
  const w = PROFILE_SIMILARITY_WEIGHTS

  const exactAxis = (x: unknown, y: unknown) => (x === y ? 1 : 0)

  const jaccard = <T>(xs: T[], ys: T[]): number => {
    if (xs.length === 0 && ys.length === 0) return 1
    const sx = new Set(xs)
    const sy = new Set(ys)
    let intersect = 0
    sx.forEach((v) => {
      if (sy.has(v)) intersect++
    })
    const union = sx.size + sy.size - intersect
    return union === 0 ? 0 : intersect / union
  }

  const tierProximity = (
    xs: readonly BudgetTier[],
    av: BudgetTier,
    bv: BudgetTier,
  ): number => {
    const i = xs.indexOf(av)
    const j = xs.indexOf(bv)
    if (i < 0 || j < 0) return 0
    const dist = Math.abs(i - j)
    const maxDist = xs.length - 1
    return maxDist === 0 ? 1 : 1 - dist / maxDist
  }

  const sM = exactAxis(a.methodology.primary, b.methodology.primary)
  const sBD = jaccard(a.targetSegment.businessDomain, b.targetSegment.businessDomain)
  const sTS = exactAxis(a.targetStage, b.targetStage)
  const sCH =
    exactAxis(a.channel.type, b.channel.type) * 0.6 +
    exactAxis(a.channel.clientTier, b.channel.clientTier) * 0.4
  const sFM = jaccard(a.formats, b.formats)
  const sSL = exactAxis(a.selection.style, b.selection.style)
  const sGE = exactAxis(a.targetSegment.geography, b.targetSegment.geography)
  const sSC = tierProximity(BUDGET_TIER_VALUES, a.scale.budgetTier, b.scale.budgetTier)
  const sPI = jaccard(a.primaryImpact, b.primaryImpact)

  return {
    methodology: w.methodology * sM,
    businessDomain: w.businessDomain * sBD,
    targetStage: w.targetStage * sTS,
    channel: w.channel * sCH,
    formats: w.formats * sFM,
    selection: w.selection * sSL,
    geography: w.geography * sGE,
    scale: w.scale * sSC,
    primaryImpact: w.primaryImpact * sPI,
    total:
      w.methodology * sM +
      w.businessDomain * sBD +
      w.targetStage * sTS +
      w.channel * sCH +
      w.formats * sFM +
      w.selection * sSL +
      w.geography * sGE +
      w.scale * sSC +
      w.primaryImpact * sPI,
  }
}

// ─────────────────────────────────────────
// 3개 시나리오 정의
// ─────────────────────────────────────────

const NOW = new Date().toISOString()

/**
 * Scenario A — 로컬 상권 활성화 (강릉시)
 *   PM 직관: 서촌 로컬브랜드(#4) 또는 청년마을(#9) 이 Top 1 이어야 함
 */
const SCENARIO_A: ProgramProfile = normalizeProfile({
  targetStage: '비창업자',
  targetSegment: {
    demographic: ['상인', '일반소상공인'],
    businessDomain: ['유통/커머스', '식품/농업'],
    geography: '로컬',
  },
  scale: {
    budgetKrw: 400_000_000,
    budgetTier: '3-5억',
    participants: '20-50',
    durationMonths: 6,
  },
  formats: ['네트워킹', '페스티벌/축제'],
  delivery: {
    mode: '오프라인',
    usesLMS: true,
    onlineRatio: 10,
    usesAICoach: false,
  },
  supportStructure: {
    tasks: ['모객', '교류_네트워킹', '컨설팅_산출물', '행사_운영'],
    fourLayerSupport: false,
    coachingStyle: '1:1',
    externalSpeakers: true,
    externalSpeakerCount: 6,
    nonStartupSupport: {
      coordinationBody: '상인 협의체',
      domainPartners: ['강릉시 중심상권'],
    },
  },
  methodology: {
    primary: '로컬브랜드',
    impactModulesUsed: [],
  },
  selection: {
    style: '선정형_비경쟁',
    stages: 1,
    competitionRatio: '낮음_1:2이하',
    publicVoting: false,
    evaluatorCount: 4,
  },
  channel: {
    type: 'B2G',
    clientTier: '기초지자체',
    isRenewal: false,
  },
  primaryImpact: ['지역활성화'],
  aftercare: {
    hasAftercare: true,
    scope: ['alumni네트워크'],
    tierCount: 2,
  },
  version: '1.0',
  updatedAt: NOW,
})

/**
 * Scenario B — 전통 매듭 공예 디자인 공모전
 *   PM 직관: 한지 디자인 공모전(#6) 또는 관광기념품(#5) 이 Top 1
 */
const SCENARIO_B: ProgramProfile = normalizeProfile({
  targetStage: '비창업자',
  targetSegment: {
    demographic: ['디자이너', '장인'],
    businessDomain: ['문화/예술'],
    geography: '일반',
  },
  scale: {
    budgetKrw: 150_000_000,
    budgetTier: '1-3억',
    participants: '20-50',
    durationMonths: 6,
  },
  formats: ['공모전', '박람회/전시'],
  delivery: {
    mode: '오프라인',
    usesLMS: false,
    onlineRatio: 0,
    usesAICoach: false,
  },
  supportStructure: {
    tasks: ['모객', '심사_선발', '컨설팅_산출물'],
    fourLayerSupport: false,
    coachingStyle: '1:1',
    externalSpeakers: true,
    externalSpeakerCount: 5,
  },
  methodology: {
    primary: '공모전설계',
    impactModulesUsed: [],
  },
  selection: {
    style: '대중심사_병행',
    stages: 3,
    competitionRatio: '높음_1:6+',
    publicVoting: true,
    publicVotingWeight: 20,
    evaluatorCount: 25,
  },
  channel: {
    type: 'B2G',
    clientTier: '공공기관',
    isRenewal: false,
  },
  primaryImpact: ['매출/판로'],
  aftercare: {
    hasAftercare: true,
    scope: ['유통입점', 'alumni네트워크'],
    tierCount: 2,
  },
  version: '1.0',
  updatedAt: NOW,
})

/**
 * Scenario C — 예비창업 5기 IMPACT 부트캠프
 *   PM 직관: NH 애그테크(#1) 또는 GS리테일(#2) 이 Top 1
 */
const SCENARIO_C: ProgramProfile = normalizeProfile({
  targetStage: '예비창업_아이디어유',
  targetSegment: {
    demographic: ['무관'],
    businessDomain: ['ALL'],
    geography: '일반',
  },
  scale: {
    budgetKrw: 400_000_000,
    budgetTier: '3-5억',
    participants: '20-50',
    durationMonths: 6,
  },
  formats: ['데모데이', '네트워킹'],
  delivery: {
    mode: '하이브리드',
    usesLMS: true,
    onlineRatio: 40,
    usesAICoach: true,
  },
  supportStructure: {
    tasks: ['모객', '심사_선발', '멘토링_코칭', '행사_운영'],
    fourLayerSupport: true,
    coachingStyle: '1:1',
    externalSpeakers: true,
    externalSpeakerCount: 10,
  },
  methodology: {
    primary: 'IMPACT',
    impactModulesUsed: ['I-1', 'M-1', 'P-1', 'A-1', 'C-1', 'T-1'],
  },
  selection: {
    style: '서류+PT',
    stages: 2,
    competitionRatio: '중간_1:3-5',
    publicVoting: false,
    evaluatorCount: 5,
  },
  channel: {
    type: 'B2G',
    clientTier: '공공기관',
    isRenewal: false,
  },
  primaryImpact: ['역량개발', '투자유치'],
  aftercare: {
    hasAftercare: true,
    scope: ['투자연계', 'alumni네트워크'],
    tierCount: 2,
  },
  version: '1.0',
  updatedAt: NOW,
})

// ─────────────────────────────────────────
// 실행
// ─────────────────────────────────────────

interface RankedCase {
  caseName: string
  score: number
  breakdown: AxisBreakdown
  whyItWorks: string
  methodology: string
  domains: string[]
  stage: string
  channel: string
}

function rankScenario(scenario: ProgramProfile): RankedCase[] {
  const ranked = CASE_SEEDS.map(({ case: c }) => {
    const cProfile = normalizeProfile(c.profile)
    const breakdown = axisBreakdown(scenario, cProfile)
    const score = profileSimilarity(scenario, cProfile)
    return {
      caseName: c.sourceProject,
      score,
      breakdown,
      whyItWorks: c.whyItWorks,
      methodology: cProfile.methodology.primary,
      domains: cProfile.targetSegment.businessDomain,
      stage: cProfile.targetStage,
      channel: `${cProfile.channel.type}/${cProfile.channel.clientTier}${
        cProfile.channel.isRenewal ? ' (renewal)' : ''
      }`,
    }
  })
  ranked.sort((a, b) => b.score - a.score)
  return ranked
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}

function printAxis(key: keyof AxisBreakdown, v: number): string {
  if (key === 'total') return ''
  const w = PROFILE_SIMILARITY_WEIGHTS[key as keyof typeof PROFILE_SIMILARITY_WEIGHTS] ?? 0
  if (w === 0) return ''
  const pct = Math.round((v / w) * 100)
  return `${key}=${v.toFixed(3)}(${pct}%)`
}

function printScenario(name: string, expected: string, scenario: ProgramProfile): void {
  console.log('\n' + '═'.repeat(90))
  console.log(`시나리오 ${name}`)
  console.log('═'.repeat(90))
  console.log(
    `프로파일 요약: methodology=${scenario.methodology.primary} · stage=${scenario.targetStage}`,
  )
  console.log(
    `               channel=${scenario.channel.type}/${scenario.channel.clientTier}` +
      ` · geography=${scenario.targetSegment.geography}` +
      ` · budget=${scenario.scale.budgetTier}`,
  )
  console.log(`               domains=[${scenario.targetSegment.businessDomain.join(', ')}]`)
  console.log(`PM 직관 예측: ${expected}`)
  console.log()

  const ranked = rankScenario(scenario)
  const top5 = ranked.slice(0, 5)

  top5.forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.caseName}`)
    console.log(`      score=${r.score.toFixed(3)} · methodology=${r.methodology}` +
      ` · stage=${r.stage} · ${r.channel}`)

    const axes: Array<keyof AxisBreakdown> = [
      'methodology',
      'businessDomain',
      'targetStage',
      'channel',
      'formats',
      'selection',
      'geography',
      'scale',
      'primaryImpact',
    ]
    const contributing = axes
      .map((k) => printAxis(k, r.breakdown[k]))
      .filter((s) => s.length > 0 && !s.includes('=0.000'))
      .join(' · ')
    console.log(`      axes: ${contributing}`)
    console.log(`      why: ${truncate(r.whyItWorks, 180)}`)
    console.log()
  })

  console.log('  -- threshold check (minSimilarity=0.35) --')
  const above = ranked.filter((r) => r.score >= 0.35).length
  console.log(`     above 0.35: ${above}/${ranked.length}`)
  console.log(
    `     min in Top 5: ${top5[top5.length - 1]?.score.toFixed(3)}` +
      ` · max overall: ${ranked[0]?.score.toFixed(3)}`,
  )
}

console.log('┌' + '─'.repeat(88) + '┐')
console.log('│ Phase E pm-guide 시뮬레이션 — 3개 시나리오 × 10건 프로파일 유사도 매칭' + ' '.repeat(14) + '│')
console.log('│ seed: prisma/seed-program-profiles.ts (CASE_SEEDS, 10건)' + ' '.repeat(31) + '│')
console.log('│ weights: methodology 0.25 · bizDomain 0.15 · stage 0.15 · channel 0.10 ...' + ' '.repeat(13) + '│')
console.log('└' + '─'.repeat(88) + '┘')

printScenario('A (강릉 중심 상권 활성화)', '서촌 로컬브랜드(#4) or 청년마을(#9)', SCENARIO_A)
printScenario('B (전통 매듭 디자인 공모전)', '한지 공모전(#6) or 관광기념품(#5)', SCENARIO_B)
printScenario('C (경기창조경제 예비창업 5기)', 'NH 애그테크(#1) or GS리테일(#2)', SCENARIO_C)

console.log('\n' + '═'.repeat(90))
console.log('완료 — 3 시나리오 Top 5 산출')
console.log('═'.repeat(90))

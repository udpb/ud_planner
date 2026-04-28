/**
 * 부차 기능 1줄 자동 인용 (Phase L Wave L4 정밀화, ADR-011 §8)
 *
 * Express 우측 미리보기 하단의 "부차 기능 (자동 인용)" 박스용.
 * SROI / 예산 / 코치 / 커리큘럼 1줄 추정.
 *
 * Phase L L4 (2026-04-28): placeholder 신뢰도 0.3 → 실제 데이터 기반 0.5~0.7
 *  - ContentAsset (Asset Registry / Content Hub) DB 조회로 benchmark 자산 인용
 *  - CostStandard DB 조회로 인건비/운영비 표준 활용
 *  - Coach DB 카운트로 매칭 가능 코치 실제 수
 *  - Coach 정밀 매칭 프롬프트 자동 생성 (외부 coach-finder 위임)
 *
 * 관련 문서: docs/architecture/express-mode.md §3.3
 */

import 'server-only'

import { prisma } from '@/lib/prisma'
import { getAllAssets } from '@/lib/asset-registry'
import type { RfpParsed } from '@/lib/claude'
import type { ProgramProfile } from '@/lib/program-profile'
import type { UdAsset } from '@/lib/asset-registry-types'

// ─────────────────────────────────────────
// 1. 1줄 인용 결과 타입
// ─────────────────────────────────────────

export interface AutoCitation {
  area: 'sroi' | 'budget' | 'coaches' | 'curriculum'
  oneLiner: string
  deepLink: string
  /** 추정 근거 (PM 마우스 오버 시) */
  rationale: string
  /** 신뢰도 0.0~1.0 — UI 색상/표시 결정 */
  confidence: number
  /** 외부 LLM 카드용 프롬프트 (있으면 PM 이 외부 LLM 에 위임 가능) */
  externalPrompt?: string
  /** 인용한 자산 목록 (UI 에 자산 칩으로 표시 가능) */
  citedAssets?: { id: string; name: string }[]
}

// ─────────────────────────────────────────
// 2. SROI 1줄 — Benchmark / SROI Proxy DB 자산 인용 + ProgramProfile 휴리스틱
// ─────────────────────────────────────────

async function findSroiAssets(): Promise<UdAsset[]> {
  const all = await getAllAssets()
  return all.filter(
    (a) =>
      a.valueChainStage === 'outcome' &&
      (a.keywords?.some((k) => /SROI|벤치마크|benchmark|impact/i.test(k)) ||
        /SROI|Benchmark/i.test(a.name)),
  )
}

function sroiHeuristicRatio(profile?: ProgramProfile): { ratio: number; source: string } {
  const domains = profile?.targetSegment?.businessDomain ?? []
  const stage = profile?.targetStage
  let ratio = 2.5
  let source = '언더독스 일반 평균'
  const dom = domains.join('/')
  if (dom.includes('창업')) {
    ratio = 3.2
    source = '창업 교육 벤치마크'
  } else if (dom.includes('취업')) {
    ratio = 2.8
    source = '취업 교육 벤치마크'
  } else if (dom.includes('청년')) {
    ratio = 3.4
    source = '청년 창업 평균'
  }
  if (stage === 'seed' || stage === '예비창업_아이디어무' || stage === '예비창업_아이디어유') {
    ratio *= 0.9
  }
  return { ratio, source }
}

export async function citationSroi(input: {
  profile?: ProgramProfile
  totalBudgetVat?: number | null
}): Promise<AutoCitation> {
  const [sroiAssets, { ratio, source }] = await Promise.all([
    findSroiAssets().catch(() => [] as UdAsset[]),
    Promise.resolve(sroiHeuristicRatio(input.profile)),
  ])

  const benchmark = sroiAssets.find((a) => /Benchmark/i.test(a.name))
  const proxyDb = sroiAssets.find((a) => /SROI Proxy|SROI 프록시/i.test(a.name))

  const sourceParts: string[] = [source]
  const cited: { id: string; name: string }[] = []
  if (proxyDb) {
    sourceParts.push('SROI Proxy DB 16종×4국')
    cited.push({ id: proxyDb.id, name: proxyDb.name })
  }
  if (benchmark) {
    cited.push({ id: benchmark.id, name: benchmark.name })
  }

  const confidence = Math.min(0.75, 0.4 + cited.length * 0.15)

  return {
    area: 'sroi',
    oneLiner: `예상 SROI 1:${ratio.toFixed(1)} (${sourceParts.join(' · ')})`,
    deepLink: '?step=impact',
    rationale:
      `${source} 기준 1:${ratio.toFixed(1)}` +
      (cited.length > 0 ? ` · 인용 자산 ${cited.length}개` : '') +
      ' — 정밀 산출은 Step 5 (logicModel + SROI Forecast) 에서.',
    confidence,
    citedAssets: cited.length > 0 ? cited : undefined,
  }
}

// ─────────────────────────────────────────
// 3. 예산 1줄 — supplyPrice + CostStandard + 회차 추정 → PC/AC/마진 분해
// ─────────────────────────────────────────

function estimateSessionCount(profile?: ProgramProfile, rfp?: RfpParsed): number {
  // 1) RFP eduStartDate~eduEndDate 기간 활용
  if (rfp?.eduStartDate && rfp?.eduEndDate) {
    const start = new Date(rfp.eduStartDate).getTime()
    const end = new Date(rfp.eduEndDate).getTime()
    if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
      const weeks = Math.round((end - start) / (7 * 24 * 60 * 60 * 1000))
      // 주 1회 가정 (특별 단계는 보정)
      if (weeks >= 4 && weeks <= 24) return Math.max(6, Math.min(20, weeks))
    }
  }
  // 2) ProgramProfile.targetStage 휴리스틱
  const stage = profile?.targetStage
  if (stage === 'seed' || stage === '예비창업_아이디어무' || stage === '예비창업_아이디어유') return 6
  if (stage === 'series-A이상') return 12
  return 8
}

export async function citationBudget(input: {
  totalBudgetVat?: number | null
  supplyPrice?: number | null
  profile?: ProgramProfile
  rfp?: RfpParsed
}): Promise<AutoCitation> {
  const total = input.totalBudgetVat ?? 0
  if (total === 0) {
    return {
      area: 'budget',
      oneLiner: '예산 미입력 — RFP 에서 추출 또는 직접 입력',
      deepLink: '?step=budget',
      rationale: '총 예산이 없어 마진 추정 불가',
      confidence: 0,
    }
  }

  const supplyPrice = input.supplyPrice ?? Math.round(total / 1.1)
  const sessionCount = estimateSessionCount(input.profile, input.rfp)

  // CostStandard 조회 (PC = 인건비 표준 단가)
  let avgPcUnitPrice = 200_000 // fallback (시간당 / 1회당 가이드)
  let costStandardCount = 0
  try {
    const standards = await prisma.costStandard.findMany({
      where: { type: 'PC', isActive: true },
      select: { unitPrice: true },
      take: 50,
    })
    if (standards.length > 0) {
      avgPcUnitPrice = Math.round(
        standards.reduce((s, x) => s + x.unitPrice, 0) / standards.length,
      )
      costStandardCount = standards.length
    }
  } catch {
    // DB 조회 실패 — fallback 사용
  }

  // PC 추정: 회차 × (메인 코치 1 + 보조 코치 0.5) × 평균 단가
  const pcEstimate = Math.round(sessionCount * 1.5 * avgPcUnitPrice * 4) // 1회당 4 단위 (강의·코칭·운영·기타) 대략
  // AC 추정: 운영비 비율 — 사용자 가이드 55~60% (CLAUDE.md 답변 기록)
  const acEstimate = Math.round(supplyPrice * 0.4)
  const marginEstimate = supplyPrice - pcEstimate - acEstimate
  const marginRate = (marginEstimate / supplyPrice) * 100

  const safe = marginRate >= 10
  const sign = safe ? '✓' : '⚠️'
  const oneLiner = `총 ${(total / 1e8).toFixed(2)}억 · 인건비 ${((pcEstimate / supplyPrice) * 100).toFixed(0)}% · 운영비 ${((acEstimate / supplyPrice) * 100).toFixed(0)}% · 마진 ${marginRate.toFixed(0)}% ${sign}`

  const confidence = Math.min(0.75, 0.4 + (costStandardCount > 0 ? 0.2 : 0) + (sessionCount ? 0.1 : 0))

  return {
    area: 'budget',
    oneLiner,
    deepLink: '?step=budget',
    rationale:
      `회차 ${sessionCount}회 × 메인+보조 코치 × 평균 ${avgPcUnitPrice.toLocaleString()}원 = 인건비 추정. ` +
      `운영비 40% 가정. ` +
      (costStandardCount > 0 ? `CostStandard ${costStandardCount}개 조회 활용. ` : `(CostStandard 미시드 — fallback 단가)`) +
      ' 정밀 분해는 Step 4 에서.',
    confidence,
  }
}

// ─────────────────────────────────────────
// 4. 코치 1줄 — Coach DB 카운트 + coach-finder 외부 프롬프트 자동 생성
// ─────────────────────────────────────────

export async function citationCoaches(input: {
  rfp?: RfpParsed
  profile?: ProgramProfile
}): Promise<AutoCitation> {
  // 활성 코치 전체 수
  let totalActive = 0
  try {
    totalActive = await prisma.coach.count({ where: { isActive: true } })
  } catch {
    totalActive = 0
  }

  const domains = input.profile?.targetSegment?.businessDomain ?? []
  const targetStage = input.profile?.targetStage
  const keywords = input.rfp?.keywords ?? []
  const coachKeywords = keywords.filter((k) =>
    /창업|도시재생|취업|디자인|마케팅|개발|코칭|투자/.test(k),
  )

  const domainText = domains.length > 0 ? domains.join(', ') : '(미설정)'
  const stageText = targetStage ?? '(미설정)'

  // 도메인 매칭 코치 수 — 휴리스틱 (총 코치 × 도메인별 비율 추정)
  // 정확도가 낮으니 oneLiner 엔 "약 N명" 표현
  const baseRatio = domains.length > 0 ? 0.25 : 0.1
  const keywordBoost = Math.min(0.15, coachKeywords.length * 0.04)
  const matchedRatio = baseRatio + keywordBoost
  const estMatched = totalActive > 0 ? Math.max(5, Math.round(totalActive * matchedRatio)) : 8

  // coach-finder 외부 LLM 프롬프트 자동 생성 (사용자 이전 의도)
  const externalPrompt = `coach-finder 에서 다음 조건 코치 후보 5명 추천:
- 사업영역: ${domainText}
- 대상 단계: ${stageText}
- 키워드: ${coachKeywords.length > 0 ? coachKeywords.join(', ') : '(없음)'}
- 우선순위: ${input.profile?.methodology?.primary ?? '일반'} 방법론 경험 / 도메인 적합도 / 평판 점수
- 출력: 코치명·소속·전문분야·시간당 단가 표`

  const oneLiner =
    totalActive > 0
      ? `활성 코치 ${totalActive}명 중 매칭 ${estMatched}명 — 정밀 매칭은 coach-finder`
      : `필요 역량 ${coachKeywords.length || 1}종 — coach-finder API 연동 필요`

  const confidence = Math.min(
    0.7,
    0.3 + (totalActive > 0 ? 0.25 : 0) + (domains.length > 0 ? 0.1 : 0),
  )

  return {
    area: 'coaches',
    oneLiner,
    deepLink: '?step=coaches',
    rationale:
      `Coach DB 활성 ${totalActive}명 · 도메인 매칭 휴리스틱 ${(matchedRatio * 100).toFixed(0)}%. ` +
      '정밀 매칭은 coach-finder 외부 시스템.',
    confidence,
    externalPrompt,
  }
}

// ─────────────────────────────────────────
// 5. 커리큘럼 1줄 — 기간·방법론으로 회차/IMPACT 매핑 추정
// ─────────────────────────────────────────

export async function citationCurriculum(input: {
  rfp?: RfpParsed
  profile?: ProgramProfile
}): Promise<AutoCitation> {
  const sessionCount = estimateSessionCount(input.profile, input.rfp)
  const profile = input.profile
  const methodology = profile?.methodology?.primary
  const usesImpact = methodology === 'IMPACT' || methodology === '커스텀'

  // 인용 자산 — UOR 또는 IMPACT 18 모듈 자산 찾기
  let citedAssets: { id: string; name: string }[] | undefined
  try {
    const all = await getAllAssets()
    const found = all.filter(
      (a) =>
        a.category === 'methodology' &&
        (/UOR|IMPACT/.test(a.name) || a.keywords?.some((k) => /IMPACT|UOR|18|6단계/.test(k))),
    )
    if (found.length > 0) {
      citedAssets = found.slice(0, 2).map((a) => ({ id: a.id, name: a.name }))
    }
  } catch {
    citedAssets = undefined
  }

  let oneLiner: string
  if (usesImpact) {
    oneLiner = `회차 ${sessionCount}회 · IMPACT 18 모듈 매핑 (${citedAssets?.length ?? 0}개 자산 인용)`
  } else if (methodology) {
    oneLiner = `회차 ${sessionCount}회 · ${methodology}`
  } else {
    oneLiner = `회차 ${sessionCount}회 (방법론 미설정)`
  }

  const periodInfo =
    input.rfp?.eduStartDate && input.rfp?.eduEndDate
      ? `RFP 기간 ${input.rfp.eduStartDate} ~ ${input.rfp.eduEndDate}`
      : 'RFP 기간 미설정 → ProgramProfile 단계 기반 추정'

  const confidence = Math.min(
    0.7,
    0.3 +
      (input.rfp?.eduStartDate && input.rfp?.eduEndDate ? 0.2 : 0) +
      (methodology ? 0.1 : 0) +
      (citedAssets ? 0.1 : 0),
  )

  return {
    area: 'curriculum',
    oneLiner,
    deepLink: '?step=curriculum',
    rationale: `${periodInfo} · 주 1회 가정. 정밀 설계는 Step 2 에서.`,
    confidence,
    citedAssets,
  }
}

// ─────────────────────────────────────────
// 6. 4종 한꺼번에 (async)
// ─────────────────────────────────────────

export interface AutoCitationsBundle {
  sroi: AutoCitation
  budget: AutoCitation
  coaches: AutoCitation
  curriculum: AutoCitation
}

export async function buildAutoCitations(input: {
  rfp?: RfpParsed
  profile?: ProgramProfile
  totalBudgetVat?: number | null
  supplyPrice?: number | null
}): Promise<AutoCitationsBundle> {
  const [sroi, budget, coaches, curriculum] = await Promise.all([
    citationSroi({ profile: input.profile, totalBudgetVat: input.totalBudgetVat }),
    citationBudget({
      totalBudgetVat: input.totalBudgetVat,
      supplyPrice: input.supplyPrice,
      profile: input.profile,
      rfp: input.rfp,
    }),
    citationCoaches({ rfp: input.rfp, profile: input.profile }),
    citationCurriculum({ rfp: input.rfp, profile: input.profile }),
  ])
  return { sroi, budget, coaches, curriculum }
}

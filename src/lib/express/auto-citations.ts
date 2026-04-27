/**
 * 부차 기능 1줄 자동 인용 (Phase L Wave L4 placeholder, ADR-011 §8)
 *
 * Express 우측 미리보기 하단의 "부차 기능 (자동 인용)" 박스용.
 * SROI / 예산 / 코치 / 커리큘럼 1줄 추정.
 *
 * 본 파일은 L2 PoC 시점엔 placeholder 수준 — 자료가 부족하면 솔직히 "추정 미준비".
 * L4 에서 본격 산출.
 *
 * 관련 문서: docs/architecture/express-mode.md §3.3
 */

import 'server-only'

import type { RfpParsed } from '@/lib/claude'
import type { ProgramProfile } from '@/lib/program-profile'

// ─────────────────────────────────────────
// 1. 1줄 인용 결과 타입
// ─────────────────────────────────────────

export interface AutoCitation {
  /** 어떤 영역의 인용인지 */
  area: 'sroi' | 'budget' | 'coaches' | 'curriculum'
  /** 우측 미리보기 표시 한 줄 */
  oneLiner: string
  /** Deep 어디로 이동할지 */
  deepLink: string
  /** 추정의 근거 (PM 이 마우스 오버 시 보임) */
  rationale: string
  /** 신뢰도 — placeholder 인 경우 0.3 미만 */
  confidence: number
}

// ─────────────────────────────────────────
// 2. SROI 1줄 — 벤치마크 기반
// ─────────────────────────────────────────

export function citationSroi(input: {
  profile?: ProgramProfile
  totalBudgetVat?: number | null
}): AutoCitation {
  // PoC: ProgramProfile 의 사업영역에 따라 휴리스틱 추정
  // (Phase F 의 benchmark SROI 자산이 있으면 거기서 가져오는 게 더 정확하지만 PoC 는 간단히)
  const domains = input.profile?.targetSegment?.businessDomain ?? []
  const stage = input.profile?.targetStage

  // 휴리스틱 베이스
  let baseRatio = 2.5
  let source = '언더독스 일반 평균'

  const domainStr = domains.join('/')
  if (domainStr.includes('창업')) {
    baseRatio = 3.2
    source = '창업 교육 벤치마크'
  } else if (domainStr.includes('취업')) {
    baseRatio = 2.8
    source = '취업 교육 벤치마크'
  } else if (domainStr.includes('청년')) {
    baseRatio = 3.4
    source = '청년 창업 평균'
  }

  if (stage === 'seed' || stage === '예비창업_아이디어무' || stage === '예비창업_아이디어유') {
    baseRatio *= 0.9 // 초기 단계는 보통 outcome 누적이 덜 됨
  }

  const oneLiner = `예상 SROI 1:${baseRatio.toFixed(1)} (${source})`
  return {
    area: 'sroi',
    oneLiner,
    deepLink: '?step=impact',
    rationale: `${source} 기준 1:${baseRatio.toFixed(1)} — 정밀 산출은 Step 5 에서.`,
    confidence: 0.3, // placeholder
  }
}

// ─────────────────────────────────────────
// 3. 예산 1줄 — 마진 안전성
// ─────────────────────────────────────────

export function citationBudget(input: {
  totalBudgetVat?: number | null
  profile?: ProgramProfile
}): AutoCitation {
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

  // 실비 비율 휴리스틱: 55~60% 가이드 (CLAUDE.md 의 사용자 답변)
  const supplyPrice = total / 1.1 // VAT 제외
  const expectedAcRate = 0.575 // 중간값
  const expectedAc = supplyPrice * expectedAcRate
  const expectedMargin = supplyPrice - expectedAc
  const marginRate = (expectedMargin / supplyPrice) * 100

  const safe = marginRate >= 30
  const oneLiner = safe
    ? `총 예산 ${(total / 1e8).toFixed(2)}억, 예상 마진 ${marginRate.toFixed(0)}% (안전 ✓)`
    : `총 예산 ${(total / 1e8).toFixed(2)}억, 마진 ${marginRate.toFixed(0)}% (확인 필요 ⚠️)`

  return {
    area: 'budget',
    oneLiner,
    deepLink: '?step=budget',
    rationale: `실비 비율 55~60% 가정. 정밀 분해는 Step 4 에서.`,
    confidence: 0.4,
  }
}

// ─────────────────────────────────────────
// 4. 코치 1줄 — 매칭 가능 코치 수 추정
// ─────────────────────────────────────────

export function citationCoaches(input: {
  rfp?: RfpParsed
  profile?: ProgramProfile
}): AutoCitation {
  // PoC: ProgramProfile 의 businessDomain 으로 추정 (실제 coach DB 조회는 L4)
  const domains = input.profile?.targetSegment?.businessDomain ?? []
  const keywords = input.rfp?.keywords ?? []
  const coachKeywords = keywords.filter((k) =>
    /창업|도시재생|취업|디자인|마케팅|개발|코칭/.test(k),
  )

  // 휴리스틱: 도메인이 명확하면 매칭 코치 추정 +20명
  const baseCount = domains.length > 0 ? 20 : 8
  const keywordBonus = coachKeywords.length * 4
  const estCount = Math.min(80, baseCount + keywordBonus)

  return {
    area: 'coaches',
    oneLiner: `필요 역량 ${coachKeywords.length || 1}종 — 매칭 가능 코치 약 ${estCount}명`,
    deepLink: '?step=coaches',
    rationale: 'coach-finder DB 매칭 휴리스틱 — 정밀 배정은 Step 3 에서.',
    confidence: 0.3,
  }
}

// ─────────────────────────────────────────
// 5. 커리큘럼 1줄 — 회차 / IMPACT 매핑
// ─────────────────────────────────────────

export function citationCurriculum(input: {
  rfp?: RfpParsed
  profile?: ProgramProfile
}): AutoCitation {
  const profile = input.profile
  const stage = profile?.targetStage
  const isEarly =
    stage === 'seed' ||
    stage === '예비창업_아이디어무' ||
    stage === '예비창업_아이디어유'
  const sessionGuess = isEarly ? 6 : 8
  const methodology = profile?.methodology?.primary
  const usesImpact = methodology === 'IMPACT' || methodology === '커스텀'

  const oneLiner = usesImpact
    ? `회차 ${sessionGuess}회 · IMPACT 6단계 매핑 (예상)`
    : `회차 ${sessionGuess}회 · ${methodology ?? '방법론 미설정'}`

  return {
    area: 'curriculum',
    oneLiner,
    deepLink: '?step=curriculum',
    rationale: 'ProgramProfile 단서로 회차 추정 — 정밀 설계는 Step 2 에서.',
    confidence: 0.3,
  }
}

// ─────────────────────────────────────────
// 6. 4종 한꺼번에
// ─────────────────────────────────────────

export interface AutoCitationsBundle {
  sroi: AutoCitation
  budget: AutoCitation
  coaches: AutoCitation
  curriculum: AutoCitation
}

export function buildAutoCitations(input: {
  rfp?: RfpParsed
  profile?: ProgramProfile
  totalBudgetVat?: number | null
}): AutoCitationsBundle {
  return {
    sroi: citationSroi({ profile: input.profile, totalBudgetVat: input.totalBudgetVat }),
    budget: citationBudget({ totalBudgetVat: input.totalBudgetVat, profile: input.profile }),
    coaches: citationCoaches({ rfp: input.rfp, profile: input.profile }),
    curriculum: citationCurriculum({ rfp: input.rfp, profile: input.profile }),
  }
}

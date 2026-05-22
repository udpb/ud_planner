/**
 * Query Variation — F3 (Wave V, ADR-015)
 *
 * AutoResearch 의 정형화 회피 핵심 메커니즘.
 * 같은 topic 이라도 universe·channel·region·attempt 별로 query 변주.
 *
 * pure function.
 */

import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ActpreneurUniverse } from '@/lib/program-profile'

/**
 * universe 별 hook 단어 (검색 쿼리에 universe 특성 반영)
 */
const UNIVERSE_HOOKS: Record<ActpreneurUniverse, string> = {
  startup: '스타트업 생존율 실행률 데스밸리 피벗',
  sme: '소상공인 소기업 디지털 전환 DX 성장',
  'local-creator': '지역 소멸 로컬 크리에이터 정주형 자생력',
  'culture-1person': '1인 창조기업 솔로프러너 크리에이터 이코노미 IP',
  'hr-corporate': '사내 혁신 신사업 애자일 인재',
  senior: '시니어 은퇴 실버 이코노미 경험 자본',
  'next-gen': '청년 청소년 미래 직업 교육 혁신',
  'di-inclusive': '다양성 포용 임팩트 투자 ESG',
  'global-innovator': '글로벌 크로스보더 해외 진출 스케일업 아시아',
}

/**
 * 채널 별 hook 단어
 */
const CHANNEL_HOOKS: Record<string, string> = {
  B2G: '정부 정책 예산 지원사업 KPI',
  B2B: '기업 시장 규모 도입률 ROI',
  renewal: '작년 성과 우수 사례 벤치마크 재계약',
}

export interface QueryVariationInput {
  /** AI 가 결정한 검색 topic (예: "청년 창업 시장 통계") */
  topic: string
  rfp: RfpParsed
  universes: ActpreneurUniverse[]
  /** 1 = 정공법 / 2 = 우회 (아시아 확장) / 3 = 글로벌 시장 규모 */
  attempt: number
}

/**
 * 검색 query 1~2개 생성.
 *
 * attempt 1: 한국 + universe + region (가장 좁고 정확)
 * attempt 2: 아시아 + channel + 발주처 사례
 * attempt 3: 글로벌 + universe 핵심어 + 시장 규모
 *
 * 같은 RFP·universe 라도 attempt 별로 query 텍스트 명확히 다름 (정형화 회피).
 */
export function buildSearchQueries(input: QueryVariationInput): string[] {
  const { topic, rfp, universes, attempt } = input

  const primaryUniverse = universes[0]
  const universeHook = primaryUniverse ? UNIVERSE_HOOKS[primaryUniverse] : ''
  const channel = rfp.projectType ?? 'B2G'
  const channelHook = CHANNEL_HOOKS[channel] ?? ''
  const region = rfp.region ?? '한국'
  const clientShort = (rfp.client ?? '').slice(0, 6)

  // attempt 별 query 변주 — 같은 topic·universe 라도 다른 텍스트
  switch (attempt) {
    case 1: {
      // 정공법 — 한국 + universe + region + topic
      const q1 = `${topic} ${universeHook.split(' ').slice(0, 2).join(' ')} ${region} 통계 2024`
      return [q1.trim()]
    }
    case 2: {
      // 우회 — 채널 + 아시아 + 발주처 사례
      const q1 = `${topic} ${channelHook.split(' ').slice(0, 2).join(' ')} 아시아 ${clientShort} 사례`
      return [q1.trim()]
    }
    case 3: {
      // 글로벌 시장 규모 fallback
      const universeWord = universeHook.split(' ')[0] || '창업'
      const q1 = `${topic} 글로벌 ${universeWord} 시장 규모 전망 2030`
      return [q1.trim()]
    }
    default: {
      // attempt > 3 (defensive) — base query
      return [`${topic} ${region} 통계`]
    }
  }
}

/**
 * Tier 1 매칭용 키워드 생성 — findMatchingStats 의 keywords 파라미터에 전달.
 *
 * RFP keywords + topic 의 의미 단어 추출.
 */
export function buildCacheMatchKeywords(input: {
  topic: string
  rfp: RfpParsed
}): string[] {
  const { topic, rfp } = input
  // topic 을 토큰 분해 + RFP keywords 결합
  const topicTokens = topic.split(/[\s,·/]+/).filter((s) => s.length >= 2)
  const rfpKeywords = rfp.keywords ?? []
  // 중복 제거
  return Array.from(new Set([...topicTokens, ...rfpKeywords]))
}

/**
 * Data Center Stats Cache — Wave V / F1.5 (2026-05-20)
 *
 * 언더독스 데이터 센터 2026 운영계획안 + 연구기획안 의 통계·시장 데이터를
 * 9 타깃(액트프러너 유니버스) × 5 카테고리 매트릭스로 정리.
 *
 * F3 (외부 리서치 자동) 가 외부 LLM 호출 전 먼저 매칭 시도 — 이미 검증된
 * 내부 통계 우선 활용으로 외부 의존 ↓, 인용 신뢰도 ↑.
 *
 * 모든 통계는 외부 출처 명시 (DataCenterStat.source).
 */

// ─────────────────────────────────────────
// 1. 타입
// ─────────────────────────────────────────

/** 9 액트프러너 유니버스 (PDF "운영계획안" + "연구기획안" 통합) */
export type ActpreneurUniverse =
  // Core 4 (핵심 비즈니스 타깃)
  | 'startup' // 1. 스타트업
  | 'sme' // 2. SME (소상공인·소공인·소기업)
  | 'local-creator' // 3. 로컬 크리에이터 (정주형)
  | 'culture-1person' // 4. 1인 창작·문화예술
  // Strategic 5 (미래 전략·ESG 타깃)
  | 'hr-corporate' // 5. HR 인재 (사내 혁신가)
  | 'senior' // 6. 시니어 (은퇴 후 창업가)
  | 'next-gen' // 7. 다음세대 (예비 혁신가·청소년)
  | 'di-inclusive' // 8. D&I 기반 (포용적 실행가)
  | 'global-innovator' // 9. 글로벌 혁신가 (크로스보더)

/** 통계 카테고리 5종 */
export type StatCategory =
  | 'survival' // 생존율·실행률
  | 'market-size' // 시장 규모
  | 'transformation' // 전환·도입률 (DX, 혁신 등)
  | 'policy' // 정책·정부 동향
  | 'trend' // 트렌드·미래 전망

export interface DataCenterStat {
  /** 고유 id — 향후 inline citation 마커에 사용 */
  id: string
  /** 9 타깃 中 어느 곳에 해당하는지 (복수 가능) */
  universes: ActpreneurUniverse[]
  /** 카테고리 */
  category: StatCategory
  /** 한 줄 헤드라인 (예: "스타트업 5년 생존율 약 34%") */
  headline: string
  /** 정량 수치 (예: "34%") */
  value: string
  /** 부연 설명 (1~2 문장) */
  description: string
  /** 외부 출처 */
  source: string
  /** 출처 연도 (YYYY 또는 YYYY.MM) — inline citation 마커 표기에 사용 */
  year: string
  /** 매칭 시 도움 되는 키워드 (RFP keywords 와 비교용) */
  keywords: string[]
}

// ─────────────────────────────────────────
// 2. Stat catalog (PDF 02.연구기획안 §3.2~3.3 + 운영계획안 §1.1)
// ─────────────────────────────────────────

export const DATA_CENTER_STATS: DataCenterStat[] = [
  // ══ Core 4 — 스타트업 ══
  {
    id: 'dc-startup-survival-5yr',
    universes: ['startup'],
    category: 'survival',
    headline: '국내 스타트업 5년 생존율 약 34%',
    value: '34%',
    description:
      '국내 스타트업 5년 생존율은 약 34%. 자본에 의존해 외형을 키우던 시대를 지나 척박한 투자 혹한기 속에서 피벗을 거듭하며 자생력을 입증하는 실행력이 기업 생존과 직결되는 최우선 역량으로 대두.',
    source: '통계청 기업생멸행정통계 + 중기부 2024 벤처투자 동향',
    year: '2024',
    keywords: ['스타트업', '생존율', '피벗', '데스밸리', '실행력', '자생력'],
  },

  // ══ Core 4 — SME ══
  {
    id: 'dc-sme-dx-transformation',
    universes: ['sme'],
    category: 'transformation',
    headline: '소상공인·소기업 디지털 전환(DX) 달성률 30% 미만',
    value: '30% 미만',
    description:
      '국내 소상공인·소기업은 전체 기업의 90% 이상을 차지하나, 디지털 전환(DX) 및 성공적 피벗 달성률은 30%를 밑돌고 있음. 정부 지원금 의존을 넘어 기존 관성을 깨는 풀뿌리 실행 DNA 가 영세 환경의 유일한 생존 전략.',
    source: '맥킨지 SME DX 진단 + 중기부 2024 소상공인 실태조사',
    year: '2024',
    keywords: ['SME', '소상공인', '소기업', 'DX', '디지털 전환', '풀뿌리'],
  },

  // ══ Core 4 — 로컬 크리에이터 ══
  {
    id: 'dc-local-extinction-risk',
    universes: ['local-creator'],
    category: 'policy',
    headline: '전국 228개 시군구 중 57%가 소멸 위험 지역',
    value: '57%',
    description:
      '전국 228개 시군구 중 57%가 소멸 위험 지역으로 진입(한국고용정보원, 2024). 하드웨어 중심 지원의 한계를 넘어 지역 현장에서 직접 문제를 해결하고 자립하는 사람 중심의 생존력이 지방 소멸을 막을 최전선의 대안.',
    source: '한국고용정보원 지방소멸 2024',
    year: '2024',
    keywords: ['지역', '로컬', '지방소멸', '소멸위험', '시군구', '정주형'],
  },

  // ══ Core 4 — 1인 창작·문화예술 ══
  {
    id: 'dc-creator-economy-480b',
    universes: ['culture-1person'],
    category: 'market-size',
    headline: '글로벌 크리에이터 이코노미 $480B (2027 전망)',
    value: '$480B',
    description:
      '글로벌 크리에이터 이코노미는 2027년 4,800억 달러 규모로 전망. 국내 1인 창조기업은 100만 개 돌파. 단순 창작을 넘어 마이크로 팬덤을 구축하고 스스로 비즈니스 모델을 설계해 생존하는 솔로프러너 실행력이 필수.',
    source: '중기부 2024 1인 창조기업 실태조사 + Statista 2027 전망',
    year: '2024',
    keywords: ['1인 창조기업', '크리에이터', '솔로프러너', '문화예술', '팬덤'],
  },

  // ══ Strategic 5 — HR 인재 ══
  {
    id: 'dc-hr-innovation-gap',
    universes: ['hr-corporate'],
    category: 'transformation',
    headline: '경영진 84% 혁신 강조 vs 만족도 6% (맥킨지)',
    value: '84% vs 6%',
    description:
      '글로벌 경영진의 84%가 혁신을 강조하나, 실제 조직의 혁신 성과 만족도는 6%에 불과(맥킨지). 수동적 업무 태도로 인한 경제 손실을 막기 위해, 현장의 변수를 직접 통제하는 애자일 실행가 확보가 기업 생존의 필수 조건.',
    source: '맥킨지 글로벌 혁신 서베이 2024',
    year: '2024',
    keywords: ['HR', '사내 혁신', '신사업', '애자일', '인재', '대기업'],
  },

  // ══ Strategic 5 — 시니어 ══
  {
    id: 'dc-senior-silver-economy',
    universes: ['senior'],
    category: 'market-size',
    headline: '글로벌 실버 이코노미 $15T (2030 전망)',
    value: '$15T',
    description:
      '글로벌 실버 이코노미 규모가 2030년 약 15조 달러 전망(월드데이터랩). 은퇴 인구의 거대한 경험 자본을 단순 복지 대상이 아닌 자생적 비즈니스로 전환하는 시니어의 주도적 실행력이 국가 경제의 새로운 생존 동력.',
    source: '월드데이터랩 Silver Economy 2030',
    year: '2024',
    keywords: ['시니어', '은퇴', '실버 이코노미', '초고령사회', '경험 자본'],
  },

  // ══ Strategic 5 — 다음세대 ══
  {
    id: 'dc-nextgen-future-jobs',
    universes: ['next-gen'],
    category: 'trend',
    headline: '미래 세대 65%는 새로운 직업을 가짐 (WEF)',
    value: '65%',
    description:
      '미래 세대의 65%는 현재 존재하지 않는 새로운 직업을 갖게 됨(WEF). AI 발달로 단순 지식의 가치가 하락하는 가운데, 정답을 외우는 대신 문제를 정의하고 실행하는 역량(Action-oriented Learning) 이 미래 인재의 가장 확실한 생존 원칙.',
    source: 'WEF Future of Jobs 2024',
    year: '2024',
    keywords: ['다음세대', '청소년', '청년', '미래 직업', 'AI 시대', '교육 혁신'],
  },

  // ══ Strategic 5 — D&I ══
  {
    id: 'dc-di-profitability-36',
    universes: ['di-inclusive'],
    category: 'market-size',
    headline: 'D&I 상위 기업 수익성 평균 36% 증대 + 임팩트 투자 $1T',
    value: '36% / $1T',
    description:
      '다양성과 포용성을 갖춘 상위 기업은 수익성이 평균 36% 더 높음(맥킨지). 글로벌 임팩트 투자 규모는 1조 달러 돌파. 다양성 양성은 단순한 배려가 아닌 틈새시장을 개척하는 강력하고 자생적인 비즈니스 동력.',
    source: '맥킨지 D&I 2024 + GIIN 임팩트 투자 보고서 2024',
    year: '2024',
    keywords: ['D&I', '다양성', '포용성', '경력 보유 여성', '이주민', '장애인', '임팩트 투자'],
  },

  // ══ Strategic 5 — 글로벌 혁신가 ══
  {
    id: 'dc-global-crossborder-2x',
    universes: ['global-innovator'],
    category: 'trend',
    headline: '크로스보더 창업가 매출 성장 속도 내수 대비 2배',
    value: '2배',
    description:
      '초기부터 크로스보더 진출을 타깃으로 한 창업가는 내수 중심 기업보다 매출 성장 속도가 2배 빠름(스타트업 지놈). 일본 스타트업 육성 5개년 계획(10조 엔) 과 인도 창업 열풍 등 아시아 전역이 혁신 창업가 확보에 사활을 거는 환경.',
    source: '스타트업 지놈 Global Startup Ecosystem Report 2024',
    year: '2024',
    keywords: ['글로벌', '크로스보더', '해외', '스케일업', '아시아', '일본', '인도'],
  },

  // ══ 전체 매크로 트렌드 (Universe 무관) ══
  {
    id: 'dc-ai-act-paradigm',
    universes: ['startup', 'sme', 'hr-corporate', 'next-gen', 'global-innovator'],
    category: 'trend',
    headline: 'AI 시대, 기획·시제품 비용 0 수렴 — 실행력(Act) 만 희소',
    value: '비용 0',
    description:
      '생성형 AI 등장으로 아이디어 기획·시제품 제작 비용은 0에 수렴. 누구나 기획자가 될 수 있는 시대에는 불확실성 속에서 가설을 세우고 현장에 부딪혀 변수를 통제해 내는 액트프러너의 실행력(Act) 만이 AI 가 대체할 수 없는 가장 강력한 경쟁 우위.',
    source: 'WEF Global Risks Report 2024',
    year: '2024',
    keywords: ['AI', '생성형 AI', '실행력', 'Act', '액트프러너', '경쟁 우위', '불확실성'],
  },
]

// ─────────────────────────────────────────
// 3. 매칭 헬퍼
// ─────────────────────────────────────────

/**
 * RFP keywords + 추정 universe 입력 → 매칭되는 stat 리스트 반환.
 *
 * 매칭 점수:
 *   - universe match (정확 일치): +0.5
 *   - keyword 교집합 비율: 0~0.5
 *
 * @param input RFP keywords + 가능한 universe 후보 (없으면 모든 universe 대상)
 * @returns 점수 desc 정렬된 top N stat
 */
export function findMatchingStats(input: {
  keywords?: string[]
  universes?: ActpreneurUniverse[]
  limit?: number
}): Array<{ stat: DataCenterStat; score: number; reason: string }> {
  const keywords = (input.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean)
  const universes = new Set(input.universes ?? [])
  const limit = input.limit ?? 5

  const scored = DATA_CENTER_STATS.map((stat) => {
    let score = 0
    const reasons: string[] = []

    // universe 매칭
    if (universes.size > 0) {
      const overlap = stat.universes.filter((u) => universes.has(u)).length
      if (overlap > 0) {
        score += 0.5
        reasons.push(`타깃 매칭 ${overlap}건`)
      }
    } else {
      // universe 미지정 → neutral 0.25
      score += 0.25
    }

    // keyword 매칭
    if (keywords.length > 0) {
      const statKeywords = stat.keywords.map((k) => k.toLowerCase())
      const haystack = (stat.headline + ' ' + stat.description).toLowerCase()
      const matched = keywords.filter(
        (k) => statKeywords.some((sk) => sk.includes(k) || k.includes(sk)) || haystack.includes(k),
      )
      if (matched.length > 0) {
        const ratio = matched.length / keywords.length
        score += Math.min(0.5, ratio * 0.5)
        reasons.push(`키워드 ${matched.length}/${keywords.length}`)
      }
    }

    return { stat, score, reason: reasons.join(' · ') || '기본 매칭' }
  })

  return scored
    .filter((s) => s.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * inline citation 마커 포맷 생성 (F3 이 본문에 박을 형태).
 * 예: "스타트업 5년 생존율은 약 34% [근거: 통계청 기업생멸행정통계 + 중기부 2024 벤처투자 동향 | 2024]"
 */
export function formatInlineCitation(stat: DataCenterStat): string {
  return `[근거: ${stat.source} | ${stat.year}]`
}

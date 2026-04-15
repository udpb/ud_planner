/**
 * 언더독스 브랜드 자산 — 제안서/커리큘럼 AI 생성 시 일관되게 주입되는 핵심 메시지
 * 출처: 수주 제안서 2건 (청년마을, 재창업) 분석 + IMPACT 방법론 PPTX 18개 + CORE 4개
 *       + underdogs.global 공식 사이트 (2026-04-15 동기화)
 *
 * 관련 Skill: `.claude/skills/ud-brand-voice/SKILL.md` (해석·톤·선택 기준)
 */

// ─────────────────────────────────────────
// 회사 핵심 실적 (정량 포화 패턴용)
// 2026-04-15 공식 사이트 기준으로 업데이트 — 변경 시 WinningPattern 시드에도 반영 필요
// ─────────────────────────────────────────
export const UD_TRACK_RECORD = {
  yearsActive: 10,                       // "A Decade Dedicated Solely to Entrepreneurs"
  cumulativeRevenueBillions: 500,        // 누적 500억+
  totalGraduates: 20211,                 // 공식 카운터 (사이트). 일반 언급은 "약 25,000명 누적" 도 허용
  totalGraduatesApprox: 25000,           // "approximately 25,000 fellow entrepreneurs"
  totalCoaches: 800,                     // 코치 풀 (DB 기준 실측)
  startupTeamsFormed: 6110,              // 공식 카운터 (사이트)
  programsConducted: 498,                // 공식 카운터 (사이트). 구 388 → 498 업데이트
  globalPartners: 520,                   // "Over 520 Global Partners" — 공식 집계
  partnerUniversities: 160,              // 세부 분류 (legacy) — globalPartners 총합과 별도
  partnerCorporations: 50,
  partnerGovernments: 50,
  partnerMunicipalities: 45,
  regionalHubs: 30,                       // 전국 30개 거점
  simultaneousCapacity: 1500,            // 동시 1,500명 교육
  creditRating: 'BB+',
  regionsCovered: 96,                    // 공식: 96 Global & Local Regions. 구 93 → 96
  esgMeasuredCompanies: 1600,            // "1,600+ 기업 ESG 영향 측정"
  startupDatabaseAnnualUpdate: 10000,    // "10,000명 신생 기업가 DB (연 갱신)"
}

// ─────────────────────────────────────────
// 정체성 선언문 (비전·미션·태그라인 — 원문 보존)
// 제안서 "제안배경" / "서론" / "결론" 섹션의 씨앗 문장
// ─────────────────────────────────────────
export const UD_IDENTITY = {
  missionKo: '창업의 가능성을 현실로 만들어 새로운 세상을 엽니다',
  missionEn: 'Opening New Worlds Through Entrepreneurial Potential',
  tagline: "Changing the World Through 'ACT-PRENEUR'",
  ceoMessage: '1%의 가능성을 100%의 현실로 바꾸는 진정성 있는 파트너, 언더독스입니다',
  beliefStatement: 'We believe in the potential of underdogs to change the world',
  actionPhilosophy: '해보기 전엔 아무것도 모른다',  // Action Week 정당화 인용구
  insightSentence:
    '20,000명이 넘는 창업가를 만나오면서 얻은 언더독스의 인사이트는 그것을 "실행"이라 답합니다',
  differentiation:
    '가장 효과적인 방법으로 일하며, 교육생을 끝까지 책임지고, ' +
    'AI 코치와 인간 코치가 전 과정에 함께하며, 교육 현장 데이터를 활용하여 성과를 높입니다',
}

// ─────────────────────────────────────────
// Underdog 재정의 (제안서 톤에서 치명적 오해 방지)
// Skill: "약자를 동정 프레임으로 쓰지 말 것"
// ─────────────────────────────────────────
export const UD_UNDERDOG_DEFINITION = {
  literal: '경쟁에서 이기기보다 질 것으로 예상되는 약자',
  reframe:
    '스타트업은 1%의 가능성에서 무언가를 만들어내는 세상의 "언더독"입니다. ' +
    '우리는 기존 시스템에 도전하는 창업가들의 힘을 믿습니다',
  concept: '사회적 지위가 아닌 의지와 영향력으로 변화를 만드는 사람들',
}

// ─────────────────────────────────────────
// Core Values (4개, 조직·팀 소개 섹션용)
// ─────────────────────────────────────────
export const UD_CORE_VALUES = [
  { name: '협업', description: '하나의 팀이 되어 더 나은 해답을 찾아감' },
  { name: '혁신', description: '이전에 없던 새로운 길을 찾아 나섬' },
  { name: '성과', description: '매 순간 최고의 성과를 내기 위해 노력' },
  { name: '책임', description: '자유를 누리면서 책임감 있는 결과를 만듦' },
] as const

// ─────────────────────────────────────────
// 법인명 표기 규칙 (2026-04-15 결정)
// 기본은 "언더독스", 예외는 법적 표기 필요 위치에서 "유디임팩트"
// ─────────────────────────────────────────
export const UD_LEGAL_ENTITY = {
  primaryName: '언더독스',                  // 본문 99% 에서 이것만 사용
  officialCorporate: '주식회사 유디임팩트',  // 법적 서류·footer·사업자 섹션
  officialEn: 'UD Impact Co., Ltd.',
  legacyEn: 'Underdogs',
  businessRegNo: '693-88-00061',
  ceo: '김정헌',
  founded: 2015,
  renamedIn: 2025,                         // 언더독스 → UD Impact 사명 변경
  globalEntities: ['Japan (2025)', 'India (2025)'],
  email: 'contact@udimpact.ai',
  addressKo: '서울특별시 종로구 돈화문로 88-1',
}

// ─────────────────────────────────────────
// 사업 영역 6종 (공식 카테고리 + 대표 메시지 원문)
// RFP → 영역 매핑 → ChannelPreset 선택 시 활용
// ─────────────────────────────────────────
export const UD_BUSINESS_AREAS = [
  {
    code: 'startup_education',
    name: '창업 인재 양성 교육',
    description:
      '교육 설계 전문가가 파트너별 최적의 액트프러너 교육을 설계하고 ' +
      '기획부터 운영 및 성과 관리까지 체계적으로 운영',
  },
  {
    code: 'ai_education',
    name: 'AI 인재 양성 교육',
    description:
      'AI를 활용하여 미래를 이끌 핵심 인재양성을 위해 ' +
      '리터리시, 멘토링, 인턴십, 솔루션 적용 등 맞춤 교육을 제공',
  },
  {
    code: 'small_business',
    name: '소상공인 성장 지원',
    description:
      '이미 검증된 실행 보장형 교육으로 소상공인을 가장 잘 이해하는 ' +
      '전담 멘토 실행을 함께',
  },
  {
    code: 'event_ops',
    name: '행사 기획 운영',
    description:
      '지역활성화를 돕고, 참여자 모두를 빛낼 수 있는 다양한 형태의 행사를 ' +
      '기획부터 운영까지 맞춤형으로 제공',
  },
  {
    code: 'esg_measurement',
    name: 'ESG 가치 측정',
    description:
      '1,600개가 넘는 기업의 ESG 임팩트 측정 노하우를 바탕으로 ' +
      '신뢰할 수 있게 사업 임팩트를 측정/평가',
  },
  {
    code: 'impact_investing',
    name: '임팩트 기업 투자',
    description:
      '매년 10,000명 업데이트 되는 창업가 데이터와 자동화 딜소싱 체계로 ' +
      '극초기 창업가를 발굴 육성',
  },
] as const

// ─────────────────────────────────────────
// 고객 세그먼트 6종 (공식 분류, 톤/프로그램 차별화)
// ─────────────────────────────────────────
export const UD_CUSTOMER_SEGMENTS = [
  { code: 'youth', name: '청년', ageRange: '19-39', context: '예비·초기 창업' },
  { code: 'small_biz', name: '소상공인', ageRange: '-', context: '운영 중, 성장 정체 해소' },
  { code: 'corporate', name: '기업', ageRange: '-', context: 'B2B, 혁신·AI 전환' },
  { code: 'young_women', name: '여성청년', ageRange: '19-39', context: '특화 프로그램' },
  { code: 'senior', name: '신중년', ageRange: '40-60', context: '재창업·경력전환' },
  { code: 'intl_dev', name: '국제개발협력', ageRange: '-', context: '해외 거점 (일본·인도)' },
] as const

// ─────────────────────────────────────────
// 자체 개발 도구 (브랜딩된 이름 — 항상 그대로 사용)
// ─────────────────────────────────────────
export const UD_PROPRIETARY_TOOLS = [
  {
    name: 'ACT-PRENEURSHIP',
    type: '진단 도구',
    description: '5가지 실행역량(Goal/Environment/Problem/eXecution/Routinization) 사전·사후 측정',
  },
  {
    name: 'DOGS Team Building',
    type: '워크숍',
    description: 'DISC 기반 24문항 진단 + 팀 구성 솔루션',
  },
  {
    name: '6 Dimension Startup Growth Model',
    type: '진단 모형',
    description: '창업팀 성장 단계별 종합 진단 프레임워크',
  },
  {
    name: 'IMPACT 창업방법론',
    type: '교육 방법론',
    description: '6단계 18모듈 54문항 — Identify → Map → Plan → Activate → Compete → Transform',
  },
  {
    name: 'EduBot',
    type: 'AI 교육 도우미',
    description: '워크숍 35분 동안 AI가 이론 설명/적용 가이드/피드백/예시를 실시간 제공',
  },
  {
    name: '언더베이스 LMS',
    type: '학습관리시스템',
    description: '자체 개발 LMS — 출결/과제/만족도/코칭일지 통합 관리',
  },
]

// ─────────────────────────────────────────
// 4중 지원 체계 (단일 코치 ❌ → 항상 레이어로 표현)
// ─────────────────────────────────────────
export const UD_SUPPORT_LAYERS = [
  { layer: '전문 멘토단', role: '300+ 분야별 전문가 풀, 분기별 전문 조언' },
  { layer: '컨설턴트 풀', role: '심화 분야 1:1 컨설팅 (회계, 법률, 투자, 글로벌)' },
  { layer: '전담 코치 (액션코치)', role: '주간 1:1 코칭, 실행 견인, 진행 점검' },
  { layer: '동료 네트워크', role: '코호트 러닝, 알럼나이 커뮤니티, 협업 연결' },
]

// ─────────────────────────────────────────
// 운영 구조 표준 (조직도 표현용)
// ─────────────────────────────────────────
export const UD_ORG_STRUCTURE = {
  hierarchy: [
    '대표 (총괄 책임)',
    '사업 PM (본부장급, 전담)',
    '기능별 리더 (기획/운영/육성콘텐츠/홍보)',
    'CM (Coach Manager) — 코치 운영 총괄',
    '전국 코치진 + 지역 PM',
  ],
  principle: '"전담"역할 명시 — 모든 핵심 포지션은 다른 사업과 겹치지 않는 100% 투입',
}

// ─────────────────────────────────────────
// 키 메시지 패턴 (제안서 작성 시 반드시 반영)
// ─────────────────────────────────────────
export const UD_KEY_MESSAGE_PATTERNS = {
  patterns: [
    {
      name: '국내 최초',
      usage: '해당 분야에서 처음 시도하는 요소를 찾아 강조 (실행보장형, 지역정착형, AI협업팀 등)',
    },
    {
      name: '정량 포화',
      usage: '"많은", "다양한" 같은 모호한 표현 금지. 항상 숫자로 표현 (291명, 50개 기업)',
    },
    {
      name: '4중 지원 체계',
      usage: '코치 1명이 아닌 전문멘토+컨설턴트+전담코치+동료의 4레이어 강조',
    },
    {
      name: '실행 보장',
      usage: '"실행을 보장하는 코칭 중심의 체계적인 교육" — 이론 vs 실행 대비',
    },
    {
      name: '자체 도구 브랜딩',
      usage: 'ACT-PRENEURSHIP, DOGS, 6 Dimension 등 항상 고유 명칭 사용',
    },
    {
      name: 'Section V 보너스',
      usage: 'RFP 범위 밖 추가 제안 3-4건 (글로벌 연계, 임팩트 리포트, 후속 투자 연계 등)',
    },
    {
      name: 'one-page-one-thesis',
      usage: '각 섹션은 단 하나의 굵은 헤드라인 주장을 중심으로 구성',
    },
    {
      name: '정부 평가 대응',
      usage: '"정부업무평가에 활용 가능한 맞춤형 성과 분석" — 클라이언트의 상위 평가 대응',
    },
  ],
}

// ─────────────────────────────────────────
// 문체 가이드
// ─────────────────────────────────────────
export const UD_TONE_GUIDE = {
  voice: '자신감 있는 선언형 — "~할 수 있습니다" ❌, "~합니다" ⭕',
  evidence: '모든 주장은 정량 근거로 뒷받침 — "291명의 코치진과 함께"',
  englishMix: '핵심 컨셉은 영어+한국어 믹스 — "Born Global", "Human Touch", "All In One", "MVP Fast Track"',
  branding: '핵심 컨셉은 따옴표로 브랜딩 — "4중 페이스메이커 시스템"',
  format: '마크다운 소제목 + 리스트 활용, 분량 600~900자',
  structure: '서론(맥락 1문장) → 본론(굵은 헤드라인 1개 + 근거) → 결론(약속 1문장)',
}

// ─────────────────────────────────────────
// IMPACT 6단계 요약 (커리큘럼/제안서 모두에서 참조)
// ─────────────────────────────────────────
export const IMPACT_STAGE_OVERVIEW = [
  { code: 'I', name: 'Ideation', focus: '나 자신', question: '왜 창업하는가? 무엇을 가지고 시작하는가?' },
  { code: 'M', name: 'Market', focus: '고객과 문제', question: '누가 첫 고객이고, 진짜 문제는 무엇인가?' },
  { code: 'P', name: 'Product', focus: '솔루션', question: '핵심 가치와 솔루션을 어떻게 설계할 것인가?' },
  { code: 'A', name: 'Acquisition', focus: '시장 진입', question: '첫 50명을 어떻게 확보할 것인가?' },
  { code: 'C', name: 'Commercial', focus: '사업화', question: '돈을 벌수록 이익이 나는 구조인가?' },
  { code: 'T', name: 'Team', focus: '조직과 성장', question: '왜 이 일을 하고, 어떻게 측정·관리할 것인가?' },
]

// ─────────────────────────────────────────
// AI 프롬프트용 텍스트 빌더
// ─────────────────────────────────────────

/**
 * 제안서 AI에 주입할 언더독스 브랜드 컨텍스트를 생성합니다.
 */
export function buildBrandContext(): string {
  const r = UD_TRACK_RECORD
  const id = UD_IDENTITY
  const tools = UD_PROPRIETARY_TOOLS.map((t) => `  - ${t.name} (${t.type}): ${t.description}`).join('\n')
  const layers = UD_SUPPORT_LAYERS.map((l) => `  - ${l.layer}: ${l.role}`).join('\n')
  const patterns = UD_KEY_MESSAGE_PATTERNS.patterns.map((p) => `  - ${p.name}: ${p.usage}`).join('\n')
  const stages = IMPACT_STAGE_OVERVIEW.map((s) => `  - ${s.code} (${s.name}): ${s.focus} — ${s.question}`).join('\n')
  const values = UD_CORE_VALUES.map((v) => `  - ${v.name}: ${v.description}`).join('\n')

  return `
[언더독스 브랜드 자산 — 제안서 작성 시 자연스럽게 녹여내세요]

▣ 정체성 (씨앗 문장)
  - 미션: ${id.missionKo} (${id.missionEn})
  - 태그라인: ${id.tagline}
  - 대표 메시지: ${id.ceoMessage}
  - 실행 철학: "${id.actionPhilosophy}"
  - 차별화 선언: ${id.differentiation}

▣ 회사 핵심 실적 (정량 표현용, 2026-04-15 공식 기준)
  - ${r.yearsActive}년간 ("A Decade Dedicated Solely to Entrepreneurs") 누적 ${r.cumulativeRevenueBillions}억+ 운영
  - 창업가 ${r.totalGraduates.toLocaleString()}명+ 육성 (약 ${r.totalGraduatesApprox.toLocaleString()}명 누적)
  - ${r.programsConducted}개 프로그램 · ${r.startupTeamsFormed.toLocaleString()}팀 창업 · ${r.regionsCovered}개 지역
  - ${r.globalPartners}+ 글로벌 파트너 · ESG 측정 ${r.esgMeasuredCompanies.toLocaleString()}개 기업
  - 코치 풀 ${r.totalCoaches}명 · 전국 ${r.regionalHubs}개 거점 · 동시 ${r.simultaneousCapacity.toLocaleString()}명 교육
  - ${r.creditRating} 신용등급 · 일본·인도 현지법인 (2025)

▣ Core Values (조직·팀 소개)
${values}

▣ 자체 개발 도구 (브랜드 명칭 그대로 사용)
${tools}

▣ 4중 지원 체계 (단일 코치 표현 금지, AI 코치는 별도 레이어 아님 — 강점 언급만)
${layers}

▣ 운영 구조 원칙
  ${UD_ORG_STRUCTURE.principle}
  계층: ${UD_ORG_STRUCTURE.hierarchy.join(' → ')}

▣ IMPACT 창업방법론 6단계
${stages}

▣ 키 메시지 패턴 (반드시 반영)
${patterns}

▣ 법인 표기 규칙
  - 본문 전반: "${UD_LEGAL_ENTITY.primaryName}"
  - 법적/공식 표기 필요 시: "${UD_LEGAL_ENTITY.officialCorporate} (${UD_LEGAL_ENTITY.officialEn})"
  - 한 문서에 두 명칭 혼용 금지

▣ 문체 가이드
  - 어조: ${UD_TONE_GUIDE.voice}
  - 근거: ${UD_TONE_GUIDE.evidence}
  - 영어 믹스: ${UD_TONE_GUIDE.englishMix}
  - 브랜딩: ${UD_TONE_GUIDE.branding}
  - 구성: ${UD_TONE_GUIDE.structure}
  - 분량: ${UD_TONE_GUIDE.format}
`.trim()
}

/**
 * IMPACT 18모듈 데이터를 AI 프롬프트용 텍스트로 변환합니다.
 * 커리큘럼 AI는 이 컨텍스트를 보고 세션 제목/목표를 IMPACT 모듈에 매핑합니다.
 */
export interface ImpactModuleContext {
  moduleCode: string
  moduleName: string
  coreQuestion: string
  workshopOutputs: string[]
  durationMinutes: number
  stage: string
}

export function buildImpactModulesContext(modules: ImpactModuleContext[]): string {
  if (modules.length === 0) return ''

  // 단계별 그룹화
  const byStage = new Map<string, ImpactModuleContext[]>()
  for (const m of modules) {
    const arr = byStage.get(m.stage) ?? []
    arr.push(m)
    byStage.set(m.stage, arr)
  }

  const stageOrder = ['I', 'M', 'P', 'A', 'C', 'T']
  const lines: string[] = []
  lines.push('[IMPACT 18모듈 라이브러리 — 참고 자산 (강제 아님, 가중치 부여)]')
  lines.push('이 모듈들은 언더독스의 자체 방법론입니다. 세션 설계 시 참고하되,')
  lines.push('더 효과적인 외부 사례나 최신 트렌드가 있으면 적극 결합하세요.')
  lines.push('')

  for (const code of stageOrder) {
    const stageModules = byStage.get(code) ?? []
    if (stageModules.length === 0) continue
    const stageInfo = IMPACT_STAGE_OVERVIEW.find((s) => s.code === code)
    lines.push(`■ ${code} - ${stageInfo?.name ?? ''} (${stageInfo?.focus ?? ''})`)
    for (const m of stageModules) {
      lines.push(`  • ${m.moduleCode} ${m.moduleName}`)
      lines.push(`    Q: ${m.coreQuestion}`)
      lines.push(`    산출물: ${m.workshopOutputs.join(' / ')}`)
    }
    lines.push('')
  }

  lines.push('활용 가이드:')
  lines.push('- IMPACT 모듈의 핵심 질문은 좋은 출발점 — 세션 목표에 반영하면 효과적')
  lines.push('- 매핑 가능한 세션은 impactModuleCode에 기록, 새로운 세션은 null')
  lines.push('- 세션 title은 모듈명을 그대로 쓰지 말고 사업 맥락에 맞게 변형')
  lines.push('- 이 모듈에 없는 새로운 접근이 더 효과적이라면 과감히 제안하세요')

  return lines.join('\n')
}

/**
 * 커리큘럼 데이터를 제안서 섹션 4(교육 커리큘럼) 작성용 컨텍스트로 변환
 */
export function buildCurriculumContextForProposal(
  sessions: Array<{
    sessionNo: number
    title: string
    durationHours: number
    isTheory: boolean
    isActionWeek: boolean
    isCoaching1on1: boolean
    objectives?: string[]
    impactModuleCode?: string | null
  }>
): string {
  if (sessions.length === 0) return ''

  const total = sessions.length
  const totalHours = sessions.reduce((s, x) => s + x.durationHours, 0)
  const aw = sessions.filter((s) => s.isActionWeek).length
  const coaching = sessions.filter((s) => s.isCoaching1on1).length
  const theory = sessions.filter((s) => s.isTheory).length
  const theoryRatio = Math.round((theory / total) * 100)

  const lines: string[] = []
  lines.push(`[확정된 커리큘럼 — 섹션 작성 시 이 세션들을 구체적으로 인용하세요]`)
  lines.push(``)
  lines.push(`총 ${total}회차 / ${totalHours}시간 / Action Week ${aw}회 / 1:1 코칭 ${coaching}회 / 이론 비율 ${theoryRatio}%`)
  lines.push(``)
  lines.push(`회차별 구성:`)
  for (const s of sessions) {
    const tags: string[] = []
    if (s.isActionWeek) tags.push('AW')
    if (s.isCoaching1on1) tags.push('1:1코칭')
    if (s.isTheory) tags.push('이론')
    if (s.impactModuleCode) tags.push(`IMPACT:${s.impactModuleCode}`)
    const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : ''
    lines.push(`  ${s.sessionNo}회차: ${s.title} (${s.durationHours}h)${tagStr}`)
  }

  return lines.join('\n')
}

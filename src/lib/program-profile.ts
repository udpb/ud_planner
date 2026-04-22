/**
 * ProgramProfile v1.1 — 사업 스펙트럼 축 체계
 *
 * Source of truth:
 *   - docs/architecture/program-profile.md (v1.1 spec)
 *   - docs/decisions/006-program-profile.md (ADR)
 *
 * Phase E Step 2 · 2026-04-20 (v1.0 초안)
 * 2026-04-20 — v1.1: supportStructure.mainType(5 enum) 제거, 과업 유형 6종
 *             multi-select + RFP 자동 감지로 재설계. "4중지원체계"·"장인_교류"·
 *             "매칭_멘토링" 같은 특수 사례 enum 은 상위 축에서 제거되고
 *             fourLayerSupport: boolean 만 언더독스 고유 자산으로 유지.
 *
 * 11축 프로파일 (대상 3축 + 규모 + 포맷 + 운영 + 지원구조 + 방법론 +
 *               심사 + 발주처 + 임팩트 + 사후관리) + 연속사업 컨텍스트.
 */

// ─────────────────────────────────────────────────────────────────
// 축 1. 대상자 단계
// ─────────────────────────────────────────────────────────────────

export const TARGET_STAGE_VALUES = [
  '예비창업_아이디어무',
  '예비창업_아이디어유',
  'seed',
  'pre-A',
  'series-A이상',
  '소상공인',
  '비창업자',
] as const
export type TargetStage = (typeof TARGET_STAGE_VALUES)[number]

// ─────────────────────────────────────────────────────────────────
// 축 2·3·4. 대상 세그먼트 (3축 세분화)
// ─────────────────────────────────────────────────────────────────

export const DEMOGRAPHIC_VALUES = [
  '무관',
  '여성',
  '청소년',
  '대학생',
  '시니어',
  '임직원',
  '상인',
  '장인',
  '디자이너',
  '일반소상공인',
] as const
export type Demographic = (typeof DEMOGRAPHIC_VALUES)[number]

// 엑셀(2024-11) 분류 체계 19종 그대로 사용
export const BUSINESS_DOMAIN_VALUES = [
  'ALL',
  '식품/농업',
  '문화/예술',
  '사회/복지',
  '여행/레저',
  '교육',
  '유통/커머스',
  '제조/하드웨어',
  'IT/TECH',
  '바이오/의료',
  '환경/에너지',
  '피트니스/스포츠',
  '부동산/건설',
  '모빌리티/교통',
  '홈리빙/펫',
  '인사/법률/비즈니스',
  '금융/재무/보험',
  '미디어/엔터테인먼트',
  '핀테크',
  '기타',
] as const
export type BusinessDomain = (typeof BUSINESS_DOMAIN_VALUES)[number]

export const GEOGRAPHY_VALUES = [
  '일반',
  '로컬',
  '글로벌_한국인바운드',
  '글로벌_공통',
  '일본',
  '인도',
] as const
export type Geography = (typeof GEOGRAPHY_VALUES)[number]

export interface TargetSegment {
  demographic: Demographic[]
  businessDomain: BusinessDomain[]
  geography: Geography
}

// ─────────────────────────────────────────────────────────────────
// 축 5. 규모
// ─────────────────────────────────────────────────────────────────

export const BUDGET_TIER_VALUES = [
  '1억_미만',
  '1-3억',
  '3-5억',
  '5억_이상',
] as const
export type BudgetTier = (typeof BUDGET_TIER_VALUES)[number]

export const PARTICIPANT_TIER_VALUES = [
  '20명_이하',
  '20-50',
  '50-100',
  '100+',
] as const
export type ParticipantTier = (typeof PARTICIPANT_TIER_VALUES)[number]

export interface Scale {
  budgetKrw: number
  budgetTier: BudgetTier // 자동 계산 (computeBudgetTier)
  participants: ParticipantTier
  durationMonths: number
}

export function computeBudgetTier(budgetKrw: number): BudgetTier {
  if (budgetKrw < 100_000_000) return '1억_미만'
  if (budgetKrw < 300_000_000) return '1-3억'
  if (budgetKrw < 500_000_000) return '3-5억'
  return '5억_이상'
}

// ─────────────────────────────────────────────────────────────────
// 축 6. 포맷 (복수)
// ─────────────────────────────────────────────────────────────────

export const FORMAT_VALUES = [
  '데모데이',
  'IR',
  '네트워킹',
  '합숙',
  '해외연수',
  '박람회/전시',
  '페스티벌/축제',
  '공모전',
] as const
export type ProgramFormat = (typeof FORMAT_VALUES)[number]

// ─────────────────────────────────────────────────────────────────
// 축 7. 운영 방식
// ─────────────────────────────────────────────────────────────────

export const DELIVERY_MODE_VALUES = ['온라인', '오프라인', '하이브리드'] as const
export type DeliveryMode = (typeof DELIVERY_MODE_VALUES)[number]

export interface Delivery {
  mode: DeliveryMode
  usesLMS: boolean // 기본 true (권장)
  onlineRatio: number // 0~100, 하이브리드일 때만 의미
  usesAICoach: boolean // EduBot 활용 여부
}

// ─────────────────────────────────────────────────────────────────
// 축 8. 지원 구조 (v1.1 재설계)
// ─────────────────────────────────────────────────────────────────
//
// v1.0 의 SupportMainType 5 enum ("4중지원체계·공모_심사_컨설팅·장인_교류·
// 매칭_멘토링·커스텀") 은 PM 에게 "무슨 말인지 모르겠다" 는 피드백을 받고 제거.
// 언더독스 실무 분해로 교체:
//   (1) 과업 유형 6종 multi-select (모객·심사·교류·멘토링·컨설팅·행사)
//       — 실제 사업 구성 요소. RFP 파싱에서 자동 감지.
//   (2) fourLayerSupport: boolean 유지 — 언더독스 고유 자산 "4중 지원 체계".
//
// "장인·매칭" 같은 특수 사례는 축 9 methodology enum 으로 흡수되므로
// 축 8 에는 더 이상 노출하지 않는다.

/**
 * 과업 유형 (ProjectTaskType) — 언더독스 사업 실무 분해 기반.
 *
 * 제1원칙: 각 유형은 RFP 평가 배점 한 카테고리에 직접 연결된다.
 *   - 모객: "모집 전략" 배점
 *   - 심사_선발: "심사·선정 설계" 배점
 *   - 교류_네트워킹: "차별화 (파트너·동문 자산)" 배점
 *   - 멘토링_코칭: "수행 역량 (4중 지원 증명)" 배점
 *   - 컨설팅_산출물: "수행 능력 (산출물 수준)" 배점
 *   - 행사_운영: "운영 역량·집객 실적" 배점
 */
export const PROJECT_TASK_VALUES = [
  '모객',
  '심사_선발',
  '교류_네트워킹',
  '멘토링_코칭',
  '컨설팅_산출물',
  '행사_운영',
] as const
export type ProjectTaskType = (typeof PROJECT_TASK_VALUES)[number]

export const COACHING_STYLE_VALUES = ['1:1', '팀코칭', '혼합', '해당없음'] as const
export type CoachingStyle = (typeof COACHING_STYLE_VALUES)[number]

export interface SupportStructure {
  /**
   * 이 사업에 포함되는 과업 유형 (복수). RFP 파싱 시 자동 감지 후 PM 보정.
   * 빈 배열이면 Gate 3 경고 (tasks-empty).
   */
  tasks: ProjectTaskType[]
  /**
   * 언더독스 고유 자산 "4중 지원 체계" (전문멘토+컨설턴트풀+전담코치+동료네트워크).
   * 과업에 멘토링_코칭 이 포함되고 IMPACT·재창업·글로벌진출·소상공인성장 방법론일 때
   * 켜는 것이 기본 권장.
   */
  fourLayerSupport: boolean
  coachingStyle: CoachingStyle
  externalSpeakers: boolean
  externalSpeakerCount?: number
  // 비창업 사업용 보조 필드 (optional)
  nonStartupSupport?: {
    coordinationBody?: string // 상권강화기구 · 운영사무국 등
    domainPartners?: string[]
    matchingOperator?: boolean
  }
}

// ─────────────────────────────────────────────────────────────────
// 축 9. 방법론 ⭐
// ─────────────────────────────────────────────────────────────────

export const METHODOLOGY_VALUES = [
  'IMPACT',
  '로컬브랜드',
  '글로컬',
  '공모전설계',
  '매칭',
  '재창업',
  '글로벌진출',
  '소상공인성장',
  '커스텀',
] as const
export type MethodologyPrimary = (typeof METHODOLOGY_VALUES)[number]

export interface Methodology {
  primary: MethodologyPrimary
  impactModulesUsed: string[] // 실제 사용 IMPACT 모듈 코드 (ex. ["I-1","M-2"])
  customFrameworkName?: string // primary === '커스텀' 일 때
}

// ─────────────────────────────────────────────────────────────────
// 축 10. 심사·선발 ⭐
// ─────────────────────────────────────────────────────────────────

export const SELECTION_STYLE_VALUES = [
  '서류',
  '서류+PT',
  '서류+PT+심층면접',
  '공모전형',
  '선정형_비경쟁',
  '대중심사_병행',
] as const
export type SelectionStyle = (typeof SELECTION_STYLE_VALUES)[number]

export const COMPETITION_RATIO_VALUES = [
  '낮음_1:2이하',
  '중간_1:3-5',
  '높음_1:6+',
  '미공개',
] as const
export type CompetitionRatio = (typeof COMPETITION_RATIO_VALUES)[number]

export interface Selection {
  style: SelectionStyle
  stages: number
  competitionRatio: CompetitionRatio
  publicVoting: boolean
  publicVotingWeight?: number // % (publicVoting=true 일 때)
  evaluatorCount: number
}

// ─────────────────────────────────────────────────────────────────
// 축 11. 발주처 + 연속사업 컨텍스트 ⭐
// ─────────────────────────────────────────────────────────────────

export const CHANNEL_TYPE_VALUES = ['B2G', 'B2B'] as const
export type ChannelType = (typeof CHANNEL_TYPE_VALUES)[number]

export const CLIENT_TIER_VALUES = [
  '중앙부처',
  '광역지자체',
  '기초지자체',
  '공공기관',
  '대기업',
  '중견기업',
  '중소기업',
  '재단',
] as const
export type ClientTier = (typeof CLIENT_TIER_VALUES)[number]

export interface Channel {
  type: ChannelType
  clientTier: ClientTier
  isRenewal: boolean
  // renewalContext 는 Project.renewalContext 에 저장 (본 프로파일과 분리)
  // isRenewal=true 일 때 renewalContext 가 반드시 있어야 Gate 3 통과
}

/**
 * 연속사업 컨텍스트 — Project.renewalContext 에 저장.
 *
 * Q9 결정: isRenewal=true 일 때 이 객체가 **필수**.
 * 없으면 Gate 3 블로킹 (renewal-context-missing).
 */
export interface RenewalContext {
  previousRoundNumber: number // 몇 기수째 (GS리테일=8기 예정)
  lastYearKPI: Array<{
    metric: string
    target: number
    actual: number
    unit: string
  }>
  lastYearLessons: string // 필수. 50자 이상 권장.
  aspectsToImprove: string[] // 필수, 최소 2개
  aspectsToKeep: string[]
}

// ─────────────────────────────────────────────────────────────────
// 축 12. 주 임팩트 (복수)
// ─────────────────────────────────────────────────────────────────

export const PRIMARY_IMPACT_VALUES = [
  '고용창출',
  '매출/판로',
  '투자유치',
  '지역활성화',
  '역량개발',
  '글로벌확장',
  '사회적가치',
] as const
export type PrimaryImpact = (typeof PRIMARY_IMPACT_VALUES)[number]

// ─────────────────────────────────────────────────────────────────
// 축 13. 사후관리
// ─────────────────────────────────────────────────────────────────

export const AFTERCARE_SCOPE_VALUES = [
  '투자연계',
  'alumni네트워크',
  'IR지원',
  '해외진출',
  '유통입점',
  '진단지속',
  '코치지속',
] as const
export type AftercareScope = (typeof AFTERCARE_SCOPE_VALUES)[number]

export interface Aftercare {
  hasAftercare: boolean
  scope: AftercareScope[]
  tierCount: number // 한지 4단 사후관리 → 4
}

// ─────────────────────────────────────────────────────────────────
// ProgramProfile — 최상위 타입 (Project.programProfile 에 저장)
// ─────────────────────────────────────────────────────────────────

export interface ProgramProfile {
  // 축 1
  targetStage: TargetStage
  // 축 2·3·4
  targetSegment: TargetSegment
  // 축 5
  scale: Scale
  // 축 6
  formats: ProgramFormat[]
  // 축 7
  delivery: Delivery
  // 축 8
  supportStructure: SupportStructure
  // 축 9
  methodology: Methodology
  // 축 10
  selection: Selection
  // 축 11
  channel: Channel
  // 축 12
  primaryImpact: PrimaryImpact[] // 최소 1, 최대 3
  // 축 13
  aftercare: Aftercare

  // 메타
  version: '1.0' | '1.1'
  updatedAt: string // ISO8601
}

// ─────────────────────────────────────────────────────────────────
// 자동 연동 (Q8) — 한 필드 변경 시 다른 필드 자동 동기화
// ─────────────────────────────────────────────────────────────────

/**
 * 자동 연동 규칙 적용.
 *
 * UI 에서 어느 한 필드를 수정할 때마다 이 함수를 통과시켜 프로파일을 정규화.
 * - formats 에 '공모전' → selection.style = '공모전형'
 * - selection.publicVoting=true → selection.style = '대중심사_병행'
 * - methodology !== '커스텀' → customFrameworkName 제거
 * - methodology !== 'IMPACT' → impactModulesUsed 경고 (미제거, 의도적 혼용 허용)
 * - budgetKrw → budgetTier 재계산
 * - primaryImpact 배열 길이 1~3 강제 (초과 시 trim)
 */
export function normalizeProfile(p: ProgramProfile): ProgramProfile {
  // v1.0 → v1.1 마이그레이션: legacy mainType 필드가 들어와도 타입상 무시되고,
  // tasks 가 없으면 빈 배열로 기본화해 UI·유사도 계산이 깨지지 않게 한다.
  const rawSupport = p.supportStructure as SupportStructure & {
    mainType?: unknown
  }
  const nextSupport: SupportStructure = {
    tasks: Array.isArray(rawSupport.tasks)
      ? rawSupport.tasks.filter((t): t is ProjectTaskType =>
          (PROJECT_TASK_VALUES as readonly string[]).includes(t),
        )
      : [],
    fourLayerSupport: Boolean(rawSupport.fourLayerSupport),
    coachingStyle: rawSupport.coachingStyle,
    externalSpeakers: Boolean(rawSupport.externalSpeakers),
    externalSpeakerCount: rawSupport.externalSpeakerCount,
    nonStartupSupport: rawSupport.nonStartupSupport,
  }

  const next: ProgramProfile = {
    ...p,
    scale: { ...p.scale, budgetTier: computeBudgetTier(p.scale.budgetKrw) },
    formats: [...p.formats],
    selection: { ...p.selection },
    methodology: { ...p.methodology },
    supportStructure: nextSupport,
    primaryImpact: [...p.primaryImpact],
    version: '1.1',
    updatedAt: new Date().toISOString(),
  }

  // 공모전 ↔ 심사 스타일 자동 연동
  const hasCompetition = next.formats.includes('공모전')
  if (hasCompetition && next.selection.style !== '공모전형' && next.selection.style !== '대중심사_병행') {
    next.selection.style = '공모전형'
  }
  if (next.selection.publicVoting) {
    next.selection.style = '대중심사_병행'
  }

  // 커스텀이 아니면 customFrameworkName 정리
  if (next.methodology.primary !== '커스텀') {
    delete next.methodology.customFrameworkName
  }

  // primaryImpact 길이 제한
  if (next.primaryImpact.length === 0) {
    next.primaryImpact = ['역량개발'] // 기본값
  }
  if (next.primaryImpact.length > 3) {
    next.primaryImpact = next.primaryImpact.slice(0, 3)
  }

  return next
}

// ─────────────────────────────────────────────────────────────────
// 유사도 매칭 — WinningPattern · 유사 프로젝트 쿼리용
// ─────────────────────────────────────────────────────────────────

/**
 * 축별 가중치 (합 = 1.0).
 *
 * v1.1: tasks(과업 유형) 축 신규 추가. methodology 를 0.25 → 0.22 로 소폭 낮추고
 * businessDomain · targetStage 를 각각 0.15 → 0.13 으로 축소해 tasks 0.10 을 확보.
 * 가중치 설계 근거: program-profile.md v1.1 Part 5.2.
 */
export const PROFILE_SIMILARITY_WEIGHTS = {
  methodology: 0.22,
  tasks: 0.1,
  businessDomain: 0.13,
  targetStage: 0.13,
  channel: 0.1,
  formats: 0.1,
  selection: 0.08,
  geography: 0.07,
  scale: 0.04,
  primaryImpact: 0.03,
} as const

/**
 * 두 프로파일 간 유사도 0~1.
 * 각 축별로 jaccard(집합 축) 또는 exact(단일 값 축) · tier proximity(스케일 축)
 * 점수를 계산 후 가중합.
 *
 * Phase E Step 3 (pm-guide/resolve.ts) 에서 사용.
 */
export function profileSimilarity(a: ProgramProfile, b: ProgramProfile): number {
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

  const tierProximity = <T>(xs: readonly T[], a: T, b: T): number => {
    const i = xs.indexOf(a)
    const j = xs.indexOf(b)
    if (i < 0 || j < 0) return 0
    const dist = Math.abs(i - j)
    const maxDist = xs.length - 1
    return maxDist === 0 ? 1 : 1 - dist / maxDist
  }

  const scoreMethodology = exactAxis(a.methodology.primary, b.methodology.primary)
  const scoreTasks = jaccard(
    a.supportStructure.tasks ?? [],
    b.supportStructure.tasks ?? [],
  )
  const scoreBizDomain = jaccard(a.targetSegment.businessDomain, b.targetSegment.businessDomain)
  const scoreStage = exactAxis(a.targetStage, b.targetStage)
  const scoreChannel =
    exactAxis(a.channel.type, b.channel.type) * 0.6 +
    exactAxis(a.channel.clientTier, b.channel.clientTier) * 0.4
  const scoreFormats = jaccard(a.formats, b.formats)
  const scoreSelection = exactAxis(a.selection.style, b.selection.style)
  const scoreGeography = exactAxis(a.targetSegment.geography, b.targetSegment.geography)
  const scoreScale = tierProximity(BUDGET_TIER_VALUES, a.scale.budgetTier, b.scale.budgetTier)
  const scoreImpact = jaccard(a.primaryImpact, b.primaryImpact)

  return (
    w.methodology * scoreMethodology +
    w.tasks * scoreTasks +
    w.businessDomain * scoreBizDomain +
    w.targetStage * scoreStage +
    w.channel * scoreChannel +
    w.formats * scoreFormats +
    w.selection * scoreSelection +
    w.geography * scoreGeography +
    w.scale * scoreScale +
    w.primaryImpact * scoreImpact
  )
}

// ─────────────────────────────────────────────────────────────────
// 검증 — Gate 3 블로킹 · 경고 룰 지원
// ─────────────────────────────────────────────────────────────────

/**
 * Gate 3 이슈 — 제1원칙 기준으로 **세 가지 맥락**을 함께 전달.
 *
 * message 만으로는 PM 에게 "왜 문제인지" 를 시스템적으로밖에 설명할 수 없음.
 * 실제로 PM 이 행동하려면:
 *   (a) 이 문제가 RFP 의 어떤 **배점 항목**을 위협하는지
 *   (b) 어떤 **언더독스 차별화 포인트**를 놓치는지
 *   (c) 구체적으로 어떻게 **고치는지** (언더독스 자산 활용 경로 포함)
 * — 이 셋을 명시해야 PM 이 "이걸 채워야 하는구나" 가 아니라 "이걸 채우면 이 배점이
 * 살아나고 이 차별화가 살아나는구나" 를 체감한다.
 */
export interface ProfileIssue {
  code: string
  severity: 'blocker' | 'warning'
  /** PM 이 가장 먼저 읽는 한 문장 — "왜 지금 이게 문제인가". */
  message: string
  /** 이 문제로 RFP 평가 중 어떤 배점 항목이 위협받는가. 경쟁사 대비 감점 맥락. */
  scoringImpact?: string
  /** 이 문제로 언더독스가 가진 어떤 차별화 자산/언어가 제안서에 못 들어가는가. */
  differentiationLoss?: string
  /** 구체적 해결 경로. 원자료 출처·언더독스 자산 활용법을 포함. */
  fixHint?: string
}

/**
 * 프로파일 + 연속사업 컨텍스트 검증.
 * Gate 3 (proposal-rules.ts) 에서 호출. 블로커 하나라도 있으면 제안서 작성 불가.
 */
export function validateProfile(
  profile: ProgramProfile,
  renewalContext: RenewalContext | null,
): ProfileIssue[] {
  const issues: ProfileIssue[] = []

  // ── 연속사업 필수 필드 (Q9 블로킹)
  if (profile.channel.isRenewal) {
    if (!renewalContext) {
      issues.push({
        code: 'renewal-context-missing',
        severity: 'blocker',
        message:
          '작년 성과·레슨런·개선영역이 비어 있습니다. 이대로 제안서를 쓰면 "처음 뵙는" 톤이 되어 재계약 심사의 핵심 논리(신뢰 누적·개선 의지)를 증명할 수 없습니다.',
        scoringImpact:
          '재계약 심사의 "제안사 이해도 · 개선 지향 · 성장 의지" 배점(통상 합계 20~30%)이 직접 감점됩니다. 신규 경쟁사와 같은 출발선에서 심사받게 됩니다.',
        differentiationLoss:
          '언더독스의 "작년 운영 데이터 기반 개선 설계" 차별화가 작동 불가. GS리테일 7기 연속 수주처럼 "N년 누적 데이터로 더 빠르고 더 정확하게" 메시지를 제안서에 녹일 수 없습니다.',
        fixHint:
          'Step 1 에서 작년 기수 KPI 실적 · 참여자 만족도 · 코치 집담회 메모 · 담당자 피드백 4개 원자료를 입력. 그러면 Step 6 제안서의 "지난해 성과 요약 → 올해 개선안" 섹션이 자동 생성 가능해집니다.',
      })
    } else {
      if (renewalContext.lastYearLessons.length < 50) {
        issues.push({
          code: 'renewal-lessons-empty',
          severity: 'warning',
          message:
            '작년 레슨런이 50자 미만입니다. "작년 운영을 학습했다" 는 신호가 평가위원에게 약하게 전달됩니다.',
          scoringImpact:
            '재계약 "성장 의지 · 개선 지향" 배점(통상 10점+) 에서 경쟁사 대비 감점 위험. 특히 "매년 같은 KPI" 로 읽히면 "성장 의지 부족" 으로 판정됩니다.',
          differentiationLoss:
            '언더독스의 "누적 데이터 자산" 차별화가 공허해집니다. 구체 사례 없이 "개선했습니다" 만으로는 경쟁사도 할 수 있는 말이 됩니다.',
          fixHint:
            '작년 운영 보고서 · 참여자 만족도 응답 · 코치 집담회 메모에서 실제 실패·부족 사례 2~3건 발췌. "A 세션 이탈률 높음 → B 로 대체" 같은 구체 인과 한 줄씩.',
        })
      }
      if (renewalContext.aspectsToImprove.length < 2) {
        issues.push({
          code: 'renewal-improvement-missing',
          severity: 'warning',
          message:
            '개선 영역이 2개 미만입니다. 재계약에서 "자만" 신호로 읽혀 "다시는 우리한테 안 맡기겠다" 는 위험이 생깁니다.',
          scoringImpact:
            '재계약 심사의 기본 기대치 미달. "제안 품질 · 성장 의지" 전반에 영향을 줘 한 배점 항목이 아니라 여러 항목에 걸쳐 누적 감점됩니다.',
          differentiationLoss:
            '"작년 대비 KPI 업그레이드" 라는 재계약 특화 차별화 언어를 제안서에 쓸 수 없습니다. 평범한 갱신 제안서가 됩니다.',
          fixHint:
            '담당자 통화에서 들은 "작년 아쉬웠던 점" 을 원자료로. 각 아쉬움 → 올해 개선안 1:1 매칭으로 최소 2~3건. 부록 A §1 체크리스트 참조.',
        })
      }
    }
  }

  // ── 과업 유형 비어 있음 (v1.1)
  if (!profile.supportStructure.tasks || profile.supportStructure.tasks.length === 0) {
    issues.push({
      code: 'tasks-empty',
      severity: 'warning',
      message:
        '이 사업이 어떤 과업(모객·심사·교류·멘토링·컨설팅·행사)으로 구성되는지 체크되지 않았습니다. RFP 파싱 결과가 비어 있거나 PM 이 확인하지 않은 상태입니다.',
      scoringImpact:
        '"과업 이해도 · 수행 계획의 구체성" 배점(통상 15~25%) 에서 감점 위험. 평가위원이 "무엇을 하겠다는 건지 불명확하다" 로 읽으면 대부분의 후속 배점(모집 전략·심사 설계·운영 역량)이 연쇄 감점됩니다.',
      differentiationLoss:
        '과업이 명시돼야 언더독스 자산이 어디에 붙는지 드러납니다. 예) "교류_네트워킹" → 520+ 글로벌 파트너 · 93개 지역 alumni / "멘토링_코칭" → 4중 지원 체계 · 800명 코치 풀. 과업이 비면 이 자산 매핑이 전부 공허해집니다.',
      fixHint:
        'Step 1 에서 RFP 를 다시 파싱하거나, 프로파일 패널 축 ③ 과업 유형에서 이 사업에 포함되는 항목을 직접 체크하세요. 보통 2~4개가 체크됩니다.',
    })
  }

  // ── 방법론-대상 불일치 경고
  if (
    profile.methodology.primary === 'IMPACT' &&
    profile.targetStage === '비창업자'
  ) {
    issues.push({
      code: 'methodology-mismatch',
      severity: 'warning',
      message:
        'IMPACT 는 창업가 대상 방법론입니다. 비창업자(상인·장인·임직원·디자이너) 사업에 그대로 적용하면 평가위원이 "과업 이해도 부족" 으로 판정합니다.',
      scoringImpact:
        '"제안 이해도 · 수행 적합성" 배점(통상 최고 가중치 20~30%) 직접 감점. 특히 지자체 상권 · 공모전 · 매칭형 사업에서 치명적.',
      differentiationLoss:
        '서촌·안성·한지·코오롱 사례로 축적된 "도메인 특화 프레임(로컬브랜드·글로컬·공모전설계·매칭)" 이 있는데 못 씁니다. 언더독스의 스펙트럼 차별화가 사라집니다.',
      fixHint:
        '사업 유형에 맞게 방법론 전환: 로컬 상권 → 로컬브랜드 / 장인 교류 → 글로컬 / 공모전·디자인 → 공모전설계 / 프로보노·멘토링 → 매칭 / 소상공인 매장 개선 → 소상공인성장.',
    })
  }

  // ── 글로벌 축에 해외 지원 구조 누락
  const isGlobal =
    profile.targetSegment.geography === '글로벌_공통' ||
    profile.targetSegment.geography === '글로벌_한국인바운드' ||
    profile.targetSegment.geography === '일본' ||
    profile.targetSegment.geography === '인도'
  const hasOverseasSupport =
    (profile.supportStructure.nonStartupSupport?.domainPartners?.length ?? 0) > 0 ||
    profile.methodology.primary === '글로벌진출' ||
    profile.methodology.primary === '글로컬'
  if (isGlobal && !hasOverseasSupport) {
    issues.push({
      code: 'geography-global-no-support',
      severity: 'warning',
      message:
        '글로벌 대상인데 해외 파트너 · 글로벌 방법론이 모두 비어 있습니다. 평가위원이 "국내 업체가 해외를 소화 가능한가?" 를 의심하게 됩니다.',
      scoringImpact:
        '글로벌 사업의 핵심 배점 "수행 가능성 · 현지화 역량" (통상 15~25%) 직접 감점. 글로벌 사업에서는 국내 경험량으로 대체가 안 되는 배점입니다.',
      differentiationLoss:
        '언더독스 고유 자산인 일본 법인(2025) · 인도 법인(2025) · 520+ 글로벌 파트너 · 아시아투모로우 플랫폼 · 메종&오브제 참여를 제안서에 못 담습니다. Section V 보너스도 비게 됩니다.',
      fixHint:
        'Step 3 코치 배정에서 해외 파트너 최소 1곳 명시(일본 무사시노대 · 인도 Action AI 대학 네트워크 · 台中 SI Lab 등) + 방법론을 글로벌진출 또는 글로컬로 전환.',
    })
  }

  return issues
}

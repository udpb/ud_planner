/**
 * Diagnostic Injector — F2 (Wave V, ADR-015, 2026-05-22)
 *
 * AI 가 생성한 커리큘럼 sessions 에 F1.5 진단 IP 회차를 자동 주입.
 *
 * 강제 규칙:
 *   - ACTT 사전 + ACTT 사후 = **페어 강제** (ACT Test 의 약자 — 사전·사후 둘 다 없으면
 *     성장 변화량 측정 자체가 불가능. 분리 X).
 *
 * AI 판단 (사업 특성 따라 0 or 1):
 *   - DOGS: 회차 N ≥ 4 + targetCount ≥ 5 일 때 권장 (네트워킹·팀빌딩 필요)
 *   - 5D: RFP keywords 가 Global/AI/Data/Finance/Domain 영역 매칭 시 권장
 *
 * 중복 방지: AI 가 이미 ACTT/DOGS/5D 키워드 회차를 만든 경우 추가 주입 skip.
 *
 * pure function.
 */

import type { CurriculumSession } from '@/lib/ai/curriculum-types'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ActpreneurUniverse } from '@/lib/program-profile'

export type DiagnosticType = 'DOGS' | 'ACTT_PRE' | 'FIVE_D' | 'ACTT_POST'

export interface DiagnosticInjectionInput {
  sessions: CurriculumSession[]
  rfp: RfpParsed
  universes?: ActpreneurUniverse[]
  /** PM 이 명시적으로 끈 경우 — 단 ACTT 페어는 강제 (사용자 변경 불가) */
  skipOptionalDiagnostics?: boolean
}

export interface DiagnosticInjectionResult {
  sessions: CurriculumSession[]
  added: Array<{ type: DiagnosticType; sessionNo: number; reason: string }>
  rationale: string[]
}

/**
 * 진단 IP 회차 자동 주입.
 *
 * 알고리즘:
 *   1. 기존 sessions 의 title 에서 진단 회차 키워드 검출 (중복 방지)
 *   2. ACTT 사전·사후 = 페어 강제 — 둘 중 하나라도 없으면 둘 다 자동 추가
 *      (사용자가 sessions 에 하나만 넣었어도 다른 하나 자동 보완)
 *   3. DOGS = 휴리스틱 (N ≥ 4 + targetCount ≥ 5)
 *   4. 5D = 휴리스틱 (RFP keywords 매칭)
 *   5. 정렬 후 sessionNo 재번호 (1, 2, 3...)
 */
export function injectDiagnosticSessions(
  input: DiagnosticInjectionInput,
): DiagnosticInjectionResult {
  const { sessions, rfp, universes = [], skipOptionalDiagnostics = false } = input
  const added: DiagnosticInjectionResult['added'] = []
  const rationale: string[] = []

  // 1. 기존 sessions 의 진단 회차 검출
  const existing = detectExistingDiagnostics(sessions)

  // 2. ACTT 페어 강제 (가장 중요)
  //    사전·사후 중 하나라도 누락이면 두 개 모두 추가
  //    (이미 둘 다 있으면 skip)
  const needsActtPair = !existing.acttPre || !existing.acttPost
  if (needsActtPair) {
    if (!existing.acttPre) {
      added.push({
        type: 'ACTT_PRE',
        sessionNo: 1.3, // 1회차 직후 (DOGS 가 1.2 일 때 그 다음)
        reason: 'ACT Test 사전 진단 — 성장 변화량(Δ) 측정의 기준점. 사후와 페어 필수.',
      })
    }
    if (!existing.acttPost) {
      added.push({
        type: 'ACTT_POST',
        sessionNo: 999.5, // 마지막 회차 직후 — sort 후 재번호
        reason: 'ACT Test 사후 진단 — 성장 변화량 정량 입증 (DDelta +1.10 검증).',
      })
    }
    rationale.push(
      `ACT Test (ACTT) 페어 ${existing.acttPre && existing.acttPost ? '유지' : '자동 보완'} — 사전·사후 둘 다 없으면 성장 측정 불가`,
    )
  } else {
    rationale.push('ACT Test 페어 이미 존재 (PM 또는 AI 작성)')
  }

  // 3. DOGS 휴리스틱 (선택)
  if (!existing.dogs && !skipOptionalDiagnostics) {
    const targetCount = rfp.targetCount ?? 0
    const shouldAddDogs = sessions.length >= 4 && targetCount >= 5
    if (shouldAddDogs) {
      added.push({
        type: 'DOGS',
        sessionNo: 0.5, // 1회차 직전 (OT)
        reason: `DOGS 성향 진단 + 대화카드 (대상 ${targetCount}명, 회차 ${sessions.length} — 네트워킹·팀빌딩 필요).`,
      })
      rationale.push(`DOGS 자동 추가 — 대상·회차 조건 충족`)
    } else {
      rationale.push(`DOGS 미추가 — 사업 규모 작음 (회차 ${sessions.length} / 대상 ${targetCount})`)
    }
  }

  // 4. 5D 휴리스틱 (선택)
  if (!existing.fiveD && !skipOptionalDiagnostics) {
    const shouldAdd5D = matchesFiveDKeywords(rfp.keywords ?? [], universes)
    if (shouldAdd5D.match) {
      added.push({
        type: 'FIVE_D',
        sessionNo: 1.4, // ACTT_PRE 와 같은 회차 묶기 (sort 후 인접)
        reason: `5D 핵심역량 진단 (Global·AI·Data·Finance·Domain) — ${shouldAdd5D.reason}`,
      })
      rationale.push(`5D 자동 추가 — ${shouldAdd5D.reason}`)
    } else {
      rationale.push(`5D 미추가 — RFP 키워드 미매칭`)
    }
  }

  // 5. sessions 에 추가 + 정렬 + 재번호
  const injectedSessions: CurriculumSession[] = added.map((a) =>
    buildDiagnosticSession(a.type, a.sessionNo, rfp, universes),
  )

  const merged = [...sessions, ...injectedSessions].sort(
    (a, b) => a.sessionNo - b.sessionNo,
  )

  // 재번호
  const renumbered = merged.map((s, i) => ({ ...s, sessionNo: i + 1 }))

  return {
    sessions: renumbered,
    added: added.map((a, i) => ({
      ...a,
      sessionNo: renumbered.find((s) => s.title === injectedSessions[i].title)?.sessionNo ?? a.sessionNo,
    })),
    rationale,
  }
}

// ─────────────────────────────────────────
// 헬퍼 — 기존 진단 회차 검출
// ─────────────────────────────────────────

interface ExistingDiagnostics {
  dogs: boolean
  acttPre: boolean
  fiveD: boolean
  acttPost: boolean
}

function detectExistingDiagnostics(sessions: CurriculumSession[]): ExistingDiagnostics {
  return {
    dogs: sessions.some(
      (s) =>
        /DOGS|성향 진단|성향진단|대화카드/i.test(s.title) ||
        s.diagnosticType === 'DOGS',
    ),
    acttPre: sessions.some(
      (s) =>
        /ACTT.*사전|사전.*ACTT|ACT Test.*사전|사전.*ACT Test|pre.*ACTT/i.test(s.title) ||
        s.diagnosticType === 'ACTT_PRE',
    ),
    fiveD: sessions.some(
      (s) =>
        /\b5D\b|5-?Day|핵심역량.*진단|five.*D/i.test(s.title) ||
        s.diagnosticType === 'FIVE_D',
    ),
    acttPost: sessions.some(
      (s) =>
        /ACTT.*사후|사후.*ACTT|ACT Test.*사후|사후.*ACT Test|post.*ACTT/i.test(s.title) ||
        s.diagnosticType === 'ACTT_POST',
    ),
  }
}

// ─────────────────────────────────────────
// 헬퍼 — 5D 키워드 매칭
// ─────────────────────────────────────────

const FIVE_D_KEYWORDS = {
  Global: ['글로벌', '해외', '크로스보더', '아시아', '일본', '인도', '수출'],
  AI: ['AI', 'ai', '인공지능', '생성형', 'LLM', '머신러닝', '딥러닝'],
  Data: ['데이터', 'data', '데이터분석', 'analytics', 'BI'],
  Finance: ['재무', '회계', '투자', 'IR', 'finance', '자금', '세무'],
  Domain: ['도메인', '전문', '업종', '산업', '기술', 'R&D'],
}

const FIVE_D_UNIVERSE_MATCH: ActpreneurUniverse[] = [
  'global-innovator',
  'hr-corporate', // AI/Data/Finance 영역 핵심
]

function matchesFiveDKeywords(
  keywords: string[],
  universes: ActpreneurUniverse[],
): { match: boolean; reason: string } {
  const haystack = keywords.join(' ').toLowerCase()
  const matchedAxes: string[] = []

  for (const [axis, words] of Object.entries(FIVE_D_KEYWORDS)) {
    if (words.some((w) => haystack.includes(w.toLowerCase()))) {
      matchedAxes.push(axis)
    }
  }

  if (matchedAxes.length >= 2) {
    return {
      match: true,
      reason: `5D 축 ${matchedAxes.length}개 매칭 (${matchedAxes.join(', ')})`,
    }
  }

  if (universes.some((u) => FIVE_D_UNIVERSE_MATCH.includes(u))) {
    return {
      match: true,
      reason: `universe ${universes.filter((u) => FIVE_D_UNIVERSE_MATCH.includes(u)).join(',')} 5D 친화`,
    }
  }

  return { match: false, reason: '5D 키워드·universe 미매칭' }
}

// ─────────────────────────────────────────
// 헬퍼 — 진단 회차 CurriculumSession 빌더
// ─────────────────────────────────────────

function buildDiagnosticSession(
  type: DiagnosticType,
  sessionNo: number,
  rfp: RfpParsed,
  universes: ActpreneurUniverse[],
): CurriculumSession {
  const targetAudience = rfp.targetAudience || '참가자'
  const channel = rfp.projectType ?? 'B2G'
  const universeHint = universes[0] ?? ''

  switch (type) {
    case 'DOGS':
      return {
        sessionNo,
        title: contextualDOGSTitle(universeHint, targetAudience),
        category: 'WORKSHOP',
        method: 'OFFLINE',
        durationHours: 1.5,
        lectureMinutes: 20,
        practiceMinutes: 70,
        isTheory: false,
        isActionWeek: false,
        isCoaching1on1: false,
        isDiagnostic: true,
        diagnosticType: 'DOGS',
        autoSeeded: true,
        objectives: [
          '창업가 성향 4 주축 12 유형 자가 진단',
          'DOGS 대화카드로 참가자 간 라포 형성·팀빌딩',
        ],
        recommendedExpertise: ['창업가 성향 진단', 'DOGS 운영', '팀 빌딩'],
        notes:
          '교육 시작 전 1회 — 참가자 성향 이해 + 네트워킹·밍글링. ' +
          '[근거: 하나소셜벤처유니버시티 최종결과보고서 | 2026.01]',
      }

    case 'ACTT_PRE':
      return {
        sessionNo,
        title: contextualACTTPreTitle(universeHint, channel),
        category: 'ASSESSMENT',
        method: 'ONLINE',
        durationHours: 1,
        lectureMinutes: 10,
        practiceMinutes: 50,
        isTheory: false,
        isActionWeek: false,
        isCoaching1on1: false,
        isDiagnostic: true,
        diagnosticType: 'ACTT_PRE',
        autoSeeded: true,
        objectives: [
          'ACT Test 사전 진단 — 5대 역량 × 15 지표 기초 측정',
          '사후 비교 기준점 확립 (성장 변화량 측정의 출발점)',
        ],
        recommendedExpertise: ['ACTT 운영', '역량 진단'],
        notes:
          'ACT Test (ACTT) 사전 — 사후와 페어 필수. 사전 없으면 변화량 Δ 측정 불가능. ' +
          '[근거: 임팩트 리서치랩 「언더독스 사회성과 연구」 | 2024.01]',
      }

    case 'FIVE_D':
      return {
        sessionNo,
        title: '5D 핵심역량 진단 (Global · AI · Data · Finance · Domain)',
        category: 'ASSESSMENT',
        method: 'ONLINE',
        durationHours: 0.5,
        lectureMinutes: 5,
        practiceMinutes: 25,
        isTheory: false,
        isActionWeek: false,
        isCoaching1on1: false,
        isDiagnostic: true,
        diagnosticType: 'FIVE_D',
        autoSeeded: true,
        objectives: [
          'AI 시대 5 핵심역량 5축 자가 진단',
          '약점 축 식별 → 맞춤 커리큘럼·코칭 매칭 근거',
        ],
        recommendedExpertise: ['5D 진단 운영'],
        notes:
          '5D — Global·AI·Data·Finance·Domain 시대 필수역량 5축. ACTT 와 별도 진단으로 약점 축 정확히 짚음.',
      }

    case 'ACTT_POST':
      return {
        sessionNo,
        title: contextualACTTPostTitle(universeHint, channel),
        category: 'ASSESSMENT',
        method: 'OFFLINE',
        durationHours: 2,
        lectureMinutes: 20,
        practiceMinutes: 100,
        isTheory: false,
        isActionWeek: false,
        isCoaching1on1: false,
        isDiagnostic: true,
        diagnosticType: 'ACTT_POST',
        autoSeeded: true,
        objectives: [
          'ACT Test 사후 진단 — 사전 대비 변화량(Δ) 정량 측정',
          '성과 발표 + 우수 사례 공유',
        ],
        recommendedExpertise: ['ACTT 운영', '성과 발표 진행'],
        notes:
          'ACT Test (ACTT) 사후 — 사전과 페어로 변화량 측정. ' +
          '벤치마크: 사전→사후 실행단계 변화량 +1.10 (N=1,002), Top 20% 우수 코호트 Δ0.67. ' +
          '[근거: 임팩트 리서치랩 「언더독스 사회성과 연구」 | 2024.01]',
      }
  }
}

// ─────────────────────────────────────────
// universe·채널 별 description 다양화 (정형화 회피)
// ─────────────────────────────────────────

function contextualDOGSTitle(universe: ActpreneurUniverse | '', audience: string): string {
  switch (universe) {
    case 'startup':
      return '초기 창업가 DOGS 성향 진단 + 페어 매칭 (대화카드 네트워킹)'
    case 'sme':
      return 'SME 대표 DOGS 성향 진단 + 협업 풀 형성 (대화카드)'
    case 'local-creator':
      return '로컬 크리에이터 DOGS 진단 + 지역 거점 매핑 (대화카드)'
    case 'culture-1person':
      return '1인 창작자 DOGS 자기 이해 진단 + 동료 연결 (대화카드)'
    case 'hr-corporate':
      return '사내 혁신가 DOGS 진단 + 팀 다양성 진단 (대화카드)'
    case 'senior':
      return '시니어 액트프러너 DOGS 자기 이해 (대화카드)'
    case 'next-gen':
      return '청년 액트프러너 DOGS 진단 + 진로 탐색 (대화카드)'
    case 'di-inclusive':
      return '포용적 액트프러너 DOGS 진단 + 강점 매핑 (대화카드)'
    case 'global-innovator':
      return '글로벌 액트프러너 DOGS 진단 + 크로스보더 페어 (대화카드)'
    default:
      return `${audience} DOGS 창업가 성향 진단 + 대화카드 (네트워킹·팀빌딩)`
  }
}

function contextualACTTPreTitle(universe: ActpreneurUniverse | '', channel: string): string {
  const base = 'ACT Test 사전 진단 (ACTT 5대 역량 × 15 지표)'
  switch (universe) {
    case 'startup':
      return `${base} — 초기 창업가 기초 실행력 측정`
    case 'sme':
      return `${base} — SME 대표 실행 역량 기초선`
    case 'local-creator':
      return `${base} — 로컬 실행가 자생력 기초선`
    case 'global-innovator':
      return `${base} — 글로벌 액트프러너 크로스보더 실행력 기초선`
    case 'hr-corporate':
      return `${base} — 사내 혁신가 애자일 실행력 기초선`
    case 'senior':
      return `${base} — 시니어 경험 → 실행력 전환 기초선`
    default:
      return channel === 'B2G' ? `${base} — 정책 사업 KPI 대응 기초선` : base
  }
}

function contextualACTTPostTitle(universe: ActpreneurUniverse | '', channel: string): string {
  const base = 'ACT Test 사후 진단 + 성과 발표 (변화량 Δ 정량 입증)'
  switch (universe) {
    case 'startup':
      return `${base} — 초기 창업가 실행력 성장 검증`
    case 'sme':
      return `${base} — SME 대표 실행 역량 변화 검증`
    case 'global-innovator':
      return `${base} — 글로벌 액트프러너 크로스보더 성장 검증`
    default:
      return channel === 'B2G' ? `${base} — 정책 KPI 달성도 검증` : base
  }
}

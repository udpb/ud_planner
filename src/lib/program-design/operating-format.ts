/**
 * ProgramDesignPattern — 운영 변수 16축 스키마 (ADR-028 동결)
 *
 * WinningProposalDoc 1건 → ProgramDesignPattern JSON 1건.
 * 키 **이름·구조**는 ADR-028 로 동결 (변경 시 ADR supersede 필요).
 * enum **값**은 데이터 레이어에서 가변 — zod 는 구조만 검증하고 값은 string 으로
 * 받는다 (enum 밖 관찰값을 조용히 버리지 않기 위함. 권장 어휘는
 * extraction-prompt.ts 의 VOCAB 참조).
 *
 * 전 축 공통 패턴: `{ value: <축별 구조 | null>, confidence: 0~1, evidence: string[] }`
 *   - 원문에 없으면 value=null + confidence=0 (강의 분류 v5.4 "[파악 불가]" 원칙)
 *   - non-null(비어있지 않은) 값에는 evidence(원문 인용 ≤200자) 1개 이상 필수
 *
 * intensity 는 LLM 산출이 아니라 추출값에서 **코드로 파생 계산** (deriveIntensity).
 *
 * Source: docs/decisions/028-program-design-grammar.md ·
 *         .claude/agent-briefs/BR-1-design-pattern-extraction.md
 */

import { z } from 'zod'

/** evidence 인용 최대 길이 (ADR-028 "≤200자"). normalize 단계에서 잘라낸 뒤 검증. */
export const MAX_EVIDENCE_CHARS = 200

// ─────────────────────────────────────────────────────────────────
// 공통 Axis 래퍼
// ─────────────────────────────────────────────────────────────────

export interface AxisValue<T> {
  value: T | null
  /** 0~1. value=null 이면 0. */
  confidence: number
  /** 원문 인용 (각 ≤200자). non-null 값이면 1개 이상. */
  evidence: string[]
}

/** value 가 "비어 있음"인지 — null 또는 빈 배열 (둘 다 evidence 불요). */
function isEmptyAxisValue(v: unknown): boolean {
  return v === null || (Array.isArray(v) && v.length === 0)
}

/** 축 zod 헬퍼 — { value, confidence, evidence } + "non-null 값엔 evidence ≥1" 규칙. */
function axis<T extends z.ZodType>(valueSchema: T) {
  return z
    .object({
      value: z.nullable(valueSchema),
      confidence: z.number().min(0).max(1),
      evidence: z.array(z.string().max(MAX_EVIDENCE_CHARS)),
    })
    .superRefine((raw, ctx) => {
      // 제네릭 T 미해결 상태에서 zod v4 mapped-type 추론이 콜백 내부에서만 깨짐 → 명시 캐스트.
      const a = raw as unknown as { value: unknown; evidence: string[] }
      if (!isEmptyAxisValue(a.value) && a.evidence.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'non-null 축 값에는 원문 인용 evidence 가 1개 이상 필요 (ADR-028)',
        })
      }
    })
}

// ─────────────────────────────────────────────────────────────────
// Layer A — profileSnapshot (ProgramProfile 11축 부분집합 추정)
// ─────────────────────────────────────────────────────────────────

const scaleSchema = z.object({
  /** 원 단위 정수 (예: 3억 → 300000000). 제안서에 없으면 null (과업지시서 별도 가능). */
  budgetKrw: z.number().int().nullable(),
  /** 참여 인원/팀 수 (명 단위 정수). */
  participants: z.number().int().nullable(),
  /** 사업 기간 (개월). */
  durationMonths: z.number().nullable(),
})

export const profileSnapshotSchema = z.object({
  targetStage: axis(z.string()),
  demographic: axis(z.array(z.string())),
  businessDomain: axis(z.array(z.string())),
  geography: axis(z.string()),
  /** B2G | B2B | renewal | 기타 — DB channel null 22건 보정 역기입 후보 (ADR-028 Follow-up). */
  channel: axis(z.string()),
  clientTier: axis(z.string()),
  scale: axis(scaleSchema),
  methodologySignals: axis(z.array(z.string())),
})

// ─────────────────────────────────────────────────────────────────
// Layer B — operatingFormat 16축 (키 이름 동결, ADR-028 표)
// ─────────────────────────────────────────────────────────────────

export const operatingFormatSchema = z.object({
  /** 1. 사전학습 */
  preLearning: axis(
    z.object({
      types: z.array(z.string()), // 없음/LMS_VOD/사전진단/사전과제/기타
      diagnostics: z.array(z.string()), // DOGS/ACTT/5D/기타
      hours: z.number().nullable(),
    }),
  ),
  /** 2. 전달 방식 */
  deliveryMode: axis(
    z.object({
      mode: z.string().nullable(), // 온라인/오프라인/하이브리드
      onlineRatio: z.number().int().min(0).max(100).nullable(), // 0~100 정수
      syncType: z.string().nullable(), // 실시간/VOD/혼합
    }),
  ),
  /** 3. 회차 리듬 */
  cadence: axis(
    z.object({
      totalSessions: z.number().int().nullable(),
      rhythm: z.string().nullable(), // 주1회/주2회/격주/집중캠프/혼합
      campDays: z.number().nullable(),
    }),
  ),
  /** 4. 회차 길이 */
  sessionLength: axis(
    z.object({
      hoursPerSession: z.number().nullable(),
      timeOfDay: z.string().nullable(), // 주간/저녁/주말/종일
    }),
  ),
  /** 5. 이론:실습 비율 */
  theoryPracticeRatio: axis(
    z.object({
      lecturePct: z.number().int().min(0).max(100).nullable(),
      practicePct: z.number().int().min(0).max(100).nullable(),
      basis: z.string().nullable(), // 명시/추정
    }),
  ),
  /** 6. 코칭 구조 */
  coaching: axis(
    z.object({
      types: z.array(z.string()), // 1:1/팀전담/그룹/온라인후속
      totalRounds: z.number().int().nullable(),
      hoursPerRound: z.number().nullable(),
      coachToTeamRatio: z.string().nullable(), // 예: '1:5'
      pairing: z.string().nullable(), // 매칭 방식 설명
    }),
  ),
  /** 7. 코호트 구조 */
  cohortStructure: axis(
    z.object({
      isCohort: z.boolean().nullable(),
      teamBased: z.boolean().nullable(),
      teamSize: z.number().int().nullable(),
      tracks: z.number().int().nullable(),
      peerDevices: z.array(z.string()), // 동료리뷰/커뮤니티/네트워킹
    }),
  ),
  /** 8. 마일스톤 이벤트 */
  milestoneEvents: axis(
    z.array(
      z.object({
        type: z.string(), // 중간공유회/데모데이/IR/네트워킹/박람회/해커톤/경진대회/기타
        timing: z.string().nullable(), // 초반/중반/종반
      }),
    ),
  ),
  /** 9. 선발 퍼널 */
  selectionFunnel: axis(
    z.object({
      stages: z.number().int().nullable(),
      methods: z.array(z.string()), // 서류/PT/면접/진단
      competitionRatio: z.string().nullable(), // 예: '5:1'
      midDropGate: z.boolean().nullable(), // 중간 탈락 게이트 존재 여부
    }),
  ),
  /** 10. Action Week */
  actionWeek: axis(
    z.object({
      count: z.number().int().nullable(),
      placement: z.string().nullable(),
    }),
  ),
  /** 11. 결과물 — 사업계획서/IR덱/MVP/프로토타입/브랜드/매출실적/기타 */
  deliverables: axis(z.array(z.string())),
  /** 12. 인센티브 */
  incentives: axis(
    z.object({
      types: z.array(z.string()), // 사업화지원금/시제품비/상금/후속연계
      amounts: z.array(
        z.object({
          label: z.string(),
          amountKrw: z.number().int().nullable(), // 원 단위 정수
        }),
      ),
    }),
  ),
  /** 13. 운영 인력 */
  faculty: axis(
    z.object({
      types: z.array(z.string()), // 전담코치/외부전문가/연사/동문코치
      headcount: z.number().int().nullable(),
      dedicatedPm: z.boolean().nullable(),
    }),
  ),
  /** 14. 장소 — 고정교육장/현장방문/합숙시설/온라인/지역거점 (복수) */
  venue: axis(z.array(z.string())),
  /** 15. 수료/평가 */
  assessment: axis(
    z.object({
      completionCriteria: z.array(z.string()), // 출석률/과제/결과물/발표
      attendanceThreshold: z.number().int().min(0).max(100).nullable(), // % 정수
    }),
  ),
  /** 16. 사후관리 */
  aftercare: axis(
    z.object({
      types: z.array(z.string()), // 없음/alumni/후속보육/투자연계/온라인코칭
      duration: z.string().nullable(),
    }),
  ),
})

// ─────────────────────────────────────────────────────────────────
// 확장 레이어 (VOD 분류 v5.4 정합)
// ─────────────────────────────────────────────────────────────────

export const contentMixSchema = axis(
  z.object({
    deliveryFormats: z.array(z.string()), // 강연/경험담/인터뷰·대담/워크숍·실습/데모·시연/패널
    contentTypes: z.array(z.string()), // 이론·개념/사례·경험/실무·도구/트렌드·인사이트
    difficultyArc: z.string().nullable(), // 단일/상승/혼합
  }),
)

export const sessionItemSchema = z.object({
  no: z.number().int(),
  title: z.string(),
  hours: z.number().nullable(),
  format: z.string().nullable(),
  isTheory: z.boolean().nullable(),
  isCoaching: z.boolean().nullable(),
  isEvent: z.boolean().nullable(),
})
export type SessionItem = z.infer<typeof sessionItemSchema>

/** 회차 시퀀스 — 원문에 회차표가 없거나 깨졌으면 빈 배열 (억지 복원 금지). */
export const sessionsSchema = axis(z.array(sessionItemSchema))

export const validitySchema = axis(
  z.object({
    status: z.string(), // 상시유효/점검필요/폐기후보
    reason: z.string().nullable(),
  }),
)

export const kpiTargetItemSchema = z.object({
  metric: z.string(), // 예: 수료율, 만족도
  targetValue: z.number().nullable(),
  unit: z.string().nullable(), // %, 점, 건, 명 …
  raw: z.string().nullable(), // 원문 표현 보존 (예: '85% 이상')
})
export const kpiTargetsSchema = axis(z.array(kpiTargetItemSchema))

// ─────────────────────────────────────────────────────────────────
// intensity (파생 계산 — LLM 산출 금지) + extractionMeta
// ─────────────────────────────────────────────────────────────────

export const intensitySchema = z.object({
  totalEducationHours: z.number().nullable(),
  totalWeeks: z.number().nullable(),
  /** 어떤 추출값으로 계산했는지 (스팟체크용). */
  basis: z.string().nullable(),
})
export type Intensity = z.infer<typeof intensitySchema>

export const extractionMetaSchema = z.object({
  model: z.string(),
  charCount: z.number().int(),
  parseBy: z.string().nullable(),
  lowText: z.boolean(),
  /** parseBy === 'unsupported' 플래그 (추출은 하되 품질 저하 표시). */
  unsupported: z.boolean(),
  /** fullText 60k 초과로 앞 55k 만 투입했는지. */
  truncated: z.boolean(),
  /** invokeAi intra-Gemini 폴백 발생 여부 (plumbing 티어 이탈 감시). */
  fallback: z.boolean(),
  extractedAt: z.string(),
})

// ─────────────────────────────────────────────────────────────────
// LLM 출력 스키마 (extraction-prompt 가 요구하는 형태) + 최종 파일 스키마
// ─────────────────────────────────────────────────────────────────

/** LLM 이 반환해야 하는 부분 — docId/intensity/extractionMeta 는 코드가 채움. */
export const extractionOutputSchema = z.object({
  profileSnapshot: profileSnapshotSchema,
  operatingFormat: operatingFormatSchema,
  contentMix: contentMixSchema,
  sessions: sessionsSchema,
  validity: validitySchema,
  kpiTargets: kpiTargetsSchema,
})
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>

/** 최종 산출 파일 (data/program-design/extracted/<docId>.json) 의 스키마. */
export const programDesignPatternSchema = extractionOutputSchema.extend({
  docId: z.string(),
  projectId: z.string().nullable(),
  projectName: z.string(),
  intensity: intensitySchema,
  extractionMeta: extractionMetaSchema,
})
export type ProgramDesignPattern = z.infer<typeof programDesignPatternSchema>

// ─────────────────────────────────────────────────────────────────
// normalize — LLM 출력의 사소한 위반(긴 evidence·범위 밖 confidence)을
// zod 검증 전에 보정. 값 자체는 바꾸지 않는다 (추측 채움 아님).
// ─────────────────────────────────────────────────────────────────

function isAxisLike(o: unknown): o is { value: unknown; confidence: unknown; evidence: unknown } {
  return (
    typeof o === 'object' &&
    o !== null &&
    !Array.isArray(o) &&
    'value' in o &&
    'confidence' in o &&
    'evidence' in o
  )
}

/**
 * 깊은-빈 값 판정 — null/빈배열/빈문자열, 또는 모든 leaf 가 깊은-빈 값인 객체·배열.
 * LLM 이 "정보 없음"을 `{ hoursPerSession: null, timeOfDay: null }` 처럼 전부-null
 * 객체로 반환하는 경우가 있어, 이를 value=null 과 동일하게 취급한다 (값 변조 아님).
 */
function isDeepEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim().length === 0
  if (Array.isArray(v)) return v.length === 0 || v.every(isDeepEmpty)
  if (typeof v === 'object') {
    const entries = Object.values(v)
    return entries.length === 0 || entries.every(isDeepEmpty)
  }
  return false // number · boolean 은 정보값
}

/**
 * LLM 출력 deep-walk 보정:
 *  - evidence: 문자열 배열 강제 + 각 항목 200자 절단
 *  - confidence: 숫자 강제 + [0,1] clamp · value 비어 있으면 0
 *  - value === undefined → null · 깊은-빈 객체 value → null (전부-null 내부 필드)
 */
export function normalizeExtraction(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(normalizeExtraction)
  if (typeof input !== 'object' || input === null) return input

  if (isAxisLike(input)) {
    const valueRaw = (input as { value: unknown }).value
    let value = valueRaw === undefined ? null : normalizeExtraction(valueRaw)
    // 전부-null 내부 필드 객체 등 깊은-빈 값 → null 로 통일 ("정보 없음" 표기 일원화).
    // 단 배열은 빈 배열([]) 표기를 보존 (sessions 의 "회차표 복원 불가 = []" 규약).
    if (!Array.isArray(value) && isDeepEmpty(value)) value = null
    const evidenceRaw = (input as { evidence: unknown }).evidence
    const evidence = (Array.isArray(evidenceRaw) ? evidenceRaw : [])
      .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
      .map((e) => (e.length > MAX_EVIDENCE_CHARS ? e.slice(0, MAX_EVIDENCE_CHARS) : e))
    const confRaw = (input as { confidence: unknown }).confidence
    let confidence = typeof confRaw === 'number' && Number.isFinite(confRaw) ? confRaw : 0
    confidence = Math.min(1, Math.max(0, confidence))
    if (isEmptyAxisValue(value)) confidence = 0
    return { value, confidence, evidence }
  }

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    out[k] = normalizeExtraction(v)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────
// deriveIntensity — 추출값에서 코드로 파생 (ADR-028: LLM 에게 시키지 않음)
// ─────────────────────────────────────────────────────────────────

/** rhythm 라벨 → 주당 회차 수 (알려진 라벨만, 그 외 null). */
function sessionsPerWeek(rhythm: string | null): number | null {
  if (!rhythm) return null
  if (rhythm.includes('주1회')) return 1
  if (rhythm.includes('주2회')) return 2
  if (rhythm.includes('격주')) return 0.5
  return null
}

export function deriveIntensity(out: ExtractionOutput): Intensity {
  const cadence = out.operatingFormat.cadence.value
  const sessionLength = out.operatingFormat.sessionLength.value
  const sessions = out.sessions.value ?? []
  const durationMonths = out.profileSnapshot.scale.value?.durationMonths ?? null

  // totalEducationHours — ① 회차 시퀀스 hours 전부 명시 시 합산 ② cadence×sessionLength
  let totalEducationHours: number | null = null
  let hoursBasis: string | null = null
  if (sessions.length > 0 && sessions.every((s) => typeof s.hours === 'number')) {
    totalEducationHours = sessions.reduce((sum, s) => sum + (s.hours as number), 0)
    hoursBasis = `sessions[${sessions.length}] hours 합산`
  } else if (
    typeof cadence?.totalSessions === 'number' &&
    typeof sessionLength?.hoursPerSession === 'number'
  ) {
    totalEducationHours = cadence.totalSessions * sessionLength.hoursPerSession
    hoursBasis = `cadence.totalSessions(${cadence.totalSessions}) × sessionLength.hoursPerSession(${sessionLength.hoursPerSession})`
  }

  // totalWeeks — ① totalSessions ÷ 주당 회차 ② durationMonths × 4.33
  let totalWeeks: number | null = null
  let weeksBasis: string | null = null
  const perWeek = sessionsPerWeek(cadence?.rhythm ?? null)
  if (typeof cadence?.totalSessions === 'number' && perWeek !== null) {
    totalWeeks = Math.ceil(cadence.totalSessions / perWeek)
    weeksBasis = `totalSessions(${cadence.totalSessions}) ÷ rhythm(${cadence?.rhythm})`
  } else if (typeof durationMonths === 'number') {
    totalWeeks = Math.round(durationMonths * 4.33)
    weeksBasis = `durationMonths(${durationMonths}) × 4.33`
  }

  const basis =
    hoursBasis || weeksBasis
      ? [hoursBasis && `hours: ${hoursBasis}`, weeksBasis && `weeks: ${weeksBasis}`]
          .filter(Boolean)
          .join(' · ')
      : null

  return { totalEducationHours, totalWeeks, basis }
}

/**
 * BR-SROI-1 — impact-measurement SROI 서비스 계약 타입 (클라이언트)
 *
 * ⭐ SROI는 렌즈이지 타깃이 아니다. 비율을 최대화하지 않는다 — 카테고리별 분해 +
 *    가정(assumptions)을 함께 본다. 이 모듈에는 랭킹/최대화 함수가 없다(의도).
 *
 * 계약 출처: impact-measurement 서비스 API (`feat/service-api`, BR-SROI-1 브리프 §Context).
 *   GET  /api/v1/coefficients?country=KR
 *   POST /api/v1/measurements/predict
 *   인증: Authorization: Bearer ${SERVICE_API_TOKEN}
 *
 * 사회가치 산식: 카테고리값 = combinedProxyValue × ∏(formulaVariables 값). SROI = Σ / 예산.
 *   → proxy(계수)는 **서비스에서만** 온다. 이 코드에 수치 하드코딩 금지.
 */

// ─────────────────────────────────────────────────────────────────
// GET /api/v1/coefficients
// ─────────────────────────────────────────────────────────────────

/** 카테고리 1건의 계수(proxy) — 전부 서비스가 내려준다(하드코딩 금지). */
export interface CoefficientEntry {
  categoryId: string
  categoryName: string
  impactTypeName: string
  /** 이 카테고리값 = combinedProxyValue × ∏(이 변수들의 값). */
  formulaVariables: string[]
  combinedProxyValue: number
  version: string | number
  effectiveDate: string
}

export interface CoefficientsResponse {
  asOf: string
  country: string
  categories: CoefficientEntry[]
}

// ─────────────────────────────────────────────────────────────────
// POST /api/v1/measurements/predict
// ─────────────────────────────────────────────────────────────────

/**
 * 예측 항목 1건. categoryId 만 필수, 나머지 변수는 카테고리 formulaVariables 에 맞춰 채운다.
 *
 * ⚠️ 결과 변수(newEmployees·investmentAmount·revenue·bizFund 등)는 **설계 사실이 아니라
 *    목표/추정** 이다. plan/구조에서 추측 생성 금지 — kpiTargets 나 PM 입력에서만 채운다.
 */
export interface PredictItem {
  categoryId: string
  count?: number
  participants?: number
  days?: number
  months?: number
  revenue?: number
  newEmployees?: number
  investmentAmount?: number
  bizFund?: number
  coachesTrained?: number
  eventParticipants?: number
  spaceArea?: number
  spaceDuration?: number
}

export interface PredictRequest {
  externalProjectId: string
  title: string
  country?: string
  budget?: number
  programType?: string
  participantType?: string
  totalParticipants?: number
  startDate?: string
  endDate?: string
  items: PredictItem[]
}

/** 서비스가 내려주는 카테고리별 분해(있으면). shape 는 서비스 소유 — 느슨하게 받는다. */
export interface PredictBreakdownEntry {
  categoryId: string
  categoryName?: string
  value?: number
  [k: string]: unknown
}

export interface PredictResponse {
  measurementId: string
  totalSocialValue: number
  beneficiaryCount: number
  /** SROI = Σ 사회가치 / 예산. 예산 0/미상이면 서비스가 null 일 수 있다. */
  sroi: number | null
  breakdown: PredictBreakdownEntry[]
  reportUrl: string
  shareToken: string
}

// ─────────────────────────────────────────────────────────────────
// 매핑 산출 (map-plan-to-impact)
// ─────────────────────────────────────────────────────────────────

/**
 * 가정 1건 — "이 값을 어디서 가져왔는가 / 왜 비웠는가"를 투명하게 남긴다.
 *   - status='derived'  : 설계 사실에서 직접 도출 (참여자·코칭 회수 등).
 *   - status='provided' : 클라이언트 목표(kpiTargets)/PM 입력에서 받음.
 *   - status='missing'  : 결과 변수가 없어 **추측하지 않고 제외**(부분 예측). PM 입력 필요.
 */
export interface Assumption {
  /** 어떤 카테고리/변수에 대한 가정인지 (예: 'coaching.participants', categoryId). */
  field: string
  status: 'derived' | 'provided' | 'missing'
  /** 사람이 읽는 한 줄 설명 (한국어). */
  note: string
  /** 채워진 값(있으면) — missing 이면 undefined. */
  value?: number
}

/** mapPlanToImpactItems 의 산출 — items + 그 items 가 어떤 가정 위에 섰는지. */
export interface MappedImpact {
  items: PredictItem[]
  assumptions: Assumption[]
}

// ─────────────────────────────────────────────────────────────────
// 목표/KPI 입력 (결과 변수의 유일한 출처)
// ─────────────────────────────────────────────────────────────────

/**
 * KPI 목표 1건 — operating-format 의 kpiTargets 항목과 같은 어휘(metric/targetValue/unit).
 * 결과 변수(고용·투자·창업전환·매출)는 **여기서만** 온다. 없으면 assumptions=missing.
 */
export interface SroiKpiTarget {
  metric: string
  targetValue: number | null
  unit?: string | null
  raw?: string | null
}

/**
 * 의미 역할 → 서비스 categoryId 바인딩.
 *
 * ⚠️ categoryId 는 서비스 소유다 — 이 코드에 하드코딩 금지. 어떤 카테고리가 "교육/코칭/
 *    고용/투자/창업전환"에 해당하는지는 **PM/설정이 명시**하거나, resolveCategoryBindings 가
 *    라이브 계수의 formulaVariables 를 보고 추론한다. 바인딩이 없는 역할은 item 을 만들지
 *    않고 assumptions=missing 으로 남긴다(추측 생성 금지).
 */
export interface CategoryBindings {
  /** 교육/세션 카테고리 (설계 사실 — participants). */
  education?: string
  /** 1:1 코칭 카테고리 (설계 사실 — count=코칭 회수, participants=인원). */
  coaching?: string
  /** 행사 카테고리 (설계 사실 — eventParticipants). */
  event?: string
  /** 신규 고용 (결과 변수 — 목표/PM 입력만). */
  employment?: string
  /** 투자 유치 (결과 변수 — 목표/PM 입력만). */
  investment?: string
  /** 창업 전환 (결과 변수 — 목표/PM 입력만). */
  startup?: string
  /** 매출 (결과 변수 — 목표/PM 입력만). */
  revenue?: string
}

/**
 * 클라이언트 목표 + PM 입력. mapPlanToImpactItems 의 결과 변수 출처.
 * 전부 optional — 없으면 해당 결과 변수 카테고리는 제외(부분 예측).
 */
export interface SroiGoal {
  /** 의미 역할 → categoryId. 없으면 해당 역할 item 제외(assumptions=missing). */
  categoryBindings?: CategoryBindings
  /** 클라이언트가 명시한 KPI 목표 (kpiTargets). */
  kpiTargets?: SroiKpiTarget[]
  /** PM 이 직접 넣은 결과 변수 추정 (있으면). 추측 생성과 구분 — 명시 입력만. */
  pmInputs?: {
    newEmployees?: number
    investmentAmount?: number
    revenue?: number
    bizFund?: number
    startupConversions?: number
  }
  /** 예산(VAT 포함/별도는 호출부 책임) — SROI 분모. 없으면 sroi=null(부분 예측). */
  budget?: number
  /** 참여 인원 — RFP/목표에서. plan 에는 직접 없으므로 여기로 받는다. */
  totalParticipants?: number
  /** 국가 (계수 조회 country). 미지정 시 'KR'. */
  country?: string
  /** 예측 식별자/제목 (서비스 predict 요청용). */
  externalProjectId?: string
  title?: string
}

// ─────────────────────────────────────────────────────────────────
// 예측 산출 (predict — 오프라인 계수 산식)
// ─────────────────────────────────────────────────────────────────

/** 카테고리별 분해 1건 — "왜 이 임팩트가 나오는가"를 보여주는 단위. */
export interface SroiBreakdownEntry {
  categoryId: string
  categoryName: string
  /** combinedProxyValue × ∏(vars) 결과. */
  value: number
  /** 산식에 들어간 변수값들 (변수명 → 값). 투명성 — 빈 변수는 제외됨. */
  vars: Record<string, number>
}

/**
 * 예측 SROI 산출 — **분해 + 가정이 본체**, sroi 비율은 보조 렌즈.
 * lens.note 가 "비율을 줄세우지 말라"는 프레이밍을 항상 동반한다.
 */
export interface PredictedSroi {
  breakdown: SroiBreakdownEntry[]
  totalSocialValue: number
  /** budget>0 일 때만 비율. 없으면 null(부분 예측 — 분해만 보라). */
  sroi: number | null
  /** 렌즈 프레이밍 — 랭킹/최대화 금지를 코드 레벨에서 상기. */
  lens: {
    /** 가장 큰 사회가치 기여 카테고리(있으면). **최댓값 ≠ 더 좋음** — 단지 어디서 오는지. */
    dominantCategory: string | null
    note: string
  }
  /** 이 예측이 선 가정들 (derived/provided/missing). */
  assumptions: Assumption[]
}

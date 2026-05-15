/**
 * Impact Measurement 시스템과 공유되는 타입 (Wave M1, 2026-05-15)
 *
 * **방침**: 이 타입들은 impact-measurement 의 schema 와 의도적으로 동일.
 * 그 repo 는 절대 import 하지 않고, 여기서 type 만 손으로 미러링.
 *
 * 변경 정책:
 *  - impact-measurement schema 변경 → 여기 type 도 수동 sync
 *  - 다행히 schema 변경 빈도 매우 낮음 (계수는 데이터만 바뀜)
 *
 * 참조: impact-measurement/prisma/schema.prisma (2026-04-15 기준)
 */

/** 임팩트 유형 7종 (교육·투자·창업전환·경제가치·고용가치·지역활성화·생태계) */
export interface ImpactType {
  id: string
  name: string
  nameEn: string | null
  description: string | null
  displayOrder: number
  isActive: boolean
}

/**
 * 임팩트 카테고리.
 * formulaVariables 는 EducationItem 의 어떤 필드를 수식에 곱해야 하는지.
 * 예: ['count', 'participants'] → value = combinedProxy × count × participants
 */
export interface ImpactCategory {
  id: string
  impactTypeId: string
  name: string
  nameEn: string | null
  description: string | null
  formulaVariables: EducationItemField[]
  displayOrder: number
  isActive: boolean
  impactType?: ImpactType // join 결과
}

/** 계수 — 국가·버전·primary/adjustment 구분 */
export interface Coefficient {
  id: string
  categoryId: string
  country: string // 'KR' | 'JP' | 'ID' | 'IN' | ...
  proxyValue: number // KRW 기준
  currency: string // 항상 'KRW'
  role: 'primary' | 'adjustment'
  localProxyValue: number | null
  localCurrency: string | null
  exchangeRate: number | null
  reference: string
  version: string
  effectiveDate: string // ISO
  isCurrent: boolean
  displayOrder: number
}

/**
 * EducationItem 의 14 정량 필드 (impact-measurement engine 입력).
 * formulaVariables 가 이 중 일부를 가리킨다.
 */
export type EducationItemField =
  | 'count'
  | 'hours'
  | 'participants'
  | 'days'
  | 'months'
  | 'revenue'
  | 'newEmployees'
  | 'investmentAmount'
  | 'bizFund'
  | 'coachesTrained'
  | 'eventParticipants'
  | 'spaceArea'
  | 'spaceDuration'

/** 엔진 입력 — 한 카테고리에 대한 정량 측정값 (모든 필드 nullable) */
export interface EducationItemInput {
  categoryId: string
  /** 카테고리 안의 단위 항목 이름 (예: "1주차 부트캠프") — 옵션 */
  itemName?: string
  count: number | null
  hours: number | null
  participants: number | null
  days: number | null
  months: number | null
  revenue: number | null
  newEmployees: number | null
  investmentAmount: number | null
  bizFund: number | null
  coachesTrained: number | null
  eventParticipants: number | null
  spaceArea: number | null
  spaceDuration: number | null
}

/** 엔진 출력 (breakdown 한 항목) */
export interface BreakdownEntry {
  categoryId: string
  /** 이 항목의 사회적 가치 (KRW) */
  value: number
  /** primary × adjustment 곱한 최종 계수 */
  combinedProxyValue: number
  /** 적용된 수식 변수 */
  formulaVariables: EducationItemField[]
}

/** 엔진 출력 — 총 결과 */
export interface ImpactCalculationResult {
  /** 총 사회적 가치 (KRW) */
  totalSocialValue: number
  /** 수혜자 수 (participants 합) */
  beneficiaryCount: number
  breakdown: BreakdownEntry[]
}

/**
 * AI 매핑 결과 — 1차본 → EducationItem[] 변환 시 신뢰도 라벨 포함.
 * UI 에서 색상 분류용.
 */
export type ForecastConfidence = 'explicit' | 'derived' | 'estimated'

export interface ForecastItemWithMeta extends EducationItemInput {
  /** 이 항목 값들의 신뢰도 */
  confidence: ForecastConfidence
  /** 어디서 왔는지 — 예: "RFP §3.1 명시", "curriculum 12주 × 30명", "AI 추정" */
  rationale: string
  /** 카테고리 이름 (캐시 — UI 표시 편의) */
  categoryName?: string
  /** 임팩트 유형 (캐시 — UI 분류) */
  impactTypeName?: string
}

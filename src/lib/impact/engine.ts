/**
 * Impact 계산 엔진 — impact-measurement 와 동일 로직 (Wave M2, 2026-05-15)
 *
 * **출처**: impact-measurement/src/lib/calculation/engine.ts (2026-04-15 기준)
 * **방침**:
 *   - 이 파일은 impact-measurement 의 엔진을 **의도적으로 복제** 함.
 *   - impact-measurement repo 는 절대 import 하지 않음.
 *   - 향후 그쪽 엔진이 변경되면 여기도 수동 sync (가급적 동시 PR 권장).
 *   - 동기 안 된 경우를 대비해 unit 테스트로 mode shift 감지.
 *
 * **공식** (단일 카테고리 한 항목):
 *   combinedProxy = primary.proxyValue × ∏(adjustments.proxyValue)
 *   value = combinedProxy × ∏(item[v] for v in formulaVariables)
 *
 * **수정 시 주의**:
 *   - impact-measurement 와 결과가 일치해야 사전·사후 비교가 의미 있음.
 *   - 결과 차이는 운영 신뢰성에 직격타 — 변경 시 양쪽 동시 배포.
 */

import type {
  EducationItemInput,
  Coefficient,
  ImpactCategory,
  BreakdownEntry,
  ImpactCalculationResult,
} from './types'

/**
 * 계산 입력 — 카테고리 + 항목 + 계수 묶음.
 *
 * 같은 계산 호출에 들어가는 모든 계수는 isCurrent=true 인 것만.
 * 호출자(forecastImpact)가 db.ts 의 listCurrentCoefficients 결과를 전달.
 */
export interface CalculationInput {
  items: EducationItemInput[]
  /** 호출 시점의 활성 계수 (country 한정) */
  coefficients: Coefficient[]
  /** 카테고리 (formulaVariables 참조) */
  categories: ImpactCategory[]
}

/**
 * 단일 함수로 multiple items 계산.
 *
 * 동작:
 *  1. 각 item.categoryId 에 대해 isCurrent 계수들 (primary + adjustment N) 조회
 *  2. combinedProxyValue = 모든 proxyValue 의 곱
 *  3. value = combinedProxyValue × 카테고리의 formulaVariables 가 가리키는 item 필드값들의 곱
 *  4. 누적
 *
 * 결측 처리:
 *  - 필수 formula 변수가 null → throw (호출자가 검증 책임)
 *  - 카테고리에 primary 계수 없음 → throw
 */
export function calculateImpact(
  input: CalculationInput,
): ImpactCalculationResult {
  const { items, coefficients, categories } = input
  let totalSocialValue = 0
  let beneficiaryCount = 0
  const breakdown: BreakdownEntry[] = []

  // 카테고리 빠른 조회용 map
  const catMap = new Map<string, ImpactCategory>()
  for (const c of categories) catMap.set(c.id, c)

  for (const item of items) {
    const category = catMap.get(item.categoryId)
    if (!category) {
      throw new Error(
        `[engine] 카테고리 미발견: ${item.categoryId} — listActiveCategories 결과에 없음`,
      )
    }

    const categoryCoeffs = coefficients.filter(
      (c) => c.categoryId === item.categoryId && c.isCurrent,
    )
    if (categoryCoeffs.length === 0) {
      throw new Error(
        `[engine] 카테고리 ${item.categoryId} (${category.name}) 의 활성 계수 없음`,
      )
    }
    const primary = categoryCoeffs.find((c) => c.role === 'primary')
    if (!primary) {
      throw new Error(
        `[engine] 카테고리 ${item.categoryId} (${category.name}) 의 primary 계수 없음`,
      )
    }

    const combinedProxyValue = categoryCoeffs.reduce(
      (acc, c) => acc * c.proxyValue,
      1,
    )

    let value = combinedProxyValue
    for (const v of category.formulaVariables) {
      const fieldValue = item[v]
      if (fieldValue == null) {
        throw new Error(
          `[engine] 카테고리 ${category.name} 의 필수 수식 변수 '${v}' 가 null`,
        )
      }
      value *= fieldValue as number
    }

    totalSocialValue += value
    beneficiaryCount += item.participants ?? 0
    breakdown.push({
      categoryId: item.categoryId,
      value,
      combinedProxyValue,
      formulaVariables: category.formulaVariables,
    })
  }

  return { totalSocialValue, beneficiaryCount, breakdown }
}

/**
 * 안전 wrapper — 결측 항목은 스킵하고 계산 가능한 것만 합산.
 * 1차본 자동 forecast 에서 일부 카테고리의 정량이 부족할 때 유용.
 *
 * 반환에 skipped 와 errors 포함 — UI 에서 PM 에게 보강 권유.
 */
export interface SafeCalculationResult extends ImpactCalculationResult {
  skipped: Array<{ index: number; categoryId: string; reason: string }>
}

export function calculateImpactSafe(
  input: CalculationInput,
): SafeCalculationResult {
  const skipped: SafeCalculationResult['skipped'] = []
  const validItems: EducationItemInput[] = []

  // 카테고리 + 계수 사전 검증
  const catMap = new Map<string, ImpactCategory>()
  for (const c of input.categories) catMap.set(c.id, c)

  input.items.forEach((item, index) => {
    const category = catMap.get(item.categoryId)
    if (!category) {
      skipped.push({ index, categoryId: item.categoryId, reason: '카테고리 미존재' })
      return
    }
    const hasPrimary = input.coefficients.some(
      (c) => c.categoryId === item.categoryId && c.role === 'primary' && c.isCurrent,
    )
    if (!hasPrimary) {
      skipped.push({ index, categoryId: item.categoryId, reason: '계수 미존재' })
      return
    }
    // 필수 변수 null 체크
    const missingVar = category.formulaVariables.find((v) => item[v] == null)
    if (missingVar) {
      skipped.push({
        index,
        categoryId: item.categoryId,
        reason: `필수 변수 '${missingVar}' null`,
      })
      return
    }
    validItems.push(item)
  })

  const r = calculateImpact({ ...input, items: validItems })
  return { ...r, skipped }
}

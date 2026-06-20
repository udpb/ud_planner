/**
 * BR-SROI-1 — 예측 SROI 계산(오프라인 산식) + 리포트 핸드오프
 *
 * ⭐ SROI 는 렌즈다 — 비율을 최대화/랭킹하지 않는다. 이 파일에는 의도적으로
 *    "더 좋은 설계를 고르는" 함수가 없다. 출력은 **카테고리별 분해 + 가정**이 본체이고,
 *    sroi 비율은 보조 렌즈(없으면 null)다.
 *
 * 산식 (서비스 계약): 카테고리값 = combinedProxyValue × ∏(formulaVariables 값).
 *                    totalSocialValue = Σ 카테고리값. sroi = budget>0 ? total/budget : null.
 *   → proxy(combinedProxyValue)·변수값은 전부 입력(계수/매핑)에서 온다. 하드코딩 수치 없음.
 */

import { log } from '@/lib/logger'
import { mapPlanToImpactItems } from './map-plan-to-impact'
import { requestPrediction } from './client'
import type { ProgramPlan } from '@/lib/program-design/plan-types'
import type {
  Assumption,
  CoefficientsResponse,
  PredictItem,
  PredictedSroi,
  PredictRequest,
  PredictResponse,
  SroiBreakdownEntry,
  SroiGoal,
} from './types'

const SCOPE = 'sroi-predict'

/** PredictItem 에서 숫자 변수만 추출 (categoryId 제외). 변수명 → 값. */
function numericVars(item: PredictItem): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(item)) {
    if (k === 'categoryId') continue
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return out
}

/**
 * 오프라인 예측 — 계수 + 매핑된 items 로 카테고리별 분해와 sroi 를 계산한다.
 *
 * 산식: 카테고리값 = combinedProxyValue × ∏(formulaVariables 에 해당하는 item 변수값).
 *   - formulaVariables 중 item 에 없는 변수는 ∏ 에서 제외(곱 1 취급)하고, 어떤 변수가
 *     비었는지는 호출부가 assumptions 로 이미 표기. 모든 변수가 비면 곱은 1.
 *   - budget 없거나 0 이면 sroi=null(부분 예측 — 분해만 본다).
 *
 * **랭킹/최대화 없음.** dominantCategory 는 "어디서 값이 오는가"를 보여줄 뿐 "더 좋음"이 아니다.
 */
export function computePredictedSroi(
  coefficients: CoefficientsResponse,
  items: PredictItem[],
  budget?: number,
  assumptions: Assumption[] = [],
): PredictedSroi {
  const byId = new Map(coefficients.categories.map((c) => [c.categoryId, c]))
  const breakdown: SroiBreakdownEntry[] = []

  for (const item of items) {
    const coeff = byId.get(item.categoryId)
    if (!coeff) {
      // 계수에 없는 카테고리 — 값 산출 불가. 가정으로 남기고 제외(추측 안 함).
      assumptions = [
        ...assumptions,
        {
          field: item.categoryId,
          status: 'missing',
          note: `categoryId='${item.categoryId}' 가 계수에 없어 분해에서 제외(추측 안 함).`,
        },
      ]
      continue
    }
    const vars = numericVars(item)
    // ∏(formulaVariables 에 해당하는 값). 없는 변수는 곱에서 빠짐(1).
    const usedVars: Record<string, number> = {}
    let product = 1
    for (const fv of coeff.formulaVariables) {
      if (typeof vars[fv] === 'number') {
        product *= vars[fv]
        usedVars[fv] = vars[fv]
      }
    }
    const value = coeff.combinedProxyValue * product
    breakdown.push({
      categoryId: coeff.categoryId,
      categoryName: coeff.categoryName,
      value,
      vars: usedVars,
    })
  }

  const totalSocialValue = breakdown.reduce((sum, b) => sum + b.value, 0)
  const sroi = typeof budget === 'number' && budget > 0 ? totalSocialValue / budget : null

  // dominantCategory — 최대 기여처(설명용). ⚠️ 최댓값 ≠ 더 좋은 설계.
  const dominant = breakdown.reduce<SroiBreakdownEntry | null>(
    (max, b) => (max === null || b.value > max.value ? b : max),
    null,
  )

  return {
    breakdown,
    totalSocialValue,
    sroi,
    lens: {
      dominantCategory: dominant?.categoryName ?? null,
      note: 'SROI는 비율 — 분해와 가정을 함께 보라. 높을수록 좋은 게 아니다(렌즈일 뿐).',
    },
    assumptions,
  }
}

/**
 * 라이브 리포트 핸드오프 — plan/goal 을 매핑해 서비스 predict 를 호출하고 sroi·reportUrl 반환.
 *
 * graceful: 클라이언트가 비활성(토큰 없음)이거나 서비스 실패면 null(throw 금지).
 * ⚠️ 라이브 네트워크 호출 — 배포 후 메인이 실측. 서비스 응답의 sroi 도 "렌즈"로 받는다.
 */
export async function requestReport(
  plan: ProgramPlan,
  goal: SroiGoal = {},
): Promise<{ sroi: number | null; reportUrl: string; response: PredictResponse } | null> {
  const { items, assumptions } = mapPlanToImpactItems(plan, goal)
  if (items.length === 0) {
    log.warn(SCOPE, '매핑된 item 0건 — 예측 요청 생략(부분 예측조차 불가)', {
      missing: assumptions.filter((a) => a.status === 'missing').length,
    })
    return null
  }

  const body: PredictRequest = {
    externalProjectId: goal.externalProjectId ?? `plan-${Date.now()}`,
    title: goal.title ?? '프로그램 SROI 예측',
    country: goal.country ?? 'KR',
    budget: goal.budget,
    totalParticipants: goal.totalParticipants,
    items,
  }

  const res = await requestPrediction(body)
  if (!res) {
    log.warn(SCOPE, 'requestPrediction null(서비스 비활성/실패) — graceful null 반환')
    return null
  }
  return { sroi: res.sroi, reportUrl: res.reportUrl, response: res }
}

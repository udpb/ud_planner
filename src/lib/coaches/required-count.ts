/**
 * Required Coach Count — Wave V / F1 (ADR-015)
 *
 * RFP + curriculum 입력으로 필요 코치 수 N 추정.
 *
 * 휴리스틱 (ADR-015 §3 + F1 plan B2):
 *   1. RFP.requiredPersonnel 명시 우선 (coach role 만 추출)
 *   2. 회차 수 (curriculum.length 또는 objectives.length × 2 fallback)
 *   3. 대상 수 (targetCount)
 *   4. 1:1 코칭 / Action Week 회차 가산 (curriculum 있을 때만)
 *   5. [1, 8] clamp
 *
 * pure function. server·client 양쪽 import 가능.
 */

import type { RequiredCountInput, RequiredCountResult } from './types'
import { COACH_COUNT_CLAMP } from './types'

/**
 * 필요 코치 수 N 추정 + rationale (PM "왜 N명?" 펼침용).
 *
 * @example
 *   12 회차 + 50명 + Action Week 2 회 → N = 3 + 1 + 1 = 5
 */
export function estimateRequiredCoaches(input: RequiredCountInput): RequiredCountResult {
  const rationale: string[] = []
  let n = 0

  // ─────────────────────────────────────────
  // 1. RFP.requiredPersonnel 명시 우선
  // ─────────────────────────────────────────
  const reqPersonnel = input.rfp.requiredPersonnel ?? []
  const coachRoles = reqPersonnel.filter((p) =>
    /코치|멘토|강사|컨설턴트/.test(p.role ?? ''),
  )
  if (coachRoles.length > 0) {
    const explicitN = coachRoles.reduce((sum, p) => sum + (p.count ?? 1), 0)
    if (explicitN > 0) {
      rationale.push(
        `RFP 명시 요구 인력: 코치/멘토 ${explicitN}명 (${coachRoles
          .map((p) => `${p.role}${p.count ? ` ${p.count}명` : ''}`)
          .join(', ')})`,
      )
      n = explicitN
      // 명시값이 있어도 1:1 / Action Week 보정은 진행 (4 단계). 회차·대상은 skip.
    }
  }

  // ─────────────────────────────────────────
  // 2. 회차 수 기반 (명시값 없을 때만)
  // ─────────────────────────────────────────
  if (n === 0) {
    const sessionCount =
      input.curriculum?.length ??
      Math.max(5, (input.rfp.objectives?.length ?? 0) * 2)
    let baseN: number
    if (sessionCount <= 5) baseN = 1
    else if (sessionCount <= 10) baseN = 2
    else if (sessionCount <= 15) baseN = 3
    else baseN = 4

    const source = input.curriculum
      ? `${sessionCount}회차 (커리큘럼)`
      : `RFP objectives × 2 추정 (${sessionCount}회차, 커리큘럼 아직 미작성)`
    rationale.push(`${source} → 베이스 ${baseN}명`)
    n = baseN

    // 3. 대상 수 가산 (명시값 없을 때만 — 명시값에 이미 반영됐다고 가정)
    if (input.rfp.targetCount != null) {
      if (input.rfp.targetCount > 50) {
        n += 2
        rationale.push(`대상 ${input.rfp.targetCount}명 → +2 (50명 초과)`)
      } else if (input.rfp.targetCount > 20) {
        n += 1
        rationale.push(`대상 ${input.rfp.targetCount}명 → +1 (20명 초과)`)
      }
    }
  }

  // ─────────────────────────────────────────
  // 4. 1:1 코칭 / Action Week 가산 (curriculum 있을 때만, 명시·휴리스틱 양쪽 모두)
  // ─────────────────────────────────────────
  if (input.curriculum && input.curriculum.length > 0) {
    const oneOnOne = input.curriculum.filter((c) => c.isCoaching1on1).length
    const actionWeek = input.curriculum.filter((c) => c.isActionWeek).length
    if (oneOnOne > 0) {
      n += 1
      rationale.push(`1:1 코칭 ${oneOnOne}회 → +1 (전담 코치)`)
    }
    if (actionWeek > 0) {
      n += 1
      rationale.push(`Action Week ${actionWeek}회 → +1 (실습 코치)`)
    }
  }

  // ─────────────────────────────────────────
  // 5. clamp [MIN, MAX]
  // ─────────────────────────────────────────
  const clamped = Math.max(COACH_COUNT_CLAMP.MIN, Math.min(n, COACH_COUNT_CLAMP.MAX))
  if (clamped !== n) {
    rationale.push(`최종 clamp [${COACH_COUNT_CLAMP.MIN}, ${COACH_COUNT_CLAMP.MAX}]: ${n} → ${clamped}명`)
  }

  return { n: clamped, rationale }
}

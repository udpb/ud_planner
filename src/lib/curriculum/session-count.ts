/**
 * Session Count Estimator — F2 (Wave V, ADR-015, 2026-05-22)
 *
 * RFP + profile + budget 입력으로 회차 수 N 추정.
 *
 * 휴리스틱 (F2 plan §D.1):
 *   1. profile.sessionCount 명시 우선 (PM Step 1 입력)
 *   2. rfp 의 totalSessions 같은 명시 필드
 *   3. fallback: objectives.length × 2 + 조정
 *   4. clamp [5, 16]
 *
 * pure function. server/client 양쪽 import 가능.
 */

import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'

export interface SessionCountInput {
  rfp: RfpParsed
  profile?: ProgramProfile
  /** 명시값 우선 (PM 직접 입력) */
  explicitN?: number
}

export interface SessionCountResult {
  n: number
  rationale: string[]
}

export const SESSION_COUNT_CLAMP = { MIN: 5, MAX: 16 } as const

/**
 * 회차 수 N 추정 + rationale.
 *
 * @example
 *   objectives 5개 + targetCount 60 + B2G → N=12
 */
export function estimateSessionCount(input: SessionCountInput): SessionCountResult {
  const rationale: string[] = []

  // 1. 명시값 우선
  if (input.explicitN != null && input.explicitN > 0) {
    const n = clamp(input.explicitN)
    rationale.push(`명시값 ${input.explicitN}회차`)
    if (n !== input.explicitN) {
      rationale.push(`clamp [${SESSION_COUNT_CLAMP.MIN}, ${SESSION_COUNT_CLAMP.MAX}]: ${input.explicitN} → ${n}`)
    }
    return { n, rationale }
  }

  // 2. profile 우선
  // ProgramProfile 스키마에는 직접 sessionCount 필드가 없지만,
  // scale (사업 규모) 와 formats (운영 형식) 으로 추정 보조.
  let base = 0

  // 3. RFP objectives 기반
  const objCount = input.rfp.objectives?.length ?? 0
  if (objCount > 0) {
    base = Math.max(5, objCount * 2)
    rationale.push(`RFP objectives ${objCount}개 × 2 → 기본 ${base}회차`)
  } else {
    base = 8 // default
    rationale.push(`RFP objectives 미상 → 기본 8회차`)
  }

  // 4. 대상 수 가산
  const targetCount = input.rfp.targetCount ?? 0
  if (targetCount > 50) {
    base += 2
    rationale.push(`대상 ${targetCount}명 → +2 (50명 초과)`)
  } else if (targetCount > 20) {
    base += 1
    rationale.push(`대상 ${targetCount}명 → +1 (20명 초과)`)
  }

  // 5. 채널별 조정 (B2G 일수록 회차 ↑)
  const channel = input.rfp.projectType
  if (channel === 'B2G') {
    base += 1
    rationale.push(`B2G 채널 → +1 (정책 사업 회차 평균 ↑)`)
  }

  // 6. 교육 기간 가산 (eduWeeks 추정 — projectStartDate / projectEndDate 차이)
  if (input.rfp.eduStartDate && input.rfp.eduEndDate) {
    const start = new Date(input.rfp.eduStartDate).getTime()
    const end = new Date(input.rfp.eduEndDate).getTime()
    const weeks = Math.max(0, Math.round((end - start) / (7 * 24 * 60 * 60 * 1000)))
    if (weeks >= 8) {
      base += 2
      rationale.push(`교육 기간 ${weeks}주 → +2 (8주 이상)`)
    } else if (weeks >= 4) {
      base += 1
      rationale.push(`교육 기간 ${weeks}주 → +1 (4주 이상)`)
    }
  }

  // 7. clamp
  const n = clamp(base)
  if (n !== base) {
    rationale.push(`clamp [${SESSION_COUNT_CLAMP.MIN}, ${SESSION_COUNT_CLAMP.MAX}]: ${base} → ${n}`)
  }

  return { n, rationale }
}

function clamp(n: number): number {
  return Math.max(SESSION_COUNT_CLAMP.MIN, Math.min(n, SESSION_COUNT_CLAMP.MAX))
}

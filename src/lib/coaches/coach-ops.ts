/**
 * BR-WS-24 — 대화 → 코치 배정/교체/제거 (순수 검증 계약)
 *
 * 코치 매칭 단계에서 PM 이 자연어로 말하면("디지털 전문가 추가해줘 / 1번 코치 대신
 * 다른 사람"), assistant route 가 이를 `CoachOp[]` 로 해석한다. 이 모듈은 그 ops 를
 * **순수하게 검증**(필드·타입)한다.
 *
 * ⚠️ budget-ops.ts / session-ops.ts 의 미러다(구조·주석 스타일 동형). 단, 결정적 차이:
 *    코치 op 의 **적용(apply)은 여기 없다** — 코치 배정은 client override 가 아니라
 *    **서버 영속**(POST/DELETE `/api/coach-assignments`)이라, ProgramWorkspace 가 op 별로
 *    비동기 fetch 한 뒤 선발팀 로스터를 재fetch 한다. 이 모듈은 **순수 검증**만 제공한다.
 *
 * 핵심 불변식:
 *   - 검증만(throw 금지) — 불량 op 는 drop. validateCoachOps 가 게이트.
 *   - **존재성**(coachId ∈ 추천 풀, assignmentId ∈ 선발팀)은 **route 의 knownIds 필터**에서
 *     사전 차단(환각 방지) — budget-ops 의 knownLabels 미러. 이 모듈은 필드·타입만 본다.
 *   - assign = 추천 풀에서 배정 / remove = 선발팀에서 제거 / swap = 제거+배정(교체).
 *
 * ⚠️ prisma·coach-assignments route·recommend-coaches·coaches 엔진 무변경 — 타입·검증만.
 */

/** 추천 풀 1건 참조 (route·chat 동봉용 — 환각 방지 근거). assign/swap 의 addCoachId 검증 대상. */
export interface CoachPoolRef {
  /** Coach.id (cuid) — 배정 API(POST) 의 coachId. */
  coachId: string
  name: string
  /** 코치 기본 단가(원) — agreedRate 기본값 추론 근거. 없으면 null. */
  coachRateMain: number | null
  /** "AI/DX + 대학생 대상" 같은 한 줄 강점 — 카드 sub 문구·프롬프트 맥락. */
  strengthOneLiner: string
  /** 0~1 매칭 점수 — 카드 정렬·근거 문구. */
  matchScore: number
}

/** 선발팀 1건 참조 (route·chat 동봉용 — 환각 방지 근거). remove/swap 의 removeAssignmentId 검증 대상. */
export interface CoachTeamRef {
  /** CoachAssignment.id — 제거(DELETE) 키. */
  assignmentId: string
  /** Coach.id (cuid) — swap 시 중복 배정 회피 근거. */
  coachId: string
  coachName: string
  /** 배정 역할(AssignmentRole 문자열). */
  role: string
}

/**
 * 코치 변경 1건 (assistant 가 자연어를 해석해 반환하는 계약 — 서버 영속).
 *   - assign : 추천 풀의 coachId 를 role 로 배정(POST). agreedRate 없으면 풀 단가 기본.
 *   - remove : 선발팀의 assignmentId 제거(DELETE).
 *   - swap   : removeAssignmentId 제거(DELETE) 후 addCoachId 배정(POST) = 교체.
 */
export type CoachOp =
  | { op: 'assign'; coachId: string; coachName: string; role: string; agreedRate?: number }
  | { op: 'remove'; assignmentId: string; coachName: string }
  | {
      op: 'swap'
      removeAssignmentId: string
      addCoachId: string
      addCoachName: string
      role: string
      agreedRate?: number
    }

/** 허용 op 종류 (검증용). */
const OP_KINDS = ['assign', 'remove', 'swap'] as const

/** AssignmentRole enum 7종 (prisma 미러 — 검증용). 모르는 role 은 합리적 기본으로 폴백. */
export const ASSIGNMENT_ROLES = [
  'MAIN_COACH',
  'SUB_COACH',
  'LECTURER',
  'SUB_LECTURER',
  'SPECIAL_LECTURER',
  'JUDGE',
  'PM_OPS',
] as const

export type AssignmentRoleStr = (typeof ASSIGNMENT_ROLES)[number]

export function isAssignmentRole(v: unknown): v is AssignmentRoleStr {
  return typeof v === 'string' && (ASSIGNMENT_ROLES as readonly string[]).includes(v)
}

/** agreedRate 가 유한·양수 number 면 정수로 반올림해 반환, 아니면 undefined(생략). */
function normalizeRate(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined
  return Math.round(v)
}

/**
 * unknown 1건이 유효한 CoachOp 인지 검증(허용 op·role enum·id 타입). 통과 못하면 null.
 * route 가 AI 산출 ops 를 신뢰하기 전 게이트로 쓴다.
 * (id 의 "존재" 검증 — coachId∈pool, assignmentId∈team — 은 route 의 knownIds 필터.)
 */
export function validateCoachOp(v: unknown): CoachOp | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const op = o.op
  if (typeof op !== 'string' || !(OP_KINDS as readonly string[]).includes(op)) return null

  switch (op) {
    case 'assign': {
      if (typeof o.coachId !== 'string' || !o.coachId.trim()) return null
      // role 이 enum 아니면 drop(route 가 합리값을 채워주지만, op 자체엔 명시 필수).
      if (!isAssignmentRole(o.role)) return null
      const out: CoachOp = {
        op: 'assign',
        coachId: o.coachId.trim(),
        coachName: typeof o.coachName === 'string' ? o.coachName.trim() : '',
        role: o.role,
      }
      const rate = normalizeRate(o.agreedRate)
      if (rate !== undefined) out.agreedRate = rate
      return out
    }
    case 'remove': {
      if (typeof o.assignmentId !== 'string' || !o.assignmentId.trim()) return null
      return {
        op: 'remove',
        assignmentId: o.assignmentId.trim(),
        coachName: typeof o.coachName === 'string' ? o.coachName.trim() : '',
      }
    }
    case 'swap': {
      if (typeof o.removeAssignmentId !== 'string' || !o.removeAssignmentId.trim()) return null
      if (typeof o.addCoachId !== 'string' || !o.addCoachId.trim()) return null
      if (!isAssignmentRole(o.role)) return null
      const out: CoachOp = {
        op: 'swap',
        removeAssignmentId: o.removeAssignmentId.trim(),
        addCoachId: o.addCoachId.trim(),
        addCoachName: typeof o.addCoachName === 'string' ? o.addCoachName.trim() : '',
        role: o.role,
      }
      const rate = normalizeRate(o.agreedRate)
      if (rate !== undefined) out.agreedRate = rate
      return out
    }
    default:
      return null
  }
}

/** unknown[] → 검증 통과한 CoachOp[] (불량 항목은 drop). 입력이 배열 아니면 []. */
export function validateCoachOps(v: unknown): CoachOp[] {
  if (!Array.isArray(v)) return []
  const out: CoachOp[] = []
  for (const item of v) {
    const valid = validateCoachOp(item)
    if (valid) out.push(valid)
  }
  return out
}

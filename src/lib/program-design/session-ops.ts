/**
 * BR-WS-6 — 대화 → 캔버스 세션 액션 (순수 적용 엔진)
 *
 * 프로그램 기획(커리큘럼) 단계에서 PM 이 자연어로 말하면, assistant route 가 이를
 * `SessionOp[]` 로 해석한다. 이 모듈은 그 ops 를 **순수함수**로 `PlanStructure` 에
 * 적용한다 — 결과는 PM 이 손으로 편집한 것과 **동일한 structureOverride** 다.
 *
 * 핵심 불변식:
 *   - sessions 구조(kind==='sessions')에만 적용. 그 외 구조(individual/event/pending)는
 *     **그대로 반환**(회차표가 아니므로 회차 op 무의미 — 강요 금지).
 *   - 불변(immutable): 항상 새 배열·새 객체. 원본 sessions·세션 객체 무변형.
 *   - 알 수 없는 `no` 는 **skip**(throw 금지) — 모호한 자연어가 잘못된 no 를 가리켜도
 *     캔버스를 망가뜨리지 않는다.
 *   - structure-view.tsx 의 편집 패턴(moveItem·map·filter·기본값)을 **그대로 재사용**.
 *
 * ⚠️ plan-types.ts 계약 수정 0 — 기존 PlanSession[] 의 순서·길이·필드 조작만.
 */

import type { PlanSession, PlanStructure } from './plan-types'

/** 회차 종류 6종 (PlanSession['kind'] 와 동일 — 계약 미러). */
export type SessionKind = PlanSession['kind']

/** ops 검증·프롬프트에서 참조하는 허용 kind 집합 (단일 진실). */
export const SESSION_KINDS: readonly SessionKind[] = [
  'theory',
  'workshop',
  'coaching',
  'event',
  'milestone',
  'prelearning',
] as const

export function isSessionKind(v: unknown): v is SessionKind {
  return typeof v === 'string' && (SESSION_KINDS as readonly string[]).includes(v)
}

/**
 * 세션 변경 1건 (assistant 가 자연어를 해석해 반환하는 계약).
 *   - add     : afterNo 뒤에 새 회차(없으면 끝). 기본 hours null·rationale ''·no 자동 'W{n}'.
 *   - remove  : no 로 회차 삭제.
 *   - edit    : no 회차의 title/hours/format 부분 수정.
 *   - setKind : no 회차의 종류 변경 ("코칭 비중 높여줘" → 여러 setKind).
 *   - reorder : no 회차를 위/아래 한 칸 이동.
 */
export type SessionOp =
  | { op: 'add'; title?: string; kind?: SessionKind; afterNo?: string }
  | { op: 'remove'; no: string }
  | { op: 'edit'; no: string; patch: { title?: string; hours?: number | null; format?: string } }
  | { op: 'setKind'; no: string; kind: SessionKind }
  | { op: 'reorder'; no: string; direction: 'up' | 'down' }

/** 허용 op 종류 (검증용). */
const OP_KINDS = ['add', 'remove', 'edit', 'setKind', 'reorder'] as const

/**
 * unknown 1건이 유효한 SessionOp 인지 검증(허용 op·kind enum·no 타입). 통과 못하면 null.
 * route 가 AI 산출 ops 를 신뢰하기 전 게이트로 쓴다. (no 의 "존재" 검증은 적용 시 skip 으로 처리.)
 */
export function validateSessionOp(v: unknown): SessionOp | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const op = o.op
  if (typeof op !== 'string' || !(OP_KINDS as readonly string[]).includes(op)) return null

  switch (op) {
    case 'add': {
      if (o.kind !== undefined && !isSessionKind(o.kind)) return null
      if (o.title !== undefined && typeof o.title !== 'string') return null
      if (o.afterNo !== undefined && typeof o.afterNo !== 'string') return null
      const out: SessionOp = { op: 'add' }
      if (typeof o.title === 'string') out.title = o.title
      if (isSessionKind(o.kind)) out.kind = o.kind
      if (typeof o.afterNo === 'string') out.afterNo = o.afterNo
      return out
    }
    case 'remove': {
      if (typeof o.no !== 'string') return null
      return { op: 'remove', no: o.no }
    }
    case 'edit': {
      if (typeof o.no !== 'string') return null
      const patch = o.patch
      if (!patch || typeof patch !== 'object') return null
      const p = patch as Record<string, unknown>
      const out: { title?: string; hours?: number | null; format?: string } = {}
      if (p.title !== undefined) {
        if (typeof p.title !== 'string') return null
        out.title = p.title
      }
      if (p.hours !== undefined) {
        if (p.hours !== null && (typeof p.hours !== 'number' || !Number.isFinite(p.hours))) return null
        out.hours = p.hours as number | null
      }
      if (p.format !== undefined) {
        if (typeof p.format !== 'string') return null
        out.format = p.format
      }
      return { op: 'edit', no: o.no, patch: out }
    }
    case 'setKind': {
      if (typeof o.no !== 'string') return null
      if (!isSessionKind(o.kind)) return null
      return { op: 'setKind', no: o.no, kind: o.kind }
    }
    case 'reorder': {
      if (typeof o.no !== 'string') return null
      if (o.direction !== 'up' && o.direction !== 'down') return null
      return { op: 'reorder', no: o.no, direction: o.direction }
    }
    default:
      return null
  }
}

/** unknown[] → 검증 통과한 SessionOp[] (불량 항목은 drop). 입력이 배열 아니면 []. */
export function validateSessionOps(v: unknown): SessionOp[] {
  if (!Array.isArray(v)) return []
  const out: SessionOp[] = []
  for (const item of v) {
    const valid = validateSessionOp(item)
    if (valid) out.push(valid)
  }
  return out
}

/** 배열 원소 i 를 dir(-1 위 / +1 아래)로 이동한 새 배열 (불변). 경계면 원본 그대로 (structure-view moveItem 미러). */
function moveItem<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= arr.length) return arr
  const next = arr.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/**
 * 다음 'W{n}' 라벨 — 기존 'W숫자' 중 최대 +1. 'W' 라벨이 하나도 없으면 길이+1 기준.
 * (structure-view 의 newSession 은 index+1 을 쓰지만, ops 는 중간 삽입·삭제 후라
 *  충돌 회피로 max 기반 — 단조 증가, Date.now/random 미사용.)
 */
function nextSessionNo(sessions: PlanSession[]): string {
  let max = 0
  for (const s of sessions) {
    const m = /^W(\d+)$/.exec(s.no)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return `W${max + 1}`
}

/** 새 회차 1건 (브리프: hours null·format ''·rationale ''·kind 기본 'workshop'). */
function makeSession(no: string, title: string, kind: SessionKind): PlanSession {
  return { no, title, hours: null, format: '', kind, rationale: '' }
}

/** 단일 op 를 sessions 배열에 적용(불변 새 배열). 알 수 없는 no 는 skip(원본 그대로). */
function applyOne(sessions: PlanSession[], op: SessionOp): PlanSession[] {
  switch (op.op) {
    case 'add': {
      const next = makeSession(nextSessionNo(sessions), op.title ?? '', op.kind ?? 'workshop')
      if (op.afterNo) {
        const idx = sessions.findIndex((s) => s.no === op.afterNo)
        if (idx >= 0) {
          const out = sessions.slice()
          out.splice(idx + 1, 0, next)
          return out
        }
        // afterNo 못 찾으면 끝에 추가(skip 대신 안전한 폴백 — add 는 파괴적이지 않음).
      }
      return [...sessions, next]
    }
    case 'remove': {
      const idx = sessions.findIndex((s) => s.no === op.no)
      if (idx < 0) return sessions // 알 수 없는 no → skip
      return sessions.filter((_, k) => k !== idx)
    }
    case 'edit': {
      const idx = sessions.findIndex((s) => s.no === op.no)
      if (idx < 0) return sessions // skip
      return sessions.map((s, k) => (k === idx ? { ...s, ...op.patch } : s))
    }
    case 'setKind': {
      const idx = sessions.findIndex((s) => s.no === op.no)
      if (idx < 0) return sessions // skip
      return sessions.map((s, k) => (k === idx ? { ...s, kind: op.kind } : s))
    }
    case 'reorder': {
      const idx = sessions.findIndex((s) => s.no === op.no)
      if (idx < 0) return sessions // skip
      return moveItem(sessions, idx, op.direction === 'up' ? -1 : 1)
    }
    default:
      return sessions
  }
}

/**
 * ops 를 순차 적용한 새 PlanStructure (불변). sessions 구조가 아니면 그대로 반환.
 * 빈 ops 면 (sessions 구조여도) 동일 구조의 새 객체로 반환(참조만 안전하게 교체).
 */
export function applySessionOps(structure: PlanStructure, ops: SessionOp[]): PlanStructure {
  if (structure.kind !== 'sessions') return structure
  let sessions = structure.sessions
  for (const op of ops) {
    sessions = applyOne(sessions, op)
  }
  return { kind: 'sessions', sessions }
}

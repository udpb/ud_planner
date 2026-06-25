/**
 * BR-WS-19 — 대화 → 캔버스 비회차 단계 액션 (순수 적용 엔진)
 *
 * 비회차 운영유형(T4 개별밀착 · T5 행사)의 구조는 회차표가 아니라 `NonSessionStructure`
 * (`stages: NonSessionStage[]`)다. PM 이 자연어로 말하면 assistant route 가 이를
 * `StageOp[]` 로 해석한다. 이 모듈은 그 ops 를 **순수함수**로 `NonSessionStructure` 에
 * 적용한다 — 결과는 PM 이 손으로 편집한 것과 **동일한 structureOverride** 다.
 *
 * ⚠️ session-ops.ts 의 미러다(구조·주석 스타일 동형). 단, 비회차 단계엔 `no`(라벨 id)가
 *    없으므로 **참조는 1-based 위치 `at`** 으로 한다. (setKind 도 없음 — stage 엔 kind 개념 X.)
 *
 * 핵심 불변식:
 *   - 비회차 구조(kind==='individual'|'event')에만 적용. sessions 구조면 **그대로 반환**
 *     (회차표엔 stage op 무의미 — 강요 금지).
 *   - 불변(immutable): 항상 새 배열·새 객체. 원본 stages·stage 객체 무변형.
 *   - 범위 밖 `at`(1-based) 은 **skip**(throw 금지) — 모호한 자연어가 잘못된 위치를 가리켜도
 *     캔버스를 망가뜨리지 않는다.
 *   - structure-view.tsx 의 StageList 편집 패턴(moveItem·map·filter·기본값)을 **그대로 재사용**.
 *
 * ⚠️ plan-types.ts 계약 수정 0 — 기존 NonSessionStage[] 의 순서·길이·필드 조작만.
 */

import type { NonSessionStage, NonSessionStructure } from './plan-types'

/**
 * 비회차 단계 변경 1건 (assistant 가 자연어를 해석해 반환하는 계약).
 * **참조는 1-based 위치 `at`** (stage 엔 id 없음).
 *   - add     : afterAt(1-based) 뒤에 새 단계(없으면 끝). 기본 content ''·rationale ''.
 *   - remove  : at(1-based) 단계 삭제.
 *   - edit    : at 단계의 label/content/rationale 부분 수정.
 *   - reorder : at 단계를 위/아래 한 칸 이동.
 */
export type StageOp =
  | { op: 'add'; label?: string; content?: string; afterAt?: number }
  | { op: 'remove'; at: number }
  | { op: 'edit'; at: number; patch: { label?: string; content?: string; rationale?: string } }
  | { op: 'reorder'; at: number; direction: 'up' | 'down' }

/** 허용 op 종류 (검증용). (setKind 없음 — stage 엔 kind 개념 X.) */
const OP_KINDS = ['add', 'remove', 'edit', 'reorder'] as const

/** 1-based 위치 정수인가(at·afterAt 검증용). */
function isPos(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1
}

/**
 * unknown 1건이 유효한 StageOp 인지 검증(허용 op·필드 타입·1-based 위치). 통과 못하면 null.
 * route 가 AI 산출 ops 를 신뢰하기 전 게이트로 쓴다. (at 의 "범위" 검증은 적용 시 skip 으로 처리.)
 */
export function validateStageOp(v: unknown): StageOp | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const op = o.op
  if (typeof op !== 'string' || !(OP_KINDS as readonly string[]).includes(op)) return null

  switch (op) {
    case 'add': {
      if (o.label !== undefined && typeof o.label !== 'string') return null
      if (o.content !== undefined && typeof o.content !== 'string') return null
      if (o.afterAt !== undefined && !isPos(o.afterAt)) return null
      const out: StageOp = { op: 'add' }
      if (typeof o.label === 'string') out.label = o.label
      if (typeof o.content === 'string') out.content = o.content
      if (isPos(o.afterAt)) out.afterAt = o.afterAt
      return out
    }
    case 'remove': {
      if (!isPos(o.at)) return null
      return { op: 'remove', at: o.at }
    }
    case 'edit': {
      if (!isPos(o.at)) return null
      const patch = o.patch
      if (!patch || typeof patch !== 'object') return null
      const p = patch as Record<string, unknown>
      const out: { label?: string; content?: string; rationale?: string } = {}
      if (p.label !== undefined) {
        if (typeof p.label !== 'string') return null
        out.label = p.label
      }
      if (p.content !== undefined) {
        if (typeof p.content !== 'string') return null
        out.content = p.content
      }
      if (p.rationale !== undefined) {
        if (typeof p.rationale !== 'string') return null
        out.rationale = p.rationale
      }
      return { op: 'edit', at: o.at, patch: out }
    }
    case 'reorder': {
      if (!isPos(o.at)) return null
      if (o.direction !== 'up' && o.direction !== 'down') return null
      return { op: 'reorder', at: o.at, direction: o.direction }
    }
    default:
      return null
  }
}

/** unknown[] → 검증 통과한 StageOp[] (불량 항목은 drop). 입력이 배열 아니면 []. */
export function validateStageOps(v: unknown): StageOp[] {
  if (!Array.isArray(v)) return []
  const out: StageOp[] = []
  for (const item of v) {
    const valid = validateStageOp(item)
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

/** 새 단계 1건 (StageList newStage 미러: label ''·content ''·rationale ''). */
function makeStage(label: string, content: string): NonSessionStage {
  return { label, content, rationale: '' }
}

/** 단일 op 를 stages 배열에 적용(불변 새 배열). 범위 밖 at 은 skip(원본 그대로). */
function applyOne(stages: NonSessionStage[], op: StageOp): NonSessionStage[] {
  switch (op.op) {
    case 'add': {
      const next = makeStage(op.label ?? '', op.content ?? '')
      if (op.afterAt !== undefined) {
        const idx = op.afterAt - 1 // 1-based → 0-based
        if (idx >= 0 && idx < stages.length) {
          const out = stages.slice()
          out.splice(idx + 1, 0, next)
          return out
        }
        // afterAt 범위 밖이면 끝에 추가(skip 대신 안전한 폴백 — add 는 파괴적이지 않음).
      }
      return [...stages, next]
    }
    case 'remove': {
      const idx = op.at - 1
      if (idx < 0 || idx >= stages.length) return stages // 범위 밖 → skip
      return stages.filter((_, k) => k !== idx)
    }
    case 'edit': {
      const idx = op.at - 1
      if (idx < 0 || idx >= stages.length) return stages // skip
      return stages.map((s, k) => (k === idx ? { ...s, ...op.patch } : s))
    }
    case 'reorder': {
      const idx = op.at - 1
      if (idx < 0 || idx >= stages.length) return stages // skip
      return moveItem(stages, idx, op.direction === 'up' ? -1 : 1)
    }
    default:
      return stages
  }
}

/**
 * ops 를 순차 적용한 새 NonSessionStructure (불변). sessions 구조면 그대로 반환.
 * 빈 ops 면 (비회차 구조여도) 동일 kind·stages 의 새 객체로 반환(참조만 안전하게 교체).
 *
 * 시그니처는 `NonSessionStructure` in/out. (호출부는 effectiveStructure.kind!=='sessions'
 *  를 확인한 뒤 넘긴다 — sessions 구조는 applySessionOps 가 처리.)
 */
export function applyStageOps(
  structure: NonSessionStructure,
  ops: StageOp[],
): NonSessionStructure {
  let stages = structure.stages
  for (const op of ops) {
    stages = applyOne(stages, op)
  }
  return { kind: structure.kind, stages }
}

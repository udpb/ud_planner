/**
 * BR-WS-22 — 대화 → 예산 적산 라인 override (순수 적용 엔진)
 *
 * 예산 자동화 단계에서 PM 이 자연어로 말하면("운영비 줄여줘 / 마진 너무 높아"),
 * assistant route 가 이를 `BudgetOp[]` 로 해석한다. 이 모듈은 그 ops 를 **순수함수**로
 * BudgetCalcCanvas 의 `acEdits`/`pcEdits`(라벨 키 → 금액 override, BR-WS-18) 맵에
 * 적용한다 — 결과는 PM 이 인라인 input 에 손으로 친 것과 **동일한 라인 override** 다.
 *
 * ⚠️ session-ops.ts 의 미러다(구조·주석 스타일 동형). 단, 회차 op(add/remove/reorder)가
 *    아니라 **라인 금액 override** 만이다 — 적산 엔진(budget-calc.ts)·단가표(budget-rules.json)는
 *    절대 건드리지 않는다(BR-WS-18 동결). OR/마진은 override 된 라인 합으로 캔버스가 재계산한다.
 *
 * 핵심 불변식:
 *   - 라인 override 만. 워터폴(R/VAT/R'/IC/IDC/DR)·단가·OR 공식은 무변경 — 캔버스가
 *     acLines/pcLines 합으로 OR=DR−PC−AC 를 다시 구할 뿐(엔진 재적산 아님).
 *   - 불변(immutable): 항상 새 맵 객체. 원본 edits 무변형.
 *   - 알 수 없는 label 은 route 의 knownLabels 필터에서 사전 차단(환각 방지) — 이 모듈은
 *     검증된 ops 를 받아 그대로 반영한다(throw 금지).
 *   - setLine = 라벨 키 금액 설정, resetLine = 그 키 삭제(기본 적산값 복귀).
 *
 * ⚠️ budget-calc.ts·budget-rules.json 계약 수정 0 — acEdits/pcEdits 맵 조작만.
 */

/** 예산 적산 라인 1건 참조 (현재 캔버스 라인 — section·label·amount 만). route·chat 동봉용. */
export interface BudgetLineRef {
  /** 'AC'(실비) | 'PC'(인건비) — 어느 적산 섹션 라인인지. */
  section: 'AC' | 'PC'
  /** 라인 라벨(acEdits/pcEdits 의 키와 동일 — 매칭 근거). */
  label: string
  /** 현재 금액(원) — override 반영분(PM 편집·기본 적산값). */
  amount: number
}

/**
 * 예산 라인 변경 1건 (assistant 가 자연어를 해석해 반환하는 계약).
 *   - setLine   : section/label 라인 금액을 amount 로 override(인라인 편집과 동일).
 *   - resetLine : section/label 의 override 해제 → 기본 적산값으로 복귀.
 */
export type BudgetOp =
  | { op: 'setLine'; section: 'AC' | 'PC'; label: string; amount: number }
  | { op: 'resetLine'; section: 'AC' | 'PC'; label: string }

/** 허용 op 종류 (검증용). */
const OP_KINDS = ['setLine', 'resetLine'] as const

/** 적산 섹션 2종 (검증용). */
function isSection(v: unknown): v is 'AC' | 'PC' {
  return v === 'AC' || v === 'PC'
}

/**
 * unknown 1건이 유효한 BudgetOp 인지 검증(허용 op·section enum·label·amount 타입). 통과 못하면 null.
 * route 가 AI 산출 ops 를 신뢰하기 전 게이트로 쓴다. (label 의 "존재" 검증은 route 의 knownLabels 필터.)
 */
export function validateBudgetOp(v: unknown): BudgetOp | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const op = o.op
  if (typeof op !== 'string' || !(OP_KINDS as readonly string[]).includes(op)) return null
  if (!isSection(o.section)) return null
  if (typeof o.label !== 'string' || !o.label.trim()) return null

  switch (op) {
    case 'setLine': {
      // 금액은 유한·음수 아닌 number 만(NaN·Infinity·음수 → drop).
      if (typeof o.amount !== 'number' || !Number.isFinite(o.amount) || o.amount < 0) return null
      return { op: 'setLine', section: o.section, label: o.label.trim(), amount: Math.round(o.amount) }
    }
    case 'resetLine': {
      return { op: 'resetLine', section: o.section, label: o.label.trim() }
    }
    default:
      return null
  }
}

/** unknown[] → 검증 통과한 BudgetOp[] (불량 항목은 drop). 입력이 배열 아니면 []. */
export function validateBudgetOps(v: unknown): BudgetOp[] {
  if (!Array.isArray(v)) return []
  const out: BudgetOp[] = []
  for (const item of v) {
    const valid = validateBudgetOp(item)
    if (valid) out.push(valid)
  }
  return out
}

/** acEdits/pcEdits 의 형태(라벨 키 → 금액). BudgetCalcCanvas 의 client state 와 동형. */
export interface BudgetEdits {
  ac: Record<string, number>
  pc: Record<string, number>
}

/**
 * ops 를 순차 적용한 새 BudgetEdits (불변). 원본 edits 무변형 — 항상 새 맵 객체.
 *   - setLine   : 해당 section 맵에 label→amount 설정.
 *   - resetLine : 해당 section 맵에서 label 키 삭제(기본 적산값 복귀).
 * 빈 ops 면 동일 내용의 새 맵으로 반환(참조만 안전하게 교체).
 */
export function applyBudgetOps(edits: BudgetEdits, ops: BudgetOp[]): BudgetEdits {
  const ac = { ...edits.ac }
  const pc = { ...edits.pc }
  for (const op of ops) {
    const map = op.section === 'AC' ? ac : pc
    if (op.op === 'setLine') {
      map[op.label] = op.amount
    } else {
      // resetLine — 키 삭제(기본 적산값 복귀).
      delete map[op.label]
    }
  }
  return { ac, pc }
}

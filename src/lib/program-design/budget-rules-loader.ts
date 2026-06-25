/**
 * budget-rules-loader — budget-rules.json server-only 로더 (BR-WS-15 분리)
 *
 * `budget-calc.ts` 가 client-safe 가 되도록, fs(node:fs)로 단가표를 읽는 부분만
 * 이 파일로 분리했다. **계산 로직은 budget-calc.ts(순수)에 그대로** — 이 파일은
 * `data/program-design/budget-rules.json`(읽기 전용·권위 데이터)을 읽어 파싱·캐시만
 * 한다.
 *
 * ⚠️ server-only. client 컴포넌트는 이 파일을 import 하지 않는다(번들에 node:fs).
 *    client live 적산은 server(route/page)가 미리 로드해 넘긴 BudgetRules 로
 *    calcBudget 을 호출한다(BR-WS-15).
 *
 * ⚠️ budget-rules.json 은 절대 수정 금지(읽기 전용).
 *
 * Source: .claude/agent-briefs/BR-WS-15-stage-thread.md ·
 *         data/program-design/budget-rules.json
 */

import 'server-only'

import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { BudgetRules } from './budget-calc'

export const BUDGET_RULES_PATH = path.join(
  process.cwd(),
  'data',
  'program-design',
  'budget-rules.json',
)

// ─────────────────────────────────────────────────────────────────
// 로더 (캐시 — 단가표는 빌드 중 불변)
// ─────────────────────────────────────────────────────────────────

let _cache: BudgetRules | null = null

/**
 * budget-rules.json 을 읽어 파싱한다 (읽기 전용). 프로세스 내 1회 캐시.
 * 실패 시 경로를 담은 명확한 에러를 던진다.
 */
export async function loadBudgetRules(): Promise<BudgetRules> {
  if (_cache) return _cache
  let raw: string
  try {
    raw = await fs.readFile(BUDGET_RULES_PATH, 'utf8')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `[budget-calc] 단가 규칙 파일을 읽지 못했습니다 (${BUDGET_RULES_PATH}): ${msg}`,
    )
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `[budget-calc] 단가 규칙 JSON 파싱 실패 (${BUDGET_RULES_PATH}): ${msg}`,
    )
  }
  _cache = json as BudgetRules
  return _cache
}

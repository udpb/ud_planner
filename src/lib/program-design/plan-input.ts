/**
 * BR-3b — 프로그램 기획 입력 합성 (프로젝트 → PlanInput)
 *
 * `buildPlanInputFromProject(projectId, extra)`:
 *   - 기존 `buildPipelineContext` 의 RfpSlice 조립을 **그대로 재사용**해 PlanInput.rfp 구성.
 *     (curriculum route 가 쓰는 패턴 — `ctx.rfp` 가 곧 RfpSlice. 중복 구현·route 수정 안 함.)
 *   - precedent / intent / decisions 는 호출부(UI 턴 루프)가 넘긴 `extra` 에서.
 *   - RFP 가 없거나 파싱 전이면 명확한 에러를 던진다(UI 가 안내).
 *
 * 이 파일은 입력 합성만 — 엔진(`planProgram`)·타입(`plan-types`)은 읽기만.
 */

import { buildPipelineContext } from '@/lib/pipeline-context'
import type {
  PlanInput,
  PrecedentInput,
  IntentInput,
} from '@/lib/program-design/plan-types'

/** RFP 슬라이스가 아직 없을 때(파싱 전) 던지는 식별 가능한 에러. */
export class PlanInputRfpMissingError extends Error {
  constructor(message = 'RFP 파싱이 먼저 필요합니다 (Project.rfpParsed 비어 있음).') {
    super(message)
    this.name = 'PlanInputRfpMissingError'
  }
}

export interface BuildPlanInputExtra {
  precedent?: PrecedentInput
  intent?: IntentInput
  /** 턴 기반 누적 게이트 응답 (axis → 값). */
  decisions?: Record<string, unknown>
}

/**
 * 프로젝트 → PlanInput.
 *
 * @param projectId  대상 프로젝트
 * @param extra      precedent / intent / decisions (UI 가 누적)
 * @param viewerId   권한 컨텍스트(선택) — buildPipelineContext 에 전달
 * @throws PlanInputRfpMissingError RFP 파싱 전이면
 */
export async function buildPlanInputFromProject(
  projectId: string,
  extra: BuildPlanInputExtra = {},
  viewerId?: string,
): Promise<PlanInput> {
  // 기존 조립 패턴 재사용 — ctx.rfp 가 곧 RfpSlice.
  const ctx = await buildPipelineContext(projectId, { viewerId })

  if (!ctx.rfp) {
    throw new PlanInputRfpMissingError()
  }

  const input: PlanInput = {
    rfp: ctx.rfp,
  }

  // precedent / intent 는 summary 또는 decisions 가 하나라도 있을 때만 포함
  // (빈 객체를 넘기면 엔진 해소 우선순위 판단에 잡음이 됨).
  if (hasContent(extra.precedent)) input.precedent = extra.precedent
  if (hasContent(extra.intent)) input.intent = extra.intent
  if (extra.decisions && Object.keys(extra.decisions).length > 0) {
    input.decisions = extra.decisions
  }

  return input
}

function hasContent(v?: { summary?: string; decisions?: Record<string, unknown> }): boolean {
  if (!v) return false
  const hasSummary = typeof v.summary === 'string' && v.summary.trim().length > 0
  const hasDecisions = !!v.decisions && Object.keys(v.decisions).length > 0
  return hasSummary || hasDecisions
}

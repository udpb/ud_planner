/**
 * Loop Alignment — SROI 축 3방향 얼라인 체크 (ADR-008 Phase F Wave 7)
 *
 * 근거: ADR-008 (docs/decisions/008-impact-value-chain.md)
 *       스펙:  docs/architecture/value-chain.md ("루프: SROI 축 3방향 얼라인" 섹션)
 *
 * ⑤ Outcome (SROI 비율) 숫자가 확정되는 순간 3방향 역류 검증을 트리거:
 *    ⑤ → ① Impact   (평가위원 설득력 — 비율이 너무 낮지 않은가?)
 *    ⑤ → ② Input    (과다 약속 — 비율이 너무 높지 않은가?)
 *    ⑤ → ④ Activity (커리큘럼 Activity 와 Logic Model Outcome 매핑 밀도)
 *
 * 각 방향은 `AlignmentCheck` 로 표현되며, status 는 ok / warn / mismatch 3단계.
 * `overallStatus` 는 3개 중 "최악" 을 채택 (mismatch > warn > ok).
 *
 * 본 모듈은 value-chain.ts 의 타입/상수만 import 한다.
 * value-chain.ts → loop-alignment.ts 로의 역의존 금지 (ADR-008 스펙 참조).
 *
 * ────────────────────────────────────────────────────────────────────
 * dev-comment — 기본 임계값 기반 빠른 검증 예시 (value-chain.md "기본 임계" 섹션):
 *
 *   sroiRatio = 1.3  → Impact=mismatch · Input=ok · Activity=(데이터에 따라)
 *   sroiRatio = 3.2  → Impact=ok       · Input=ok · Activity=ok (정상 데이터 가정)
 *   sroiRatio = 8.0  → Impact=ok       · Input=mismatch · Activity=(데이터에 따라)
 * ────────────────────────────────────────────────────────────────────
 */

import type { PipelineContext } from '@/lib/pipeline-context'
import type {
  LoopAlignmentChecks,
  AlignmentCheck,
  AlignmentStatus,
} from '@/lib/value-chain'

// ═════════════════════════════════════════════════════════════
// 1. 임계값 상수 (value-chain.md "기본 임계" 섹션)
// ═════════════════════════════════════════════════════════════

/** ⑤ → ① Impact 방향 — 너무 낮으면 평가위원 설득력 약함 */
const IMPACT_MISMATCH_BELOW = 1.5
const IMPACT_WARN_BELOW = 2.5

/** ⑤ → ② Input 방향 — 너무 높으면 과다 약속 의심 */
const INPUT_WARN_ABOVE = 5
const INPUT_MISMATCH_ABOVE = 7

// ═════════════════════════════════════════════════════════════
// 2. 헬퍼 — status 순위 비교
// ═════════════════════════════════════════════════════════════

const STATUS_RANK: Record<AlignmentStatus, number> = {
  ok: 0,
  warn: 1,
  mismatch: 2,
}

function worstStatus(...statuses: AlignmentStatus[]): AlignmentStatus {
  return statuses.reduce<AlignmentStatus>(
    (worst, cur) => (STATUS_RANK[cur] > STATUS_RANK[worst] ? cur : worst),
    'ok',
  )
}

/** SROI 비율을 보기 좋은 문자열로 포맷 (예: 3.2) */
function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—'
  // 소수 둘째까지, 끝자리 0 은 제거
  return ratio
    .toFixed(2)
    .replace(/\.?0+$/, '') || '0'
}

// ═════════════════════════════════════════════════════════════
// 3. 방향별 계산 — ⑤ → ① Impact
// ═════════════════════════════════════════════════════════════

function checkImpactDirection(sroiRatio: number): AlignmentCheck {
  const ratioStr = formatRatio(sroiRatio)

  if (sroiRatio < IMPACT_MISMATCH_BELOW) {
    return {
      targetStage: 'impact',
      status: 'mismatch',
      signal: `1:${ratioStr} — 평가위원 설득력 약함 (통상 1:1.5 미만은 기대효과 배점 직격탄)`,
      fixHint: 'Outcome 지표 재점검 또는 예산 축소 검토',
      returnTo: 'rfp',
      debugMetrics: { sroiRatio, threshold: IMPACT_MISMATCH_BELOW },
    }
  }

  if (sroiRatio < IMPACT_WARN_BELOW) {
    return {
      targetStage: 'impact',
      status: 'warn',
      signal: `1:${ratioStr} — 설득력 경계선`,
      fixHint: 'Outcome 1~2개 추가 가능한지',
      returnTo: 'rfp',
      debugMetrics: { sroiRatio, threshold: IMPACT_WARN_BELOW },
    }
  }

  return {
    targetStage: 'impact',
    status: 'ok',
    signal: `1:${ratioStr} — Impact 의도 정량화 양호`,
    fixHint: '추가 개선 불필요',
    returnTo: 'rfp',
    debugMetrics: { sroiRatio },
  }
}

// ═════════════════════════════════════════════════════════════
// 4. 방향별 계산 — ⑤ → ② Input
// ═════════════════════════════════════════════════════════════

function checkInputDirection(sroiRatio: number): AlignmentCheck {
  const ratioStr = formatRatio(sroiRatio)

  if (sroiRatio > INPUT_MISMATCH_ABOVE) {
    return {
      targetStage: 'input',
      status: 'mismatch',
      signal: `1:${ratioStr} — 과다 약속 의심 (벤치마크 상위 이례 범위)`,
      fixHint: 'Outcome 숫자 하향 조정 또는 예산 근거 보강',
      returnTo: 'budget',
      debugMetrics: { sroiRatio, threshold: INPUT_MISMATCH_ABOVE },
    }
  }

  if (sroiRatio > INPUT_WARN_ABOVE) {
    return {
      targetStage: 'input',
      status: 'warn',
      signal: `1:${ratioStr} — 과다 가능성 주의`,
      fixHint: 'SROI 벤치마크 리서치 참조',
      returnTo: 'budget',
      debugMetrics: { sroiRatio, threshold: INPUT_WARN_ABOVE },
    }
  }

  return {
    targetStage: 'input',
    status: 'ok',
    signal: `1:${ratioStr} — Input 대비 Outcome 현실적`,
    fixHint: '추가 개선 불필요',
    returnTo: 'budget',
    debugMetrics: { sroiRatio },
  }
}

// ═════════════════════════════════════════════════════════════
// 5. 방향별 계산 — ⑤ → ④ Activity
// ═════════════════════════════════════════════════════════════

/**
 * Logic Model 의 `outcome` 배열과 `activity` 배열 매핑 밀도를 기반으로 판정.
 *
 * - Logic Model 자체가 없음 → warn ("Logic Model 미확정")
 * - Activity 배열이 비었거나, Outcome 이 Activity 의 2배 이상 → mismatch
 * - Activity 가 1~2 개인데 Outcome 이 3 개 이상 → warn
 * - 그 외 → ok
 */
function checkActivityDirection(ctx: PipelineContext): AlignmentCheck {
  const logicModel = ctx.impact?.logicModel

  if (!ctx.impact || !logicModel) {
    return {
      targetStage: 'activity',
      status: 'warn',
      signal: 'Logic Model 미확정 — Activity ↔ Outcome 매핑 밀도 판정 불가',
      fixHint: 'Step 5 에서 Logic Model 을 먼저 생성하세요',
      returnTo: 'curriculum',
      debugMetrics: { hasImpact: 0, hasLogicModel: 0 },
    }
  }

  const outcomeCount = logicModel.outcome?.length ?? 0
  const activityCount = logicModel.activity?.length ?? 0

  // Activity 비어있거나 Outcome 이 Activity 대비 2배 이상
  if (activityCount === 0 || outcomeCount >= activityCount * 2) {
    return {
      targetStage: 'activity',
      status: 'mismatch',
      signal: `커리큘럼 Activity 부족 또는 Outcome 과다 (Activity ${activityCount} · Outcome ${outcomeCount}) — Activity 로 만들어낼 수 있는 범위 확인 필요`,
      fixHint:
        activityCount === 0
          ? 'Step 2 커리큘럼을 먼저 설계하세요'
          : 'Outcome 개수를 Activity 로 감당 가능한 수준까지 축소 · 또는 Activity 를 늘리세요',
      returnTo: 'curriculum',
      debugMetrics: { activityCount, outcomeCount },
    }
  }

  // Activity 1~2 개인데 Outcome 3 개 이상
  if (activityCount <= 2 && outcomeCount >= 3) {
    return {
      targetStage: 'activity',
      status: 'warn',
      signal: `Activity ${activityCount}건 대비 Outcome ${outcomeCount}건 — Activity 당 감당 부담 큼`,
      fixHint: 'Activity 를 1~2개 추가하거나 Outcome 을 응집해 축소',
      returnTo: 'curriculum',
      debugMetrics: { activityCount, outcomeCount },
    }
  }

  return {
    targetStage: 'activity',
    status: 'ok',
    signal: `Activity ${activityCount}건 · Outcome ${outcomeCount}건 — 매핑 밀도 적정`,
    fixHint: '추가 개선 불필요',
    returnTo: 'curriculum',
    debugMetrics: { activityCount, outcomeCount },
  }
}

// ═════════════════════════════════════════════════════════════
// 6. 진입점 — computeLoopAlignment
// ═════════════════════════════════════════════════════════════

/**
 * SROI 숫자 확정 시점에 3방향 얼라인 체크를 계산.
 *
 * @param sroiRatio  SROI 비율 (Project.sroiForecast.ratio). NaN · 음수 · 0 은 유효성 오류로 취급.
 * @param ctx        PipelineContext — Activity/Outcome 데이터 참조용.
 *
 * @returns LoopAlignmentChecks — 3방향 결과 + overallStatus + computedAt.
 */
export function computeLoopAlignment(
  sroiRatio: number,
  ctx: PipelineContext,
): LoopAlignmentChecks {
  const computedAt = new Date().toISOString()

  // ─── 에지 케이스: sroiRatio 가 유효하지 않으면 전 방향 warn ───
  if (!Number.isFinite(sroiRatio) || sroiRatio <= 0) {
    const invalidMsg = 'SROI 숫자 유효성 확인 필요 (NaN · 음수 · 0 감지)'
    const invalidCheck = (
      targetStage: AlignmentCheck['targetStage'],
      returnTo: AlignmentCheck['returnTo'],
    ): AlignmentCheck => ({
      targetStage,
      status: 'warn',
      signal: invalidMsg,
      fixHint: 'Step 4 예산에서 SROI 비율이 정상 계산됐는지 확인',
      returnTo,
      debugMetrics: { sroiRatio: String(sroiRatio) },
    })

    return {
      sroiRatio,
      computedAt,
      impactDirection: invalidCheck('impact', 'rfp'),
      inputDirection: invalidCheck('input', 'budget'),
      activityDirection: invalidCheck('activity', 'curriculum'),
      overallStatus: 'warn',
    }
  }

  const impactDirection = checkImpactDirection(sroiRatio)
  const inputDirection = checkInputDirection(sroiRatio)
  const activityDirection = checkActivityDirection(ctx)

  return {
    sroiRatio,
    computedAt,
    impactDirection,
    inputDirection,
    activityDirection,
    overallStatus: worstStatus(
      impactDirection.status,
      inputDirection.status,
      activityDirection.status,
    ),
  }
}

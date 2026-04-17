/**
 * PM Guide Resolve — 스텝·컨텍스트 기반으로 표시할 가이드 콘텐츠 결정
 *
 * Data Source:
 *   - WinningPattern (D1) — findWinningPatterns()
 *   - ChannelPreset (D2) — getChannelPreset()
 *   - Static Content — 흔한 실수 / UD 강점 팁
 *
 * ADR-005: 가이드북 본문 통째 주입 금지.
 */

import type { PipelineContext, ProposalSectionKey } from '@/lib/pipeline-context'
import { findWinningPatterns } from '@/lib/winning-patterns'
import { getChannelPreset } from '@/lib/channel-presets'
import {
  COMMON_MISTAKES_BY_STEP,
  EVALUATOR_PERSPECTIVE_FALLBACK,
  UD_STRENGTH_TIPS,
} from './static-content'
import type { PmGuideContent, StepKey } from './types'

// ─────────────────────────────────────────
// 스텝 → 제안서 섹션 매핑
// ─────────────────────────────────────────

const STEP_TO_SECTION: Record<StepKey, ProposalSectionKey> = {
  rfp: 'proposal-background',
  curriculum: 'curriculum',
  coaches: 'coaches',
  budget: 'budget',
  impact: 'impact',
  proposal: 'other',
}

// ─────────────────────────────────────────
// 채널 타입 도출
// ─────────────────────────────────────────

function deriveChannel(context: PipelineContext): string {
  if (context.meta.channelType === 'renewal') return 'renewal'
  // bid 인 경우 projectType 으로 B2G | B2B
  return context.meta.projectType ?? 'B2G'
}

// ─────────────────────────────────────────
// 메인 resolve 함수
// ─────────────────────────────────────────

/**
 * 주어진 스텝과 파이프라인 컨텍스트에 따라 PM 가이드 콘텐츠를 조합합니다.
 *
 * @param stepKey  현재 활성 스텝
 * @param context  PipelineContext (buildPipelineContext 결과)
 * @returns        PmGuideContent
 */
export async function resolvePmGuide(
  stepKey: StepKey,
  context: PipelineContext,
): Promise<PmGuideContent> {
  const channel = deriveChannel(context)
  const sectionKey = STEP_TO_SECTION[stepKey]

  // 병렬: DB 조회 (WinningPattern + ChannelPreset)
  const [patterns, preset] = await Promise.all([
    findWinningPatterns({
      sectionKey,
      channelType: channel,
      outcome: 'won',
      limit: 3,
    }).catch(() => []),
    getChannelPreset(channel).catch(() => null),
  ])

  // 평가위원 관점: DB preset 우선, 없으면 static fallback
  const evaluatorPerspective =
    preset?.evaluatorProfile ?? EVALUATOR_PERSPECTIVE_FALLBACK[channel] ?? null

  return {
    winningReferences: patterns,
    evaluatorPerspective,
    commonMistakes: COMMON_MISTAKES_BY_STEP[stepKey] ?? [],
    udStrengthTips: UD_STRENGTH_TIPS[stepKey] ?? [],
  }
}

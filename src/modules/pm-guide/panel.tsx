/**
 * PmGuidePanel — 각 스텝 우측에 표시되는 PM 가이드 패널
 *
 * Server Component 로 사용 가능: page.tsx 에서 resolvePmGuide 결과를 전달하면
 * 이 컴포넌트는 순수 렌더링만 수행.
 *
 * 섹션 순서 (2026-04-23 Phase F Wave 4 — Value Chain 다이어그램 추가):
 *   0. ValueChainDiagram    — Impact Value Chain 5단계 + 루프 (최상단 상시) ✨ 신규
 *   1. ResearchRequestsCard — 스텝별 티키타카 리서치 요청 (✨ Wave 3: 단계 뱃지 + 씨앗/수확)
 *   2. EvaluatorCard        — 평가위원 관점 (스텝별 구체)
 *   3. CommonMistakesCard   — 흔한 실수
 *   4. WinningReferencesCard — 당선 레퍼런스
 *   5. UdStrengthsCard      — UD 강점 팁
 *
 * 디자인 SKILL 준수:
 *   - Card 컴포넌트 사용
 *   - 카드 제목 text-base font-semibold
 *   - Action Orange 는 배지·강조만 (10-15%)
 *   - lucide 아이콘: MessageCircleQuestion · Target · Trophy · AlertTriangle · Sparkles
 */

import { EvaluatorCard } from './sections/evaluator'
import { WinningReferencesCard } from './sections/winning-references'
import { CommonMistakesCard } from './sections/common-mistakes'
import { UdStrengthsCard } from './sections/ud-strengths'
import { ResearchRequestsCard } from './sections/research-requests'
import { ValueChainDiagram } from '@/components/value-chain-diagram'
import {
  computeValueChainState,
  type ValueChainInputs,
} from '@/lib/value-chain'
import type { PmGuideContent, StepKey } from './types'

interface PmGuidePanelProps {
  content: PmGuideContent
  /** 리서치 저장 API 호출에 필요 */
  projectId: string
  /** 현재 스텝 — research 저장 시 stepKey 메타로 첨부 */
  stepKey: StepKey
  /**
   * Value Chain 다이어그램 계산용 입력 (Phase F, ADR-008).
   * 미지정 시 최소값으로 fallback — 다이어그램은 현재 스텝만 하이라이트.
   */
  valueChainInputs?: ValueChainInputs
}

export function PmGuidePanel({
  content,
  projectId,
  stepKey,
  valueChainInputs,
}: PmGuidePanelProps) {
  // Phase F: Value Chain 상태 도출 (다이어그램용)
  const vcState = computeValueChainState(
    valueChainInputs ?? {
      hasIntent: false,
      hasBudget: false,
      hasCoaches: false,
      hasCurriculum: false,
      hasOutcomeDraft: false,
      hasSroi: false,
      hasProposalSections: false,
    },
    stepKey,
  )

  return (
    <aside className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        PM 가이드
      </p>

      {/* 0. Value Chain 다이어그램 (최상단 상시 — ADR-008) */}
      <ValueChainDiagram
        currentStage={vcState.currentStage}
        completedStages={vcState.completedStages}
        hasSroi={vcState.hasSroi}
      />

      {/* 1. 리서치 요청 (티키타카 카드) */}
      <ResearchRequestsCard
        projectId={projectId}
        stepKey={stepKey}
        requests={content.researchRequests}
      />

      {/* 2. 평가위원 관점 (스텝별) */}
      <EvaluatorCard perspective={content.evaluatorPerspective} />

      {/* 3. 흔한 실수 */}
      <CommonMistakesCard items={content.commonMistakes} />

      {/* 4. 당선 레퍼런스 */}
      <WinningReferencesCard patterns={content.winningReferences} />

      {/* 5. UD 강점 팁 */}
      <UdStrengthsCard tips={content.udStrengthTips} />
    </aside>
  )
}

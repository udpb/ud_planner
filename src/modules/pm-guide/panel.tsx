/**
 * PmGuidePanel — 각 스텝 우측에 표시되는 PM 가이드 패널
 *
 * Server Component 로 사용 가능: page.tsx 에서 resolvePmGuide 결과를 전달하면
 * 이 컴포넌트는 순수 렌더링만 수행.
 *
 * 디자인 SKILL 준수:
 *   - Card 컴포넌트 사용
 *   - 카드 제목 text-base font-semibold
 *   - Action Orange 는 배지·강조만 (10-15%)
 *   - lucide 아이콘: Target · Trophy · AlertTriangle · Sparkles
 */

import { EvaluatorCard } from './sections/evaluator'
import { WinningReferencesCard } from './sections/winning-references'
import { CommonMistakesCard } from './sections/common-mistakes'
import { UdStrengthsCard } from './sections/ud-strengths'
import type { PmGuideContent } from './types'

interface PmGuidePanelProps {
  content: PmGuideContent
}

export function PmGuidePanel({ content }: PmGuidePanelProps) {
  return (
    <aside className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        PM 가이드
      </p>
      <EvaluatorCard perspective={content.evaluatorPerspective} />
      <WinningReferencesCard patterns={content.winningReferences} />
      <CommonMistakesCard items={content.commonMistakes} />
      <UdStrengthsCard tips={content.udStrengthTips} />
    </aside>
  )
}

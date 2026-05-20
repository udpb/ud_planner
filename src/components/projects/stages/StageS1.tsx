'use client'

/**
 * StageS1 — RFP 분석 (Wave V / F0)
 *
 * 펼침 시: 기존 StepRfp 컴포넌트 그대로 렌더.
 * F0 에선 단지 wrapper — AI 자동 채움 토글 placeholder (F5 에서 활성).
 */

import { StepRfp } from '@/app/(dashboard)/projects/[id]/step-rfp'
import type { ComponentProps } from 'react'

type StepRfpProps = ComponentProps<typeof StepRfp>

interface Props {
  stepRfpProps: StepRfpProps
}

export function StageS1({ stepRfpProps }: Props) {
  return (
    <div className="space-y-4">
      {/* F5 자동 채움 토글 placeholder — F0 에선 아직 활성 안 됨 */}
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        💡 <strong className="font-semibold">AI 자동 채움</strong> (F5) — RFP 업로드 후
        Logic Model · 자산 · 코치 · 커리큘럼 · 1차본 60% 까지 자동 채움 예정.
        현재는 기존 RFP 분석 화면 그대로.
      </div>
      <StepRfp {...stepRfpProps} />
    </div>
  )
}

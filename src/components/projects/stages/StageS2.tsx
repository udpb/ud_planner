'use client'

/**
 * StageS2 — 1차본 작성 (Wave V / F0)
 *
 * 펼침 시: ExpressShell 그대로 렌더 (가장 큰 재사용).
 * F0 에선 단지 wrapper. NowBar / NorthStarBar 등 ExpressShell 내부 sticky
 * 컴포넌트가 그대로 작동.
 *
 * 참고: 부모 StageCard 의 padding 안에 들어가므로 ExpressShell 본문의 sticky
 * top 좌표는 StageCard 의 펼침 영역 안에서만 유효 (전역 sticky 와 충돌 시
 * F0 B8 검증 단계에서 z-index 조정).
 */

import { ExpressShell } from '@/components/express/ExpressShell'
import type { ComponentProps } from 'react'

type ExpressShellProps = ComponentProps<typeof ExpressShell>

interface Props {
  expressShellProps: ExpressShellProps
}

export function StageS2({ expressShellProps }: Props) {
  return (
    <div className="-m-4">
      {/* ExpressShell 은 내부적으로 자체 padding/sticky 가 있어서
          StageCard 의 p-4 를 상쇄 (-m-4) — full-bleed 안에서 렌더 */}
      <ExpressShell {...expressShellProps} />
    </div>
  )
}

'use client'

/**
 * StageS3 — 검수 (Wave V / F0)
 *
 * F0 결정 (H.1.d): server 가 inspectorReport 를 모름 (ExpressShell client state).
 * 따라서 F0 의 S3 카드는 **placeholder** —
 *   "Stage 2 에서 검수 실행 → 결과는 Stage 2 카드 안의 검수 카드에서 확인"
 *
 * F5 에서 inspector report DB 영속화 + S3 카드 격상 예정.
 */

import { Search, ArrowUp, CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  /** S2 카드를 펼치는 콜백 — PM 이 "S2 로 이동" 클릭 시 호출 */
  onJumpToS2?: () => void
  /** Express 1차본이 50% 이상 채워졌는가 (검수 실행 가능 조건) */
  draftProgressOverall?: number
  /** Express 1차본 승인 (isCompleted) 여부 */
  isExpressCompleted?: boolean
}

export function StageS3({
  onJumpToS2,
  draftProgressOverall = 0,
  isExpressCompleted = false,
}: Props) {
  const canInspect = isExpressCompleted || draftProgressOverall >= 50

  return (
    <div className="space-y-3">
      {/* 안내 */}
      <div className="flex items-start gap-3 border bg-muted/30 p-3">
        <Search className="h-4 w-4 text-brand mt-0.5 shrink-0" />
        <div className="space-y-1 text-sm">
          <div className="font-medium">평가위원 시각 7 렌즈 검수</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            시장 · 통계 · 문제정의 · Before/After · 핵심 메시지 · 차별화 · 톤·완결성
            7개 lens 로 1차본을 평가하고, 약점 lens 에 대응하는 UD 자산을 자동 추천합니다.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">현재 결과는 Stage 2 (1차본 작성) 카드 안의
            검수 카드</strong> 에서 확인할 수 있습니다. (F0 placeholder — F5 에서 S3 격상 예정)
          </p>
        </div>
      </div>

      {/* CTA */}
      {canInspect ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onJumpToS2} className="gap-1.5">
            <ArrowUp className="h-3.5 w-3.5" />
            Stage 2 (1차본 작성) 으로 — 검수 실행
          </Button>
          <span className="text-xs text-muted-foreground">
            Stage 2 의 NowBar 에 &quot;✓ 1차본 승인 + 검수&quot; 또는 &quot;🔍 검수 실행&quot; 버튼이 노출됩니다.
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2 border border-amber-300 bg-amber-50/60 p-2.5 text-xs text-amber-800">
          <CircleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            검수는 1차본 50% 이상이어야 의미가 있습니다. Stage 2 에서 챗봇으로
            먼저 1차본을 채워주세요.
          </span>
        </div>
      )}
    </div>
  )
}

'use client'

/**
 * 자동 추출 카드 — 시스템이 자동 처리한 사항 알림
 * (Phase L Wave L2, ADR-011 §5.3)
 *
 * Wave 2 #7 통합: 자산 매칭 알림 + "오른쪽 미리보기에서 토글" 안내.
 * 토글 액션 자체는 ExpressPreview 의 차별화 자산 카드에서만 — 좌우 중복 제거.
 */

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, ArrowRight } from 'lucide-react'

interface Props {
  topic: string
  autoNote: string
  onAcknowledge: () => void
}

export function AutoExtractCard({ topic, autoNote, onAcknowledge }: Props) {
  // topic 에 "자산" 단어 포함 시 — 우측 안내 표시
  const isAssetMatch = /자산|asset|매칭/.test(topic)

  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-green-700" />
          자동 추출 — {topic}
        </div>
        <p className="text-xs text-foreground/85">{autoNote}</p>
        {isAssetMatch && (
          <p className="flex items-center gap-1 rounded bg-white/60 px-2 py-1 text-[11px] text-muted-foreground">
            <ArrowRight className="h-3 w-3" />
            오른쪽 미리보기의 <span className="font-medium">차별화 자산</span> 카드에서 자산을 토글하세요.
          </p>
        )}
        <Button size="sm" variant="outline" onClick={onAcknowledge} className="text-xs">
          확인 · 다음으로
        </Button>
      </CardContent>
    </Card>
  )
}

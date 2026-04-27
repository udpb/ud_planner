'use client'

/**
 * 자동 추출 카드 — 시스템이 자동 처리한 사항 알림
 * (Phase L Wave L2, ADR-011 §5.3)
 */

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'

interface Props {
  topic: string
  autoNote: string
  onAcknowledge: () => void
}

export function AutoExtractCard({ topic, autoNote, onAcknowledge }: Props) {
  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-green-700" />
          자동 추출 — {topic}
        </div>
        <p className="text-xs text-foreground/85">{autoNote}</p>
        <Button size="sm" variant="outline" onClick={onAcknowledge} className="text-xs">
          확인 · 다음으로
        </Button>
      </CardContent>
    </Card>
  )
}

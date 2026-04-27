'use client'

/**
 * PM 직접 카드 — 발주처 통화·내부 정보 등 시스템이 모르는 영역
 * (Phase L Wave L2, ADR-011 §5.1)
 */

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Phone } from 'lucide-react'

interface Props {
  topic: string
  checklistItems: string[]
  onSubmit: (answer: string) => void
}

export function PmDirectCard({ topic, checklistItems, onSubmit }: Props) {
  const [answer, setAnswer] = useState('')

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Phone className="h-4 w-4 text-amber-700" />
          PM 직접 카드 — {topic}
        </div>

        {checklistItems.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">PM 이 직접 확인할 항목</div>
            <ul className="ml-1 space-y-1 text-xs">
              {checklistItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="font-medium text-amber-700">{i + 1}.</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="text-xs font-medium">확인 결과 입력</div>
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="확인한 내용을 자유롭게 적어주세요..."
            className="min-h-[80px] text-xs"
          />
          <Button
            size="sm"
            disabled={!answer.trim()}
            onClick={() => {
              onSubmit(answer.trim())
              setAnswer('')
            }}
          >
            결과 제출
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

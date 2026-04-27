'use client'

/**
 * 외부 LLM 카드 — 시장·통계·정책 자료 외부 LLM 위임
 * (Phase L Wave L2, ADR-011 §5.2)
 */

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Search, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  topic: string
  generatedPrompt: string
  onPaste: (answer: string) => void
}

export function ExternalLlmCard({ topic, generatedPrompt, onPaste }: Props) {
  const [answer, setAnswer] = useState('')
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt)
      setCopied(true)
      toast.success('프롬프트를 복사했어요. ChatGPT/Claude 에 붙여넣으세요.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('복사 실패')
    }
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Search className="h-4 w-4 text-blue-600" />
          외부 LLM 카드 — {topic}
        </div>

        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">
            아래 프롬프트를 복사해서 ChatGPT/Claude 등에 붙여넣고, 답을 다시 여기 붙여넣으세요.
          </div>
          <div className="rounded-md border bg-background p-2.5 text-xs text-foreground/85 whitespace-pre-wrap">
            {generatedPrompt}
          </div>
          <Button size="sm" variant="outline" onClick={handleCopy} className="text-xs">
            {copied ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" />
                복사됨
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                프롬프트 복사
              </>
            )}
          </Button>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium">외부 답 붙여넣기</div>
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="ChatGPT/Claude 답변을 여기에 붙여넣으세요..."
            className="min-h-[80px] text-xs"
          />
          <Button
            size="sm"
            disabled={!answer.trim()}
            onClick={() => {
              onPaste(answer.trim())
              setAnswer('')
            }}
          >
            답 제출
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

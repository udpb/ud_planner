'use client'

/**
 * ExpressChat — 좌측 챗봇 영역
 *  - Turn 리스트 표시
 *  - PM 자유 입력
 *  - 외부 LLM 카드 / PM 직접 카드 / 자동 추출 카드 인라인 렌더
 *  - RFP 미업로드 시 업로드 안내 카드
 *
 * (Phase L Wave L2, ADR-011 §3.2 장치 4·5)
 */

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Send, Upload, Loader2, FileQuestion } from 'lucide-react'
import { SLOT_LABELS, type SlotKey } from '@/lib/express/schema'
import type { Turn, ExternalLookupRequest } from '@/lib/express/conversation'
import { ExternalLlmCard } from './cards/ExternalLlmCard'
import { PmDirectCard } from './cards/PmDirectCard'
import { AutoExtractCard } from './cards/AutoExtractCard'
import { cn } from '@/lib/utils'

interface Props {
  turns: Turn[]
  currentSlot: string | null
  pendingExternalLookup?: ExternalLookupRequest
  pendingTurn: boolean
  isInitializing: boolean
  hasRfp: boolean
  onSendMessage: (pmInput: string, forceSlot?: string | null) => void
  onUploadRfp: () => void
}

export function ExpressChat({
  turns,
  currentSlot,
  pendingExternalLookup,
  pendingTurn,
  isInitializing,
  hasRfp,
  onSendMessage,
  onUploadRfp,
}: Props) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // 스크롤 자동 하단
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [turns.length, pendingTurn])

  const handleSubmit = () => {
    if (!input.trim() || pendingTurn) return
    const text = input.trim()
    setInput('')
    onSendMessage(text)
  }

  const slotLabel = currentSlot
    ? (SLOT_LABELS[currentSlot as SlotKey] ?? currentSlot)
    : '(전체 검토)'

  return (
    <div className="flex h-full flex-col">
      {/* 상단 바 — 다음 슬롯 안내 */}
      <div className="border-b bg-muted/30 px-5 py-2.5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          다음 채울 슬롯
        </div>
        <div className="mt-0.5 text-sm font-medium">
          {currentSlot ? (
            <>
              <span className="text-primary">●</span> {slotLabel}
            </>
          ) : (
            <span className="text-muted-foreground">전체 슬롯 채워짐 — 1차본 승인 가능</span>
          )}
        </div>
      </div>

      {/* 대화 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
        {/* RFP 미업로드 안내 */}
        {!hasRfp && turns.length === 0 && (
          <Card className="border-orange-200 bg-orange-50/50">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileQuestion className="h-4 w-4 text-primary" />
                RFP 부터 시작해 주세요
              </div>
              <p className="text-sm text-muted-foreground">
                RFP 를 업로드하면 챗봇이 자동으로 분석하고 첫 질문을 던져요. 본문 붙여넣기로도
                가능해요.
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={onUploadRfp}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  RFP 업로드 / 붙여넣기
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 초기화 중 */}
        {isInitializing && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            RFP 분석 중 · 자산 매칭 · 첫 질문 준비 중...
          </div>
        )}

        {/* Turn 리스트 */}
        {turns.map((t) => (
          <TurnBubble key={t.id} turn={t} />
        ))}

        {/* AI 응답 대기 */}
        {pendingTurn && !isInitializing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI 가 생각 중...
          </div>
        )}

        {/* 마지막 AI 턴의 quickReplies — 클릭 한 번에 답하기 */}
        {(() => {
          if (pendingTurn) return null
          const lastAi = [...turns].reverse().find((t) => t.role === 'ai')
          if (!lastAi || !lastAi.quickReplies || lastAi.quickReplies.length === 0) return null
          return (
            <div className="flex flex-wrap gap-1.5">
              {lastAi.quickReplies.map((reply, i) => (
                <button
                  key={i}
                  onClick={() => onSendMessage(reply)}
                  className="rounded-full border border-primary/40 bg-background px-3 py-1.5 text-xs text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                  title="클릭해 답변 전송"
                  disabled={pendingTurn}
                >
                  {reply}
                </button>
              ))}
            </div>
          )
        })()}

        {/* 외부 LLM 카드 */}
        {pendingExternalLookup && (
          <div className="my-2">
            {pendingExternalLookup.type === 'external-llm' && (
              <ExternalLlmCard
                topic={pendingExternalLookup.topic}
                generatedPrompt={pendingExternalLookup.generatedPrompt ?? ''}
                onPaste={(answer) => onSendMessage(`[외부 LLM 답]\n${answer}`)}
              />
            )}
            {pendingExternalLookup.type === 'pm-direct' && (
              <PmDirectCard
                topic={pendingExternalLookup.topic}
                checklistItems={pendingExternalLookup.checklistItems ?? []}
                onSubmit={(answer) => onSendMessage(`[PM 직접 확인]\n${answer}`)}
              />
            )}
            {pendingExternalLookup.type === 'auto-extract' && (
              <AutoExtractCard
                topic={pendingExternalLookup.topic}
                autoNote={pendingExternalLookup.autoNote ?? ''}
                onAcknowledge={() => onSendMessage('[확인]')}
              />
            )}
          </div>
        )}
      </div>

      {/* 입력 박스 */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              !hasRfp
                ? 'RFP 업로드 후 챗봇이 시작됩니다 (또는 직접 텍스트 입력)'
                : pendingTurn
                  ? 'AI 응답을 기다리는 중...'
                  : '답변을 입력하세요. Cmd/Ctrl + Enter 로 전송.'
            }
            className="min-h-[60px] flex-1 resize-none text-sm"
            disabled={pendingTurn}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                handleSubmit()
              }
            }}
          />
          <Button
            onClick={handleSubmit}
            disabled={!input.trim() || pendingTurn}
            size="icon"
            className="h-10 w-10"
            title="전송 (Cmd/Ctrl + Enter)"
          >
            {pendingTurn ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// Turn 말풍선
// ─────────────────────────────────────────

function TurnBubble({ turn }: { turn: Turn }) {
  const isAi = turn.role === 'ai'
  return (
    <div className={cn('flex', isAi ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
          isAi
            ? 'bg-muted text-foreground'
            : 'bg-primary text-primary-foreground',
        )}
      >
        <div>{turn.text}</div>
        {isAi && turn.targetSlot && (
          <div className="mt-1 text-[10px] uppercase tracking-wider opacity-60">
            슬롯: {SLOT_LABELS[turn.targetSlot as SlotKey] ?? turn.targetSlot}
            {turn.aiModel && <span className="ml-2">· {turn.aiModel}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

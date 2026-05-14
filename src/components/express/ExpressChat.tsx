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
  /** Wave 1 #13: 입력 보존 sessionStorage 스코프 */
  projectId?: string
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
  projectId,
  onSendMessage,
  onUploadRfp,
}: Props) {
  // Wave 1 #13: 채팅 인풋 sessionStorage 보존
  // - key 스코프: projectId × currentSlot. 슬롯 바뀌면 별도 저장 (의도)
  // - 마운트 시 복원, input 변할 때마다 저장, 전송 후 해당 키 제거
  const storageKey =
    projectId && currentSlot ? `express-input:${projectId}:${currentSlot}` : null

  const readStorage = (key: string | null): string => {
    if (!key || typeof window === 'undefined') return ''
    try {
      return sessionStorage.getItem(key) ?? ''
    } catch {
      return ''
    }
  }

  // lazy init — 첫 마운트 시 sessionStorage 에서 복원
  const [input, setInput] = useState<string>(() => readStorage(storageKey))
  // key 가 바뀌면 별도 복원 (사용자가 슬롯 사이 이동) — useEffect setState 회피 위해 useRef 비교
  const lastKeyRef = useRef<string | null>(storageKey)
  if (lastKeyRef.current !== storageKey) {
    lastKeyRef.current = storageKey
    // event-like update: 다음 render 에 반영되도록 setInput 호출 (effect 밖이므로 lint OK)
    setInput(readStorage(storageKey))
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return
    try {
      if (input) sessionStorage.setItem(storageKey, input)
      else sessionStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
  }, [input, storageKey])

  // 스크롤 자동 하단
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [turns.length, pendingTurn])

  const handleSubmit = () => {
    if (!input.trim() || pendingTurn) return
    const text = input.trim()
    setInput('')
    if (storageKey && typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(storageKey)
      } catch {}
    }
    onSendMessage(text)
  }

  // chip 클릭 = 입력 박스에 prefill + focus (사용자가 수정 후 전송 가능)
  const handlePickQuickReply = (reply: string) => {
    setInput(reply)
    // 다음 tick 에 focus + 커서 끝으로
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (ta) {
        ta.focus()
        ta.setSelectionRange(reply.length, reply.length)
      }
    })
  }

  const slotLabel = currentSlot
    ? (SLOT_LABELS[currentSlot as SlotKey] ?? currentSlot)
    : '(전체 검토)'

  return (
    <div className="flex h-full flex-col">
      {/* 상단 바 — 다음 슬롯 안내 (Wave 4: 모바일 padding 축소) */}
      <div className="border-b bg-muted/30 px-3 py-2 sm:px-5 sm:py-2.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-xs">
          다음 채울 슬롯
        </div>
        <div className="mt-0.5 text-sm font-medium">
          {currentSlot ? (
            <>
              <span className="text-primary">●</span> {slotLabel}
            </>
          ) : (
            <span className="text-muted-foreground">
              전체 슬롯이 채워졌어요 — 위쪽 [1차본 승인] 버튼을 눌러주세요
            </span>
          )}
        </div>
      </div>

      {/* 대화 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 sm:p-5">
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

        {/* Turn 리스트 — 카드는 마지막 AI 턴 안에 인라인 (이전 턴 카드는 disabled 표시) */}
        {(() => {
          const lastAiId = [...turns].reverse().find((t) => t.role === 'ai')?.id
          return turns.map((t) => (
            <TurnBubble
              key={t.id}
              turn={t}
              isLatestAi={t.id === lastAiId && !pendingTurn}
              onSendMessage={onSendMessage}
            />
          ))
        })()}

        {/* AI 응답 대기 */}
        {pendingTurn && !isInitializing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI 가 생각 중...
          </div>
        )}

        {/* 마지막 AI 턴의 quickReplies — 클릭하면 입력 박스에 prefill (편집 후 전송).
            단, 그 턴이 카드(externalLookupNeeded)를 가지면 quickReplies hide
            (사용자가 카드 먼저 처리하도록 — 동시 표시 방지) */}
        {(() => {
          if (pendingTurn) return null
          const lastAi = [...turns].reverse().find((t) => t.role === 'ai')
          if (!lastAi || !lastAi.quickReplies || lastAi.quickReplies.length === 0) return null
          // 카드가 있으면 quickReplies 숨김
          if (lastAi.externalLookupNeeded) return null
          return (
            <div className="space-y-1.5">
              <div className="text-[11px] text-muted-foreground">
                💡 추천 답변 — 클릭해서 편집 후 전송하거나, 아래 입력란에 직접 작성
              </div>
              <div className="flex flex-wrap gap-1.5">
                {lastAi.quickReplies.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => handlePickQuickReply(reply)}
                    className="rounded-full border border-primary/40 bg-background px-3 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors"
                    title="클릭하면 입력란에 채워져요. 그대로 또는 수정 후 Cmd/Ctrl+Enter 로 전송."
                    disabled={pendingTurn}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            </div>
          )
        })()}

        {/* 외부 카드는 이제 TurnBubble 안에 인라인으로 렌더됨 (Phase L UX fix 2026-04-29).
            pendingExternalLookup 은 ConversationState 일관성 위해 유지하지만 별도 렌더 X. */}
      </div>

      {/* 입력 박스 — 모바일 터치 친화 (Wave 4) */}
      <div className="border-t p-2 sm:p-3">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              !hasRfp
                ? 'RFP 업로드 후 챗봇이 시작됩니다'
                : pendingTurn
                  ? 'AI 응답을 기다리는 중...'
                  : '답변 작성 또는 위 옵션 클릭 (Cmd/Ctrl + Enter 로 전송)'
            }
            className="min-h-[48px] flex-1 resize-none text-sm sm:min-h-[60px]"
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
            // 모바일 터치 최소 44x44px (Apple HIG 권장)
            className="h-11 w-11 shrink-0 sm:h-10 sm:w-10"
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
// 카드가 있을 때 본문을 짧게 자르는 헬퍼
// ─────────────────────────────────────────
function truncateForCard(text: string): string {
  if (!text) return ''
  // 첫 문장 또는 최대 120자
  const firstSentence = text.split(/(?<=[.!?。!?])\s/)[0]
  if (firstSentence && firstSentence.length <= 140) return firstSentence
  return text.slice(0, 120) + (text.length > 120 ? '…' : '')
}

// ─────────────────────────────────────────
// Turn 말풍선 + (마지막 AI 턴이면) 인라인 카드
// ─────────────────────────────────────────

function TurnBubble({
  turn,
  isLatestAi,
  onSendMessage,
}: {
  turn: Turn
  isLatestAi: boolean
  onSendMessage: (text: string) => void
}) {
  const isAi = turn.role === 'ai'
  const card = turn.externalLookupNeeded
  // 카드가 있고 active 상태면 메시지 본문은 한 줄로 짧게 (사용자 시선 카드로 유도).
  // 메시지 본문이 길어도 첫 줄 또는 100자만 보여주고 카드 가리킨다.
  const isCardTurnActive = isAi && !!card && isLatestAi
  const displayText = isCardTurnActive
    ? truncateForCard(turn.text)
    : turn.text
  return (
    <div className={cn('flex flex-col gap-1.5', isAi ? 'items-start' : 'items-end')}>
      {/* 메시지 버블 */}
      <div className={cn('flex w-full', isAi ? 'justify-start' : 'justify-end')}>
        <div
          className={cn(
            'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
            isAi
              ? 'bg-muted text-foreground'
              : 'bg-primary text-primary-foreground',
          )}
        >
          <div>{displayText}</div>
          {isCardTurnActive && (
            <div className="mt-1 text-[11px] text-primary">▼ 아래 카드를 먼저 처리해 주세요</div>
          )}
          {isAi && turn.targetSlot && (
            <div className="mt-1 text-[10px] uppercase tracking-wider opacity-60">
              슬롯: {SLOT_LABELS[turn.targetSlot as SlotKey] ?? turn.targetSlot}
              {turn.aiModel && <span className="ml-2">· {turn.aiModel}</span>}
            </div>
          )}
        </div>
      </div>

      {/* 인라인 카드 (이 turn 의 externalLookupNeeded) — 메시지 바로 아래 한 묶음 */}
      {isAi && card && (
        <div
          className={cn(
            'w-full max-w-[85%] transition-opacity',
            !isLatestAi && 'opacity-50 pointer-events-none',
          )}
          title={!isLatestAi ? '이전 턴의 카드 (이미 처리됨)' : undefined}
        >
          {card.type === 'external-llm' && (
            <ExternalLlmCard
              topic={card.topic}
              generatedPrompt={card.generatedPrompt ?? ''}
              onPaste={(answer) => onSendMessage(`[외부 LLM 답]\n${answer}`)}
            />
          )}
          {card.type === 'pm-direct' && (
            <PmDirectCard
              topic={card.topic}
              checklistItems={card.checklistItems ?? []}
              onSubmit={(answer) => onSendMessage(`[PM 직접 확인]\n${answer}`)}
            />
          )}
          {card.type === 'auto-extract' && (
            <AutoExtractCard
              topic={card.topic}
              autoNote={card.autoNote ?? ''}
              onAcknowledge={() => onSendMessage('[확인]')}
            />
          )}
        </div>
      )}
    </div>
  )
}

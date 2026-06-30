'use client'

/**
 * ConceptChat — 좌 대화 pane: 컨셉을 단계별로 벼리는 대화 (ADR-031 Wave 2)
 *
 * 프로그램 기획 단계가 **컨셉부터** 열리도록, 좌측을 컨셉 도출 대화로 채운다.
 * W1 라우트(/api/projects/[id]/concept) 호출만 — 엔진/라우트 무변경:
 *   1) 마운트 → POST {action:'step', picks:[]} → 첫 질문 + 카드(angle).
 *   2) 카드 클릭 → picks 누적({stepKey,label,value}) → POST step {picks} → 다음 질문/카드.
 *      (BR-WS-17 카드 UX 동형. 이중 적용 가드: 적용된 메시지의 카드는 잠금.)
 *   3) done → POST {action:'assemble', picks} → ConceptShape → 부모로 올림(우 캔버스에 맺힘).
 *   4) 자유 입력(message)도 각 step 에 동봉 가능(더 뾰족하게 — 카드 편향).
 *   picks·concept 는 부모(ProgramWorkspace)로 lift → ConceptCanvas 가 실시간으로 읽는다.
 *
 * ⚠️ WorkspaceChat.tsx 내부 무변경 — 컨셉 단계는 이 별 컴포넌트로 격리(회귀 방지).
 * 디자인킷 260529: accent #F05519 1개 · radius 0 · NanumHuman/Poppins.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Send, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type {
  ConceptCard,
  ConceptPick,
  ConceptShape,
  ConceptStepResult,
} from '@/lib/program-design/concept-synth'

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  /** 이 assistant 메시지에 딸린 선택 카드(있으면 텍스트 아래 렌더). */
  cards?: ConceptCard[]
  /** 이 메시지의 stepKey(카드 클릭 시 pick 의 stepKey). */
  stepKey?: string
  /** 이 메시지의 카드가 이미 한 번 선택됐는지(이중 적용 가드). */
  picked?: boolean
}

interface Props {
  projectId: string
  /** 현재 누적 picks(부모 보유 — lift). 표시·전송 모두 이 값 기준. */
  picks: ConceptPick[]
  /** 카드 클릭/done 으로 picks 가 바뀔 때 부모로 보고. */
  onPicksChange: (picks: ConceptPick[]) => void
  /** assemble 결과 ConceptShape — 우 캔버스로 올림(부모 state). */
  onConcept: (concept: ConceptShape) => void
}

export function ConceptChat({ projectId, picks, onPicksChange, onConcept }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  // step 로딩(다음 질문/카드 요청 중) — 입력·카드 비활성.
  const [stepping, setStepping] = useState(false)
  // assemble 로딩(컨셉 조립 중).
  const [assembling, setAssembling] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // 이중 진입 가드(동기) — state 보다 먼저 잠금.
  const busyRef = useRef(false)
  // picks 를 콜백 안에서 안정적으로 읽기 위한 ref.
  const picksRef = useRef<ConceptPick[]>(picks)
  picksRef.current = picks
  // 마운트 시 첫 step 1회만 요청.
  const seededRef = useRef(false)

  // 새 메시지마다 하단 스크롤.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, stepping, assembling])

  /** step 결과를 메시지로 append (질문 버블 + 카드). */
  const appendStep = useCallback((step: ConceptStepResult) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `a-${step.stepKey}-${Date.now()}`,
        role: 'assistant',
        text: step.question || '다음으로 좁혀가 봅시다.',
        cards: step.cards.length > 0 ? step.cards : undefined,
        stepKey: step.stepKey,
      },
    ])
  }, [])

  /** done → assemble 요청. 성공 시 부모로 concept 올림 + 안내 메시지. */
  const requestAssemble = useCallback(
    async (allPicks: ConceptPick[], message?: string) => {
      setAssembling(true)
      try {
        const res = await fetch(`/api/projects/${projectId}/concept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'assemble',
            picks: allPicks,
            ...(message && message.trim() ? { message: message.trim() } : {}),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          concept?: ConceptShape
          error?: string
        }
        if (!res.ok || !data.concept) {
          throw new Error(data?.error ?? `HTTP ${res.status}`)
        }
        onConcept(data.concept)
        setMessages((prev) => [
          ...prev,
          {
            id: `a-assembled-${Date.now()}`,
            role: 'assistant',
            text:
              '컨셉을 오른쪽 캔버스에 맺었어요. 확인하고 괜찮으면 "컨셉 확정 → 구조 잡기"를 눌러주세요. ' +
              '더 뾰족하게 밀고 싶으면 아래에 자유롭게 적어주셔도 됩니다.',
          },
        ])
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error('컨셉 조립에 실패했습니다: ' + msg.slice(0, 160))
      } finally {
        setAssembling(false)
      }
    },
    [projectId, onConcept],
  )

  /**
   * 다음 step 요청. nextPicks 로 단계 결정(서버가 picks.length 로 step 산정).
   * done 이면 assemble 로 넘어간다(여기선 step append 안 함).
   * message(자유 입력)는 카드 편향 힌트로 동봉(선택).
   */
  const requestStep = useCallback(
    async (nextPicks: ConceptPick[], message?: string) => {
      setStepping(true)
      try {
        const res = await fetch(`/api/projects/${projectId}/concept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'step',
            picks: nextPicks,
            ...(message && message.trim() ? { message: message.trim() } : {}),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as
          | (ConceptStepResult & { error?: string })
          | { error?: string }
        if (!res.ok) {
          throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`)
        }
        const step = data as ConceptStepResult
        if (step.done) {
          // 마지막 단계까지 골랐다 → 컨셉 조립.
          await requestAssemble(nextPicks, message)
          return
        }
        appendStep(step)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error('다음 단계를 불러오지 못했습니다: ' + msg.slice(0, 160))
      } finally {
        setStepping(false)
      }
    },
    [projectId, appendStep, requestAssemble],
  )

  // 마운트 시 첫 step 1회(picks 가 비어 있을 때만 — 재진입/HMR 중복 방지).
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true
    if (picksRef.current.length === 0 && messages.length === 0) {
      void requestStep([])
    }
    // requestStep 은 mount 시 1회만 — deps 의도적으로 빈 배열.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 카드 클릭 → pick 누적 → 다음 step.
   * 이중 적용 가드: 해당 메시지가 이미 picked 면 무시 + busyRef 동기 잠금.
   */
  const handleCard = useCallback(
    (messageId: string, stepKey: string, card: ConceptCard) => {
      if (busyRef.current || stepping || assembling) return
      const target = messages.find((m) => m.id === messageId)
      if (!target || target.picked) return
      busyRef.current = true

      const pick: ConceptPick = {
        stepKey,
        label: card.label,
        value: card.value || card.label,
      }
      const nextPicks = [...picksRef.current, pick]
      // 메시지 잠금 + 선택 확인 버블.
      setMessages((prev) => [
        ...prev.map((m) => (m.id === messageId ? { ...m, picked: true } : m)),
        {
          id: `u-${Date.now()}`,
          role: 'user',
          text: `✓ ${card.label}`,
        },
      ])
      onPicksChange(nextPicks)
      void requestStep(nextPicks).finally(() => {
        busyRef.current = false
      })
    },
    [messages, stepping, assembling, onPicksChange, requestStep],
  )

  /**
   * 자유 입력 전송 → 현재 picks + message 로 step 요청(카드 편향).
   * picks 가 이미 다 찼으면(done) message 동봉해 재조립.
   */
  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || busyRef.current || stepping || assembling) return
    busyRef.current = true
    setMessages((prev) => [
      ...prev,
      { id: `u-free-${Date.now()}`, role: 'user', text },
    ])
    setInput('')
    void requestStep(picksRef.current, text).finally(() => {
      busyRef.current = false
    })
  }, [input, stepping, assembling, requestStep])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const busy = stepping || assembling

  return (
    <div className="flex h-full min-h-0 flex-col border-r bg-background">
      {/* 헤더 */}
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <Sparkles className="h-4 w-4 text-brand" aria-hidden />
        <span className="text-sm font-semibold">컨셉 잡기</span>
        <span className="ml-auto truncate text-xs text-muted-foreground">
          각도 → 차별점 → 메시지
        </span>
      </div>

      {/* 메시지 리스트 — 내부 스크롤 */}
      <div ref={scrollRef} className="flex-1 min-h-0 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'flex gap-2',
              m.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            {m.role === 'assistant' && (
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center bg-brand/10"
                aria-hidden
              >
                <Sparkles className="h-3.5 w-3.5 text-brand" />
              </span>
            )}
            <div className="flex max-w-[80%] flex-col gap-2">
              <div
                className={cn(
                  'whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground',
                )}
              >
                {m.text}
              </div>

              {/* 선택 카드 — 클릭 시 pick 누적 → 다음 step. */}
              {m.role === 'assistant' && m.cards && m.cards.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {m.cards.map((c, i) => (
                    <button
                      key={`${m.id}-c${i}`}
                      type="button"
                      onClick={() => handleCard(m.id, m.stepKey ?? '', c)}
                      disabled={m.picked || busy}
                      className={cn(
                        'flex flex-col items-start gap-0.5 border border-brand/40 bg-background px-3 py-2 text-left text-sm transition-colors',
                        m.picked || busy
                          ? 'cursor-not-allowed opacity-50'
                          : 'hover:border-brand hover:bg-brand/5',
                      )}
                    >
                      <span className="font-medium text-foreground">{c.label}</span>
                      {c.sub && (
                        <span className="text-xs text-muted-foreground">{c.sub}</span>
                      )}
                    </button>
                  ))}
                  {m.picked && (
                    <span className="text-xs text-muted-foreground">선택 완료</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {assembling ? '컨셉 맺는 중…' : '다음 단계 만드는 중…'}
          </div>
        )}
      </div>

      {/* 입력 — 자유 입력으로 더 뾰족하게 */}
      <div className="shrink-0 border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="더 뾰족하게 밀고 싶은 방향을 적어주세요 (Enter 전송 · Shift+Enter 줄바꿈)"
            rows={2}
            className="min-h-0 flex-1 resize-none text-sm"
            disabled={busy}
          />
          <Button
            type="button"
            onClick={handleSend}
            disabled={busy || !input.trim()}
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="전송"
          >
            {busy ? (
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

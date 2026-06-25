'use client'

/**
 * WorkspaceChat — 좌 대화 pane (BR-WS-5)
 *
 * 브레인 주도 채팅. 단계가 바뀌어도 **하나로 이어진다**(메시지 리스트는 stage 와
 * 독립). 전송 → `/api/projects/[id]/assistant` POST {message, stage, contextSummary}
 * → reply 추가.
 *
 * ⚠️ 이번 범위(BR-WS-5) = **대화 응답까지**. 브레인 응답이 우 캔버스를 직접 바꾸는
 * 연결은 BR-WS-6. assistant 응답의 action 자리는 비어 있음(`null`) — 후속 호환.
 *
 * ⚠️ 메시지는 **client state** 다. 이번엔 영속 X — 새로고침하면 리셋된다(서버 저장은
 * 다음 브리프 범위). 스키마 변경 0.
 *
 * 디자인킷 260529: accent #F05519 1개(브레인 아이콘·전송), radius 0, NanumHuman/Poppins.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Send, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { PlanSession } from '@/lib/program-design/plan-types'
import type { SessionOp } from '@/lib/program-design/session-ops'
import {
  WORKSPACE_STAGE_LABELS,
  type WorkspaceStageId,
} from './workspace-stages'

/** BR-WS-17: assistant 카드 선택지 1개 — 클릭 시 ops 를 캔버스에 즉시 적용. */
interface ChatChoice {
  label: string
  sub?: string
  ops: SessionOp[]
}

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  /** BR-WS-17: design 단계 카드 선택지(있으면 텍스트 아래 카드 렌더). */
  choices?: ChatChoice[]
  /** BR-WS-17: 이 메시지의 카드가 이미 한 번 적용됐는지(중복 적용 가드). */
  choicePicked?: boolean
}

interface Props {
  projectId: string
  /** 현재 단계 — 응답을 단계 인지로 만들기 위해 전송에 포함. */
  stage: WorkspaceStageId
  /** 현재 단계 1줄 요약(서버 판정) — 대화 맥락으로 전달. */
  contextSummary?: string
  /**
   * BR-WS-6: design 단계 현재 회차 목록(no·title·kind 만 전송 — 매칭 근거). 없으면 null.
   * design 외 단계에서는 전달 X(전송 body 에서 생략).
   */
  sessions?: PlanSession[] | null
  /**
   * BR-WS-6: assistant 가 design 단계에서 ops 를 반환하면 호출(상위가 캔버스에 적용).
   * design 단계에서만 주입됨.
   */
  onOps?: (ops: SessionOp[]) => void
}

/**
 * 단계 인지 첫 인사(BR-WS-9 / SI-greeting). 대화는 단계를 넘어 하나로 이어지므로
 * 마운트 시 1회만 시드한다(stage 가 바뀌어도 재발급 X — history 유지).
 *
 * - `design`(프로그램 기획): 대화로 회차를 바꿀 수 있음을 명시(BR-WS-6 실제 동작 반영).
 * - 그 외 단계: 안내·해석 중심. 옛 "캔버스 직접 변경은 곧 추가됩니다" 거짓 문구 제거.
 */
function welcomeFor(stage: WorkspaceStageId): ChatMessage {
  const text =
    stage === 'design'
      ? '안녕하세요. 언더독스 기획 보조입니다. 이 단계에선 ‘회차를 추가·변경·재배치해줘’처럼 ' +
        '말하면 오른쪽 커리큘럼이 바로 바뀝니다. 예: ‘마지막에 성과 발표회 추가해줘’.'
      : '안녕하세요. 언더독스 기획 보조입니다. 현재 단계의 산출물을 같이 디벨롭해 봅시다. ' +
        '궁금한 점이나 방향을 적어 주세요. (이 단계는 안내·해석 중심이에요.)'
  return { id: 'welcome', role: 'assistant', text }
}

export function WorkspaceChat({
  projectId,
  stage,
  contextSummary,
  sessions,
  onOps,
}: Props) {
  // 마운트 시점 stage 로 1회 시드(lazy init). 이후 stage 변경 시 인사 재발급 안 함 — history 유지.
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeFor(stage)])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // 이중 전송 가드(BR-WS-7): `sending` state 는 비동기 갱신이라 같은 tick 에 Enter+클릭이
  // 겹치면 둘 다 false 를 본다. ref 는 동기 — 전송 시작 즉시 잠그고 finally 에서 푼다.
  const sendingRef = useRef(false)
  // BR-WS-17: history 스냅샷용 — handleSend 콜백을 안정적으로 유지(messages 를 deps 에서 제외).
  const messagesRef = useRef<ChatMessage[]>(messages)
  messagesRef.current = messages

  // 새 메시지마다 하단으로 스크롤(pane 내부 스크롤).
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    // 빈/공백 금지 + 동기 ref 로 이중 진입 차단(state 의 sending 보다 먼저 잠금).
    if (!text || sendingRef.current) return
    sendingRef.current = true

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
    }
    // BR-WS-17: 직전 history(welcome 제외·최근 8턴)를 본문 전에 스냅샷 — 맥락 유지.
    const history = messagesRef.current
      .filter((m) => m.id !== 'welcome')
      .slice(-8)
      .map((m) => ({ role: m.role, text: m.text }))
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSending(true)

    try {
      const res = await fetch(`/api/projects/${projectId}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          stage,
          contextSummary: contextSummary ?? '',
          // BR-WS-17: 직전 대화 맥락(모든 단계 동봉 무방 — design 만 활용).
          history,
          // BR-WS-6: design 단계만 현재 회차 목록(no·title·kind) 동봉 — 매칭 근거.
          ...(stage === 'design' && sessions
            ? {
                sessions: sessions.map((s) => ({
                  no: s.no,
                  title: s.title,
                  kind: s.kind,
                })),
              }
            : {}),
        }),
      })

      if (!res.ok) {
        // HTML(세션 만료) 등은 json 파싱 실패 → 일반 에러로
        let msg = '응답을 받지 못했습니다.'
        try {
          const err = (await res.json()) as { error?: string }
          if (err?.error) msg = err.error
        } catch {
          /* non-json */
        }
        throw new Error(msg)
      }

      const data = (await res.json()) as {
        reply?: string
        action?: unknown
        ops?: SessionOp[] | null
        choices?: ChatChoice[] | null
      }
      const reply = (data.reply ?? '').trim()

      // BR-WS-6: design 단계 응답에 ops 가 있으면 상위로 전달(캔버스 적용) + 보조줄 표시.
      const ops = Array.isArray(data.ops) ? data.ops : null
      const appliedCount = ops?.length ?? 0
      if (onOps && appliedCount > 0) {
        onOps(ops!)
      }
      const applyNote =
        appliedCount > 0 ? `\n\n✓ ${appliedCount}개 변경을 캔버스에 적용했어요.` : ''

      // BR-WS-17: choices 가 있으면 카드로(클릭 시 그 ops 를 즉시 적용 — 서버 재호출 X).
      // 카드는 onOps 가 있을 때(=design 단계)만 의미 있음. label·ops 형태만 통과.
      const choices: ChatChoice[] | undefined =
        onOps && Array.isArray(data.choices)
          ? data.choices.filter(
              (c): c is ChatChoice =>
                !!c &&
                typeof c.label === 'string' &&
                Array.isArray(c.ops) &&
                c.ops.length > 0,
            )
          : undefined

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: (reply || '(응답이 비어 있습니다.)') + applyNote,
          choices: choices && choices.length > 0 ? choices : undefined,
        },
      ])
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : '대화 응답 중 오류가 발생했습니다.'
      toast.error(msg)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [input, projectId, stage, contextSummary, sessions, onOps])

  /**
   * BR-WS-17: 카드 클릭 → 그 카드의 ops 를 캔버스에 즉시 적용(서버 재호출 X).
   * 중복 적용 가드: 해당 메시지의 choicePicked 가 이미 true 면 무시. 적용 후
   * 그 메시지를 picked 로 잠그고(다른 카드 비활성) 확인 메시지를 append.
   */
  const handleChoice = useCallback(
    (messageId: string, choice: ChatChoice) => {
      if (!onOps) return
      const target = messagesRef.current.find((m) => m.id === messageId)
      if (!target || target.choicePicked) return // 이미 선택됨 — 중복 적용 차단.
      if (!choice.ops.length) return

      onOps(choice.ops)
      setMessages((prev) => [
        ...prev.map((m) =>
          m.id === messageId ? { ...m, choicePicked: true } : m,
        ),
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: `✓ ‘${choice.label}’ 적용 — ${choice.ops.length}개 변경을 캔버스에 반영했어요.`,
        },
      ])
    },
    [onOps],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter 전송 / Shift+Enter 줄바꿈
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="flex h-full min-h-0 flex-col border-r bg-background">
      {/* 헤더 */}
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <Sparkles className="h-4 w-4 text-brand" aria-hidden />
        <span className="text-sm font-semibold">기획 대화</span>
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {WORKSPACE_STAGE_LABELS[stage]}
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

              {/* BR-WS-17: 카드 선택지 — 클릭 시 그 ops 를 캔버스에 즉시 적용(서버 재호출 X). */}
              {m.role === 'assistant' && m.choices && m.choices.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {m.choices.map((c, i) => (
                    <button
                      key={`${m.id}-c${i}`}
                      type="button"
                      onClick={() => handleChoice(m.id, c)}
                      disabled={m.choicePicked}
                      className={cn(
                        'flex flex-col items-start gap-0.5 border border-brand/40 bg-background px-3 py-2 text-left text-sm transition-colors',
                        m.choicePicked
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
                  {m.choicePicked && (
                    <span className="text-xs text-muted-foreground">선택 완료</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            응답 생성 중…
          </div>
        )}
      </div>

      {/* 입력 */}
      <div className="shrink-0 border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="이 단계 기획을 어떻게 디벨롭할까요? (Enter 전송 · Shift+Enter 줄바꿈)"
            rows={2}
            className="min-h-0 flex-1 resize-none text-sm"
            disabled={sending}
          />
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !input.trim()}
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="전송"
          >
            {sending ? (
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

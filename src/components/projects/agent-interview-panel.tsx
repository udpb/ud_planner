'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, MessageSquare, Send, ChevronDown, ChevronUp,
  CheckCircle2, SkipForward, Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Message {
  id: string
  role: 'agent' | 'user'
  content: string
  timestamp: string
}

interface Props {
  projectId: string
  rfpText: string
  /** 인터뷰 완료 시 호출 — strategicNotes를 프로젝트에 저장 */
  onComplete?: () => void
}

export function AgentInterviewPanel({ projectId, rfpText, onComplete }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [state, setState] = useState<any>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => { scrollToBottom() }, [messages])

  // 기존 세션 확인
  const checkExistingSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/sessions?projectId=${projectId}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.sessions?.length > 0) {
        const latest = data.sessions[0]
        setSessionId(latest.id)
        if (latest.status === 'COMPLETED') {
          setIsComplete(true)
        }
      }
    } catch {
      // ignore
    }
  }, [projectId])

  useEffect(() => { checkExistingSession() }, [checkExistingSession])

  // 세션 시작
  const startInterview = async () => {
    setLoading(true)
    setExpanded(true)
    try {
      const res = await fetch('/api/agent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'bid',
          rfpText,
          meta: { source: 'pipeline', sourceDetail: projectId },
        }),
      })
      if (!res.ok) throw new Error('인터뷰 시작 실패')
      const data = await res.json()

      setState(data.state)
      setSessionId(data.sessionId)
      if (data.agentMessage) {
        setMessages([{
          id: data.agentMessage.id,
          role: 'agent',
          content: data.agentMessage.content,
          timestamp: data.agentMessage.timestamp,
        }])
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  // 세션 resume
  const resumeSession = async () => {
    if (!sessionId) return
    setLoading(true)
    setExpanded(true)
    try {
      const res = await fetch(`/api/agent/sessions?id=${sessionId}`)
      if (!res.ok) throw new Error('세션 로드 실패')
      const data = await res.json()

      setState(data.state)
      setMessages(
        (data.state.history ?? []).map((m: any) => ({
          id: m.id,
          role: m.role === 'user' ? 'user' : 'agent',
          content: m.content,
          timestamp: m.timestamp,
        }))
      )
      if (data.state.status === 'completed') {
        setIsComplete(true)
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  // 답변 전송
  const sendMessage = async () => {
    if (!input.trim() || !state) return
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/agent/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, userMessage: userMsg.content }),
      })
      if (!res.ok) throw new Error('응답 실패')
      const data = await res.json()

      setState(data.state)
      if (data.agentMessage) {
        setMessages((prev) => [...prev, {
          id: data.agentMessage.id,
          role: 'agent',
          content: data.agentMessage.content,
          timestamp: data.agentMessage.timestamp,
        }])
      }

      if (data.isComplete) {
        setIsComplete(true)
        // strategicContext를 프로젝트 strategicNotes에 자동 저장
        await saveStrategyToProject(data.state?.intent ?? data.finalIntent)
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  // 질문 건너뛰기
  const skipQuestion = async () => {
    if (!state) return
    setLoading(true)
    try {
      const res = await fetch('/api/agent/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, skipCurrentQuestion: true }),
      })
      if (!res.ok) throw new Error('건너뛰기 실패')
      const data = await res.json()
      setState(data.state)
      if (data.agentMessage) {
        setMessages((prev) => [...prev, {
          id: data.agentMessage.id,
          role: 'agent',
          content: data.agentMessage.content,
          timestamp: data.agentMessage.timestamp,
        }])
      }
      if (data.isComplete) {
        setIsComplete(true)
        await saveStrategyToProject(data.state?.intent ?? data.finalIntent)
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  // strategicContext → project.strategicNotes 저장
  const saveStrategyToProject = async (intent: any) => {
    if (!intent?.strategicContext) return
    const sc = intent.strategicContext
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategicNotes: {
            clientHiddenWants: sc.clientHiddenWants || undefined,
            mustNotFail: sc.mustNotFail || undefined,
            competitorWeakness: sc.competitorWeakness || undefined,
            riskFactors: sc.riskFactors || undefined,
            pastSimilarProjects: sc.pastSimilarProjects || undefined,
            participationDecision: sc.participationDecision || undefined,
          },
        }),
      })
      toast.success('전략 인터뷰 완료 — 수주 전략이 프로젝트에 자동 저장되었습니다')
      onComplete?.()
    } catch {
      toast.error('전략 저장 실패 — 수주 전략 메모에서 직접 입력해주세요')
    }
  }

  const turnCount = messages.filter((m) => m.role === 'user').length
  const completeness = state?.intent?.metadata?.completeness ?? 0

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/20">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-3 text-left hover:bg-violet-50/40 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-violet-700" />
          <span className="text-sm font-semibold text-violet-900">수주 전략 인터뷰</span>
          {isComplete ? (
            <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">
              <CheckCircle2 className="h-3 w-3 mr-0.5" /> 완료
            </Badge>
          ) : sessionId ? (
            <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700">
              {turnCount}턴 · {completeness}%
            </Badge>
          ) : null}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-violet-600" /> : <ChevronDown className="h-4 w-4 text-violet-600" />}
      </button>

      {expanded && (
        <div className="border-t border-violet-200 p-3">
          {/* 시작/재개 버튼 */}
          {!state && !isComplete && (
            <div className="text-center py-4 space-y-2">
              <p className="text-xs text-violet-700">
                AI가 5~10개 질문으로 수주 전략을 파악합니다. 결과는 제안서 생성에 자동 반영됩니다.
              </p>
              <div className="flex justify-center gap-2">
                {sessionId ? (
                  <Button size="sm" className="gap-1.5" onClick={resumeSession} disabled={loading}>
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                    이어서 진행
                  </Button>
                ) : (
                  <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={startInterview} disabled={loading || !rfpText}>
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                    전략 인터뷰 시작
                  </Button>
                )}
              </div>
              {!rfpText && (
                <p className="text-[10px] text-amber-600">RFP 분석을 먼저 완료하세요</p>
              )}
            </div>
          )}

          {/* 완료 상태 */}
          {isComplete && !state && (
            <div className="text-center py-3 space-y-1">
              <p className="text-xs text-green-700">전략 인터뷰가 완료되어 제안서에 자동 반영됩니다.</p>
              <Button size="sm" variant="ghost" className="text-[10px]" onClick={resumeSession}>
                대화 내용 보기
              </Button>
            </div>
          )}

          {/* 채팅 영역 */}
          {state && (
            <>
              <div className="max-h-80 overflow-y-auto space-y-2 mb-2">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'rounded-lg px-3 py-2 text-xs leading-relaxed',
                      msg.role === 'agent'
                        ? 'bg-violet-50 text-violet-900 mr-8'
                        : 'bg-primary/10 text-foreground ml-8',
                    )}
                  >
                    {msg.content}
                  </div>
                ))}
                {loading && (
                  <div className="bg-violet-50 rounded-lg px-3 py-2 text-xs text-violet-600 mr-8 flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> 분석 중...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 입력 */}
              {!isComplete && (
                <div className="flex gap-1.5">
                  <Textarea
                    placeholder="답변을 입력하세요..."
                    className="h-16 text-xs flex-1"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
                    }}
                  />
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      className="h-8 px-2"
                      disabled={loading || !input.trim()}
                      onClick={sendMessage}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[9px] text-muted-foreground"
                      disabled={loading}
                      onClick={skipQuestion}
                    >
                      <SkipForward className="h-3 w-3" /> 건너뛰기
                    </Button>
                  </div>
                </div>
              )}

              {isComplete && (
                <p className="text-center text-xs text-green-700 py-1">
                  인터뷰 완료 — 수주 전략이 프로젝트에 저장되었습니다
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

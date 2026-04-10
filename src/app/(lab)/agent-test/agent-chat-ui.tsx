'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Send, Loader2, RotateCcw, Download, SkipForward, FileText, MessageSquare, Users, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────
// 타입 (서버 응답 shape)
// ─────────────────────────────────────────

type Message = {
  id: string
  role: 'agent' | 'user' | 'system'
  content: string
  timestamp: string
}

// AgentState는 서버 shape을 그대로 보관. stateless API를 위해 통째로 서버로 다시 전송.
// intent 안의 bidContext/leadContext/renewalContext 등 모든 필드를 투명하게 유지해야 함.
type AgentState = {
  sessionId: string
  projectId?: string
  status: string
  history: Message[]
  intent: {
    channel: { type: 'bid' | 'lead' | 'renewal'; source: string }
    strategicContext: Record<string, any>
    metadata: {
      completeness: number
      confidence: 'low' | 'medium' | 'high'
      turnsCompleted: number
      unfilledSlots: string[]
    }
    derivedStrategy: any | null
    // 채널별 컨텍스트 (서버에서 세팅된 그대로 유지)
    bidContext?: any
    leadContext?: any
    renewalContext?: any
  }
  currentQuestion: any | null
  askedQuestionIds: string[]
  followupCountByQuestion: Record<string, number>
  createdAt: string
  updatedAt: string
}

type ChannelType = 'bid' | 'lead' | 'renewal'

// ─────────────────────────────────────────
// 채널별 시작 데이터 폼
// ─────────────────────────────────────────

function StartForm({
  onStart,
  loading,
}: {
  onStart: (channel: ChannelType, data: any) => void
  loading: boolean
}) {
  const [channel, setChannel] = useState<ChannelType>('bid')
  const [rfpText, setRfpText] = useState('')
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [pdfFilename, setPdfFilename] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handlePdfUpload(file: File) {
    setPdfUploading(true)
    setPdfError('')
    try {
      // 서버 사이드 추출 (/api/agent/extract-pdf)
      // - 검증: pdfjs-dist legacy + DOMMatrix polyfill로 4개 실제 RFP PDF 100% 성공
      // - 큰 PDF(60+ 페이지)도 서버에서 처리하는 게 안정적
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/agent/extract-pdf', {
        method: 'POST',
        body: formData,
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? 'PDF 추출 실패')
      setRfpText(result.text)
      setPdfFilename(`${result.filename} (${result.numPages}p, ${result.length}자)`)
    } catch (e: any) {
      setPdfError(e.message ?? 'PDF 추출 실패')
    } finally {
      setPdfUploading(false)
    }
  }
  const [leadJson, setLeadJson] = useState(JSON.stringify({
    clientName: '경주화백컨벤션센터',
    clientType: '기관',
    country: '한국',
    contact: {
      name: '박경',
      email: 'zxcvbnm6913@hico.or.kr',
      phone: '054-702-1084',
      department: '경주화백컨벤션센터 전시사업팀',
      position: '주임',
    },
    awarenessChannel: '아웃바운드_검색',
    awarenessDetail: '넥스트로컬 운영사로 인지하여 서치 후 전화',
    objectives: '서울시 청년들을 위한 로컬 크리에이터 발굴 프로젝트의 행사 취지에 맞춰 로컬브랜드 참가업체 부스 참여 제안',
    desiredHeadcount: null,
    projectPeriodText: '2026.7.2(목) ~ 7.4(토) / 3일간, 경주화백컨벤션센터(HICO)',
    budgetExcludingVat: 1500000,
    paymentTerms: '',
    expectedTasks: '로컬브랜드페어 2026 참여, 부스 운영, Local Drink & food / Object / Contents & Culture / Activity & Architecture / Life style 분야 전시',
  }, null, 2))
  const [renewalJson, setRenewalJson] = useState(JSON.stringify({
    previousProjectName: '청년 창업 아카데미 2025',
    previousProjectYear: 2025,
    previousBudget: 250000000,
    previousClient: '서울시 청년청',
    isSameClient: true,
    previousResults: {
      applicantCount: 200,
      enrolledCount: 100,
      completedCount: 88,
      completionRate: 88,
      satisfactionAvg: 4.2,
      startupConversionCount: 8,
    },
    lessonsLearned: {
      whatWorked: ['Action Week 운영 방식', '코치 1:1 매칭 시스템'],
      whatDidntWork: ['중도 이탈자 대응 부족 (3주차 집중)', '모집 홍보 채널 제한적'],
      improvementsThisYear: ['3주차 1:1 점검 미팅 신설', '모집 채널 SNS 광고 추가'],
    },
    clientChangeRequests: ['교육 기간 6주 → 8주로 연장', '글로벌 진출 모듈 추가'],
  }, null, 2))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (channel === 'bid') {
      if (rfpText.trim().length < 100) {
        alert('RFP 텍스트는 최소 100자 이상이어야 합니다')
        return
      }
      onStart('bid', { rfpText })
    } else if (channel === 'lead') {
      try {
        const leadData = JSON.parse(leadJson)
        onStart('lead', { leadData })
      } catch (err) {
        alert('JSON 파싱 오류: ' + (err as Error).message)
      }
    } else {
      try {
        const renewalData = JSON.parse(renewalJson)
        onStart('renewal', { renewalData })
      } catch (err) {
        alert('JSON 파싱 오류: ' + (err as Error).message)
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Planning Agent 격리 테스트</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            채널을 선택하고 데이터를 입력한 뒤 시작하세요. Agent가 인터뷰를 시작합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 채널 선택 */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 block">
              사업 채널
            </label>
            <div className="flex gap-2">
              {[
                { value: 'bid', label: '나라장터 입찰', icon: FileText },
                { value: 'lead', label: 'B2B 영업 리드', icon: Users },
                { value: 'renewal', label: '연속 사업', icon: RotateCcw },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setChannel(value as ChannelType)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 rounded-md border-2 px-4 py-3 text-sm transition-colors',
                    channel === value
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-muted hover:border-primary/50',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 채널별 입력 */}
          {channel === 'bid' && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 block">
                RFP 텍스트 (최소 100자)
              </label>

              {/* PDF 업로드 */}
              <div className="mb-2 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handlePdfUpload(file)
                    if (e.target) e.target.value = ''
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={pdfUploading || loading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {pdfUploading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> PDF 추출 중...
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" /> PDF 업로드
                    </>
                  )}
                </Button>
                {pdfFilename && !pdfUploading && (
                  <span className="text-[10px] text-muted-foreground truncate">
                    📄 {pdfFilename}
                  </span>
                )}
              </div>
              {pdfError && (
                <p className="mb-2 text-[10px] text-destructive">{pdfError}</p>
              )}

              <Textarea
                placeholder="RFP 전문을 붙여넣거나 PDF를 업로드하세요..."
                value={rfpText}
                onChange={(e) => setRfpText(e.target.value)}
                className="h-64 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                현재 길이: {rfpText.length}자
              </p>
            </div>
          )}

          {channel === 'lead' && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 block">
                영업 리드 데이터 (JSON)
              </label>
              <Textarea
                value={leadJson}
                onChange={(e) => setLeadJson(e.target.value)}
                className="h-80 text-[10px] font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                예시: 경주화백컨벤션센터 로컬브랜드페어 2026 (수정 가능)
              </p>
            </div>
          )}

          {channel === 'renewal' && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 block">
                연속 사업 데이터 (JSON)
              </label>
              <Textarea
                value={renewalJson}
                onChange={(e) => setRenewalJson(e.target.value)}
                className="h-80 text-[10px] font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                예시: 청년 창업 아카데미 2025의 2026년 버전 (수정 가능)
              </p>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full gap-2">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> 시작 중...</> : <><Send className="h-4 w-4" /> Agent 시작</>}
          </Button>
        </CardContent>
      </Card>
    </form>
  )
}

// ─────────────────────────────────────────
// 메인 채팅 UI
// ─────────────────────────────────────────

export function AgentChatUI() {
  const [state, setState] = useState<AgentState | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [finalIntent, setFinalIntent] = useState<any>(null)
  const [error, setError] = useState('')
  const [proposalLoading, setProposalLoading] = useState(false)
  const [proposalError, setProposalError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleStart(channel: ChannelType, data: any) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/agent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, ...data }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      setState(result.state)
      setMessages(result.state.history)
      setIsComplete(result.isComplete)
      if (result.finalIntent) setFinalIntent(result.finalIntent)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSend(skip = false) {
    if (!state) return
    if (!skip && !input.trim()) return

    setLoading(true)
    setError('')
    try {
      // Stateless API: state 전체를 body에 포함해서 전송
      // (Next.js dev Fast Refresh로 인한 in-memory Map 리셋 문제 회피)
      const res = await fetch('/api/agent/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state,
          userMessage: skip ? undefined : input,
          skipCurrentQuestion: skip || undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      setState(result.state)
      setMessages(result.state.history)
      setIsComplete(result.isComplete)
      if (result.finalIntent) setFinalIntent(result.finalIntent)
      setInput('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setState(null)
    setMessages([])
    setInput('')
    setIsComplete(false)
    setFinalIntent(null)
    setError('')
  }

  function handleDownloadIntent() {
    if (!finalIntent) return
    const blob = new Blob([JSON.stringify(finalIntent, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `planning-intent-${state?.sessionId.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleGenerateProposal() {
    if (!finalIntent && !state?.intent) return
    setProposalLoading(true)
    setProposalError('')
    try {
      const res = await fetch('/api/agent/generate-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: finalIntent ?? state?.intent }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      // 마크다운으로 조합 후 다운로드
      let md = `# ${state?.intent.bidContext?.rfpFacts?.projectName ?? '제안서'} — 초안\n\n`
      md += `> Planning Agent에 의해 자동 생성된 초안입니다. 검토 및 수정이 필요합니다.\n\n---\n\n`
      for (const section of result.sections) {
        md += `## ${section.no}. ${section.title}\n\n${section.content}\n\n---\n\n`
      }
      md += `\n총 ${result.totalLength.toLocaleString()}자\n`

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `proposal-draft-${state?.sessionId.slice(0, 8)}.md`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setProposalError(e.message)
    } finally {
      setProposalLoading(false)
    }
  }

  // 시작 전: 폼 표시
  if (!state) {
    return <StartForm onStart={handleStart} loading={loading} />
  }

  // 시작 후: 채팅 UI + 사이드 패널
  const completeness = state.intent.metadata.completeness
  const turns = state.intent.metadata.turnsCompleted
  const unfilledCount = state.intent.metadata.unfilledSlots.length
  const channelLabel = {
    bid: '나라장터 입찰',
    lead: 'B2B 영업 리드',
    renewal: '연속 사업',
  }[state.intent.channel.type]

  return (
    <div className="flex h-full">
      {/* 채팅 영역 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 헤더 */}
        <div className="border-b px-6 py-3 flex items-center gap-3 bg-background">
          <MessageSquare className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-semibold">Planning Agent</div>
            <div className="text-[11px] text-muted-foreground">
              {channelLabel} · 세션 {state.sessionId.slice(0, 8)} · 턴 {turns}
            </div>
          </div>
          <Badge variant={isComplete ? 'default' : 'outline'} className="text-xs">
            {state.status}
          </Badge>
          <Button size="sm" variant="ghost" onClick={handleReset} className="gap-1">
            <RotateCcw className="h-3.5 w-3.5" /> 새로 시작
          </Button>
        </div>

        {/* 메시지 리스트 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-muted/20">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              <div
                className={cn(
                  'max-w-[80%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border',
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-card border rounded-lg px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 입력 영역 */}
        {!isComplete && (
          <div className="border-t px-6 py-4 bg-background">
            {error && (
              <p className="mb-2 text-xs text-destructive">{error}</p>
            )}
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="자유롭게 답변하세요. '잘 모르겠음'도 OK."
                className="flex-1 min-h-[80px] text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => handleSend(false)}
                  disabled={loading || !input.trim()}
                  className="gap-1"
                >
                  <Send className="h-3.5 w-3.5" /> 전송
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleSend(true)}
                  disabled={loading}
                  className="gap-1 text-xs"
                  size="sm"
                >
                  <SkipForward className="h-3 w-3" /> 건너뛰기
                </Button>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              ⌘+Enter (또는 Ctrl+Enter)로 전송
            </p>
          </div>
        )}

        {isComplete && (
          <div className="border-t px-6 py-4 bg-green-50 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-green-800">
                ✅ 인터뷰 완료!
              </p>
              <div className="flex gap-2">
                <Button onClick={handleDownloadIntent} variant="outline" size="sm" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Intent JSON
                </Button>
                <Button onClick={handleGenerateProposal} disabled={proposalLoading} className="gap-1.5">
                  {proposalLoading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 제안서 생성 중...</>
                  ) : (
                    <><FileText className="h-3.5 w-3.5" /> 제안서 초안 생성</>
                  )}
                </Button>
              </div>
            </div>
            {proposalError && (
              <p className="text-xs text-destructive">{proposalError}</p>
            )}
          </div>
        )}
      </div>

      {/* 사이드 패널 — 진행 상태 */}
      <div className="w-80 border-l p-4 overflow-y-auto bg-background space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            📊 진행 상태
          </h3>
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">완전성</span>
                <span className="font-bold">{completeness}/100</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    completeness >= 80 ? 'bg-green-500' :
                      completeness >= 50 ? 'bg-amber-400' : 'bg-red-400',
                  )}
                  style={{ width: `${completeness}%` }}
                />
              </div>
              <div className="flex justify-between text-xs pt-1">
                <span className="text-muted-foreground">신뢰도</span>
                <Badge variant="outline" className="text-[10px]">
                  {state.intent.metadata.confidence}
                </Badge>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">진행 턴</span>
                <span>{turns}회</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">남은 슬롯</span>
                <span>{unfilledCount}개</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            ✏️ 채워진 슬롯
          </h3>
          <div className="space-y-1.5">
            {Object.entries(state.intent.strategicContext).map(([slot, value]) => {
              const isFilled = Array.isArray(value) ? value.length > 0 : !!value
              const display = Array.isArray(value) ? value.join(', ') : value
              return (
                <div
                  key={slot}
                  className={cn(
                    'rounded-md border p-2 text-xs',
                    isFilled ? 'border-green-200 bg-green-50/50' : 'border-muted bg-muted/30',
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-[10px] uppercase tracking-wide text-muted-foreground">
                      {slot}
                    </span>
                    {isFilled && <span className="text-green-600 text-xs">✓</span>}
                  </div>
                  {isFilled && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{display}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {finalIntent?.derivedStrategy && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              🎯 도출된 전략
            </h3>

            {/* 포지셔닝 */}
            {finalIntent.derivedStrategy.positioning && (
              <Card>
                <CardContent className="p-3 text-xs space-y-1">
                  <p className="font-medium text-[10px] uppercase text-muted-foreground">포지셔닝</p>
                  <p className="text-[11px] font-semibold">{finalIntent.derivedStrategy.positioning.oneLiner}</p>
                  {finalIntent.derivedStrategy.positioning.whyUnderdogs && (
                    <p className="text-[11px] text-muted-foreground mt-1">{finalIntent.derivedStrategy.positioning.whyUnderdogs}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 키 메시지 */}
            {finalIntent.derivedStrategy.keyMessages?.length > 0 && (
              <Card>
                <CardContent className="p-3 text-xs space-y-1">
                  <p className="font-medium text-[10px] uppercase text-muted-foreground">Key Messages</p>
                  <ul className="space-y-1">
                    {finalIntent.derivedStrategy.keyMessages.map((m: string, i: number) => (
                      <li key={i} className="text-[11px]">· {m}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* RFP 심층 분석 */}
            {finalIntent.derivedStrategy.rfpAnalysis && (
              <Card>
                <CardContent className="p-3 text-xs space-y-2">
                  <p className="font-medium text-[10px] uppercase text-muted-foreground">RFP 심층 분석</p>
                  {finalIntent.derivedStrategy.rfpAnalysis.clientIntentInference && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">발주기관 의도</p>
                      <p className="text-[11px]">{finalIntent.derivedStrategy.rfpAnalysis.clientIntentInference}</p>
                    </div>
                  )}
                  {finalIntent.derivedStrategy.rfpAnalysis.hiddenRequirements?.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">숨은 요구</p>
                      <ul className="space-y-0.5">
                        {finalIntent.derivedStrategy.rfpAnalysis.hiddenRequirements.map((r: string, i: number) => (
                          <li key={i} className="text-[11px]">· {r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {finalIntent.derivedStrategy.rfpAnalysis.evalCriteriaStrategy && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">배점 공략</p>
                      {typeof finalIntent.derivedStrategy.rfpAnalysis.evalCriteriaStrategy === 'string' ? (
                        <p className="text-[11px]">{finalIntent.derivedStrategy.rfpAnalysis.evalCriteriaStrategy}</p>
                      ) : (
                        finalIntent.derivedStrategy.rfpAnalysis.evalCriteriaStrategy.map((e: any, i: number) => (
                          <div key={i} className="rounded border p-1.5 mt-1 bg-muted/30">
                            <p className="text-[11px] font-medium">{e.item} {e.score ? `(${e.score}점)` : ''} → {e.pageAllocation}</p>
                            <p className="text-[10px] text-muted-foreground">{e.emphasis}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 커리큘럼 방향 */}
            {finalIntent.derivedStrategy.curriculumDirection && (
              <Card>
                <CardContent className="p-3 text-xs space-y-1">
                  <p className="font-medium text-[10px] uppercase text-muted-foreground">커리큘럼 방향</p>
                  <p className="text-[11px]">{finalIntent.derivedStrategy.curriculumDirection.designPrinciple}</p>
                  {finalIntent.derivedStrategy.curriculumDirection.weeklyOutline?.map((w: any, i: number) => (
                    <div key={i} className="text-[11px] flex gap-1">
                      <span className="font-medium text-primary shrink-0">[{w.week}]</span>
                      <span>{w.focus} — {w.keyActivity}</span>
                    </div>
                  ))}
                  {finalIntent.derivedStrategy.curriculumDirection.formatMix && (
                    <p className="text-[10px] text-muted-foreground mt-1">{finalIntent.derivedStrategy.curriculumDirection.formatMix}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 예산 가이드 */}
            {finalIntent.derivedStrategy.budgetGuideline && (
              <Card>
                <CardContent className="p-3 text-xs space-y-1">
                  <p className="font-medium text-[10px] uppercase text-muted-foreground">예산 가이드</p>
                  <p className="text-[11px]">{finalIntent.derivedStrategy.budgetGuideline.overallApproach}</p>
                  {finalIntent.derivedStrategy.budgetGuideline.majorCategories?.map((c: any, i: number) => (
                    <div key={i} className="text-[11px]">· {c.category}: {c.allocation}</div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* 리스크 매트릭스 */}
            {finalIntent.derivedStrategy.riskMatrix?.length > 0 && (
              <Card>
                <CardContent className="p-3 text-xs space-y-1">
                  <p className="font-medium text-[10px] uppercase text-muted-foreground">리스크 매트릭스</p>
                  {finalIntent.derivedStrategy.riskMatrix.map((r: any, i: number) => (
                    <div key={i} className="rounded border p-1.5 mt-1 bg-muted/30">
                      <div className="flex items-center gap-1 mb-0.5">
                        <Badge variant="outline" className="text-[9px] h-4">{r.probability}/{r.impact}</Badge>
                        <span className="text-[11px] font-medium">{r.risk}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{r.mitigation}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* 코치 프로필 */}
            {finalIntent.derivedStrategy.coachProfile && (
              <Card>
                <CardContent className="p-3 text-xs">
                  <p className="font-medium text-[10px] uppercase text-muted-foreground mb-1">코치 프로필</p>
                  <p className="text-[11px]">{finalIntent.derivedStrategy.coachProfile}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

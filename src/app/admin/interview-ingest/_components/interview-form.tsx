'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

export function InterviewForm() {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  const [projectName, setProjectName] = useState('')
  const [client, setClient] = useState('')
  const [domain, setDomain] = useState('')
  const [intervieweeName, setIntervieweeName] = useState('')
  const [outcome, setOutcome] = useState<'won' | 'lost' | 'cancelled'>('won')
  const [rawText, setRawText] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (rawText.trim().length < 50) {
      toast.error('인터뷰 텍스트는 최소 50자')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/admin/interview-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: projectName.trim(),
          client: client.trim() || undefined,
          domain: domain.trim() || undefined,
          intervieweeName: intervieweeName.trim(),
          outcome,
          rawText: rawText.trim(),
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`)
      toast.success(`인터뷰 저장 완료 (${data.jobId})`)
      // 폼 리셋 + 목록 갱신
      setProjectName('')
      setClient('')
      setDomain('')
      setIntervieweeName('')
      setRawText('')
      startTransition(() => router.refresh())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('저장 실패: ' + msg.slice(0, 100))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="projectName">사업명 *</Label>
          <Input
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="예: 2026 청년창업사관학교 위탁운영"
            required
            minLength={2}
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="intervieweeName">인터뷰 대상 PM *</Label>
          <Input
            id="intervieweeName"
            value={intervieweeName}
            onChange={(e) => setIntervieweeName(e.target.value)}
            placeholder="예: 홍길동 PM"
            required
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="client">발주 기관 (선택)</Label>
          <Input
            id="client"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="예: 중소벤처기업부"
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="domain">사업 영역 (선택)</Label>
          <Input
            id="domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="예: 청년 창업"
            disabled={busy}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="outcome">결과 *</Label>
        <select
          id="outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as 'won' | 'lost' | 'cancelled')}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          disabled={busy}
        >
          <option value="won">🏆 수주</option>
          <option value="lost">미수주</option>
          <option value="cancelled">취소</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rawText">인터뷰 내용 *</Label>
        <Textarea
          id="rawText"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="PM 과의 인터뷰 내용을 자유롭게 입력하세요 (최소 50자). 예시:&#10;&#10;Q: 이 사업에서 발주처가 가장 신경 쓴 평가 항목은?&#10;A: ...&#10;&#10;Q: 우리 자산 중 어떤 게 가장 차별화 됐나?&#10;A: ..."
          className="min-h-[200px] text-sm"
          required
          minLength={50}
          disabled={busy}
        />
        <div className="text-xs text-muted-foreground tabular-nums">
          {rawText.length} 자
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={busy || rawText.length < 50}>
          {busy ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> 저장 중
            </>
          ) : (
            <>
              <Send className="mr-1.5 h-3.5 w-3.5" /> 저장
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

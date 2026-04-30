'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function ProcessButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  const handle = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/admin/interview-ingest/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process' }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`)
      toast.success(`자산 후보 ${data.candidatesCount} 개 추출 완료 (${data.aiModel})`)
      startTransition(() => router.refresh())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('AI 추출 실패: ' + msg.slice(0, 100))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button onClick={handle} disabled={busy} size="sm">
      {busy ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> AI 분석 중
        </>
      ) : (
        <>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" /> AI 추출 시작
        </>
      )}
    </Button>
  )
}

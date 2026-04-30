'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  targetAsset: string
  targetLabel: string
  payload: Record<string, unknown>
  confidence: number
  status: string
  appliedId: string | null
  reviewNotes: string | null
}

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 대기',
  approved: '승인',
  rejected: '반려',
  edited: '편집됨',
}

export function CandidateCard({
  id,
  targetLabel,
  payload,
  confidence,
  status,
  appliedId,
  reviewNotes,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  const handleAction = async (action: 'approve' | 'reject') => {
    if (busy) return
    if (action === 'reject') {
      const note = window.prompt('반려 사유 (선택):') ?? undefined
      setBusy(true)
      try {
        const r = await fetch(`/api/admin/extracted-items/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject', reviewNotes: note }),
        })
        if (!r.ok) throw new Error(await r.text())
        toast.info('반려 처리 완료')
        startTransition(() => router.refresh())
      } catch (err: unknown) {
        toast.error('반려 실패: ' + (err instanceof Error ? err.message : String(err)).slice(0, 80))
      } finally {
        setBusy(false)
      }
      return
    }

    // approve
    setBusy(true)
    try {
      const r = await fetch(`/api/admin/extracted-items/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`)
      toast.success(`승인 완료 — ContentAsset 생성: ${data.createdAssetId}`)
      startTransition(() => router.refresh())
    } catch (err: unknown) {
      toast.error('승인 실패: ' + (err instanceof Error ? err.message : String(err)).slice(0, 80))
    } finally {
      setBusy(false)
    }
  }

  const name = String(payload.name ?? '')
  const narrativeSnippet = String(payload.narrativeSnippet ?? '')
  const keywords = Array.isArray(payload.keywords) ? (payload.keywords as string[]) : []
  const keyNumbers = Array.isArray(payload.keyNumbers) ? (payload.keyNumbers as string[]) : []
  const evidence = String(payload.evidenceFromInterview ?? '')

  const confidenceColor =
    confidence >= 0.7
      ? 'bg-green-100 text-green-800'
      : confidence >= 0.4
        ? 'bg-amber-100 text-amber-800'
        : 'bg-muted text-muted-foreground'

  return (
    <div
      className={cn(
        'rounded-md border p-3',
        status === 'approved' && 'border-green-300 bg-green-50/30',
        status === 'rejected' && 'border-red-300 bg-red-50/30 opacity-60',
        status === 'edited' && 'border-amber-300 bg-amber-50/30',
      )}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xs font-medium">{targetLabel}</span>
        <Badge variant="outline" className={cn('text-[10px]', confidenceColor)}>
          신뢰 {(confidence * 100).toFixed(0)}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {STATUS_LABEL[status] ?? status}
        </Badge>
        {appliedId && (
          <span className="text-[10px] text-muted-foreground">→ {appliedId}</span>
        )}
      </div>

      <div className="mt-2 text-sm font-semibold">{name}</div>
      <div className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/85">
        {narrativeSnippet}
      </div>

      {keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {keywords.map((k, i) => (
            <Badge key={i} variant="outline" className="text-[10px]">
              {k}
            </Badge>
          ))}
        </div>
      )}

      {keyNumbers.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {keyNumbers.map((k, i) => (
            <Badge key={i} variant="secondary" className="text-[10px]">
              📊 {k}
            </Badge>
          ))}
        </div>
      )}

      {evidence && (
        <div className="mt-2 rounded bg-muted/50 px-2 py-1 text-[11px] italic text-muted-foreground">
          📎 “{evidence}”
        </div>
      )}

      {reviewNotes && (
        <div className="mt-2 text-[11px] text-amber-700">
          💬 {reviewNotes}
        </div>
      )}

      {status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={() => handleAction('approve')}
            disabled={busy}
            className="text-xs"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
            승인 → ContentAsset 생성
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('reject')}
            disabled={busy}
            className="text-xs"
          >
            <X className="h-3 w-3 mr-1" /> 반려
          </Button>
        </div>
      )}
    </div>
  )
}

'use client'

/**
 * ReviewActions — 검수 대기 자산 승인/반려 액션 (2026-05-19)
 *
 * /admin/content-hub/[id]/edit 의 form 위에 노출.
 * Admin/Director 만 (server 측에서 isPendingReview && canReview 조건).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Props {
  assetId: string
  assetName: string
  submitterNote: string
}

export function ReviewActions({ assetId, assetName, submitterNote }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [approveNote, setApproveNote] = useState('')

  const run = async (action: 'approve' | 'reject', note: string) => {
    if (action === 'reject' && !note.trim()) {
      toast.error('반려 사유 필수')
      return
    }
    setLoading(action)
    try {
      const r = await fetch('/api/admin/content-hub/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId,
          action,
          note: note.trim() || undefined,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'unknown')
      toast.success(data.message ?? '처리 완료')
      router.push('/admin/content-hub?status=pending-review')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('실패: ' + msg.slice(0, 120))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="rounded-md border border-blue-300 bg-blue-50/60 p-3">
      <div className="text-xs font-semibold text-blue-900">
        🔵 PM 제안 검수 대기
      </div>
      <div className="mt-1 rounded bg-white/60 p-2 text-[11px] text-blue-800">
        💬 <strong>제안자 메모:</strong> {submitterNote}
      </div>

      {!showRejectForm ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-[10px] text-muted-foreground">
              승인 메모 (선택)
            </Label>
            <Textarea
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              placeholder="예: 좋은 자산이네요. status=stable 로 승격합니다."
              rows={2}
              className="mt-0.5 text-xs"
            />
          </div>
          <div className="flex gap-2 items-end">
            <Button
              onClick={() => run('approve', approveNote)}
              disabled={loading !== null}
              size="sm"
              className="gap-1 bg-green-600 hover:bg-green-700"
            >
              {loading === 'approve' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              승인 (stable 승격)
            </Button>
            <Button
              onClick={() => setShowRejectForm(true)}
              disabled={loading !== null}
              size="sm"
              variant="outline"
              className="gap-1 border-red-300 text-red-700 hover:bg-red-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              반려
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">
              반려 사유 <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder={`"${assetName}" 반려 사유 — 제안자가 다음 제출 시 참고할 메모`}
              rows={3}
              className="mt-0.5 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => run('reject', rejectNote)}
              disabled={loading !== null || !rejectNote.trim()}
              size="sm"
              variant="destructive"
            >
              {loading === 'reject' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              반려 확정 (archived 처리)
            </Button>
            <Button
              onClick={() => setShowRejectForm(false)}
              disabled={loading !== null}
              size="sm"
              variant="ghost"
            >
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

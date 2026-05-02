'use client'

/**
 * Coach DB 동기화 트리거 버튼
 *  - POST /api/coaches/sync → GitHub coaches-db 에서 fetch + upsert
 *  - 환경변수 GITHUB_TOKEN / GITHUB_COACHES_REPO 등 필요 (private repo 일 때)
 *  - 결과 toast + 진행률 갱신 위해 router.refresh
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function CoachSyncButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  const handle = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/coaches/sync', { method: 'POST' })
      const data = await r.json().catch(() => null)
      if (!r.ok) {
        const msg = data?.error ?? `HTTP ${r.status}`
        toast.error(`Coach sync 실패: ${msg}`, {
          description:
            r.status === 502
              ? 'GitHub 연결 실패 — GITHUB_TOKEN / GITHUB_COACHES_REPO 환경변수 확인 (Vercel Settings)'
              : '관리자에게 문의',
        })
        return
      }
      const upserted = data?.upserted ?? 0
      const skipped = data?.skipped ?? 0
      toast.success(`Coach sync 완료 — ${upserted} 코치 upsert · ${skipped} skip`)
      startTransition(() => router.refresh())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('네트워크 오류: ' + msg.slice(0, 80))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
      title="GitHub coaches-db 에서 fetch + upsert"
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <RefreshCw className="h-3 w-3" />
      )}
      Sync
    </button>
  )
}

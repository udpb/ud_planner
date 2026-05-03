'use client'

/**
 * Coach DB 동기화 트리거 버튼
 *
 * Source-of-truth: Supabase `coaches_directory` (coach-finder 와 동일)
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE 설정 시 우선 사용
 *   - 미설정 시 GitHub raw JSON fallback
 *
 * 응답에 `source: 'supabase' | 'github'` 포함되므로 toast 에 어디서 가져왔는지 표시.
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
              ? 'Supabase 와 GitHub 모두 연결 실패 — SUPABASE_URL / SUPABASE_SERVICE_ROLE 또는 GITHUB_TOKEN 환경변수 확인'
              : '관리자에게 문의',
        })
        return
      }
      const upserted = data?.upserted ?? 0
      const skipped = data?.skipped ?? 0
      const source = data?.source ?? 'unknown'
      const sourceLabel = source === 'supabase' ? '🟢 Supabase' : '🟡 GitHub fallback'
      const ms = data?.durationMs ?? 0
      toast.success(`Coach sync 완료 — ${upserted}명 upsert · ${skipped} skip`, {
        description: `${sourceLabel} (${ms}ms) — coach-finder 와 동일 source`,
      })
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
      title="Supabase coaches_directory (coach-finder 와 동일) → ud-ops 로컬 Coach 테이블 동기화"
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

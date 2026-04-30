'use client'

/**
 * /admin/content-hub 의 "시드 다시 적용" 버튼.
 * /api/admin/seed-content-assets POST 호출 → upsert 결과 toast.
 *
 * 멱등 — id 기준 upsert. 사용자가 UI 로 수정한 자산도 덮어쓰기 됨 (확인 dialog).
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export function SeedButton() {
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    if (
      !confirm(
        '코드 시드 (UD_ASSETS_SEED + 계층 예시) 를 DB 에 다시 적용합니다.\n\n' +
          '⚠️ UI 로 수정한 자산도 덮어쓰기 될 수 있어요. 계속하시겠어요?',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/admin/seed-content-assets', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`)
      toast.success(
        `시드 완료 — ${data.upserted}건 upsert · DB 총 ${data.totalInDb}건`,
      )
      // 새 데이터 노출 위해 새로고침
      setTimeout(() => location.reload(), 800)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('시드 실패: ' + msg.slice(0, 100))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={busy}
      className="gap-1.5"
      title="UD_ASSETS_SEED + 계층 예시를 DB 에 upsert (ADMIN/DIRECTOR 만)"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      시드 적용
    </Button>
  )
}

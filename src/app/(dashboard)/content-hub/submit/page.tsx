/**
 * /content-hub/submit — PM 자산 제안 페이지 (2026-05-19)
 *
 * /admin/* 가 아니라 /content-hub/* 아래에 둠 — PM 도 접근 가능 (admin gate 없음).
 * Admin 승인 후 status='stable' 로 추천 풀 합류.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { auth } from '@/lib/auth'
import { SubmitAssetClient } from './submit-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: '자산 제안 | UD-Ops' }

export default async function SubmitAssetPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="새 자산 제안" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-6 py-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            대시보드
          </Link>

          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
            <p className="font-medium text-primary">📚 자산 제안 흐름</p>
            <p className="mt-1 text-muted-foreground">
              제출하신 자산은 <strong>status=developing</strong> 상태로
              검수 대기 큐에 등록됩니다. Admin/Director 가 검토 후 승인하면
              자동으로 추천 풀에 합류되어 다른 PM 의 1차본 작성 시 인용 가능해집니다.
            </p>
          </div>

          <SubmitAssetClient />
        </div>
      </div>
    </div>
  )
}

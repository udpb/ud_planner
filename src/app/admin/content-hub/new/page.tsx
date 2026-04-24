/**
 * /admin/content-hub/new — 신규 자산 생성 페이지 (Server Component).
 *
 * 서버에서 top-level 자산 목록(parentId 후보)을 로드하고
 * AssetForm 에 전달한다.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Header } from '@/components/layout/header'
import { AssetForm } from '@/components/admin/asset-form'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const metadata = { title: '새 자산 | Content Hub' }

export default async function NewAssetPage() {
  // 1 단 계층 — 부모 후보는 top-level 자산만
  const parents = await prisma.contentAsset.findMany({
    where: { parentId: null, status: { not: 'archived' } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="새 자산" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 pt-4">
          <Link
            href="/admin/content-hub"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            목록으로
          </Link>
        </div>
        <AssetForm mode="new" parents={parents} />
      </div>
    </div>
  )
}

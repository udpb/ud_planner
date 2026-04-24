/**
 * /admin/content-hub/[id]/edit — 자산 편집 페이지 (Server Component).
 *
 * 서버에서 대상 자산과 top-level 자산 목록(parentId 후보)을 로드하고
 * AssetForm 에 initial prop 으로 전달한다.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { Header } from '@/components/layout/header'
import { AssetForm, type AssetFormInitial } from '@/components/admin/asset-form'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const metadata = { title: '자산 편집 | Content Hub' }

type Params = { params: Promise<{ id: string }> }

export default async function EditAssetPage({ params }: Params) {
  const { id } = await params

  const [asset, parentsRaw] = await Promise.all([
    prisma.contentAsset.findUnique({
      where: { id },
      include: { children: { select: { id: true } } },
    }),
    prisma.contentAsset.findMany({
      where: { parentId: null, status: { not: 'archived' } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  if (!asset) notFound()

  // 자기 자신이 children 을 가진 경우 top-level 전용 → 부모 후보에서 자신 제외
  const parents = parentsRaw.filter((p) => p.id !== id)

  const initial: AssetFormInitial = {
    id: asset.id,
    name: asset.name,
    category: asset.category,
    narrativeSnippet: asset.narrativeSnippet,
    applicableSections: Array.isArray(asset.applicableSections)
      ? (asset.applicableSections as string[])
      : [],
    valueChainStage: asset.valueChainStage,
    parentId: asset.parentId,
    evidenceType: asset.evidenceType,
    keywords: Array.isArray(asset.keywords) ? (asset.keywords as string[]) : [],
    keyNumbers: Array.isArray(asset.keyNumbers)
      ? (asset.keyNumbers as string[])
      : [],
    sourceReferences: Array.isArray(asset.sourceReferences)
      ? (asset.sourceReferences as string[])
      : [],
    programProfileFit: asset.programProfileFit ?? null,
    status: asset.status,
    version: asset.version,
    lastReviewedAt: asset.lastReviewedAt
      ? new Date(asset.lastReviewedAt).toISOString().slice(0, 10)
      : '',
  }

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title={`편집 — ${asset.name}`} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 pt-4">
          <Link
            href="/admin/content-hub"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            목록으로
          </Link>
          {asset.children.length > 0 && (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
              이 자산은 {asset.children.length}개의 하위 자산을 가지고 있어 다른 자산의 하위(child)로 이동할 수 없습니다.
              아카이브 시 하위 자산은 유지됩니다.
            </p>
          )}
        </div>
        <AssetForm mode="edit" initial={initial} parents={parents} />
      </div>
    </div>
  )
}

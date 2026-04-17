/**
 * /ingest/review — Admin 승인 UI (Phase D1)
 *
 * 좌: ExtractedItem 목록 (status: "pending", targetAsset: "winning_pattern")
 * 우: 선택한 아이템 상세 (원본 섹션 heading·snippet 미리보기 + AI 추출 payload + 편집 가능 form)
 * 액션 3개: 승인 그대로 / 편집 후 승인 / 거부
 *
 * 관련 문서: docs/architecture/ingestion.md §4, ADR-003
 */

import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ReviewClient } from './_components/review-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: '자산 추출 검토 (Ingestion Review)' }

export interface ReviewItemData {
  id: string
  jobId: string
  sectionKey: string
  heading: string
  snippet: string
  whyItWorks: string
  tags: string[]
  sourceProject: string
  sourceClient: string
  outcome: string
  techEvalScore: number | null
  confidence: number
  status: string
  jobKind: string
  uploadedAt: string
}

async function getPendingItems(): Promise<ReviewItemData[]> {
  const items = await prisma.extractedItem.findMany({
    where: {
      status: 'pending',
      targetAsset: 'winning_pattern',
    },
    include: {
      job: {
        select: {
          id: true,
          kind: true,
          uploadedAt: true,
          metadata: true,
        },
      },
    },
    orderBy: { job: { uploadedAt: 'desc' } },
    take: 50,
  })

  return items.map((item) => {
    const payload = (item.payload ?? {}) as Record<string, unknown>
    return {
      id: item.id,
      jobId: item.jobId,
      sectionKey: String(payload['sectionKey'] ?? 'other'),
      heading: String(payload['heading'] ?? ''),
      snippet: String(payload['snippet'] ?? ''),
      whyItWorks: String(payload['whyItWorks'] ?? ''),
      tags: Array.isArray(payload['tags'])
        ? (payload['tags'] as unknown[]).map(String)
        : [],
      sourceProject: String(payload['sourceProject'] ?? ''),
      sourceClient: String(payload['sourceClient'] ?? ''),
      outcome: String(payload['outcome'] ?? 'pending'),
      techEvalScore: typeof payload['techEvalScore'] === 'number'
        ? payload['techEvalScore']
        : null,
      confidence: item.confidence,
      status: item.status,
      jobKind: item.job.kind,
      uploadedAt: item.job.uploadedAt.toISOString(),
    }
  })
}

export default async function IngestReviewPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const items = await getPendingItems()

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="자산 추출 검토" />
      <div className="flex-1 overflow-y-auto p-6">
        {/* 안내 배너 */}
        <div className="mb-5 rounded-md border-l-4 border-primary bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium">
            AI가 제안서에서 추출한 당선 패턴 후보를 검토합니다.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            승인된 패턴은 <strong>WinningPattern</strong> 자산에 저장되어 이후 기획에 자동 주입됩니다.
            자동 승인은 없습니다 -- 모든 패턴은 사람의 검토를 거칩니다.
          </p>
        </div>

        <ReviewClient items={items} />
      </div>
    </div>
  )
}

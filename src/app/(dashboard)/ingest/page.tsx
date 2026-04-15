/**
 * /ingest — Ingestion 단일 진입점 (Phase A 뼈대)
 *
 * 좌: 자료 업로드 폼 (자료 종류 + 메타 + 파일/URL)
 * 우: 최근 10건 IngestionJob 목록
 *
 * Phase D 워커가 가동되면 status 가 queued → processing → review → approved 로 진행됨.
 * 현재는 queued 상태로만 쌓임.
 */

import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { IngestForm } from './_components/ingest-form'
import { RecentJobsList } from './_components/recent-jobs-list'
import {
  type IngestionJobSummary,
  type IngestionKind,
  type IngestionStatus,
} from '@/lib/ingestion/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: '자료 업로드 (Ingestion)' }

async function getRecentJobs(): Promise<IngestionJobSummary[]> {
  const jobs = await prisma.ingestionJob.findMany({
    orderBy: { uploadedAt: 'desc' },
    take: 10,
  })
  return jobs.map((j) => ({
    id: j.id,
    kind: j.kind as IngestionKind,
    status: j.status as IngestionStatus,
    metadata: (j.metadata ?? {}) as Record<string, unknown>,
    sourceFile: j.sourceFile,
    sourceUrl: j.sourceUrl,
    uploadedAt: j.uploadedAt.toISOString(),
    uploadedBy: j.uploadedBy,
  }))
}

export default async function IngestPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const jobs = await getRecentJobs()

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="자료 업로드 (Ingestion)" />
      <div className="flex-1 overflow-y-auto p-6">
        {/* 안내 배너 */}
        <div className="mb-5 rounded-md border-l-4 border-primary bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium">
            자료를 드롭하면 다음 기획부터 그 자료의 노하우가 자동 주입됩니다.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            현재는 <strong>업로드 + 대기열 적재</strong>까지 동작합니다. AI 자동 추출과 검토
            UI는 Phase D에서 가동 예정입니다. 그 전까지는 자료를 미리 쌓아둘 수 있습니다.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <IngestForm uploaderId={session.user.id} />
          <RecentJobsList jobs={jobs} />
        </div>
      </div>
    </div>
  )
}

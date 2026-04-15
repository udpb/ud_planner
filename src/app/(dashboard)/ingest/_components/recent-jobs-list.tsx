/**
 * 최근 IngestionJob 목록 (Phase A — 서버 컴포넌트)
 *
 * 좌측 폼에서 업로드 → router.refresh() → 이 컴포넌트가 다시 렌더링.
 */

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Inbox } from 'lucide-react'
import {
  INGESTION_KIND_LABELS,
  INGESTION_STATUS_LABELS,
  type IngestionJobSummary,
  type IngestionStatus,
} from '@/lib/ingestion/types'

const STATUS_VARIANT: Record<IngestionStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  queued: 'secondary',
  processing: 'default',
  review: 'outline',
  approved: 'default',
  rejected: 'destructive',
  failed: 'destructive',
}

const STATUS_CLASS: Record<IngestionStatus, string> = {
  queued: 'bg-muted text-muted-foreground',
  processing: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-900/30 dark:text-cyan-100',
  review: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100',
  approved: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100',
  rejected: 'bg-destructive/10 text-destructive',
  failed: 'bg-destructive/10 text-destructive',
}

interface RecentJobsListProps {
  jobs: IngestionJobSummary[]
}

function pickTitle(job: IngestionJobSummary): string {
  const meta = job.metadata as Record<string, unknown>
  const candidates = ['projectName', 'interviewee', 'audience'] as const
  for (const k of candidates) {
    const v = meta[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return '(제목 없음)'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yy}.${mm}.${dd} ${hh}:${mi}`
}

export function RecentJobsList({ jobs }: RecentJobsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">최근 업로드</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-60" />
            <p className="text-sm">아직 업로드된 자료가 없습니다.</p>
            <p className="text-xs">왼쪽에서 첫 자료를 업로드해보세요.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {jobs.map((job) => {
              const status = job.status
              const variant = STATUS_VARIANT[status] ?? 'secondary'
              const cls = STATUS_CLASS[status] ?? ''
              return (
                <li key={job.id} className="px-6 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {INGESTION_KIND_LABELS[job.kind] ?? job.kind}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(job.uploadedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium">
                        {pickTitle(job)}
                      </p>
                      {(job.sourceFile || job.sourceUrl) && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {job.sourceFile ?? job.sourceUrl}
                        </p>
                      )}
                    </div>
                    <Badge variant={variant} className={cls}>
                      {INGESTION_STATUS_LABELS[status] ?? status}
                    </Badge>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * /admin/interview-ingest — 수주 전략 인터뷰 자산화 (Phase I4 PoC)
 *
 * 흐름:
 *   1. 수주 후 PM 인터뷰 텍스트를 paste
 *   2. IngestionJob (kind='strategy_interview', status='queued') 으로 저장
 *   3. 추후 워커가 AI 요약·자산 추출 → ContentAsset 후보 → 콘텐츠 담당자 검토
 *
 * 본 PoC 는 1·2 단계만 구현. 3 단계 (AI 처리·검토 UI) 는 Phase I4 후속.
 */

import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { InterviewForm } from './_components/interview-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: '전략 인터뷰 인제스트' }

const STATUS_LABEL: Record<string, string> = {
  queued: '대기',
  processing: '처리 중',
  review: '검토',
  approved: '승인',
  rejected: '반려',
  failed: '실패',
}

const OUTCOME_LABEL: Record<string, string> = {
  won: '🏆 수주',
  lost: '미수주',
  cancelled: '취소',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  queued: 'outline',
  processing: 'secondary',
  review: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  failed: 'destructive',
}

export default async function InterviewIngestPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user) redirect('/login')
  if (role !== 'ADMIN' && role !== 'DIRECTOR') redirect('/dashboard')

  const jobs = await prisma.ingestionJob.findMany({
    where: { kind: 'strategy_interview' },
    orderBy: { uploadedAt: 'desc' },
    take: 30,
  })

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="전략 인터뷰 인제스트" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          {/* 안내 */}
          <Card className="border-orange-200 bg-orange-50/40">
            <CardContent className="p-4 text-sm">
              <div className="font-semibold text-primary mb-1">
                📝 수주 후 PM 인터뷰 자동 자산화 (PoC)
              </div>
              <p className="text-muted-foreground leading-relaxed">
                수주·미수주 후 PM 과 1:1 인터뷰한 결과를 텍스트로 입력해 주세요.
                AI 가 핵심 패턴·교훈·재사용 가능 자산을 자동 추출해 콘텐츠 담당자에게 검토 요청합니다.
                PoC 단계 — 현재는 저장만, AI 추출은 후속 (Phase I4 다음 단계).
              </p>
            </CardContent>
          </Card>

          {/* 입력 폼 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">새 인터뷰 입력</CardTitle>
            </CardHeader>
            <CardContent>
              <InterviewForm />
            </CardContent>
          </Card>

          {/* 인터뷰 목록 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">최근 인터뷰 ({jobs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  아직 인터뷰가 없습니다. 위 폼으로 첫 인터뷰를 입력해 주세요.
                </div>
              ) : (
                <div className="space-y-2">
                  {jobs.map((job) => {
                    const meta = job.metadata as {
                      projectName?: string
                      outcome?: string
                      intervieweeName?: string
                      client?: string
                      domain?: string
                      rawTextLength?: number
                    }
                    return (
                      <div
                        key={job.id}
                        className="rounded-md border bg-background p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-baseline gap-3">
                          <span className="font-semibold">
                            {meta.projectName ?? '(이름 없음)'}
                          </span>
                          <Badge
                            variant={STATUS_VARIANT[job.status] ?? 'outline'}
                            className="text-[10px]"
                          >
                            {STATUS_LABEL[job.status] ?? job.status}
                          </Badge>
                          {meta.outcome && (
                            <span className="text-xs">
                              {OUTCOME_LABEL[meta.outcome] ?? meta.outcome}
                            </span>
                          )}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {new Date(job.uploadedAt).toLocaleString('ko-KR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {meta.intervieweeName && <span>👤 {meta.intervieweeName}</span>}
                          {meta.client && <span>🏢 {meta.client}</span>}
                          {meta.domain && <span>📍 {meta.domain}</span>}
                          {meta.rawTextLength && (
                            <span>📝 {meta.rawTextLength.toLocaleString()}자</span>
                          )}
                        </div>
                        {job.error && (
                          <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                            에러: {job.error}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

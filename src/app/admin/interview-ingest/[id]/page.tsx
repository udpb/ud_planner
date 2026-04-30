/**
 * /admin/interview-ingest/[id] — 인터뷰 상세 검토 (Phase I4 후속)
 *
 * 흐름:
 *  1. 좌: 인터뷰 원문 + 메타
 *  2. 우 상단: AI 분석 트리거 버튼 ([AI 추출 시작]) → status 'queued' → 'review'
 *  3. 우 본문: ExtractedItem 후보 목록 + 카드별 [✓ 승인] [✕ 반려]
 *  4. 승인 시 ContentAsset 자동 생성 (status='developing' — 검토 후 stable 승격)
 */

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { ProcessButton } from './_components/process-button'
import { CandidateCard } from './_components/candidate-card'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  queued: '대기',
  processing: '처리 중',
  review: '검토',
  approved: '승인',
  rejected: '반려',
  failed: '실패',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  queued: 'outline',
  processing: 'secondary',
  review: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  failed: 'destructive',
}

const TARGET_LABEL: Record<string, string> = {
  winning_pattern: '🏆 수주 패턴',
  curriculum_archetype: '📚 커리큘럼 원형',
  evaluator_question: '❓ 평가위원 질문',
  strategy_note: '🧭 전략 노트',
}

export default async function InterviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user) redirect('/login')
  if (role !== 'ADMIN' && role !== 'DIRECTOR') redirect('/dashboard')

  const { id } = await params
  const job = await prisma.ingestionJob.findUnique({
    where: { id },
    include: { extractedItems: { orderBy: { confidence: 'desc' } } },
  })
  if (!job || job.kind !== 'strategy_interview') notFound()

  const meta = job.metadata as {
    projectName?: string
    outcome?: string
    intervieweeName?: string
    client?: string | null
    domain?: string | null
    rawText?: string
    aiSummary?: string
    aiRedFlags?: string[]
    aiProvider?: string
    aiModel?: string
  }

  const canProcess = job.status === 'queued' || job.status === 'failed'

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title={meta.projectName ?? '인터뷰 상세'} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          {/* 상단 — 메타 + 액션 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <Link
                  href="/admin/interview-ingest"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                >
                  <ArrowLeft className="h-3 w-3" /> 목록
                </Link>
                <span className="text-base font-semibold">{meta.projectName}</span>
                <Badge variant={STATUS_VARIANT[job.status] ?? 'outline'} className="text-xs">
                  {STATUS_LABEL[job.status] ?? job.status}
                </Badge>
                {meta.outcome && (
                  <span className="text-xs">
                    {meta.outcome === 'won' ? '🏆 수주' : meta.outcome === 'lost' ? '미수주' : '취소'}
                  </span>
                )}
                {canProcess && (
                  <div className="ml-auto">
                    <ProcessButton jobId={job.id} />
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {meta.intervieweeName && <span>👤 {meta.intervieweeName}</span>}
                {meta.client && <span>🏢 {meta.client}</span>}
                {meta.domain && <span>📍 {meta.domain}</span>}
                <span>📅 {new Date(job.uploadedAt).toLocaleString('ko-KR')}</span>
                {meta.aiModel && <span className="opacity-60">🤖 {meta.aiModel}</span>}
              </div>
              {job.error && (
                <div className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
                  실패: {job.error}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
            {/* 좌: 인터뷰 원문 + AI 요약 */}
            <div className="space-y-4">
              {meta.aiSummary && (
                <Card className="border-orange-200 bg-orange-50/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">🧠 AI 요약</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{meta.aiSummary}</p>
                    {Array.isArray(meta.aiRedFlags) && meta.aiRedFlags.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <div className="text-xs font-semibold text-amber-700">⚠ Red Flags</div>
                        <ul className="ml-5 list-disc text-xs text-amber-900">
                          {meta.aiRedFlags.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">인터뷰 원문</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans">
                    {meta.rawText ?? '(텍스트 없음)'}
                  </pre>
                </CardContent>
              </Card>
            </div>

            {/* 우: ExtractedItem 후보 목록 */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    자산 후보 ({job.extractedItems.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {job.extractedItems.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      {canProcess
                        ? '아직 분석 전. 우상단 [AI 추출 시작] 버튼을 눌러주세요.'
                        : job.status === 'processing'
                          ? 'AI 분석 중...'
                          : '추출된 자산 후보가 없습니다.'}
                    </div>
                  ) : (
                    job.extractedItems.map((item) => (
                      <CandidateCard
                        key={item.id}
                        id={item.id}
                        targetAsset={item.targetAsset}
                        targetLabel={TARGET_LABEL[item.targetAsset] ?? item.targetAsset}
                        payload={item.payload as Record<string, unknown>}
                        confidence={item.confidence}
                        status={item.status}
                        appliedId={item.appliedId ?? null}
                        reviewNotes={item.reviewNotes ?? null}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

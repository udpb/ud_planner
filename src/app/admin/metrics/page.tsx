/**
 * /admin/metrics — 운영 모니터링 대시보드 (Phase I4)
 *
 * 핵심 지표:
 *   1. Project 통계 — 전체 / 상태별 / 수주율
 *   2. Express 활용도 — 활성 / 완성 / 평균 진행률
 *   3. ContentAsset 현황 — 총 갯수 / 카테고리·상태별
 *   4. 자산 재사용률 — acceptedAssetIds 빈도 Top 10
 *   5. IngestionJob — 상태별 / 승인률 / 인터뷰 시드
 *
 * 차트 라이브러리 미사용 (recharts 등 deps 추가 X) — 표 + progress bar 만.
 *
 * 인증: ADMIN | DIRECTOR (서버 컴포넌트에서 redirect)
 */

import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { CATEGORY_LABELS } from '@/lib/asset-registry-types'
import { cn } from '@/lib/utils'
import { CoachSyncButton } from './_components/coach-sync-button'

export const dynamic = 'force-dynamic'
export const metadata = { title: '운영 지표 — 모니터링' }

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '기획 중',
  PROPOSAL: '제안서',
  SUBMITTED: '제출 완료',
  IN_PROGRESS: '운영 중',
  COMPLETED: '완료',
  LOST: '미수주',
}

const INGEST_STATUS_LABEL: Record<string, string> = {
  queued: '대기',
  processing: '처리 중',
  review: '검토',
  approved: '승인',
  rejected: '반려',
  failed: '실패',
}

// 인라인 progress bar — 새 deps 없이
function ProgressBar({ pct, color = 'primary' }: { pct: number; color?: 'primary' | 'green' | 'amber' | 'red' }) {
  const colorClass =
    color === 'green'
      ? 'bg-green-500'
      : color === 'amber'
        ? 'bg-amber-500'
        : color === 'red'
          ? 'bg-red-500'
          : 'bg-primary'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full transition-all', colorClass)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

interface StatRowProps {
  label: string
  value: string | number
  pct?: number
  hint?: string
  color?: 'primary' | 'green' | 'amber' | 'red'
}

function StatRow({ label, value, pct, hint, color }: StatRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      {pct !== undefined && <ProgressBar pct={pct} color={color} />}
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}

async function getMetrics() {
  // 병렬 쿼리
  const [
    projectStats,
    expressActiveCount,
    expressCompletedCount,
    contentAssetTotal,
    contentAssetByCategory,
    contentAssetByStatus,
    ingestStats,
    coachActiveCount,
    proposalSectionCount,
    projectAssets,
    proposalSections,
    expressDrafts,
    rfpAudit,
    bidOutcome,
  ] = await Promise.all([
    prisma.project.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.project.count({ where: { expressActive: true } }),
    // Express isCompleted=true — JSON 필드 안이라 raw 또는 findMany 후 필터
    prisma.project.findMany({
      where: { expressActive: true },
      select: { expressDraft: true },
    }).then((rows) => rows.filter((r) => {
      const draft = r.expressDraft as { meta?: { isCompleted?: boolean } } | null
      return draft?.meta?.isCompleted === true
    }).length),
    prisma.contentAsset.count(),
    prisma.contentAsset.groupBy({
      by: ['category'],
      _count: { _all: true },
    }),
    prisma.contentAsset.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.ingestionJob.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.coach.count({ where: { isActive: true } }),
    prisma.proposalSection.count(),
    // Prisma Json 필드의 not-null 검사는 Prisma.JsonNullValueFilter 가 까다로움 —
    // 단순히 모두 가져온 후 메모리에서 필터 (수십 행 수준이라 영향 없음)
    prisma.project.findMany({
      select: { acceptedAssetIds: true },
    }),
    // Phase 3.2 — Validation 지표
    prisma.proposalSection.findMany({
      select: { sectionNo: true, version: true, isApproved: true },
    }),
    // Express 검수 결과 (inspectionResult JSON)
    prisma.project.findMany({
      where: { expressActive: true },
      select: { expressDraft: true },
    }),
    // Phase 4-coach-integration: evalCriteria 추출 정확도 audit
    prisma.project.findMany({
      where: { rfpParsed: { not: Prisma.JsonNull } },
      select: { id: true, name: true, rfpParsed: true },
    }),
    // isBidWon 기록률 (수주 피드백 루프)
    prisma.project.findMany({
      where: {
        OR: [
          { status: 'COMPLETED' },
          { status: 'IN_PROGRESS' },
          { status: 'LOST' },
          { status: 'SUBMITTED' },
        ],
      },
      select: { id: true, status: true, isBidWon: true, techEvalScore: true },
    }),
  ])

  // 프로젝트 상태별 카운트
  const projectByStatus: Record<string, number> = {}
  let totalProjects = 0
  for (const r of projectStats) {
    projectByStatus[r.status] = r._count._all
    totalProjects += r._count._all
  }
  const submitted = (projectByStatus.SUBMITTED ?? 0) + (projectByStatus.IN_PROGRESS ?? 0)
  const completed = projectByStatus.COMPLETED ?? 0
  const lost = projectByStatus.LOST ?? 0
  const submittedTotal = submitted + completed + lost
  const winRate =
    submittedTotal > 0 ? (completed / submittedTotal) * 100 : 0

  // Asset 재사용 빈도 — acceptedAssetIds 평탄화
  const assetUsage = new Map<string, number>()
  for (const p of projectAssets) {
    const ids = p.acceptedAssetIds as unknown as string[] | null
    if (!Array.isArray(ids)) continue
    for (const id of ids) {
      assetUsage.set(id, (assetUsage.get(id) ?? 0) + 1)
    }
  }
  const topAssets = [...assetUsage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  const assetIdsForName = topAssets.map(([id]) => id)
  const assetNameMap = new Map<string, string>()
  if (assetIdsForName.length > 0) {
    const named = await prisma.contentAsset.findMany({
      where: { id: { in: assetIdsForName } },
      select: { id: true, name: true },
    })
    for (const a of named) assetNameMap.set(a.id, a.name)
  }

  // Ingestion 상태별
  const ingestByStatus: Record<string, number> = {}
  let totalIngest = 0
  for (const r of ingestStats) {
    ingestByStatus[r.status] = r._count._all
    totalIngest += r._count._all
  }
  const ingestApproved = ingestByStatus.approved ?? 0
  const ingestReviewed = ingestApproved + (ingestByStatus.rejected ?? 0)
  const approvalRate = ingestReviewed > 0 ? (ingestApproved / ingestReviewed) * 100 : 0

  // ContentAsset by category/status
  const assetsByCategory: Record<string, number> = {}
  for (const r of contentAssetByCategory) assetsByCategory[r.category] = r._count._all
  const assetsByStatus: Record<string, number> = {}
  for (const r of contentAssetByStatus) assetsByStatus[r.status] = r._count._all

  // ─────────────────────────────────────────
  // Phase 3.2 — Validation 지표 계산
  // ─────────────────────────────────────────

  // ProposalSection: 평균 version (재시도 빈도 proxy) + 승인률
  let approvedCount = 0
  let totalVersionSum = 0
  let multiVersionCount = 0 // version >= 2 (재시도 1회 이상)
  for (const s of proposalSections) {
    if (s.isApproved) approvedCount += 1
    totalVersionSum += s.version
    if (s.version >= 2) multiVersionCount += 1
  }
  const sectionApprovalRate =
    proposalSections.length > 0 ? (approvedCount / proposalSections.length) * 100 : 0
  const avgSectionVersion =
    proposalSections.length > 0 ? totalVersionSum / proposalSections.length : 0
  const retryRate =
    proposalSections.length > 0 ? (multiVersionCount / proposalSections.length) * 100 : 0

  // Express 검수: inspectionResult.overallScore 평균
  let inspectorScoreSum = 0
  let inspectorScoreCount = 0
  let criticalIssueCount = 0
  for (const p of expressDrafts) {
    const draft = p.expressDraft as {
      meta?: {
        inspectionResult?: {
          overallScore?: number
          issues?: Array<{ severity?: string }>
        }
      }
    } | null
    const r = draft?.meta?.inspectionResult
    if (typeof r?.overallScore === 'number') {
      inspectorScoreSum += r.overallScore
      inspectorScoreCount += 1
    }
    if (Array.isArray(r?.issues)) {
      criticalIssueCount += r.issues.filter((i) => i?.severity === 'critical').length
    }
  }
  const avgInspectorScore =
    inspectorScoreCount > 0 ? inspectorScoreSum / inspectorScoreCount : 0

  // ─────────────────────────────────────────
  // evalCriteria audit (Phase 4-coach-integration)
  // ─────────────────────────────────────────
  let evalEmptyCount = 0
  let evalThinCount = 0 // 항목 < 3
  let evalRichCount = 0 // 항목 ≥ 5
  let evalCriteriaTotal = 0
  for (const p of rfpAudit) {
    const rfp = p.rfpParsed as { evalCriteria?: Array<{ score: number }> } | null
    const items = rfp?.evalCriteria ?? []
    if (items.length === 0) evalEmptyCount += 1
    else if (items.length < 3) evalThinCount += 1
    else if (items.length >= 5) evalRichCount += 1
    evalCriteriaTotal += 1
  }

  // ─────────────────────────────────────────
  // isBidWon 기록률 (수주 피드백 루프)
  // ─────────────────────────────────────────
  // 제출 이상 단계 프로젝트 중 isBidWon 기록된 비율
  const submittedOrLater = bidOutcome.length
  const bidWonRecorded = bidOutcome.filter((p) => p.isBidWon !== null).length
  const bidWonTrue = bidOutcome.filter((p) => p.isBidWon === true).length
  const bidWonFalse = bidOutcome.filter((p) => p.isBidWon === false).length
  const bidWonRate = submittedOrLater > 0 ? (bidWonRecorded / submittedOrLater) * 100 : 0
  const techScoreRecorded = bidOutcome.filter((p) => p.techEvalScore !== null).length
  const techScoreAvg =
    techScoreRecorded > 0
      ? bidOutcome.reduce((s, p) => s + (p.techEvalScore ?? 0), 0) / techScoreRecorded
      : 0

  return {
    totalProjects,
    projectByStatus,
    winRate,
    submittedTotal,
    completed,
    expressActiveCount,
    expressCompletedCount,
    contentAssetTotal,
    assetsByCategory,
    assetsByStatus,
    topAssets: topAssets.map(([id, count]) => ({
      id,
      name: assetNameMap.get(id) ?? id,
      count,
    })),
    ingestByStatus,
    totalIngest,
    approvalRate,
    coachActiveCount,
    proposalSectionCount,
    // Phase 3.2 Validation
    sectionApprovalRate,
    avgSectionVersion,
    retryRate,
    avgInspectorScore,
    inspectorScoreCount,
    criticalIssueCount,
    // Phase 4: evalCriteria audit
    evalEmptyCount,
    evalThinCount,
    evalRichCount,
    evalCriteriaTotal,
    // Phase 4: 수주 피드백 루프
    submittedOrLater,
    bidWonRecorded,
    bidWonTrue,
    bidWonFalse,
    bidWonRate,
    techScoreRecorded,
    techScoreAvg,
  }
}

export default async function MetricsPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user) redirect('/login')
  if (role !== 'ADMIN' && role !== 'DIRECTOR') redirect('/dashboard')

  const m = await getMetrics()

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="운영 지표" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* 4 컬럼 그리드 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* 1. Project 통계 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">프로젝트</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatRow label="전체" value={m.totalProjects} />
              <StatRow
                label="수주율"
                value={`${m.winRate.toFixed(1)}%`}
                pct={m.winRate}
                color={m.winRate >= 50 ? 'green' : m.winRate >= 30 ? 'amber' : 'red'}
                hint={`완료 ${m.completed} / 제출 + 완료 + 미수주 ${m.submittedTotal}`}
              />
              <div className="space-y-1.5 pt-2 border-t text-xs">
                {(['DRAFT', 'PROPOSAL', 'SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'LOST'] as const).map(
                  (s) => (
                    <div key={s} className="flex justify-between">
                      <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
                      <span className="tabular-nums">{m.projectByStatus[s] ?? 0}</span>
                    </div>
                  ),
                )}
              </div>
            </CardContent>
          </Card>

          {/* 2. Express */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Express Track</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatRow
                label="활성 프로젝트"
                value={m.expressActiveCount}
                hint="expressActive=true"
              />
              <StatRow
                label="1차본 완성"
                value={m.expressCompletedCount}
                pct={
                  m.expressActiveCount > 0
                    ? (m.expressCompletedCount / m.expressActiveCount) * 100
                    : 0
                }
                color="green"
                hint={`활성 중 ${
                  m.expressActiveCount > 0
                    ? ((m.expressCompletedCount / m.expressActiveCount) * 100).toFixed(0)
                    : 0
                }% 가 1차본 도달`}
              />
            </CardContent>
          </Card>

          {/* 3. ContentAsset */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Content Hub</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatRow label="총 자산" value={m.contentAssetTotal} />
              <div className="space-y-1.5 pt-2 border-t text-xs">
                {Object.entries(m.assetsByCategory).map(([cat, count]) => (
                  <div key={cat} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat}
                    </span>
                    <span className="tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                {Object.entries(m.assetsByStatus).map(([status, count]) => (
                  <Badge key={status} variant="outline" className="text-[10px]">
                    {status}: {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 4. Validation (Phase 3.2) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Validation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatRow
                label="ProposalSection 승인률"
                value={`${m.sectionApprovalRate.toFixed(1)}%`}
                pct={m.sectionApprovalRate}
                color={
                  m.sectionApprovalRate >= 80
                    ? 'green'
                    : m.sectionApprovalRate >= 50
                      ? 'amber'
                      : 'red'
                }
                hint={`섹션 ${m.proposalSectionCount}건 중`}
              />
              <StatRow
                label="재시도율"
                value={`${m.retryRate.toFixed(1)}%`}
                pct={m.retryRate}
                color={m.retryRate >= 30 ? 'red' : m.retryRate >= 15 ? 'amber' : 'green'}
                hint={`평균 v${m.avgSectionVersion.toFixed(2)} (높을수록 검증 실패 多)`}
              />
              <div className="space-y-1.5 pt-2 border-t text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Express 검수 평균점</span>
                  <span className="tabular-nums">
                    {m.inspectorScoreCount > 0
                      ? `${m.avgInspectorScore.toFixed(1)} / 100`
                      : '–'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">검수 표본</span>
                  <span className="tabular-nums">{m.inspectorScoreCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Critical 이슈</span>
                  <span className="tabular-nums">
                    {m.criticalIssueCount > 0 ? (
                      <span className="text-red-600 font-semibold">{m.criticalIssueCount}</span>
                    ) : (
                      0
                    )}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 두 번째 행 — Ingestion / evalCriteria audit / 수주 피드백 / 활성 코치 등 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* 5. Ingestion */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Ingestion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatRow
                label="승인률"
                value={`${m.approvalRate.toFixed(1)}%`}
                pct={m.approvalRate}
                color={m.approvalRate >= 70 ? 'green' : 'amber'}
                hint={`전체 ${m.totalIngest} 건 처리`}
              />
              <div className="space-y-1.5 pt-2 border-t text-xs">
                {Object.entries(m.ingestByStatus).map(([status, count]) => (
                  <div key={status} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {INGEST_STATUS_LABEL[status] ?? status}
                    </span>
                    <span className="tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 6. evalCriteria audit (Phase 4) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">평가 배점 추출</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatRow
                label="추출 성공률"
                value={
                  m.evalCriteriaTotal > 0
                    ? `${(((m.evalCriteriaTotal - m.evalEmptyCount) / m.evalCriteriaTotal) * 100).toFixed(0)}%`
                    : '–'
                }
                pct={
                  m.evalCriteriaTotal > 0
                    ? ((m.evalCriteriaTotal - m.evalEmptyCount) / m.evalCriteriaTotal) * 100
                    : 0
                }
                color="green"
                hint={`RFP 파싱 ${m.evalCriteriaTotal}건 중 평가배점 추출됨`}
              />
              <div className="space-y-1.5 pt-2 border-t text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">⚠ 추출 0건</span>
                  <span className="tabular-nums">
                    {m.evalEmptyCount > 0 ? (
                      <span className="text-red-600 font-semibold">{m.evalEmptyCount}</span>
                    ) : (
                      0
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">부분 (≤2개)</span>
                  <span className="tabular-nums">{m.evalThinCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">풍부 (≥5개)</span>
                  <span className="tabular-nums text-green-700">{m.evalRichCount}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 7. 수주 피드백 루프 (Phase 4) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">수주 피드백 루프</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatRow
                label="isBidWon 기록률"
                value={`${m.bidWonRate.toFixed(0)}%`}
                pct={m.bidWonRate}
                color={m.bidWonRate >= 80 ? 'green' : m.bidWonRate >= 50 ? 'amber' : 'red'}
                hint={`제출 이상 ${m.submittedOrLater}건 중 ${m.bidWonRecorded}건`}
              />
              <div className="space-y-1.5 pt-2 border-t text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">수주 (won)</span>
                  <span className="tabular-nums text-green-700">{m.bidWonTrue}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">미수주 (lost)</span>
                  <span className="tabular-nums">{m.bidWonFalse}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">기술평가 평균점</span>
                  <span className="tabular-nums">
                    {m.techScoreRecorded > 0
                      ? `${m.techScoreAvg.toFixed(1)} (n=${m.techScoreRecorded})`
                      : '–'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 자산 재사용 Top 10 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">자산 재사용 Top 10</CardTitle>
          </CardHeader>
          <CardContent>
            {m.topAssets.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                아직 차별화 자산을 수락한 프로젝트가 없습니다.
              </div>
            ) : (
              <div className="space-y-2">
                {m.topAssets.map((a, i) => {
                  const max = m.topAssets[0].count
                  return (
                    <div key={a.id} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2">
                          <span className="text-xs tabular-nums text-muted-foreground">
                            #{i + 1}
                          </span>
                          {a.name}
                        </span>
                        <span className="tabular-nums font-semibold">{a.count}</span>
                      </div>
                      <ProgressBar pct={(a.count / max) * 100} />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 부가 지표 */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-xs text-muted-foreground">활성 코치</div>
                <CoachSyncButton />
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {m.coachActiveCount}
              </div>
              {m.coachActiveCount === 0 && (
                <div className="mt-1 text-[10px] text-amber-700">
                  ⚠ 코치 DB 비어있음 — 우상단 sync
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">제안서 섹션 누적</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {m.proposalSectionCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Express 활성률</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {m.totalProjects > 0
                  ? ((m.expressActiveCount / m.totalProjects) * 100).toFixed(0)
                  : 0}
                %
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                전체 프로젝트 중 Express 진입
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Ingestion 진행 중</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {(m.ingestByStatus.queued ?? 0) +
                  (m.ingestByStatus.processing ?? 0) +
                  (m.ingestByStatus.review ?? 0)}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

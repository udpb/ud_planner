/**
 * /admin/content-hub — 콘텐츠 자산 목록 (Server Component)
 *
 * Phase H Wave H3 (ADR-010, docs/architecture/content-hub.md §"관리자 UI 스펙").
 *
 * URL 쿼리 파라미터로 필터 상태 유지:
 *   ?category=methodology&stage=impact&status=stable&parent=top-level&search=IMPACT
 *
 * 기본 동작:
 *  - status 명시 없으면 archived 제외
 *  - 정렬: updatedAt desc
 */

import Link from 'next/link'
import { Plus, Sparkles } from 'lucide-react'

import { Header } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { prisma } from '@/lib/prisma'
import { CATEGORY_LABELS } from '@/lib/asset-registry'
import { VALUE_CHAIN_STAGES } from '@/lib/value-chain'

import { FilterBar } from './_components/filter-bar'
import { SeedButton } from './_components/seed-button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Content Hub' }

interface SearchParams {
  category?: string
  stage?: string
  status?: string
  parent?: string
  search?: string
}

const EVIDENCE_LABEL: Record<string, string> = {
  quantitative: '정량',
  structural: '구조',
  case: '사례',
  methodology: '방법',
}

const STATUS_LABEL: Record<string, string> = {
  stable: '안정',
  developing: '개발 중',
  archived: '아카이브',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'ghost'> = {
  stable: 'default',
  developing: 'secondary',
  archived: 'outline',
}

async function getAssets(params: SearchParams) {
  const where: Record<string, unknown> = {}
  if (params.category) where.category = params.category
  if (params.stage) where.valueChainStage = params.stage

  // 상태: 명시 없으면 archived 숨김
  // 'pending-review': status='developing' AND submitterNote != null (PM 제안 검수 대기)
  if (params.status === 'pending-review') {
    where.status = 'developing'
    where.submitterNote = { not: null }
  } else if (params.status) {
    where.status = params.status
  } else {
    where.status = { not: 'archived' }
  }

  if (params.parent === 'top-level') {
    where.parentId = null
  } else if (params.parent === 'child') {
    where.parentId = { not: null }
  }

  if (params.search) {
    where.name = { contains: params.search, mode: 'insensitive' }
  }

  return prisma.contentAsset.findMany({
    where,
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { children: true } },
    },
    orderBy:
      params.status === 'pending-review'
        ? { createdAt: 'asc' } // 검수 큐: 오래된 순 (FIFO)
        : { updatedAt: 'desc' },
  })
}

export default async function ContentHubPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const assets = await getAssets(params)

  // 검수 대기 큐 카운트 (배지용)
  const pendingCount = await prisma.contentAsset.count({
    where: { status: 'developing', submitterNote: { not: null } },
  })

  const isReviewMode = params.status === 'pending-review'

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="Content Hub" />
      <div className="flex-1 overflow-y-auto p-6">
        {/* PM 제안 검수 큐 알림 — 대기 자산 있고 현재 필터 모드 아닐 때 */}
        {pendingCount > 0 && !isReviewMode && (
          <Link
            href="/admin/content-hub?status=pending-review"
            className="mb-3 flex items-center gap-2 rounded-md border border-[color:var(--cyan)]/40 bg-[color:var(--light-beige)] px-3 py-2 text-xs hover:bg-[color:var(--cyan)]/10"
          >
            <span className="text-base">🔵</span>
            <span>
              <strong className="text-[color:var(--cyan)]">PM 제안 {pendingCount}건</strong>{' '}
              검수 대기 — 클릭해서 처리하기
            </span>
          </Link>
        )}
        {isReviewMode && (
          <div className="mb-3 rounded-md border border-[color:var(--cyan)]/40 bg-[color:var(--light-beige)] px-3 py-2 text-xs text-[color:var(--body-text)]">
            🔵 <strong>PM 제안 검수 모드</strong> · 자산 카드의 [편집] → 페이지
            하단에서 승인/반려 가능. 또는 직접 편집 후 status 를 stable 로
            변경하면 추천 풀에 합류됩니다.
          </div>
        )}

        {/* 필터 바 + 새 자산 CTA */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <FilterBar initial={params} />
          <div className="flex shrink-0 gap-2">
            <SeedButton />
            <Link href="/admin/content-hub/ingest">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Sparkles className="h-4 w-4" />
                URL 자동 수집
              </Button>
            </Link>
            <Link href="/admin/content-hub/new">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />새 자산
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      이름
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      카테고리
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      단계
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      증거
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      상태
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                      버전
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      최종 검토
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                      액션
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {assets.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-12 text-center text-muted-foreground"
                      >
                        자산이 없습니다.{' '}
                        <Link
                          href="/admin/content-hub/new"
                          className="underline"
                        >
                          새 자산을 추가하세요
                        </Link>
                        .
                      </td>
                    </tr>
                  ) : (
                    assets.map((a) => {
                      const stageSpec =
                        VALUE_CHAIN_STAGES[
                          a.valueChainStage as keyof typeof VALUE_CHAIN_STAGES
                        ]
                      return (
                        <tr
                          key={a.id}
                          className="border-b last:border-0 hover:bg-muted/30"
                        >
                          <td className="px-4 py-3">
                            {a.parent ? (
                              <div className="space-y-0.5">
                                <div className="text-[11px] text-muted-foreground">
                                  └─ {a.parent.name}
                                </div>
                                <Link
                                  href={`/admin/content-hub/${a.id}/edit`}
                                  className="font-medium hover:underline"
                                >
                                  {a.name}
                                </Link>
                              </div>
                            ) : (
                              <Link
                                href={`/admin/content-hub/${a.id}/edit`}
                                className="font-medium hover:underline"
                              >
                                {a.name}
                                {a._count.children > 0 && (
                                  <span className="ml-2 text-[11px] text-muted-foreground">
                                    ({a._count.children}개 하위)
                                  </span>
                                )}
                              </Link>
                            )}
                            {/* PM 제안 검수 모드: submitterNote 노출 */}
                            {a.submitterNote && (
                              <div className="mt-1 rounded border border-[color:var(--cyan)]/30 bg-[color:var(--light-beige)] px-1.5 py-0.5 text-[10px] text-[color:var(--body-text)]">
                                💬 {a.submitterNote}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">
                              {CATEGORY_LABELS[
                                a.category as keyof typeof CATEGORY_LABELS
                              ] ?? a.category}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {stageSpec ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{ backgroundColor: stageSpec.colorHex }}
                                />
                                <span className="text-xs">
                                  {stageSpec.numberedLabel}
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {a.valueChainStage}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {EVIDENCE_LABEL[a.evidenceType] ?? a.evidenceType}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={STATUS_VARIANT[a.status] ?? 'outline'}>
                              {STATUS_LABEL[a.status] ?? a.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            v{a.version}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                            {a.lastReviewedAt
                              ? new Date(a.lastReviewedAt).toLocaleDateString('ko')
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/admin/content-hub/${a.id}/edit`}>
                              <Button size="xs" variant="outline">
                                편집
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* 요약 — 현재 필터 결과 건수 */}
        <div className="mt-3 text-xs text-muted-foreground">
          총 {assets.length}건 (정렬: 최근 수정 순)
        </div>
      </div>
    </div>
  )
}

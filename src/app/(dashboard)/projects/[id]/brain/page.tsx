/**
 * /projects/[id]/brain — W31 (Phase E, Product) ⭐
 *
 * Brain 4+1 영역 통합 화면 — PM 이 RFP 업로드 후 즉시 보는 통합 답변.
 *
 * 흐름:
 *   1. Project + rfpRaw 로드
 *   2. matchTuple 호출 (server-side, channel 자동 추론)
 *   3. BrainPanel client component 에 결과 전달
 *   4. PM 이 자산 "인용" 클릭 → /api/express/asset-usage POST → AssetUsage row
 *
 * Express UI 와 별도 panel 로 운영 — ExpressShell 직접 수정 X (회귀 0).
 * 검증 기준 (PRD §7): "PM RFP 업로드 → 5초 내 통합 답변".
 */

import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { matchTuple } from '@/lib/inference/match-tuple'
import { BrainPanel, type BrainPanelProps } from '@/components/brain/BrainPanel'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await prisma.project.findUnique({
    where: { id },
    select: { name: true },
  })
  return { title: `Brain — ${project?.name ?? '프로젝트'}` }
}

function inferChannel(p: {
  programProfile: unknown
  projectType: string | null
}): 'B2G' | 'B2B' | 'renewal' {
  const pp = p.programProfile as
    | { channel?: { type?: string; isRenewal?: boolean } }
    | null
    | undefined
  if (pp?.channel?.isRenewal) return 'renewal'
  if (pp?.channel?.type === 'B2B' || p.projectType === 'B2B') return 'B2B'
  return 'B2G'
}

export default async function BrainPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      client: true,
      rfpRaw: true,
      programProfile: true,
      projectType: true,
    },
  })

  if (!project) notFound()

  const channel = inferChannel(project)
  const rfpText = project.rfpRaw ?? ''

  let panelProps: BrainPanelProps | null = null
  let error: string | null = null

  if (rfpText.length >= 200) {
    try {
      const result = await matchTuple({
        rfp: { text: rfpText },
        profile: project.programProfile,
        channel,
        limit: 5,
      })
      panelProps = {
        projectId: project.id,
        channel,
        rfpEstimate: {
          contentKeywords: result.rfpEstimate.contentKeywords,
          logicGraph: result.rfpEstimate.logicGraph
            ? {
                nodeCount: result.rfpEstimate.logicGraph.nodes.length,
                edgeCount: result.rfpEstimate.logicGraph.edges.length,
              }
            : null,
        },
        messages: result.messages.map((m) => ({
          patternId: m.patternId,
          matchScore: m.matchScore,
          sourceProject: m.sourceProject,
          outcome: m.outcome,
          message: {
            slogan: m.message.slogan,
            keyMessages: m.message.keyMessages,
            beforeAfter: m.message.beforeAfter,
          },
          breakdown: {
            messageSim: m.breakdown.messageSim,
            logicSim: m.breakdown.logicSim,
            contentSim: m.breakdown.contentSim,
            channelMatch: m.breakdown.channelMatch,
            winRateBonus: m.breakdown.winRateBonus,
          },
        })),
        contents: result.contents.map((c) => ({
          assetId: c.assetId,
          matchScore: c.matchScore,
          mmrScore: c.mmrScore,
          sectionHint: c.sectionHint,
          sourceTier: c.sourceTier,
          narrativeSnippet: c.narrativeSnippet,
        })),
        methodologyAssets: result.methodologyAssets.map((c) => ({
          assetId: c.assetId,
          matchScore: c.matchScore,
          mmrScore: c.mmrScore,
          sectionHint: c.sectionHint,
          sourceTier: c.sourceTier,
          narrativeSnippet: c.narrativeSnippet,
        })),
        caseAssets: result.caseAssets.map((c) => ({
          assetId: c.assetId,
          matchScore: c.matchScore,
          mmrScore: c.mmrScore,
          sectionHint: c.sectionHint,
          sourceTier: c.sourceTier,
          narrativeSnippet: c.narrativeSnippet,
        })),
        matchedConcepts: result.matchedConcepts.map((c) => ({
          conceptId: c.conceptId,
          name: c.name,
          type: c.type,
          weight: c.weight,
          matchedBy: c.matchedBy,
          assetCount: c.assetCount,
          matchedKeyword: c.matchedKeyword,
        })),
        conceptAssets: result.conceptAssets.map((c) => ({
          assetId: c.assetId,
          assetName: c.assetName,
          assetType: c.assetType,
          matchedConcept: c.matchedConcept,
          matchedConceptType: c.matchedConceptType,
          matchScore: c.matchScore,
          isCore: c.isCore,
          sourceTier: c.sourceTier,
          narrativeSnippet: c.narrativeSnippet,
        })),
        meta: {
          elapsedMs: result.elapsedMs,
          totalCandidates:
            (result.totalCandidates?.messages ?? 0) +
            (result.totalCandidates?.contents ?? 0) +
            (result.totalCandidates?.methodologyAssets ?? 0) +
            (result.totalCandidates?.caseAssets ?? 0),
        },
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title={`${project.name} · Brain`} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">
              🧠 Brain 4+1 통합 분석 (W31)
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {project.client ? `${project.client} · ` : ''}
              {project.name}
            </p>
          </div>
          <div className="flex gap-2 text-[11px]">
            <Link
              href={`/projects/${project.id}/express`}
              className="rounded border bg-blue-50 px-2.5 py-1 hover:bg-blue-100"
            >
              ← Express
            </Link>
            <Link
              href={`/projects/${project.id}`}
              className="rounded border bg-gray-50 px-2.5 py-1 hover:bg-gray-100"
            >
              ← Project
            </Link>
          </div>
        </div>

        {rfpText.length < 200 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <p className="mb-2 text-sm font-medium">
                ⚠ RFP 텍스트가 너무 짧음 (200자 미만)
              </p>
              <p className="text-[11px] text-muted-foreground">
                Brain 매칭을 위해 RFP raw 텍스트 입력 필요. Express → RFP
                업로드/붙여넣기 후 다시 접속.
              </p>
              <Link
                href={`/projects/${project.id}/express`}
                className="mt-3 inline-block rounded border bg-primary px-3 py-1 text-xs text-white hover:bg-primary/90"
              >
                Express 로 이동
              </Link>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-6">
              <p className="mb-2 text-sm font-medium text-red-700">
                ❌ Brain 매칭 실패
              </p>
              <p className="text-[11px] text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        ) : panelProps ? (
          <BrainPanel {...panelProps} />
        ) : null}
      </div>
    </div>
  )
}

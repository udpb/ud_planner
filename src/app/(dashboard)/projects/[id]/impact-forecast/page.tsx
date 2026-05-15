/**
 * /projects/[id]/impact-forecast — Wave M4 (2026-05-15)
 *
 * 사전 임팩트 forecast 상세 + PM 보정.
 *
 * 서버 컴포넌트가 forecast + 프로젝트 메타 로드 → 클라이언트로 전달.
 * 클라이언트가 inline 보정 폼 + "다시 계산" + "확정 (lock)" 액션 제공.
 */

import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { isImpactDbConfigured, listActiveCategories } from '@/lib/impact/db'
import { ImpactForecastClient } from './forecast-client'
import type { ForecastItemWithMeta, BreakdownEntry } from '@/lib/impact/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: '사전 임팩트 리포트 | UD-Ops' }

interface Params {
  params: Promise<{ id: string }>
}

export default async function ImpactForecastPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id: projectId } = await params

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      client: true,
      sroiCountry: true,
      totalBudgetVat: true,
      impactForecast: true,
    },
  })
  if (!project) notFound()

  const configured = isImpactDbConfigured()
  let categories: Awaited<ReturnType<typeof listActiveCategories>> = []
  if (configured) {
    try {
      categories = await listActiveCategories()
    } catch (err) {
      console.warn('[impact-forecast page] 카테고리 로드 실패:', err)
    }
  }

  const forecast = project.impactForecast
  const items = (forecast?.itemsJson as unknown as ForecastItemWithMeta[]) ?? []
  const breakdown = (forecast?.breakdownJson as unknown as BreakdownEntry[]) ?? []

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title={`📊 사전 임팩트 리포트 — ${project.name}`} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-4 px-6 py-4">
          <Link
            href={`/projects/${projectId}/express`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Express 로 돌아가기
          </Link>

          {!configured && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>IMPACT_MEASUREMENT_DATABASE_URL 미설정</strong> — Vercel
              환경변수에 read-only Supabase 자격증명을 추가하면 사전 임팩트
              계산이 자동으로 시작됩니다. (시스템 관리자에게 요청)
            </div>
          )}

          {!forecast && configured && (
            <div className="rounded-md border bg-muted/30 p-4 text-sm">
              <p className="font-medium">아직 사전 임팩트 리포트가 없습니다.</p>
              <p className="mt-1 text-muted-foreground">
                Express 에서 1차본을 승인하면 자동으로 생성됩니다. 또는 아래
                버튼으로 수동 트리거.
              </p>
            </div>
          )}

          <ImpactForecastClient
            projectId={projectId}
            country={project.sroiCountry}
            totalBudgetVat={project.totalBudgetVat}
            initialForecast={
              forecast
                ? {
                    id: forecast.id,
                    country: forecast.country,
                    totalSocialValue: Number(forecast.totalSocialValue),
                    beneficiaryCount: forecast.beneficiaryCount,
                    calibration: forecast.calibration,
                    calibrationNote: forecast.calibrationNote,
                    generatedAt: forecast.generatedAt.toISOString(),
                    items,
                    breakdown,
                  }
                : null
            }
            categories={categories.map((c) => ({
              id: c.id,
              name: c.name,
              impactType: c.impactType?.name ?? '',
              formulaVariables: c.formulaVariables,
            }))}
            configured={configured}
          />
        </div>
      </div>
    </div>
  )
}

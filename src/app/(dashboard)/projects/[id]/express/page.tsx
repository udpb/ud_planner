/**
 * Express 단일 화면 진입 (Phase L Wave L2, ADR-011)
 *
 * 2026-05-20 (Wave V / F0): Feature flag EXPRESS_PARADIGM_V3 가 ON 이면
 * `/projects/[id]` 로 redirect (통합 페이지). flag OFF 면 기존 ExpressShell.
 *
 * 데이터 로드 로직은 `src/lib/express/load-express-props.ts` 로 추출 — V3
 * 통합 페이지 (page.tsx) 와 공유. 회귀 0.
 *
 * 관련: docs/architecture/express-mode.md §3.1, ADR-015
 */

import { redirect, notFound } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { ExpressShell } from '@/components/express/ExpressShell'
import { isExpressParadigmV3 } from '@/lib/feature-flags'
import { loadExpressInitialProps } from '@/lib/express/load-express-props'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

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
  return { title: `Express — ${project?.name ?? '프로젝트'}` }
}

export default async function ExpressPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Wave V / F0 — flag ON 이면 통합 페이지로 redirect.
  if (isExpressParadigmV3()) {
    redirect(`/projects/${id}`)
  }

  // flag OFF — 기존 ExpressShell 그대로 (회귀 0).
  const props = await loadExpressInitialProps(id)
  if (!props) notFound()

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title={`${props.projectName} · Express`} />
      <ExpressShell {...props} />
    </div>
  )
}

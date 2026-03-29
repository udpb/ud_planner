import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'
import { SroiCalculator } from './sroi-calculator'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'SROI 계산기' }

async function getData() {
  const [proxies, projects] = await Promise.all([
    prisma.sroiProxy.findMany({ where: { isActive: true }, orderBy: [{ country: 'asc' }, { impactType: 'asc' }] }),
    prisma.project.findMany({
      where: { status: { in: ['IN_PROGRESS', 'COMPLETED', 'SUBMITTED'] } },
      select: { id: true, name: true, client: true, totalBudgetVat: true, kpiTargets: true, sroiForecast: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ])
  return { proxies, projects }
}

export default async function SroiPage() {
  const { proxies, projects } = await getData()
  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="SROI 계산기" />
      <div className="flex-1 overflow-y-auto p-6">
        <SroiCalculator proxies={proxies} projects={projects} />
      </div>
    </div>
  )
}

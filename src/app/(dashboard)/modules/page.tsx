import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: '교육 모듈' }

const CATEGORY_LABEL: Record<string, string> = {
  TECH_EDU: '기술교육', STARTUP_EDU: '창업교육', CAPSTONE: '캡스톤/해커톤',
  MENTORING: '멘토링', NETWORKING: '네트워킹', EVENT: '이벤트',
  ACTION_WEEK: 'Action Week', SPECIAL_LECTURE: '특강',
}
const METHOD_LABEL: Record<string, string> = {
  LECTURE: '강의', WORKSHOP: '워크숍', PRACTICE: '실습',
  MENTORING: '멘토링', MIXED: '혼합', ACTION_WEEK: 'Action Week', ONLINE: '온라인',
}
const DIFFICULTY_LABEL: Record<string, string> = {
  INTRO: '입문', MID: '중급', ADVANCED: '심화',
}

interface SearchParams { q?: string; category?: string }

async function getModules(params: SearchParams) {
  const where: any = { isActive: true }
  if (params.category) where.category = params.category
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: 'insensitive' } },
      { moduleCode: { contains: params.q, mode: 'insensitive' } },
      { keywordTags: { has: params.q } },
    ]
  }
  return prisma.module.findMany({
    where,
    select: {
      id: true, moduleCode: true, name: true, category: true,
      method: true, durationHours: true, difficulty: true, keywordTags: true,
      targetStages: true, isTheory: true, aiRatio: true,
      _count: { select: { curriculumItems: true } },
    },
    orderBy: [{ category: 'asc' }, { moduleCode: 'asc' }],
  })
}

export default async function ModulesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const modules = await getModules(params)

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="교육 모듈" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <form className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={params.q} placeholder="모듈명, 코드, 태그 검색..." className="pl-9" />
            </div>
            <select
              name="category"
              defaultValue={params.category}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">전체 카테고리</option>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <Button type="submit" size="sm">검색</Button>
          </form>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">총 <strong>{modules.length}</strong>개 모듈</p>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">코드</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">모듈명</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">카테고리</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">방식</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">시간</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">난이도</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">대상 단계</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">AI비율</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">사용횟수</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-muted-foreground">
                        모듈이 없습니다. <code className="text-xs">npm run db:seed</code> 를 실행해주세요.
                      </td>
                    </tr>
                  ) : (
                    modules.map((m) => (
                      <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{m.moduleCode}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{m.name}</div>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {m.keywordTags.slice(0, 3).map((t) => (
                              <span key={t} className="text-xs text-muted-foreground">#{t}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">{CATEGORY_LABEL[m.category] ?? m.category}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {METHOD_LABEL[m.method] ?? m.method}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{m.durationHours}h</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{DIFFICULTY_LABEL[m.difficulty] ?? m.difficulty}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {m.targetStages.map((s) => (
                              <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">
                          {m.aiRatio > 0 ? `${m.aiRatio}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {m._count.curriculumItems}회
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

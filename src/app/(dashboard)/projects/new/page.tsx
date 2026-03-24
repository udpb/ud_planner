import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export const metadata = { title: '새 프로젝트' }

async function createProject(formData: FormData) {
  'use server'

  const name = formData.get('name') as string
  const client = formData.get('client') as string
  const projectType = (formData.get('projectType') as string) || 'B2G'
  const totalBudgetVat = formData.get('totalBudgetVat')
    ? Number(formData.get('totalBudgetVat'))
    : null
  const eduStartDate = formData.get('eduStartDate')
    ? new Date(formData.get('eduStartDate') as string)
    : null
  const eduEndDate = formData.get('eduEndDate')
    ? new Date(formData.get('eduEndDate') as string)
    : null

  if (!name || !client) throw new Error('프로젝트명과 발주기관은 필수입니다.')

  const project = await prisma.project.create({
    data: {
      name,
      client,
      projectType: projectType as any,
      totalBudgetVat,
      eduStartDate,
      eduEndDate,
      status: 'DRAFT',
    },
  })

  revalidatePath('/projects')
  redirect(`/projects/${project.id}`)
}

export default function NewProjectPage() {
  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="새 프로젝트" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle>프로젝트 기본 정보</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createProject} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">프로젝트명 *</Label>
                  <Input id="name" name="name" placeholder="예: 2026 청년창업사관학교 위탁운영" required />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="client">발주기관 *</Label>
                  <Input id="client" name="client" placeholder="예: 중소벤처기업부" required />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="projectType">사업 유형</Label>
                  <select
                    id="projectType"
                    name="projectType"
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="B2G">B2G (정부/공공)</option>
                    <option value="B2B">B2B (기업)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="totalBudgetVat">총 예산 (VAT 포함, 원)</Label>
                  <Input
                    id="totalBudgetVat"
                    name="totalBudgetVat"
                    type="number"
                    placeholder="예: 500000000"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="eduStartDate">교육 시작일</Label>
                    <Input id="eduStartDate" name="eduStartDate" type="date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="eduEndDate">교육 종료일</Label>
                    <Input id="eduEndDate" name="eduEndDate" type="date" />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="submit" className="flex-1">프로젝트 생성</Button>
                  <a href="/projects">
                    <Button type="button" variant="outline">취소</Button>
                  </a>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

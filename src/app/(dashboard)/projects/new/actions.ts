'use server'

/**
 * 신규 프로젝트 생성 server action
 *
 * Phase L (ADR-011) 갱신:
 *  - RFP 업로드를 우선 흐름으로 — name·client·totalBudgetVat·eduStartDate·eduEndDate
 *    가 RFP 파싱 결과에서 자동 채워짐 (사용자 수정 가능)
 *  - rfpRaw + rfpParsed 같이 저장 → /express 진입 시 RFP 이미 있는 상태
 *  - expressActive=true 로 사이드바·진입점이 자동으로 Express 화면
 */

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { RfpParsed } from '@/lib/claude'

export async function createProjectAction(formData: FormData): Promise<void> {
  const name = (formData.get('name') as string)?.trim() ?? ''
  const client = (formData.get('client') as string)?.trim() ?? ''
  const projectType = (formData.get('projectType') as string) || 'B2G'

  const rawBudget = formData.get('totalBudgetVat')
  const totalBudgetVat = rawBudget && String(rawBudget).trim() !== '' ? Number(rawBudget) : null

  const eduStartRaw = formData.get('eduStartDate') as string | null
  const eduEndRaw = formData.get('eduEndDate') as string | null
  const eduStartDate = eduStartRaw ? new Date(eduStartRaw) : null
  const eduEndDate = eduEndRaw ? new Date(eduEndRaw) : null

  // RFP 텍스트·파싱 결과 (NewProjectForm 의 hidden input 에서)
  const rfpRaw = ((formData.get('rfpRaw') as string) ?? '').trim()
  const rfpParsedJson = (formData.get('rfpParsed') as string) ?? ''
  let rfpParsed: RfpParsed | null = null
  if (rfpParsedJson) {
    try {
      rfpParsed = JSON.parse(rfpParsedJson) as RfpParsed
    } catch {
      // 파싱 실패 시 무시 (RFP 없이 진행)
      rfpParsed = null
    }
  }

  if (!name || !client) {
    throw new Error('프로젝트명과 발주기관은 필수입니다.')
  }

  // RFP 가 있을 때 supplyPrice 도 같이 저장 (Phase D, RfpParsed.supplyPrice)
  const supplyPrice = rfpParsed?.supplyPrice ?? null

  const project = await prisma.project.create({
    data: {
      name,
      client,
      projectType: projectType as 'B2G' | 'B2B',
      totalBudgetVat,
      supplyPrice,
      eduStartDate,
      eduEndDate,
      status: 'DRAFT',
      // Phase L (ADR-011): 신규 = Express 기본 진입
      expressActive: true,
      // Phase D / Phase L: RFP 가 있으면 같이 저장 → /express 에서 자동 첫 턴
      ...(rfpRaw ? { rfpRaw } : {}),
      ...(rfpParsed ? { rfpParsed: rfpParsed as unknown as object } : {}),
    },
  })

  revalidatePath('/projects')
  redirect(`/projects/${project.id}/express`)
}

/**
 * GET /api/projects/[id]/export-budget-template
 *
 * 발주처 budget-template (16 시트 중 메인 2 시트) 다운로드 — Phase J2.
 *
 * 시트:
 *   1. "1-1-1. 주관부서" (내부 사업성 검토용)
 *   2. "1-2. 외부용" (발주처 제출 견적서, 일반관리비·기업이윤·VAT 포함)
 *
 * docs/architecture/budget-template.md §3.1·3.2 매핑 데이터 기반.
 * 시트 #16 (2. 내부용 세부) 는 후속.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildBudgetTemplateExcel } from '@/lib/excel-export/render-budget-template'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        budget: {
          include: { items: { orderBy: { wbsCode: 'asc' } } },
        },
        coachAssignments: {
          include: { coach: { select: { name: true, organization: true } } },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const buffer = await buildBudgetTemplateExcel({
      project: {
        name: project.name,
        client: project.client,
        totalBudgetVat: project.totalBudgetVat,
        supplyPrice: project.supplyPrice,
        eduStartDate: project.eduStartDate,
        eduEndDate: project.eduEndDate,
      },
      budget: project.budget
        ? {
            pcTotal: project.budget.pcTotal,
            acTotal: project.budget.acTotal,
            margin: project.budget.margin,
            marginRate: project.budget.marginRate,
            items: project.budget.items.map((i) => ({
              type: i.type,
              category: i.category,
              name: i.name,
              unit: i.unit,
              unitPrice: i.unitPrice,
              quantity: i.quantity,
              amount: i.amount,
              notes: i.notes,
            })),
          }
        : null,
      coachAssignments: project.coachAssignments.map((a) => ({
        coach: { name: a.coach.name, organization: a.coach.organization },
        role: a.role,
        sessions: a.sessions,
        totalHours: undefined,
        agreedRate: a.agreedRate,
        totalFee: a.totalFee,
      })),
    })

    const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
    const filename = `${safeName}_발주처템플릿.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[export-budget-template] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

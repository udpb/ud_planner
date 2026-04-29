/**
 * GET /api/projects/[id]/export-excel
 *
 * Project + 관련 데이터 → 5 시트 .xlsx 파일 다운로드.
 * Phase J PoC (2026-04-29).
 *
 * 시트:
 *   1. 프로젝트 요약
 *   2. 커리큘럼 (회차별)
 *   3. 코치 배정
 *   4. 예산 (PC/AC)
 *   5. SROI Forecast
 *
 * 발주처 16 시트 매핑은 후속 (docs/architecture/budget-template.md).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildProjectExcel } from '@/lib/excel-export/render'

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
        curriculum: { orderBy: { sessionNo: 'asc' } },
        coachAssignments: {
          include: {
            coach: { select: { name: true, organization: true } },
          },
        },
        budget: {
          include: {
            items: { orderBy: { wbsCode: 'asc' } },
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const buffer = await buildProjectExcel({
      project: {
        id: project.id,
        name: project.name,
        client: project.client,
        projectType: project.projectType,
        totalBudgetVat: project.totalBudgetVat,
        supplyPrice: project.supplyPrice,
        eduStartDate: project.eduStartDate,
        eduEndDate: project.eduEndDate,
        proposalConcept: project.proposalConcept,
        proposalBackground: project.proposalBackground,
        keyPlanningPoints: project.keyPlanningPoints,
        sroiForecast: project.sroiForecast,
        sroiCountry: project.sroiCountry,
      },
      curriculum: project.curriculum.map((c) => ({
        sessionNo: c.sessionNo,
        title: c.title,
        durationHours: c.durationHours,
        isTheory: c.isTheory,
        isActionWeek: c.isActionWeek,
        venue: c.venue,
        notes: c.notes,
        date: c.date,
      })),
      coachAssignments: project.coachAssignments.map((a) => ({
        coach: { name: a.coach.name, organization: a.coach.organization },
        role: a.role,
        sessions: a.sessions,
        agreedRate: a.agreedRate,
        totalFee: a.totalFee,
        confirmed: a.confirmed,
      })),
      budget: project.budget
        ? {
            pcTotal: project.budget.pcTotal,
            acTotal: project.budget.acTotal,
            margin: project.budget.margin,
            marginRate: project.budget.marginRate,
            items: project.budget.items.map((i) => ({
              wbsCode: i.wbsCode,
              type: i.type,
              category: i.category,
              name: i.name,
              unit: i.unit,
              unitPrice: i.unitPrice,
              quantity: i.quantity,
              amount: i.amount,
            })),
          }
        : null,
    })

    // 파일명 — 한글·공백 OK 한 utf-8 인코딩
    const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
    const filename = `${safeName}_제안자료.xlsx`

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
    console.error('[/api/projects/{id}/export-excel] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

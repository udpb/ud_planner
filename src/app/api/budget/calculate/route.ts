import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// CoachAssignment role → payRole 매핑 (coach-finder RATE_TABLE 기준)
const ROLE_TO_PAY_ROLE: Record<string, string> = {
  MAIN_COACH: '코칭',
  SUB_COACH: '코칭',
  LECTURER: '강의',
  SUB_LECTURER: '강의',
  SPECIAL_LECTURER: '강의',
  JUDGE: '강의',
  PM_OPS: '운영',
}
const ROLE_TO_PAY_GRADE: Record<string, string> = {
  MAIN_COACH: '메인',
  SUB_COACH: '보조',
  LECTURER: '메인',
  SUB_LECTURER: '보조',
  SPECIAL_LECTURER: '특별지급',
  JUDGE: '보조',
  PM_OPS: '메인',
}

// 세금 공제율
const TAX_RATE: Record<string, number> = {
  BUSINESS: 0.033,  // 사업소득세 3.3%
  OTHER: 0.033,
}

export async function POST(req: NextRequest) {
  try {
    const { projectId } = await req.json()
    if (!projectId) return NextResponse.json({ error: 'projectId 필요' }, { status: 400 })

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        coachAssignments: {
          include: { coach: { select: { id: true, name: true, tier: true, taxType: true } } },
        },
        budget: { include: { items: true } },
        curriculum: true,
      },
    })
    if (!project) return NextResponse.json({ error: '프로젝트 없음' }, { status: 404 })

    // ── PC 산출: 코치 배정 기반 ──────────────────────────────
    const pcItems = project.coachAssignments.map((a) => {
      const taxRate = TAX_RATE[a.coach.taxType] ?? 0.033
      const grossFee = a.totalFee ?? (a.agreedRate ?? 0) * (a.totalHours ?? a.sessions * a.hoursPerSession)
      const netFee = Math.round(grossFee * (1 - taxRate))

      return {
        coachId: a.coach.id,
        coachName: a.coach.name,
        role: a.role,
        payRole: ROLE_TO_PAY_ROLE[a.role] ?? '코칭',
        payGrade: ROLE_TO_PAY_GRADE[a.role] ?? '메인',
        sessions: a.sessions,
        hoursPerSession: a.hoursPerSession,
        totalHours: a.totalHours ?? a.sessions * a.hoursPerSession,
        agreedRate: a.agreedRate ?? 0,
        grossFee,
        taxRate,
        netFee,
        wbsCode: `PC-COACH-${a.coach.id.slice(0, 6)}`,
      }
    })
    const pcTotal = pcItems.reduce((s, i) => s + i.grossFee, 0)

    // ── AC 산출: 기존 BudgetItem(AC) 또는 자동 추정 ──────────
    const existingAcItems = project.budget?.items.filter((i) => i.type === 'AC') ?? []

    let acItems = existingAcItems.map((i) => ({
      id: i.id,
      wbsCode: i.wbsCode,
      category: i.category,
      name: i.name,
      unit: i.unit ?? '',
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      amount: i.amount,
      isEstimated: false,
    }))

    // 기존 AC 항목 없으면 세션 수 기반 기본 추정
    if (acItems.length === 0) {
      const sessionCount = project.curriculum.filter((c) => !c.isCoaching1on1).length
      const participantCount = (project.rfpParsed as any)?.targetCount ?? 30

      const estimates = [
        { wbsCode: 'AC-06', category: '식음료비', name: '교육 중 다과비', unit: '인·회', unitPrice: 10000, quantity: participantCount * sessionCount },
        { wbsCode: 'AC-11', category: '장소비', name: '교육장 임차비', unit: '일', unitPrice: 500000, quantity: Math.max(1, Math.ceil(sessionCount / 2)) },
        { wbsCode: 'AC-08', category: '교통비', name: '강사 교통비 (서울)', unit: '인·회', unitPrice: 30000, quantity: project.coachAssignments.length * sessionCount },
      ]

      acItems = estimates.map((e) => ({
        id: '',
        wbsCode: e.wbsCode,
        category: e.category,
        name: e.name,
        unit: e.unit,
        unitPrice: e.unitPrice,
        quantity: e.quantity,
        amount: e.unitPrice * e.quantity,
        isEstimated: true,
      }))
    }

    const acTotal = acItems.reduce((s, i) => s + i.amount, 0)

    // ── 마진 산출 ────────────────────────────────────────────
    // 2026-05-03 fix: supplyPrice 가 null 이면 totalBudgetVat / 1.1 로 자동 계산
    // (대부분 프로젝트가 RFP 에서 totalBudgetVat 만 추출, supplyPrice 는 별도 입력 필요).
    // 이 fallback 없이 0 이면 margin = 0 - PC - AC = 음수 표시되는 버그 → 운영자 혼란.
    const supplyPrice =
      project.supplyPrice ??
      (project.totalBudgetVat ? Math.round(project.totalBudgetVat / 1.1) : 0)
    const margin = supplyPrice - pcTotal - acTotal
    const marginRate = supplyPrice > 0 ? (margin / supplyPrice) * 100 : 0

    // ── Budget / BudgetItem 저장 ─────────────────────────────
    const budget = await prisma.budget.upsert({
      where: { projectId },
      create: {
        projectId,
        pcTotal,
        acTotal,
        margin,
        marginRate,
      },
      update: {
        pcTotal,
        acTotal,
        margin,
        marginRate,
      },
    })

    // PC 아이템 저장 (기존 PC 아이템 교체)
    await prisma.budgetItem.deleteMany({ where: { budgetId: budget.id, type: 'PC' } })
    if (pcItems.length > 0) {
      await prisma.budgetItem.createMany({
        data: pcItems.map((i) => ({
          budgetId: budget.id,
          wbsCode: i.wbsCode,
          type: 'PC',
          category: '외부인건비',
          name: `${i.coachName} (${i.payRole}/${i.payGrade})`,
          unit: '건',
          unitPrice: i.grossFee,
          quantity: 1,
          amount: i.grossFee,
          notes: `세후 ${i.netFee.toLocaleString()}원`,
        })),
      })
    }

    // AC 추정 아이템 저장 (기존 없을 때만)
    if (existingAcItems.length === 0 && acItems.length > 0) {
      await prisma.budgetItem.deleteMany({ where: { budgetId: budget.id, type: 'AC' } })
      await prisma.budgetItem.createMany({
        data: acItems.map((i) => ({
          budgetId: budget.id,
          wbsCode: i.wbsCode,
          type: 'AC',
          category: i.category,
          name: i.name,
          unit: i.unit,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
          amount: i.amount,
          notes: '자동 추정 (수정 가능)',
        })),
      })
    }

    return NextResponse.json({
      budget: {
        pcTotal,
        acTotal,
        margin,
        marginRate,
        marginWarning: marginRate < 10,
        supplyPrice,
        totalBudgetVat: project.totalBudgetVat ?? 0,
      },
      pcItems,
      acItems,
    })
  } catch (err: any) {
    console.error('Budget calculate error:', err)
    return NextResponse.json({ error: err.message ?? '계산 실패' }, { status: 500 })
  }
}

// AC 항목 개별 수정
export async function PATCH(req: NextRequest) {
  try {
    const { itemId, unitPrice, quantity } = await req.json()
    const amount = Math.round(unitPrice * quantity)
    const item = await prisma.budgetItem.update({
      where: { id: itemId },
      data: { unitPrice, quantity, amount, notes: undefined },
    })

    // Budget 합계 재계산
    const budgetItems = await prisma.budgetItem.findMany({ where: { budgetId: item.budgetId } })
    const pcTotal = budgetItems.filter((i) => i.type === 'PC').reduce((s, i) => s + i.amount, 0)
    const acTotal = budgetItems.filter((i) => i.type === 'AC').reduce((s, i) => s + i.amount, 0)
    const budget = await prisma.budget.findUnique({ where: { id: item.budgetId }, select: { projectId: true } })
    const project = await prisma.project.findUnique({
      where: { id: budget!.projectId },
      select: { supplyPrice: true, totalBudgetVat: true },
    })
    // 2026-05-03 fix: supplyPrice null 이면 totalBudgetVat / 1.1 fallback (POST 와 동일)
    const supplyPrice =
      project?.supplyPrice ??
      (project?.totalBudgetVat ? Math.round(project.totalBudgetVat / 1.1) : 0)
    const margin = supplyPrice - pcTotal - acTotal
    const marginRate = supplyPrice > 0 ? (margin / supplyPrice) * 100 : 0

    await prisma.budget.update({
      where: { id: item.budgetId },
      data: { pcTotal, acTotal, margin, marginRate },
    })

    return NextResponse.json({ ok: true, item, pcTotal, acTotal, margin, marginRate })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

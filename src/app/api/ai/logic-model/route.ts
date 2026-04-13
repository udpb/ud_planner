import { NextRequest, NextResponse } from 'next/server'
import { buildLogicModel, type ExternalResearch } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const { projectId, summary, objectives, impactGoal } = await req.json()

    if (!summary || !objectives?.length) {
      return NextResponse.json({ error: '사업 요약과 목표가 필요합니다.' }, { status: 400 })
    }

    // 저장된 외부 리서치가 있으면 주입 (티키타카)
    let externalResearch: ExternalResearch[] | undefined
    if (projectId) {
      const proj = await prisma.project.findUnique({
        where: { id: projectId },
        select: { externalResearch: true },
      })
      const saved = (proj?.externalResearch ?? []) as unknown as ExternalResearch[]
      if (saved.length > 0) externalResearch = saved
    }

    const logicModel = await buildLogicModel(summary, objectives, impactGoal ?? '', externalResearch)

    if (projectId) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          impactGoal: logicModel.impactGoal,
          logicModel: logicModel as any,
        },
      })
    }

    return NextResponse.json({ logicModel })
  } catch (err: any) {
    console.error('Logic Model 에러:', err)
    return NextResponse.json({ error: err.message ?? '생성 실패' }, { status: 500 })
  }
}

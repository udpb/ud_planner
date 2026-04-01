import { NextRequest, NextResponse } from 'next/server'
import { buildLogicModel } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const { projectId, summary, objectives, impactGoal } = await req.json()

    if (!summary || !objectives?.length) {
      return NextResponse.json({ error: '사업 요약과 목표가 필요합니다.' }, { status: 400 })
    }

    const logicModel = await buildLogicModel(summary, objectives, impactGoal ?? '')

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

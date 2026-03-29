import { NextRequest, NextResponse } from 'next/server'
import { suggestCurriculum } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const { projectId, rfpParsed, logicModel } = await req.json()

    if (!rfpParsed || !logicModel) {
      return NextResponse.json({ error: 'RFP 파싱 결과와 Logic Model이 필요합니다.' }, { status: 400 })
    }

    const moduleCodes = await prisma.module.findMany({
      where: { isActive: true },
      select: { moduleCode: true },
    })

    const curriculum = await suggestCurriculum(rfpParsed, logicModel, moduleCodes.map((m) => m.moduleCode))

    // 커리큘럼 아이템으로 저장
    if (projectId) {
      // 기존 AI 추천 아이템 삭제 후 재생성
      await prisma.curriculumItem.deleteMany({ where: { projectId, moduleId: null } })
      await prisma.curriculumItem.createMany({
        data: curriculum.sessions.map((s, i) => ({
          projectId,
          sessionNo: s.sessionNo,
          title: s.title,
          durationHours: s.durationHours,
          isTheory: s.isTheory,
          isActionWeek: s.isActionWeek,
          notes: s.notes,
          order: i,
        })),
      })
    }

    return NextResponse.json({ curriculum })
  } catch (err: any) {
    console.error('커리큘럼 생성 에러:', err)
    return NextResponse.json({ error: err.message ?? '생성 실패' }, { status: 500 })
  }
}

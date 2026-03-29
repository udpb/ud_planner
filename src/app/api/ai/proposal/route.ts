import { NextRequest, NextResponse } from 'next/server'
import { generateProposalSection, PROPOSAL_SECTIONS } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const { projectId, sectionNo } = await req.json()

    if (!projectId || !sectionNo) {
      return NextResponse.json({ error: 'projectId, sectionNo 필요' }, { status: 400 })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { proposalSections: { orderBy: { sectionNo: 'asc' } } },
    })

    if (!project?.rfpParsed || !project?.logicModel) {
      return NextResponse.json({ error: 'RFP 파싱 및 Logic Model 먼저 생성하세요.' }, { status: 400 })
    }

    const rfpParsed = project.rfpParsed as any
    const logicModel = project.logicModel as any
    const previousSections = project.proposalSections
      .filter((s) => s.sectionNo < sectionNo)
      .map((s) => ({ no: s.sectionNo, title: s.title, content: s.content }))

    const content = await generateProposalSection(sectionNo, {
      rfpParsed,
      logicModel,
      previousSections,
    })

    const section = PROPOSAL_SECTIONS.find((s) => s.no === sectionNo)!

    // 버전 관리: 기존 버전 찾기
    const existing = await prisma.proposalSection.findFirst({
      where: { projectId, sectionNo },
      orderBy: { version: 'desc' },
    })
    const newVersion = (existing?.version ?? 0) + 1

    const saved = await prisma.proposalSection.create({
      data: {
        projectId,
        sectionNo,
        title: section.title,
        content,
        version: newVersion,
      },
    })

    return NextResponse.json({ section: saved })
  } catch (err: any) {
    console.error('제안서 생성 에러:', err)
    return NextResponse.json({ error: err.message ?? '생성 실패' }, { status: 500 })
  }
}

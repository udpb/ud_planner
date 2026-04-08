import { NextRequest, NextResponse } from 'next/server'
import { generateProposalSection, PROPOSAL_SECTIONS, anthropic, CLAUDE_MODEL } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

function safeParseJson<T>(raw: string): T {
  let s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  let start: number, end: number
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    start = arrStart; end = s.lastIndexOf(']')
  } else {
    start = objStart; end = s.lastIndexOf('}')
  }
  if (start === -1 || end === -1 || end <= start) throw new Error('JSON not found')
  return JSON.parse(s.slice(start, end + 1))
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, sectionNo } = await req.json()

    if (!projectId || !sectionNo) {
      return NextResponse.json({ error: 'projectId, sectionNo 필요' }, { status: 400 })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        proposalSections: { orderBy: { sectionNo: 'asc' } },
        curriculum: { orderBy: { sessionNo: 'asc' } },
      },
    })

    if (!project?.rfpParsed || !project?.logicModel) {
      return NextResponse.json({ error: 'RFP 파싱 및 Logic Model 먼저 생성하세요.' }, { status: 400 })
    }

    const rfpParsed = project.rfpParsed as any
    const logicModel = project.logicModel as any
    const previousSections = project.proposalSections
      .filter((s) => s.sectionNo < sectionNo)
      .map((s) => ({ no: s.sectionNo, title: s.title, content: s.content }))

    // IMPACT 18모듈 (섹션 3, 4 작성 시 사용)
    const impactModules = await prisma.impactModule.findMany({
      where: { isActive: true },
      orderBy: [{ stageOrder: 'asc' }, { moduleOrder: 'asc' }],
      select: {
        moduleCode: true,
        moduleName: true,
        coreQuestion: true,
        workshopOutputs: true,
        durationMinutes: true,
        stage: true,
      },
    })

    // 확정된 커리큘럼 (섹션 4, 5, 7 작성 시 사용)
    const curriculumSessions = project.curriculum.map((c) => ({
      sessionNo: c.sessionNo,
      title: c.title,
      durationHours: c.durationHours,
      isTheory: c.isTheory,
      isActionWeek: c.isActionWeek,
      isCoaching1on1: c.isCoaching1on1,
      impactModuleCode: c.impactModuleCode,
    }))

    const content = await generateProposalSection(sectionNo, {
      rfpParsed,
      logicModel,
      previousSections,
      impactModules,
      curriculumSessions,
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

// PATCH: 제안서 섹션 콘텐츠 직접 수정
export async function PATCH(req: NextRequest) {
  try {
    const { sectionId, content } = await req.json()
    if (!sectionId || content === undefined) {
      return NextResponse.json({ error: 'sectionId와 content가 필요합니다.' }, { status: 400 })
    }

    const updated = await prisma.proposalSection.update({
      where: { id: sectionId },
      data: { content, updatedAt: new Date() },
    })

    return NextResponse.json({ section: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? '수정 실패' }, { status: 500 })
  }
}

// PUT: 평가위원 시뮬레이션 — AI가 현재 제안서를 평가 배점 기준으로 채점
export async function PUT(req: NextRequest) {
  try {
    const { projectId } = await req.json()
    if (!projectId) {
      return NextResponse.json({ error: 'projectId가 필요합니다.' }, { status: 400 })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { proposalSections: { orderBy: { sectionNo: 'asc' } } },
    })
    if (!project) return NextResponse.json({ error: '프로젝트 없음' }, { status: 404 })

    const rfpParsed = project.rfpParsed as any
    const evalCriteria = rfpParsed?.evalCriteria ?? []

    if (evalCriteria.length === 0) {
      return NextResponse.json({ error: '평가 배점이 입력되지 않아 시뮬레이션할 수 없습니다.' }, { status: 400 })
    }

    const sectionsText = project.proposalSections
      .map((s) => `[섹션 ${s.sectionNo}. ${s.title}]\n${s.content.slice(0, 1500)}`)
      .join('\n\n')

    const evalText = evalCriteria
      .map((e: any) => `- ${e.item}: ${e.score}점`)
      .join('\n')

    const totalMaxScore = evalCriteria.reduce((s: number, e: any) => s + e.score, 0)

    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `당신은 교육 사업 제안서를 평가하는 심사위원입니다.
아래 제안서 내용을 평가 배점 기준으로 채점하고, 개선 포인트를 제시하세요.

[평가 배점 기준] (총 ${totalMaxScore}점)
${evalText}

[제안서 내용]
${sectionsText}

반드시 아래 JSON만 반환하세요:
{
  "totalScore": 예상 총점(숫자),
  "maxScore": ${totalMaxScore},
  "items": [
    {
      "criteria": "평가항목명",
      "maxScore": 배점,
      "score": 예상점수,
      "strength": "잘된 점 (1문장)",
      "improvement": "개선 포인트 (1문장)"
    }
  ],
  "overallFeedback": "전체 피드백 (2~3문장)",
  "topPriority": "가장 먼저 개선해야 할 1가지"
}`,
        },
      ],
    })

    const raw = (msg.content[0] as any).text.trim()
    const simulation = safeParseJson<any>(raw)

    return NextResponse.json({ simulation })
  } catch (err: any) {
    console.error('평가 시뮬레이션 에러:', err)
    return NextResponse.json({ error: err.message ?? '시뮬레이션 실패' }, { status: 500 })
  }
}

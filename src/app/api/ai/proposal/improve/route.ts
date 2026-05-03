import { NextRequest, NextResponse } from 'next/server'
import {
  PROPOSAL_SECTIONS,
  formatExternalResearch,
  formatStrategicNotes,
  type ExternalResearch,
  type StrategicNotes,
} from '@/lib/claude'
import { invokeAi } from '@/lib/ai-fallback'
import { prisma } from '@/lib/prisma'
import { AI_TOKENS } from '@/lib/ai/config'
import { log } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/ai/proposal/improve
 *
 * PM 피드백을 반영하여 섹션을 부분 재생성.
 * 전략 맥락 + 외부 리서치 + 평가 배점까지 컨텍스트로 함께 주입.
 *
 * Request: { projectId, sectionNo, feedback, keepParts? }
 * - feedback: PM의 구체적 수정 요청 (예: "모집 리스크 대응 방안을 더 구체적으로")
 * - keepParts: 유지할 부분 명시 (예: "첫 문단은 유지하고 나머지를 수정해줘")
 */
export async function POST(req: NextRequest) {
  try {
    const { projectId, sectionNo, feedback, keepParts } = await req.json()

    if (!projectId || !sectionNo || !feedback?.trim()) {
      return NextResponse.json(
        { error: 'projectId, sectionNo, feedback 필요' },
        { status: 400 },
      )
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        proposalSections: { orderBy: { sectionNo: 'asc' } },
      },
    })

    if (!project) {
      return NextResponse.json({ error: '프로젝트 없음' }, { status: 404 })
    }

    const currentSection = project.proposalSections.find((s) => s.sectionNo === sectionNo)
    if (!currentSection) {
      return NextResponse.json({ error: '해당 섹션이 아직 생성되지 않았습니다.' }, { status: 400 })
    }

    const sectionMeta = PROPOSAL_SECTIONS.find((s) => s.no === sectionNo)

    // 전략 맥락
    const strategicNotes = (project as any).strategicNotes as StrategicNotes | null
    const strategyBlock = strategicNotes ? formatStrategicNotes(strategicNotes) : ''

    // 외부 리서치
    const savedResearch = (project as any).externalResearch as ExternalResearch[] | null
    const researchBlock = savedResearch?.length ? formatExternalResearch(savedResearch as unknown as ExternalResearch[]) : ''

    // 평가 배점 (이 섹션과 관련된 것만)
    const rfpParsed = project.rfpParsed as any
    const evalCriteria = rfpParsed?.evalCriteria ?? []
    const evalBlock = evalCriteria.length > 0
      ? `\n[평가 배점 — 이 섹션의 점수를 높이는 데 집중]\n${evalCriteria.map((e: any) => `  - ${e.item}: ${e.score}점`).join('\n')}\n`
      : ''

    // 인접 섹션 요약 (일관성 유지)
    const adjacentSections = project.proposalSections
      .filter((s) => Math.abs(s.sectionNo - sectionNo) <= 1 && s.sectionNo !== sectionNo)
      .map((s) => `[${s.sectionNo}. ${s.title}] ${s.content.slice(0, 300)}...`)
      .join('\n\n')

    // 2026-05-03: anthropic → invokeAi
    const result = await invokeAi({
      prompt: `당신은 교육 사업 제안서 전문 편집자입니다. PM의 피드백을 정밀하게 반영하여 섹션을 개선하세요.
${strategyBlock}${researchBlock}${evalBlock}
[현재 섹션 ${sectionNo}. ${sectionMeta?.title ?? ''}]
${currentSection.content}

${adjacentSections ? `[인접 섹션 — 톤/논리 일관성 유지]\n${adjacentSections}\n` : ''}
═══════════════════════════════════════
[PM 피드백]
${feedback}
${keepParts ? `\n[유지 요청] ${keepParts}` : ''}
═══════════════════════════════════════

개선 원칙:
1. PM이 수정 요청한 부분만 정밀하게 수정하세요. 나머지는 가능한 유지합니다.
2. ${keepParts ? '"유지 요청"에 명시된 부분은 그대로 두세요.' : '기존 구조와 핵심 메시지는 유지합니다.'}
3. 전략적 맥락이 있으면 피드백 반영 시 해당 전략 방향에 맞게 수정하세요.
4. 외부 리서치가 있으면 정량 근거를 강화하는 데 활용하세요.
5. 평가 배점 정보가 있으면 해당 항목의 점수를 높이는 방향으로 보강하세요.
6. 800~1200자 범위를 유지하세요.
7. 개선된 제안서 섹션 내용만 반환하세요 (JSON 아님, 순수 마크다운 텍스트).`,
      maxTokens: AI_TOKENS.LIGHT,
      temperature: 0.4,
      label: 'proposal-improve',
    })

    const improvedContent = result.raw.trim()

    // 새 버전으로 저장
    const newVersion = currentSection.version + 1
    const saved = await prisma.proposalSection.create({
      data: {
        projectId,
        sectionNo,
        title: currentSection.title,
        content: improvedContent,
        version: newVersion,
      },
    })

    return NextResponse.json({ section: saved, previousVersion: currentSection.version })
  } catch (err: any) {
    log.error('proposal-improve', err)
    return NextResponse.json({ error: err.message ?? '개선 실패' }, { status: 500 })
  }
}

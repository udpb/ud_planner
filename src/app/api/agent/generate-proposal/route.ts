/**
 * POST /api/agent/generate-proposal
 *
 * 완성된 PlanningIntent를 받아 7개 제안서 섹션을 순차 생성.
 * derivedStrategy → LogicModel 자동 생성 → 섹션별 generateProposalSection 호출.
 *
 * Request: { intent: PlanningIntent (or PartialPlanningIntent with derivedStrategy) }
 * Response: { sections: Array<{ no, title, content }>, totalLength }
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  buildLogicModel,
  generateProposalSection,
  normalizeLogicModel,
  type RfpParsed,
  type LogicModel,
  type ExternalResearch,
} from '@/lib/claude'

export async function POST(req: NextRequest) {
  try {
    const { intent, externalResearch } = await req.json()
    // externalResearch는 optional — 티키타카 파이프라인에서 PM이 수집한 리서치
    const research = (externalResearch as ExternalResearch[] | undefined)?.length
      ? externalResearch as ExternalResearch[]
      : undefined

    if (!intent?.bidContext?.rfpFacts) {
      return NextResponse.json(
        { error: 'bidContext.rfpFacts가 필요합니다' },
        { status: 400 },
      )
    }
    if (!intent?.derivedStrategy) {
      return NextResponse.json(
        { error: 'derivedStrategy가 필요합니다 (인터뷰 완료 후 호출하세요)' },
        { status: 400 },
      )
    }

    const rfpParsed: RfpParsed = intent.bidContext.rfpFacts
    const ds = intent.derivedStrategy

    // 1. derivedStrategy에서 LogicModel 생성
    const impactGoal = ds.positioning?.oneLiner
      ?? rfpParsed.objectives?.[0]
      ?? `${rfpParsed.projectName} 임팩트 목표`

    let logicModel: LogicModel
    try {
      logicModel = await buildLogicModel(
        rfpParsed.summary,
        rfpParsed.objectives,
        impactGoal,
        research,
      )
    } catch (err: any) {
      console.error('[generate-proposal] LogicModel 생성 실패:', err.message)
      // fallback: 최소 LogicModel (normalizeLogicModel로 string[] → LogicModelItem[] 변환)
      logicModel = normalizeLogicModel({
        impactGoal,
        impact: rfpParsed.objectives.slice(0, 2),
        outcome: ds.keyMessages?.slice(0, 3) ?? [],
        output: rfpParsed.deliverables?.slice(0, 3) ?? [],
        activity: ds.curriculumDirection?.weeklyOutline?.map((w: any) => w.keyActivity) ?? [],
        input: ['전담 PM', '전문 코치진', '교육 운영 인프라'],
      })
    }

    // 2. 커리큘럼 세션 데이터 (derivedStrategy에서 추출)
    const curriculumSessions = ds.curriculumDirection?.weeklyOutline?.map((w: any, i: number) => ({
      sessionNo: i + 1,
      title: w.focus,
      durationHours: 4,
      isTheory: false,
      isActionWeek: (w.keyActivity ?? '').includes('Action') || (w.keyActivity ?? '').includes('MVP'),
      isCoaching1on1: (w.keyActivity ?? '').includes('코칭') || (w.keyActivity ?? '').includes('1:1'),
      objectives: [w.keyActivity],
      impactModuleCode: null,
    })) ?? []

    // 3. 7개 섹션 순차 생성
    const sections: Array<{ no: number; title: string; content: string }> = []
    const sectionTitles = [
      '사업 추진 배경 및 필요성',
      '사업 목표 및 추진 전략',
      '임팩트 로직 모델',
      '교육 커리큘럼 및 운영 계획',
      '코치 및 전문가 구성',
      '성과 지표 및 평가 계획',
      '추진 일정 및 예산 계획',
    ]

    for (let sectionNo = 1; sectionNo <= 7; sectionNo++) {
      try {
        const content = await generateProposalSection(sectionNo, {
          rfpParsed,
          logicModel,
          curriculumSessions,
          previousSections: sections,
          externalResearch: research,
        })
        sections.push({
          no: sectionNo,
          title: sectionTitles[sectionNo - 1],
          content,
        })
      } catch (err: any) {
        console.error(`[generate-proposal] 섹션 ${sectionNo} 실패:`, err.message)
        sections.push({
          no: sectionNo,
          title: sectionTitles[sectionNo - 1],
          content: `[섹션 생성 실패: ${err.message}]`,
        })
      }
    }

    const totalLength = sections.reduce((sum, s) => sum + s.content.length, 0)

    return NextResponse.json({
      sections,
      totalLength,
      logicModel,
    })
  } catch (err: any) {
    console.error('[POST /api/agent/generate-proposal] error:', err)
    return NextResponse.json(
      { error: err.message ?? '제안서 생성 실패' },
      { status: 500 },
    )
  }
}

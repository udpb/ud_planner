import { NextRequest, NextResponse } from 'next/server'
import { suggestCurriculum, CurriculumSession, CurriculumInsight } from '@/lib/claude'
import { prisma } from '@/lib/prisma'
import { validateCurriculumRules } from '@/lib/curriculum-rules'

// Action Week 세션이 있는 주에 1:1 온라인 코칭 세션을 페어로 추가
function injectCoachingPairs(sessions: CurriculumSession[]): {
  sessions: CurriculumSession[]
  addedPairs: number
} {
  const result: CurriculumSession[] = []
  let addedPairs = 0

  for (const session of sessions) {
    result.push(session)

    // Action Week 세션 직후에 1:1 코칭이 아직 없으면 자동 추가
    if (session.isActionWeek) {
      const nextSession = sessions.find(s => s.sessionNo === session.sessionNo + 1)
      const alreadyHasCoaching = nextSession?.isCoaching1on1 === true

      if (!alreadyHasCoaching) {
        addedPairs++
        result.push({
          sessionNo: session.sessionNo + 0.5, // 정렬용 임시 번호, 저장 시 재번호 매김
          title: `1:1 온라인 코칭 — ${session.title} 실행 리뷰`,
          category: 'MENTORING',
          method: 'ONLINE',
          durationHours: 1,
          lectureMinutes: 0,
          practiceMinutes: 60,
          isTheory: false,
          isActionWeek: false,
          isCoaching1on1: true,
          objectives: ['Action Week 실행 결과 점검', '다음 단계 방향 설정'],
          recommendedExpertise: ['창업 일반', '코칭'],
          notes: 'Action Week 실행 후 1:1 온라인 코칭. 참여자 진행 상황을 개별 확인하고 다음 실행을 구체화합니다.',
        })
      }
    }
  }

  // sessionNo 재번호 매김 (0.5 단위 정리)
  const reordered = result.map((s, i) => ({ ...s, sessionNo: i + 1 }))

  return { sessions: reordered, addedPairs }
}

// 커리큘럼 구성 분석 후 기획자용 안내 메시지 생성 (강제 아님, 정보 제공용)
function buildAdvisoryInsights(sessions: CurriculumSession[]): CurriculumInsight[] {
  const insights: CurriculumInsight[] = []
  const total = sessions.length
  if (total === 0) return insights

  const theoryCount = sessions.filter(s => s.isTheory).length
  const actionWeekCount = sessions.filter(s => s.isActionWeek).length
  const coachingCount = sessions.filter(s => s.isCoaching1on1).length
  const theoryRatio = Math.round((theoryCount / total) * 100)

  // 이론 비율 안내
  if (theoryRatio > 30) {
    insights.push({
      type: 'tip',
      message: `현재 이론 위주 세션 비율이 ${theoryRatio}%입니다. 실습·워크숍 비중을 높이면 참여자 체감 만족도가 올라가는 경향이 있습니다.`,
    })
  } else {
    insights.push({
      type: 'info',
      message: `이론 비율 ${theoryRatio}% — 실습 중심 구성입니다.`,
    })
  }

  // Action Week 안내
  if (actionWeekCount === 0) {
    insights.push({
      type: 'tip',
      message: 'Action Week(실전 실행 주간)가 포함되어 있지 않습니다. 이론 학습 후 실전 경험 기회를 넣으면 학습 전환율이 높아집니다.',
    })
  } else {
    insights.push({
      type: 'info',
      message: `Action Week ${actionWeekCount}회 포함 — 각 Action Week에 1:1 온라인 코칭 ${coachingCount}회가 페어로 구성되어 있습니다.`,
    })
  }

  // 연속 이론 세션 안내
  let consecutiveTheory = 0
  let maxConsecutive = 0
  for (const s of sessions) {
    if (s.isTheory) {
      consecutiveTheory++
      maxConsecutive = Math.max(maxConsecutive, consecutiveTheory)
    } else {
      consecutiveTheory = 0
    }
  }
  if (maxConsecutive >= 3) {
    insights.push({
      type: 'tip',
      message: `이론 강의가 최대 ${maxConsecutive}회 연속으로 배치되어 있습니다. 중간에 실습이나 Action Week를 넣으면 참여자 집중도 유지에 도움이 됩니다.`,
    })
  }

  // 총 구성 요약
  insights.push({
    type: 'asset',
    message: `총 ${total}회차 / ${sessions.filter(s => !s.isCoaching1on1).length}회 그룹 교육 + ${coachingCount}회 1:1 코칭으로 구성되었습니다.`,
  })

  return insights
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, rfpParsed, logicModel } = await req.json()

    if (!rfpParsed || !logicModel) {
      return NextResponse.json({ error: 'RFP 파싱 결과와 Logic Model이 필요합니다.' }, { status: 400 })
    }

    // IMPACT 18모듈 DB 로드 (Claude 프롬프트에 컨텍스트로 주입)
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

    const curriculum = await suggestCurriculum(rfpParsed, logicModel, impactModules)

    // Action Week 페어 1:1 코칭 자동 주입
    const { sessions: sessionsWithCoaching, addedPairs } = injectCoachingPairs(curriculum.sessions)

    // 기획자용 안내 메시지 생성
    const advisoryInsights = buildAdvisoryInsights(sessionsWithCoaching)
    // AI가 생성한 insights와 합침
    const allInsights = [...(curriculum.insights ?? []), ...advisoryInsights]

    // 추가된 코칭 세션 안내
    if (addedPairs > 0) {
      allInsights.unshift({
        type: 'info',
        message: `Action Week ${addedPairs}회에 맞춰 1:1 온라인 코칭 세션 ${addedPairs}회가 자동으로 추가되었습니다. 필요에 따라 삭제하거나 날짜를 조정하세요.`,
      })
    }

    // Rule Engine 검증 (R-001 ~ R-004)
    const ruleResult = validateCurriculumRules(
      sessionsWithCoaching.map((s) => ({
        sessionNo: s.sessionNo,
        isTheory: s.isTheory,
        isActionWeek: s.isActionWeek,
        category: s.category,
        method: s.method,
      }))
    )

    // BLOCK 위반 시 422 반환 (DB 저장하지 않음)
    if (!ruleResult.passed) {
      return NextResponse.json(
        {
          error: 'RULE_VIOLATION',
          message: '커리큘럼 설계 규칙을 충족하지 못합니다. 수정 후 다시 시도해주세요.',
          violations: ruleResult.violations,
          curriculum: { ...curriculum, sessions: sessionsWithCoaching, insights: allInsights },
        },
        { status: 422 }
      )
    }

    // WARN/SUGGEST 위반은 insights에 추가하여 기획자에게 안내
    for (const v of ruleResult.violations) {
      allInsights.push({
        type: v.action === 'WARN' ? 'tip' : 'info',
        message: `[${v.ruleId}] ${v.message}`,
      })
    }

    const finalCurriculum = {
      ...curriculum,
      sessions: sessionsWithCoaching,
      insights: allInsights,
    }

    // DB 저장
    if (projectId) {
      await prisma.curriculumItem.deleteMany({ where: { projectId, moduleId: null } })
      await prisma.curriculumItem.createMany({
        data: sessionsWithCoaching.map((s, i) => ({
          projectId,
          sessionNo: s.sessionNo,
          title: s.title,
          durationHours: s.durationHours,
          lectureMinutes: s.lectureMinutes,
          practiceMinutes: s.practiceMinutes,
          isTheory: s.isTheory,
          isActionWeek: s.isActionWeek,
          isCoaching1on1: s.isCoaching1on1,
          impactModuleCode: s.impactModuleCode ?? null,
          notes: s.notes,
          order: i,
        })),
      })
    }

    return NextResponse.json({ curriculum: finalCurriculum })
  } catch (err: any) {
    console.error('커리큘럼 생성 에러:', err)
    return NextResponse.json({ error: err.message ?? '생성 실패' }, { status: 500 })
  }
}

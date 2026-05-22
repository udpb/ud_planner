import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/logger'
import { checkRateLimit, getClientIp, AI_RATE_LIMIT } from '@/lib/rate-limit'
import { validateCurriculumRules } from '@/lib/curriculum-rules'
import { buildPipelineContext } from '@/lib/pipeline-context'
import {
  generateCurriculum,
  generateCurriculumOutline,
  enrichCurriculumDetails,
  type GenerateCurriculumResponse,
} from '@/lib/curriculum-ai'
import type { CurriculumSession } from '@/lib/pipeline-context'
import type { ExternalResearch } from '@/lib/ai/research'
import type { CurriculumInsight } from '@/lib/ai/curriculum-types'
import type { ImpactModuleContext } from '@/lib/ud-brand'
import type { PlanningChannel } from '@/lib/planning-direction'
// F2 (Wave V) — 진단 IP 자동 주입 + topic citation
import { injectDiagnosticSessions, type DiagnosticType } from '@/lib/curriculum/diagnostic-injector'
import { suggestTopicsForCurriculum } from '@/lib/curriculum/topic-suggester'
import { isExpressParadigmV3 } from '@/lib/feature-flags'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60초 — Vercel Hobby 한계, mode='outline'/'details' 로 분할

// ────────────────────────────────────────────────────────────────
// 보조 유틸 — 기존 route 에서 계승 (Action Week 페어, 안내 메시지)
// ────────────────────────────────────────────────────────────────

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
      const nextSession = sessions.find((s) => s.sessionNo === session.sessionNo + 1)
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
          notes:
            'Action Week 실행 후 1:1 온라인 코칭. 참여자 진행 상황을 개별 확인하고 다음 실행을 구체화합니다.',
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

  const theoryCount = sessions.filter((s) => s.isTheory).length
  const actionWeekCount = sessions.filter((s) => s.isActionWeek).length
  const coachingCount = sessions.filter((s) => s.isCoaching1on1).length
  const theoryRatio = Math.round((theoryCount / total) * 100)

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

  if (actionWeekCount === 0) {
    insights.push({
      type: 'tip',
      message:
        'Action Week(실전 실행 주간)가 포함되어 있지 않습니다. 이론 학습 후 실전 경험 기회를 넣으면 학습 전환율이 높아집니다.',
    })
  } else {
    insights.push({
      type: 'info',
      message: `Action Week ${actionWeekCount}회 포함 — 각 Action Week에 1:1 온라인 코칭 ${coachingCount}회가 페어로 구성되어 있습니다.`,
    })
  }

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

  insights.push({
    type: 'asset',
    message: `총 ${total}회차 / ${
      sessions.filter((s) => !s.isCoaching1on1).length
    }회 그룹 교육 + ${coachingCount}회 1:1 코칭으로 구성되었습니다.`,
  })

  return insights
}

// ────────────────────────────────────────────────────────────────
// POST /api/ai/curriculum
//   - stateless 생성은 curriculum-ai.ts 의 generateCurriculum() 에 위임
//   - 본 route 는 ① PipelineContext 조립 ② 페어 주입 ③ 룰 검증 ④ DB 저장 담당
// ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }

    // Phase 4: rate-limit (분당 10회)
    const userId = (session.user as { id?: string }).id ?? 'anon'
    const limit = checkRateLimit({
      key: `curriculum-gen:${userId}:${getClientIp(req)}`,
      ...AI_RATE_LIMIT,
    })
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'RATE_LIMIT',
          message: `잠시 후 다시 시도해주세요 (${limit.retryAfterSec}초 후).`,
          retryAfterSec: limit.retryAfterSec,
        },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      )
    }

    const body = await req.json().catch(() => ({}))
    const projectId: string | undefined = body?.projectId
    const channelInput: PlanningChannel | undefined = body?.channel
    const totalSessions: number | undefined =
      typeof body?.totalSessions === 'number' ? body.totalSessions : undefined
    // 분할 호출 mode (2026-05-03)
    //  - 'outline'  : 1단계 — 회차 골격 + designRationale (가벼움, ~30초)
    //  - 'details'  : 2단계 — outline 받아서 detail 보강 (~30초). DB 저장 + 룰 검증.
    //  - 'full'     : 단일 호출 (기존 동작) — 작은 RFP 에서 가능
    //  - 미지정     : 'full' 로 처리
    const mode: 'outline' | 'details' | 'full' =
      body?.mode === 'outline' || body?.mode === 'details' ? body.mode : 'full'
    const existingOutline: GenerateCurriculumResponse | undefined =
      mode === 'details' && body?.existingOutline ? body.existingOutline : undefined

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'PROJECT_ID_REQUIRED' }, { status: 400 })
    }

    // PipelineContext 에서 필요한 슬라이스 조립
    const viewerId =
      typeof session.user === 'object' && session.user && 'id' in session.user
        ? (session.user as { id?: string }).id
        : undefined

    const ctx = await buildPipelineContext(projectId, { viewerId })

    if (!ctx.rfp) {
      return NextResponse.json(
        { error: 'RFP_SLICE_MISSING', message: 'Step 1 RFP 파싱이 먼저 필요합니다.' },
        { status: 400 },
      )
    }

    // IMPACT 18모듈 자산 (Prisma) — 자산 로딩은 route 책임
    const impactModulesRaw = await prisma.impactModule.findMany({
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
    const impactModules: ImpactModuleContext[] = impactModulesRaw.map((m) => ({
      moduleCode: m.moduleCode,
      moduleName: m.moduleName,
      coreQuestion: m.coreQuestion,
      workshopOutputs: m.workshopOutputs,
      durationMinutes: m.durationMinutes,
      stage: m.stage,
    }))

    // 외부 리서치 — PipelineContext.research 우선
    const externalResearch: ExternalResearch[] | undefined =
      ctx.research && ctx.research.length > 0 ? ctx.research : undefined

    // ── AI 호출 (stateless) — mode 별 분기 ──
    const aiInput = {
      rfp: ctx.rfp,
      strategy: ctx.strategy,
      impactModules,
      externalResearch,
      channel: channelInput,
      totalSessions,
    }

    // mode='outline': 1단계 — 회차 골격만 응답 (DB 저장 X, 룰 검증 X)
    if (mode === 'outline') {
      const outline = await generateCurriculumOutline(aiInput)
      if (!outline.ok) {
        log.error('curriculum-outline', outline.error, {
          rawPreview: outline.raw?.slice(0, 200),
        })
        return NextResponse.json(
          {
            error: 'AI_GENERATION_FAILED',
            message: outline.error,
            // raw 처음 200자만 client 에 — 디버깅 도움
            rawPreview: outline.raw?.slice(0, 200),
            mode: 'outline',
          },
          { status: 500 },
        )
      }
      return NextResponse.json({
        mode: 'outline',
        outline: outline.data,
        message: '커리큘럼 골격 완성. 다음 단계: details 호출로 회차별 상세 보강.',
      })
    }

    // mode='details': 2단계 — existingOutline 받아 detail 보강 + 룰 검증 + DB 저장
    let aiResult: { ok: true; data: GenerateCurriculumResponse } | { ok: false; error: string; raw?: string }
    if (mode === 'details') {
      if (!existingOutline) {
        return NextResponse.json(
          { error: 'EXISTING_OUTLINE_REQUIRED', message: 'mode=details 는 body.existingOutline 필수' },
          { status: 400 },
        )
      }
      aiResult = await enrichCurriculumDetails(aiInput, existingOutline)
    } else {
      // mode='full' (default) — 기존 단일 호출 (작은 RFP 케이스)
      aiResult = await generateCurriculum(aiInput)
    }

    if (!aiResult.ok) {
      log.error('curriculum-' + mode, aiResult.error, {
        rawPreview: aiResult.raw?.slice(0, 200),
      })
      return NextResponse.json(
        { error: 'AI_GENERATION_FAILED', message: aiResult.error, raw: aiResult.raw, mode },
        { status: 500 },
      )
    }

    // Action Week 페어 1:1 코칭 자동 주입
    const { sessions: sessionsWithCoaching, addedPairs } = injectCoachingPairs(
      aiResult.data.sessions,
    )

    // F2 (Wave V) — 진단 IP 자동 주입 + topic citation enrich
    // flag ON 일 때만 적용 (회귀 가드).
    // 핵심: ACTT 사전·사후는 페어 강제, DOGS·5D 는 휴리스틱.
    let sessionsAfterDiagnostic = sessionsWithCoaching
    let diagnosticAdded: Array<{ type: DiagnosticType; sessionNo: number; reason: string }> = []
    let diagnosticRationale: string[] = []
    let topicAppliedCount = 0
    const v3Enabled = isExpressParadigmV3()
    if (v3Enabled && ctx.rfp?.parsed) {
      const rfpParsed = ctx.rfp.parsed as RfpParsed
      // 명시적으로 끄려면 body.skipDiagnostics===true (단 ACTT 페어는 여전히 강제)
      const skipOptional = body?.skipDiagnostics === true
      const diagResult = injectDiagnosticSessions({
        sessions: sessionsWithCoaching,
        rfp: rfpParsed,
        universes: ctx.meta?.programProfile?.actpreneurUniverses,
        skipOptionalDiagnostics: skipOptional,
      })
      sessionsAfterDiagnostic = diagResult.sessions
      diagnosticAdded = diagResult.added
      diagnosticRationale = diagResult.rationale

      // topic suggester — 일반 회차에 stat citation 분배 (정형화 회피: 1 회차당 1개)
      const topicResult = suggestTopicsForCurriculum({
        sessions: sessionsAfterDiagnostic,
        rfp: rfpParsed,
        universes: ctx.meta?.programProfile?.actpreneurUniverses,
        maxCitationsPerSession: 1,
      })
      sessionsAfterDiagnostic = topicResult.sessions
      topicAppliedCount = topicResult.appliedCount
    }

    // 기획자용 안내 메시지 생성
    const advisoryInsights = buildAdvisoryInsights(sessionsAfterDiagnostic)
    const allInsights: CurriculumInsight[] = [...advisoryInsights]

    if (addedPairs > 0) {
      allInsights.unshift({
        type: 'info',
        message: `Action Week ${addedPairs}회에 맞춰 1:1 온라인 코칭 세션 ${addedPairs}회가 자동으로 추가되었습니다. 필요에 따라 삭제하거나 날짜를 조정하세요.`,
      })
    }

    // F2 — 진단 회차 자동 추가 안내
    if (diagnosticAdded.length > 0) {
      const types = diagnosticAdded.map((d) => d.type).join(', ')
      allInsights.unshift({
        type: 'diagnostic',
        message: `진단 IP ${diagnosticAdded.length}회차 자동 추가됨 (${types}). ACTT 사전·사후 페어는 성장 변화량(Δ) 측정의 필수 — 임의 제거 시 평가위원 검증 불가.`,
      })
    }
    if (topicAppliedCount > 0) {
      allInsights.push({
        type: 'info',
        message: `데이터 센터 통계 ${topicAppliedCount}건이 회차 notes 에 참고 인용으로 자동 추가됨 (정형화 회피 — 회차당 1건).`,
      })
    }

    // Rule Engine 검증 (R-001 ~ R-004) — 진단 회차 포함된 최종 sessions 기준
    const ruleResult = validateCurriculumRules(
      sessionsAfterDiagnostic.map((s) => ({
        sessionNo: s.sessionNo,
        isTheory: s.isTheory,
        isActionWeek: s.isActionWeek,
        category: s.category,
        method: s.method,
      })),
    )

    // BLOCK 위반 시 422 반환 (DB 저장하지 않음)
    if (!ruleResult.passed) {
      return NextResponse.json(
        {
          error: 'RULE_VIOLATION',
          message: '커리큘럼 설계 규칙을 충족하지 못합니다. 수정 후 다시 시도해주세요.',
          violations: ruleResult.violations,
          curriculum: {
            sessions: sessionsAfterDiagnostic,
            designRationale: aiResult.data.designRationale,
            appliedDirection: aiResult.data.appliedDirection,
            insights: allInsights,
          },
        },
        { status: 422 },
      )
    }

    // WARN/SUGGEST 위반은 insights 에 추가
    for (const v of ruleResult.violations) {
      allInsights.push({
        type: v.action === 'WARN' ? 'tip' : 'info',
        message: `[${v.ruleId}] ${v.message}`,
      })
    }

    // DB 저장 — 기존 커리큘럼 교체 (projectId 단위)
    // F2: 진단 회차 메타 (isDiagnostic/diagnosticType/autoSeeded) 는 notes prefix 로 영속화
    //     (H.1.f 옵션 A — schema 마이그레이션 없이). Read 시 prefix 파싱.
    await prisma.curriculumItem.deleteMany({
      where: { projectId, moduleId: null },
    })
    await prisma.curriculumItem.createMany({
      data: sessionsAfterDiagnostic.map((s, i) => {
        // notes prefix: F2 진단 회차 / 자동 시드 메타 보관
        const metaPrefix: string[] = []
        if (s.isDiagnostic && s.diagnosticType) {
          metaPrefix.push(`[DIAGNOSTIC:${s.diagnosticType}]`)
        }
        if (s.autoSeeded) {
          metaPrefix.push('[AUTOSEEDED]')
        }
        const notesWithMeta =
          metaPrefix.length > 0 ? `${metaPrefix.join(' ')} ${s.notes}` : s.notes

        return {
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
          notes: notesWithMeta,
          order: i,
        }
      }),
    })

    // 응답 — 기존 UI 호환 (curriculum.sessions / rationale / insights) + F2 신규 필드
    return NextResponse.json({
      curriculum: {
        sessions: sessionsAfterDiagnostic,
        rationale: aiResult.data.designRationale,
        designRationale: aiResult.data.designRationale,
        appliedDirection: aiResult.data.appliedDirection,
        insights: allInsights,
        totalHours: sessionsAfterDiagnostic.reduce((sum, s) => sum + s.durationHours, 0),
      },
      // F2 (Wave V) — 자동 시드 메타
      autoSeed: v3Enabled
        ? {
            diagnosticAdded,
            diagnosticRationale,
            topicCitationsApplied: topicAppliedCount,
          }
        : null,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '생성 실패'
    log.error('curriculum', e)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 })
  }
}

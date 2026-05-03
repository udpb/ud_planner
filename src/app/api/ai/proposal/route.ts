/**
 * POST /api/ai/proposal  — 제안서 섹션 생성 (C3 · PipelineContext 전체 주입)
 *
 * 변경 이력:
 *   - C3 (Phase C Wave 1): `src/lib/proposal-ai.ts` 의 신규 `generateProposalSection` 으로 교체.
 *     rfp+strategy+curriculum+coaches+budget+impact 전체 슬라이스 주입 + SectionMetadata 반환.
 *   - 기존 claude.ts 의 `generateProposalSection` 은 /api/ai/proposal/improve 가 계속 사용 (공존).
 *
 * Request:  { projectId, sectionNo, keepParts? }
 * Response: { section, metadata }  |  { error }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { invokeAi } from '@/lib/ai-fallback'
import { log } from '@/lib/logger'
import { buildPipelineContext } from '@/lib/pipeline-context'
import {
  generateProposalSection,
  PROPOSAL_SECTION_SPEC,
  type ProposalSectionNo,
} from '@/lib/proposal-ai'
import { AI_TOKENS } from '@/lib/ai/config'

function safeParseJson<T>(raw: string): T {
  const s = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
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

function isValidSectionNo(n: unknown): n is ProposalSectionNo {
  return typeof n === 'number' && n >= 1 && n <= 7 && Number.isInteger(n)
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Vercel Hobby 한계 — 7 섹션 큰 응답 시 위험 (P1-4 분할 호출 예정)

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as {
      projectId?: string
      sectionNo?: number
      keepParts?: string
    }
    const { projectId, sectionNo, keepParts } = body

    if (!projectId || !isValidSectionNo(sectionNo)) {
      return NextResponse.json(
        { error: 'projectId, sectionNo(1~7) 필요' },
        { status: 400 },
      )
    }

    // 1. PipelineContext 조립
    const t0 = Date.now()
    const userId = (session.user as { id?: string }).id
    const context = await buildPipelineContext(projectId, {
      viewerId: typeof userId === 'string' ? userId : undefined,
    })
    const tCtx = Date.now() - t0

    // 2. AI 생성
    const tAi0 = Date.now()
    const result = await generateProposalSection({
      sectionNo,
      context,
      keepParts,
    })
    const tAi = Date.now() - tAi0

    if (!result.ok) {
      log.warn('proposal-generate', '섹션 생성 실패', {
        sectionNo,
        ms: tAi,
        error: result.error,
      })
      if (result.error.startsWith('SLICE_REQUIRED:')) {
        const slice = result.error.split(':')[1]
        return NextResponse.json(
          {
            error: result.error,
            message: `이전 스텝을 먼저 완료하세요 (${slice} 슬라이스 미확정)`,
          },
          { status: 400 },
        )
      }
      if (result.error.startsWith('INVALID_SECTION_NO:')) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      // 504 가능성 안내: AI 생성이 50초 넘으면 timeout 위험을 클라이언트에 전달
      const timeoutHint = tAi > 50_000
        ? ' (AI 생성이 오래 걸리고 있습니다. 다시 시도해주세요.)'
        : ''
      return NextResponse.json(
        { error: result.error + timeoutHint },
        { status: 500 },
      )
    }

    // 3. DB 저장 (버전 증가)
    const spec = PROPOSAL_SECTION_SPEC[sectionNo]
    const existing = await prisma.proposalSection.findFirst({
      where: { projectId, sectionNo },
      orderBy: { version: 'desc' },
    })
    const newVersion = (existing?.version ?? 0) + 1

    const saved = await prisma.proposalSection.create({
      data: {
        projectId,
        sectionNo,
        title: spec.title,
        content: result.content,
        version: newVersion,
      },
    })

    const tTotal = Date.now() - t0
    log.info('proposal-generate', '섹션 생성 성공', {
      sectionNo,
      version: newVersion,
      ctxMs: tCtx,
      aiMs: tAi,
      totalMs: tTotal,
      retried: result.metadata.retried,
    })

    return NextResponse.json({
      section: saved,
      metadata: result.metadata,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '생성 실패'
    log.error('proposal-generate', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH: 제안서 섹션 콘텐츠 수정 또는 승인 토글
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as {
      sectionId?: string
      content?: string
      isApproved?: boolean
    }
    const { sectionId, content, isApproved } = body

    if (!sectionId) {
      return NextResponse.json({ error: 'sectionId가 필요합니다.' }, { status: 400 })
    }

    const data: { updatedAt: Date; content?: string; isApproved?: boolean } = {
      updatedAt: new Date(),
    }
    if (content !== undefined) data.content = content
    if (isApproved !== undefined) data.isApproved = isApproved

    const updated = await prisma.proposalSection.update({
      where: { id: sectionId },
      data,
    })

    return NextResponse.json({ section: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '수정 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PUT: 평가위원 시뮬레이션 — AI가 현재 제안서를 평가 배점 기준으로 채점
export async function PUT(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId } = (await req.json()) as { projectId?: string }
    if (!projectId) {
      return NextResponse.json({ error: 'projectId가 필요합니다.' }, { status: 400 })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { proposalSections: { orderBy: { sectionNo: 'asc' } } },
    })
    if (!project) return NextResponse.json({ error: '프로젝트 없음' }, { status: 404 })

    const rfpParsed = project.rfpParsed as { evalCriteria?: Array<{ item: string; score: number }> } | null
    const evalCriteria = rfpParsed?.evalCriteria ?? []

    if (evalCriteria.length === 0) {
      return NextResponse.json(
        { error: '평가 배점이 입력되지 않아 시뮬레이션할 수 없습니다.' },
        { status: 400 },
      )
    }

    const sectionsText = project.proposalSections
      .map((s) => `[섹션 ${s.sectionNo}. ${s.title}]\n${s.content.slice(0, 1500)}`)
      .join('\n\n')

    const evalText = evalCriteria
      .map((e) => `- ${e.item}: ${e.score}점`)
      .join('\n')

    const totalMaxScore = evalCriteria.reduce((s, e) => s + e.score, 0)

    // 2026-05-03: anthropic → invokeAi
    const result = await invokeAi({
      prompt: `당신은 교육 사업 제안서를 평가하는 심사위원입니다.
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
      maxTokens: AI_TOKENS.LIGHT,
      temperature: 0.4,
      label: 'evaluator-simulation',
    })

    const raw = result.raw.trim()
    const simulation = safeParseJson<unknown>(raw)

    return NextResponse.json({ simulation })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '시뮬레이션 실패'
    console.error('평가 시뮬레이션 에러:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

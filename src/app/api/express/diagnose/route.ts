/**
 * POST /api/express/diagnose
 *
 * Express 2.0 AI 자동 진단 (Phase M0, ADR-013).
 *
 * Body: { projectId, kinds?: ('channel'|'framing'|'logic-chain'|'fact-check')[] }
 *   - kinds 미지정 시 모두 진단
 *
 * Response: { autoDiagnosis: AutoDiagnosis }
 *
 * 호출자:
 *   - Express 진입 시: kinds=['channel']
 *   - sections.* 슬롯 채움 후 debounce: kinds=['framing']
 *   - 1차본 조립 직전: kinds=['logic-chain', 'fact-check']
 *
 * AI 호출 정책 (ADR-013):
 *   - channel: 비-AI (키워드 + DB 조회)
 *   - framing: AI 1회 (~2K) — B2B 일 때만 정밀, 그 외 heuristic
 *   - logic-chain: AI 1회 (~3K) — 후속 PR (M1)
 *   - fact-check: 정규식 + 선택 AI — 후속 PR (M1)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { log } from '@/lib/logger'
import { ExpressDraftSchema, type ExpressDraft, type Channel } from '@/lib/express/schema'
import { detectChannel } from '@/lib/express/channel-detector'
import { diagnoseFraming } from '@/lib/express/framing-inspector'
import { checkLogicChain } from '@/lib/express/logic-chain-checker'
import { checkFacts } from '@/lib/express/fact-check-light'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BodySchema = z.object({
  projectId: z.string().min(1),
  kinds: z.array(z.enum(['channel', 'framing', 'logic-chain', 'fact-check'])).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', detail: err }, { status: 400 })
  }

  const { projectId, kinds = ['channel', 'framing'] } = body

  // 프로젝트 + draft + RFP + prior projects 동시 조회
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      client: true,
      rfpParsed: true,
      expressDraft: true,
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Draft 파싱
  let draft: ExpressDraft | null = null
  if (project.expressDraft) {
    const parsed = ExpressDraftSchema.safeParse(project.expressDraft)
    if (parsed.success) draft = parsed.data
  }

  // RFP 가 없으면 진단 불가 (channel 외)
  const rfp = project.rfpParsed as unknown as RfpParsed | null
  if (!rfp && kinds.includes('channel')) {
    return NextResponse.json(
      { error: 'RFP_NOT_PARSED', message: 'RFP 파싱 후 진단 가능' },
      { status: 400 },
    )
  }

  // 이전 진단 결과 (있으면) — partial update 가능
  const prevDiagnosis = draft?.meta?.autoDiagnosis ?? {}
  const newDiagnosis = { ...prevDiagnosis }

  // ─── 1. Channel 진단 ───
  if (kinds.includes('channel') && rfp) {
    const priorProjects = await prisma.project.findMany({
      where: {
        client: project.client,
        id: { not: project.id },
        status: { in: ['COMPLETED', 'IN_PROGRESS'] },
      },
      select: { client: true, status: true },
      take: 10,
    })

    const result = detectChannel(rfp, priorProjects)
    newDiagnosis.channel = {
      detected: result.detected,
      confidence: result.confidence,
      reasoning: result.reasoning,
      confirmedByPm: prevDiagnosis.channel?.confirmedByPm ?? false,
    }
    log.info('express-diagnose', 'channel 추론 완료', {
      projectId,
      detected: result.detected,
      confidence: result.confidence,
    })
  }

  // ─── 2. Framing 진단 (B2B 우선) ───
  if (kinds.includes('framing') && draft) {
    const channel: Channel = (newDiagnosis.channel?.detected ?? prevDiagnosis.channel?.detected ?? 'B2B') as Channel

    try {
      const result = await diagnoseFraming({
        draft,
        channel,
        intendedDepartment: draft.meta?.intendedDepartment,
      })

      newDiagnosis.framing = {
        detected: result.detected,
        intendedDepartment: result.intendedDepartment,
        match: result.match,
        evidence: result.evidence,
        suggestion: result.suggestion,
        diagnosedAt: new Date().toISOString(),
      }

      log.info('express-diagnose', 'framing 진단 완료', {
        projectId,
        detected: result.detected,
        match: result.match,
        mode: result.mode,
      })
    } catch (err) {
      log.error('express-diagnose', err, { projectId, stage: 'framing' })
    }
  }

  // ─── 3. Logic Chain 진단 (M1) ───
  if (kinds.includes('logic-chain') && draft) {
    const channel: Channel = (newDiagnosis.channel?.detected ?? prevDiagnosis.channel?.detected ?? 'B2B') as Channel
    try {
      const result = await checkLogicChain({
        draft,
        channel,
        intendedDepartment: draft.meta?.intendedDepartment,
      })
      newDiagnosis.logicChain = {
        passed: result.passed,
        channel: result.channel,
        passedSteps: result.passedSteps,
        totalSteps: result.totalSteps,
        breakpoints: result.breakpoints,
        mode: result.mode,
        diagnosedAt: new Date().toISOString(),
      }
      log.info('express-diagnose', 'logic-chain 진단 완료', {
        projectId,
        channel,
        passed: result.passed,
        breakpoints: result.breakpoints.length,
        mode: result.mode,
      })
    } catch (err) {
      log.error('express-diagnose', err, { projectId, stage: 'logic-chain' })
    }
  }

  // ─── 4. Fact Check 진단 (M1) ───
  if (kinds.includes('fact-check') && draft) {
    try {
      const result = await checkFacts(draft, { aiVerify: true })
      newDiagnosis.factCheck = {
        totalFacts: result.totalFacts,
        byCategory: result.byCategory,
        byStatus: result.byStatus,
        facts: result.facts,
        mode: result.mode,
        diagnosedAt: new Date().toISOString(),
      }
      log.info('express-diagnose', 'fact-check 진단 완료', {
        projectId,
        totalFacts: result.totalFacts,
        suspicious: result.byStatus.suspicious,
        needsSource: result.byStatus['needs-source'],
        mode: result.mode,
      })
    } catch (err) {
      log.error('express-diagnose', err, { projectId, stage: 'fact-check' })
    }
  }

  // DB 저장 — meta.autoDiagnosis 업데이트
  if (draft) {
    const newDraft: ExpressDraft = {
      ...draft,
      meta: {
        ...draft.meta,
        autoDiagnosis: newDiagnosis,
        lastUpdatedAt: new Date().toISOString(),
      },
    }
    await prisma.project.update({
      where: { id: projectId },
      data: { expressDraft: newDraft as unknown as object },
    })
  }

  return NextResponse.json({
    autoDiagnosis: newDiagnosis,
  })
}

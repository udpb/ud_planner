/**
 * 티키타카 리서치 파이프라인 API
 *
 * GET  /api/projects/[id]/research — 리서치 프롬프트 생성 (외부 LLM용 복사 프롬프트)
 * POST /api/projects/[id]/research — PM이 수집한 리서치 결과 저장
 *                                    — 신규: { stepKey, requestId, answer, stores }
 *                                    — 레거시: { promptId, category, content }
 * DELETE /api/projects/[id]/research — 특정 리서치 항목 삭제 (requestId 또는 promptId)
 *
 * 저장 전략:
 *   - externalResearch[] 에 항상 append (ExternalResearch 타입)
 *     → 다음 AI 호출(curriculum-ai · proposal-ai · logic-model-builder) 이
 *       formatExternalResearch() 로 자동 주입
 *   - stores='strategicNotes' 의 경우 Project.strategicNotes JSON 에도 미러링 저장
 *     → formatStrategicNotes() 로 제안서 톤·강조점 결정에 활용
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { generateResearchPrompts, type ExternalResearch } from '@/lib/ai/research'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────
// POST zod 스키마 — 신규 + 레거시 동시 지원
// ─────────────────────────────────────────

const NewPostSchema = z.object({
  stepKey: z.enum(['rfp', 'curriculum', 'coaches', 'budget', 'impact', 'proposal']),
  requestId: z.string().min(1),
  answer: z.string().min(1),
  stores: z.enum(['externalResearch', 'strategicNotes']),
})

const LegacyPostSchema = z.object({
  promptId: z.string().min(1),
  category: z.string().optional(),
  content: z.string().min(1),
  source: z.string().optional(),
})

const DeleteSchema = z.object({
  requestId: z.string().min(1).optional(),
  promptId: z.string().min(1).optional(),
}).refine((d) => d.requestId || d.promptId, {
  message: 'requestId 또는 promptId 가 필요합니다',
})

// ─────────────────────────────────────────
// GET — 리서치 프롬프트 생성
// ─────────────────────────────────────────

/** GET: RFP 기반 리서치 프롬프트 생성 + 기존 저장된 리서치 반환 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    select: { rfpParsed: true, impactGoal: true, externalResearch: true },
  })

  if (!project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 })
  }
  if (!project.rfpParsed) {
    return NextResponse.json({ error: 'RFP 분석이 먼저 필요합니다' }, { status: 400 })
  }

  const prompts = generateResearchPrompts(
    project.rfpParsed as unknown as RfpParsed,
    project.impactGoal ?? undefined,
  )
  const savedResearch = (project.externalResearch ?? []) as unknown as ExternalResearch[]

  return NextResponse.json({ prompts, savedResearch })
}

// ─────────────────────────────────────────
// POST — 저장 (신규 또는 레거시 페이로드)
// ─────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  // 신규 스키마 우선 시도 → 실패 시 레거시 시도
  const newParsed = NewPostSchema.safeParse(body)
  const legacyParsed = newParsed.success
    ? null
    : LegacyPostSchema.safeParse(body)

  if (!newParsed.success && !legacyParsed?.success) {
    return NextResponse.json(
      {
        error:
          '요청 형식 오류: { stepKey, requestId, answer, stores } 또는 { promptId, content } 형식 필요',
      },
      { status: 422 },
    )
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { externalResearch: true, strategicNotes: true },
  })

  if (!project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 })
  }

  const existing = (project.externalResearch ?? []) as unknown as ExternalResearch[]

  // ── 페이로드 정규화 ────────────────────────────────
  let promptId: string
  let category: string
  let content: string
  let source: string | undefined
  let storesToStrategic = false
  let stepKey: string | undefined

  if (newParsed.success) {
    promptId = newParsed.data.requestId
    category = newParsed.data.stepKey
    content = newParsed.data.answer
    stepKey = newParsed.data.stepKey
    storesToStrategic = newParsed.data.stores === 'strategicNotes'
  } else {
    const d = legacyParsed!.data!
    promptId = d.promptId
    category = d.category ?? d.promptId
    content = d.content
    source = d.source
  }

  // ── externalResearch 에 업데이트 (항상) ───────────
  const newItem: ExternalResearch = {
    promptId,
    category,
    content: content.trim(),
    source: source || undefined,
    attachedAt: new Date().toISOString(),
  }
  const updatedResearch = existing.filter((r) => r.promptId !== promptId)
  updatedResearch.push(newItem)

  // ── strategicNotes 미러 저장 (stores='strategicNotes' 인 경우) ───
  //   strategicNotes 객체에 `research:<requestId>` 키로 누적 저장하지 않고,
  //   PM 이 쉽게 확인할 수 있게 `winStrategy` 또는 다른 필드에 섞지 않고,
  //   별도 `researchNotes` 맵을 추가한다. (기존 StrategicNotes 타입과 공존)
  let updatedNotes: StrategicNotes | null = null
  if (storesToStrategic) {
    const currentNotes = (project.strategicNotes ?? {}) as StrategicNotes &
      Record<string, unknown>
    const noteMap =
      (currentNotes as any).researchNotes &&
      typeof (currentNotes as any).researchNotes === 'object'
        ? { ...(currentNotes as any).researchNotes }
        : {}
    noteMap[promptId] = {
      content: content.trim(),
      stepKey,
      attachedAt: newItem.attachedAt,
    }
    updatedNotes = {
      ...currentNotes,
      researchNotes: noteMap,
    } as StrategicNotes
  }

  // ── 저장 ────────────────────────────────────────
  await prisma.project.update({
    where: { id },
    data: {
      externalResearch: updatedResearch as any,
      ...(updatedNotes ? { strategicNotes: updatedNotes as any } : {}),
    },
  })

  return NextResponse.json({
    ok: true,
    research: updatedResearch,
    ...(updatedNotes ? { strategicNotes: updatedNotes } : {}),
  })
}

// ─────────────────────────────────────────
// DELETE — 항목 제거
// ─────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const parsed = DeleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const targetId = parsed.data.requestId ?? parsed.data.promptId!

  const project = await prisma.project.findUnique({
    where: { id },
    select: { externalResearch: true, strategicNotes: true },
  })

  if (!project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 })
  }

  const existing = (project.externalResearch ?? []) as unknown as ExternalResearch[]
  const updated = existing.filter((r) => r.promptId !== targetId)

  // strategicNotes.researchNotes 에서도 제거
  const currentNotes = (project.strategicNotes ?? {}) as StrategicNotes &
    Record<string, unknown>
  let updatedNotes: StrategicNotes | null = null
  if (
    (currentNotes as any).researchNotes &&
    typeof (currentNotes as any).researchNotes === 'object' &&
    (currentNotes as any).researchNotes[targetId]
  ) {
    const noteMap = { ...(currentNotes as any).researchNotes }
    delete noteMap[targetId]
    updatedNotes = {
      ...currentNotes,
      researchNotes: noteMap,
    } as StrategicNotes
  }

  await prisma.project.update({
    where: { id },
    data: {
      externalResearch: updated as any,
      ...(updatedNotes ? { strategicNotes: updatedNotes as any } : {}),
    },
  })

  return NextResponse.json({ ok: true, research: updated })
}

/**
 * 티키타카 리서치 파이프라인 API
 *
 * GET  /api/projects/[id]/research — 리서치 프롬프트 생성 (외부 LLM용 복사 프롬프트)
 * POST /api/projects/[id]/research — PM이 수집한 리서치 결과 저장
 * DELETE /api/projects/[id]/research — 특정 리서치 항목 삭제
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  generateResearchPrompts,
  type RfpParsed,
  type ExternalResearch,
} from '@/lib/claude'

type Params = { params: Promise<{ id: string }> }

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

/** POST: PM이 외부 LLM에서 수집한 리서치 결과 저장 (append) */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params

  const body = await req.json()
  const { promptId, category, content, source } = body

  if (!promptId || !content?.trim()) {
    return NextResponse.json(
      { error: 'promptId와 content는 필수입니다' },
      { status: 400 },
    )
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { externalResearch: true },
  })

  if (!project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 })
  }

  const existing = (project.externalResearch ?? []) as unknown as ExternalResearch[]

  // 같은 promptId가 이미 있으면 교체, 없으면 추가
  const newItem: ExternalResearch = {
    promptId,
    category: category || promptId,
    content: content.trim(),
    source: source || undefined,
    attachedAt: new Date().toISOString(),
  }

  const updated = existing.filter((r) => r.promptId !== promptId)
  updated.push(newItem)

  await prisma.project.update({
    where: { id },
    data: { externalResearch: updated as any },
  })

  return NextResponse.json({ ok: true, research: updated })
}

/** DELETE: 특정 리서치 항목 삭제 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { promptId } = await req.json()

  if (!promptId) {
    return NextResponse.json({ error: 'promptId가 필요합니다' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { externalResearch: true },
  })

  if (!project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 })
  }

  const existing = (project.externalResearch ?? []) as unknown as ExternalResearch[]
  const updated = existing.filter((r) => r.promptId !== promptId)

  await prisma.project.update({
    where: { id },
    data: { externalResearch: updated as any },
  })

  return NextResponse.json({ ok: true, research: updated })
}

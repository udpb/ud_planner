/**
 * /api/projects/[id]/concept — 컨셉-퍼스트 기획 컨셉 도출·조립·영속 (ADR-031 Wave 1)
 *
 * action 분기 (POST body.action):
 *   - "step"     : 단계별(angle → differentiation → message) 질문 + 선택 카드 2~3개
 *                  (conceptStep, Flash). picks.length 로 다음 단계 결정.
 *   - "assemble" : 누적 선택(picks) → ConceptShape 조립 (assembleConcept, Pro=engine.wintheme).
 *
 * PUT: 확정 ConceptShape → strategicNotes.concept 으로 merge 저장 (기존 키 보존).
 *
 * 인증: requireProjectAccess (planning-intent 패턴 미러).
 * AI 호출은 concept-synth.ts 의 invokeAi 단일 진입점만.
 * 저장은 기존 `Project.strategicNotes`(Json) 만 — 스키마 변경 0.
 *
 * 그라운딩(ctx)은 route 가 조립해 엔진에 주입한다(엔진은 fetch 안 함):
 *   project.rfpParsed + strategicNotes(formatStrategicNotes) + matchAssetsToRfp(graceful)
 *   + best-effort 당선패턴(채널 일치 WinningProposalDoc 일부 — 임베딩 검색 미구현, ADR-031 W1).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'
import { matchAssetsToRfp } from '@/lib/asset-registry'
import {
  formatStrategicNotes,
  type StrategicNotes,
} from '@/lib/ai/strategic-notes'
import {
  conceptStep,
  assembleConcept,
  type ConceptPick,
  type ConceptShape,
  type ConceptGrounding,
  type ConceptCtx,
} from '@/lib/program-design/concept-synth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ─────────────────────────────────────────────────────────────────
// ctx 그라운딩 조립 (서버) — 엔진에 주입할 재료를 route 가 모은다.
// ─────────────────────────────────────────────────────────────────

/** RFP 핵심을 한 단락 요약으로 (프롬프트 맥락용). */
function summarizeRfp(rfp: RfpParsed): string {
  const parts: string[] = []
  if (rfp.projectName) parts.push(`사업명: ${rfp.projectName}`)
  if (rfp.client) parts.push(`발주처: ${rfp.client}`)
  if (rfp.targetAudience) parts.push(`대상: ${rfp.targetAudience}`)
  if (rfp.objectives?.length) parts.push(`목표: ${rfp.objectives.slice(0, 3).join(' / ')}`)
  if (rfp.summary) parts.push(`요약: ${rfp.summary}`)
  return parts.join(' · ').slice(0, 600)
}

/**
 * best-effort 당선패턴 그라운딩 (ADR-031 W1):
 *   임베딩 의미검색은 W1 범위 밖 — 채널(projectType) 일치 WinningProposalDoc 일부만 인용한다.
 *   매칭 함수가 없으므로 단순 channel·won 필터 + 최근순 소량. 실패/없으면 graceful 빈 배열.
 */
async function bestEffortWinning(
  channel: string | undefined,
): Promise<{ label: string; ref?: string }[]> {
  if (!channel) return []
  try {
    const docs = await prisma.winningProposalDoc.findMany({
      where: { channel, won: true },
      select: { id: true, projectName: true, client: true, year: true },
      orderBy: { year: 'desc' },
      take: 3,
    })
    return docs.map((d) => ({
      label: [d.projectName, d.client, d.year ? `${d.year}` : null]
        .filter(Boolean)
        .join(' · '),
      ref: d.id,
    }))
  } catch {
    return []
  }
}

/** project 로딩 + 그라운딩 조립. RFP 없으면 null(호출부에서 400). */
async function buildCtx(
  id: string,
  message: string | undefined,
): Promise<ConceptCtx | { error: string }> {
  const project = await prisma.project.findUnique({
    where: { id },
    select: { rfpParsed: true, programProfile: true, strategicNotes: true },
  })
  if (!project || !project.rfpParsed) {
    return { error: 'RFP 분석 먼저 진행해주세요' }
  }
  const rfp = project.rfpParsed as unknown as RfpParsed
  const profile =
    (project.programProfile as unknown as ProgramProfile | null) ?? null

  // 읽기 가드 — strategicNotes 가 객체가 아니면 {} 로 (배열·null·불량).
  const sn = project.strategicNotes
  const notes: StrategicNotes =
    sn && typeof sn === 'object' && !Array.isArray(sn)
      ? (sn as unknown as StrategicNotes)
      : {}

  // 채널 추론: profile.channel.type 우선, 없으면 RFP projectType(B2G/B2B).
  const channel =
    (profile?.channel?.isRenewal ? 'renewal' : profile?.channel?.type) ??
    rfp.projectType ??
    undefined

  // 자산 그라운딩 — graceful catch [].
  const assetMatches = await matchAssetsToRfp({
    rfp,
    profile: profile ?? undefined,
    limit: 8,
  }).catch(() => [])
  // 자산 평탄화 (label + narrativeSnippet) · 중복 자산 제거.
  const seenAsset = new Set<string>()
  const assets: ConceptGrounding['assets'] = []
  for (const m of assetMatches) {
    if (seenAsset.has(m.asset.id)) continue
    seenAsset.add(m.asset.id)
    assets.push({
      label: m.asset.name,
      ...(m.asset.narrativeSnippet
        ? { snippet: m.asset.narrativeSnippet.slice(0, 200) }
        : {}),
    })
    if (assets.length >= 6) break
  }

  const winning = await bestEffortWinning(channel)

  const grounding: ConceptGrounding = {
    rfpSummary: summarizeRfp(rfp),
    ...(channel ? { channel } : {}),
    intentText: formatStrategicNotes(notes),
    assets,
    winning,
  }

  return { grounding, ...(message?.trim() ? { message: message.trim() } : {}) }
}

// ─────────────────────────────────────────────────────────────────
// 입력 검증 — picks
// ─────────────────────────────────────────────────────────────────

function coercePicks(raw: unknown): ConceptPick[] {
  if (!Array.isArray(raw)) return []
  const out: ConceptPick[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const o = p as Record<string, unknown>
    const stepKey = typeof o.stepKey === 'string' ? o.stepKey : ''
    const label = typeof o.label === 'string' ? o.label : ''
    const value = typeof o.value === 'string' ? o.value : ''
    if (!stepKey || (!label && !value)) continue
    out.push({ stepKey, label: label || value, value: value || label })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────
// POST — step (질문+카드) · assemble (ConceptShape 조립)
// ─────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const action = (body as { action?: string })?.action
  const picks = coercePicks((body as { picks?: unknown }).picks)
  const message = (body as { message?: string }).message

  const ctx = await buildCtx(id, message)
  if ('error' in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: 400 })
  }

  try {
    if (action === 'assemble') {
      const concept = await assembleConcept(ctx, picks)
      return NextResponse.json({ concept })
    }
    // 기본 action = "step"
    const step = await conceptStep(ctx, picks)
    return NextResponse.json(step)
  } catch (err) {
    // 엔진은 graceful(throw X) 이지만, 예기치 못한 오류는 502 로.
    console.error('[concept] 엔진 호출 실패:', err)
    return NextResponse.json(
      { error: 'AI 컨셉 도출에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    )
  }
}

// ─────────────────────────────────────────────────────────────────
// PUT — 확정 ConceptShape 저장 (strategicNotes.concept merge — planning-intent 미러)
// ─────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const access = await requireProjectAccess(id)
  if (!access.ok) return access.response!

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const concept = (body as { concept?: ConceptShape }).concept
  if (!concept || typeof concept !== 'object') {
    return NextResponse.json({ error: 'concept 누락' }, { status: 400 })
  }

  // 기존 strategicNotes 읽어 다른 키 보존 (read-merge-write — planning-intent 미러).
  const project = await prisma.project.findUnique({
    where: { id },
    select: { strategicNotes: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // 읽기 가드 — 객체 아니면 {} (배열·null·불량).
  const sn = project.strategicNotes
  const existing: StrategicNotes =
    sn && typeof sn === 'object' && !Array.isArray(sn)
      ? (sn as unknown as StrategicNotes)
      : {}

  const merged: StrategicNotes = { ...existing, concept }

  try {
    await prisma.project.update({
      where: { id },
      data: { strategicNotes: merged as unknown as object },
    })
  } catch (err) {
    console.error('[concept] 저장 실패:', err)
    return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

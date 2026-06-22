/**
 * /api/projects/[id]/planning-intent — ②기획의도 (BR-WS-3, 재설계 v1 §5 ②)
 *
 * action 분기 (POST body.action):
 *   - "draft"  : RFP·프로파일·자산 → 4카드 초안 (draftPlanningIntent, Pro 티어)
 *   - "refine" : PM 답변을 한 필드 값으로 정제 (refineIntentField, Flash 티어 즉답)
 *
 * PUT: 확정 초안 → toStrategicNotes → prisma.project.update({ strategicNotes }).
 *   - 기존 strategicNotes 의 비매핑 필드(clientOfficialDoc·participationDecision)는 병합 보존.
 *   - 저장된 값은 `formatStrategicNotes` 로 흘러 ③커리큘럼·제안서 생성에 주입됨.
 *
 * 인증: requireProjectAccess (recommend-coaches 패턴 — PM 본인/미배정/ADMIN·DIRECTOR/dev 우회).
 * AI 호출은 planning-intent.ts 의 invokeAi 단일 진입점만 (외부 LLM 0).
 * 저장은 기존 `Project.strategicNotes`(Json) 만 — 스키마 변경 0.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'
import { matchAssetsToRfp } from '@/lib/asset-registry'
import type { StrategicNotes } from '@/lib/ai/strategic-notes'
import {
  draftPlanningIntent,
  refineIntentField,
  toStrategicNotes,
  type PlanningIntentDraft,
  type IntentFieldKey,
} from '@/lib/program-design/planning-intent'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const INTENT_FIELDS: IntentFieldKey[] = [
  'goalInterpretation',
  'yearOverYear',
  'differentiation',
  'risk',
  'winStrategy',
]

// ─────────────────────────────────────────────────────────────────
// POST — draft (초안 생성/재생성) · refine (대화 정제)
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

  // RFP 는 두 action 공통 재료
  const project = await prisma.project.findUnique({
    where: { id },
    select: { rfpParsed: true, programProfile: true },
  })
  if (!project || !project.rfpParsed) {
    return NextResponse.json(
      { error: 'RFP 분석 먼저 진행해주세요' },
      { status: 400 },
    )
  }
  const rfp = project.rfpParsed as unknown as RfpParsed
  const profile =
    (project.programProfile as unknown as ProgramProfile | null) ?? null

  try {
    if (action === 'refine') {
      const field = (body as { field?: string }).field as IntentFieldKey | undefined
      const pmMessage = (body as { pmMessage?: string }).pmMessage
      const currentDraft = (body as { currentDraft?: PlanningIntentDraft }).currentDraft
      if (!field || !INTENT_FIELDS.includes(field)) {
        return NextResponse.json({ error: 'field 누락/유효하지 않음' }, { status: 400 })
      }
      if (!pmMessage || !pmMessage.trim()) {
        return NextResponse.json({ error: 'pmMessage 누락' }, { status: 400 })
      }
      if (!currentDraft) {
        return NextResponse.json({ error: 'currentDraft 누락' }, { status: 400 })
      }
      const value = await refineIntentField({ field, pmMessage, currentDraft, rfp })
      return NextResponse.json({ field, value })
    }

    // 기본 action = "draft"
    const assetMatches = await matchAssetsToRfp({
      rfp,
      profile: profile ?? undefined,
    }).catch(() => [])

    const draft = await draftPlanningIntent({ rfp, profile, assetMatches })
    return NextResponse.json({ draft })
  } catch (err) {
    console.error('[planning-intent] AI 호출 실패:', err)
    return NextResponse.json(
      { error: 'AI 초안 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    )
  }
}

// ─────────────────────────────────────────────────────────────────
// PUT — 확정 저장 (strategicNotes 병합)
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
  const draft = (body as { draft?: PlanningIntentDraft }).draft
  if (!draft) {
    return NextResponse.json({ error: 'draft 누락' }, { status: 400 })
  }

  // 기존 strategicNotes 읽어 비매핑 필드 보존 (clientOfficialDoc·participationDecision 등).
  const project = await prisma.project.findUnique({
    where: { id },
    select: { strategicNotes: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const existing =
    (project.strategicNotes as unknown as StrategicNotes | null) ?? {}
  const mapped = toStrategicNotes(draft)

  // 병합: 4카드가 매핑하는 6개 필드는 mapped 로 덮고, 그 외는 기존 보존.
  // 4카드 필드가 비면 mapped 에 키가 없음 → 기존 값 유지(삭제 의도면 PM 이 빈 값으로 PUT
  //   하지만, 명시 삭제 UX 는 후속). 보수적으로 매핑 6필드는 mapped 우선(빈값=미설정).
  const MAPPED_KEYS: (keyof StrategicNotes)[] = [
    'clientHiddenWants',
    'pastSimilarProjects',
    'competitorWeakness',
    'winStrategy',
    'riskFactors',
    'mustNotFail',
  ]
  const merged: StrategicNotes = { ...existing }
  for (const k of MAPPED_KEYS) {
    // 매핑 결과에 키가 있으면 덮어쓰기, 없으면(=빈 카드) 해당 매핑 필드 제거.
    if (k in mapped) {
      // @ts-expect-error — 동적 키 할당 (StrategicNotes 부분 매핑)
      merged[k] = mapped[k]
    } else {
      delete merged[k]
    }
  }

  try {
    await prisma.project.update({
      where: { id },
      data: { strategicNotes: merged as unknown as object },
    })
  } catch (err) {
    console.error('[planning-intent] 저장 실패:', err)
    return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, strategicNotes: merged })
}

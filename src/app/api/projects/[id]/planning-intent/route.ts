/**
 * /api/projects/[id]/planning-intent — ②기획의도 (BR-WS-3, 재설계 v1 §5 ②)
 *
 * action 분기 (POST body.action):
 *   - "draft"   : RFP·프로파일·자산 → 4카드 초안 (draftPlanningIntent, Pro 티어)
 *   - "refine"  : PM 답변을 한 필드 값으로 정제 (refineIntentField, Flash 티어 즉답)
 *   - "suggest" : 한 필드의 후보 2~3개 반환 (refine 미러, Flash 티어). PM 이 카드로 보고
 *                 클릭 → 즉시 입력(서버 재호출 없이). 후보는 그 필드 값으로 바로 쓰일 완성 문장.
 *                 (BR-WS-21 — 대화 → 후보 카드 → 클릭=채움)
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
import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS, FLASH_MODEL } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
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
// suggest — 한 필드의 후보 2~3개 (refine 미러, Flash 즉답)
//   refineIntentField 와 동일 의미(PM 답변 정제)이되, 단일 값 대신 서로 다른 관점의
//   후보 2~3개를 반환한다. 헬퍼를 planning-intent.ts 에 추가하지 않고(스코프 한정)
//   route 내 인라인으로 둔다. invokeAi(Flash) + safeParseJson.
// ─────────────────────────────────────────────────────────────────

const FIELD_LABEL: Record<IntentFieldKey, string> = {
  goalInterpretation: '목표 해석 (RFP 목표 재해석)',
  yearOverYear: '작년 대비 무엇이 달라야 하나',
  differentiation: '차별점 (우리 우위)',
  risk: '리스크 (담당자 우려)',
  winStrategy: '메인 솔루션·전략',
}

interface RawSuggest {
  candidates?: unknown
}

/**
 * 한 필드의 후보 2~3개 생성 (Flash 즉답). 후보는 그 필드 값으로 바로 쓰일 완성 문장.
 * pmMessage 가 있으면 힌트로 반영, 없으면 RFP·현재 초안 맥락에서 AI 가 초안 후보.
 * 점수·SROI 단정 금지(기존 규칙 유지).
 */
async function suggestIntentField(input: {
  field: IntentFieldKey
  pmMessage?: string
  currentDraft: PlanningIntentDraft
  rfp?: RfpParsed | null
}): Promise<string[]> {
  const { field, pmMessage, currentDraft, rfp } = input
  const current = currentDraft[field]?.value ?? ''
  const hint = pmMessage?.trim()

  const prompt = `당신은 언더독스(교육·창업지원 전문) 기획 PM 의 보조입니다.
"${FIELD_LABEL[field]}" 카드에 그대로 들어갈 **서로 다른 후보 2~3개**를 제안하세요.
각 후보는 그 카드 값으로 바로 쓰일 1~2문장의 완성된 한국어 문장입니다(라벨·메타설명 아님).
서로 다른 관점·강조점을 갖되, 기획의도로 읽히게 간결하게. 과장·새 사실 추가·점수/SROI 수치 단정 금지.
${rfp?.projectName ? `\n[사업명] ${rfp.projectName}` : ''}
[현재 카드 초안] ${current || '(비어있음)'}
${hint ? `[PM 힌트] ${hint}` : '[PM 힌트] (없음 — RFP·현재 초안 맥락에서 초안 후보를 제안)'}

반드시 아래 JSON 만 반환 (마크다운 없이):
{ "candidates": ["후보 1", "후보 2", "후보 3"] }`

  const result = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.LIGHT,
    temperature: 0.6,
    model: FLASH_MODEL,
    label: 'planning-intent-suggest',
  })

  const raw = safeParseJson<RawSuggest>(result.raw, 'planning-intent-suggest')
  const list = Array.isArray(raw.candidates) ? raw.candidates : []
  // 검증: 문자열만·trim·빈 항목 drop·중복 제거·최대 3개.
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of list) {
    if (typeof c !== 'string') continue
    const v = c.trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= 3) break
  }
  return out
}

// ─────────────────────────────────────────────────────────────────
// POST — draft (초안 생성/재생성) · refine (대화 정제) · suggest (후보 2~3개)
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

    if (action === 'suggest') {
      const field = (body as { field?: string }).field as IntentFieldKey | undefined
      const pmMessage = (body as { pmMessage?: string }).pmMessage
      const currentDraft = (body as { currentDraft?: PlanningIntentDraft }).currentDraft
      if (!field || !INTENT_FIELDS.includes(field)) {
        return NextResponse.json({ error: 'field 누락/유효하지 않음' }, { status: 400 })
      }
      if (!currentDraft) {
        return NextResponse.json({ error: 'currentDraft 누락' }, { status: 400 })
      }
      // pmMessage 는 선택(빈 "대화로 채우기" 도 후보 제안). 후보 검증은 헬퍼 내부.
      const candidates = await suggestIntentField({ field, pmMessage, currentDraft, rfp })
      return NextResponse.json({ field, candidates })
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

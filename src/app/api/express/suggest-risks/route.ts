/**
 * POST /api/express/suggest-risks
 *
 * S3 — Risk Mitigation 자동 제안 (Wave U / U5, 2026-05-19).
 *
 * 현재 ExpressDraft 를 보고 평가위원이 의심할 가능성이 높은 위험 3~5개 +
 * 언더독스 자산 기반 능동 답변을 AI 로 자동 생성.
 *
 * Body: { projectId }
 * Response: { suggestions: RiskMitigation[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { ExpressDraftSchema, RiskMitigationItemSchema } from '@/lib/express/schema'
import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

const BodySchema = z.object({
  projectId: z.string().min(1),
})

const SuggestionsSchema = z.object({
  suggestions: z.array(RiskMitigationItemSchema).max(8),
})

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', detail: err }, { status: 400 })
  }

  const access = await requireProjectAccess(body.projectId)
  if (!access.ok) return access.response!

  const project = await prisma.project.findUnique({
    where: { id: body.projectId },
    select: { rfpParsed: true, expressDraft: true, name: true, client: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const draftParsed = ExpressDraftSchema.safeParse(project.expressDraft)
  if (!draftParsed.success) {
    return NextResponse.json({
      suggestions: [],
      reason: 'ExpressDraft 비어있음 — 1차본 더 채우세요',
    })
  }
  const draft = draftParsed.data
  const rfp = project.rfpParsed as unknown as RfpParsed | null

  // 1차본이 너무 비어있으면 의미있는 risk 추출 불가
  const filledSlots =
    (draft.intent ? 1 : 0) +
    (draft.beforeAfter?.before ? 1 : 0) +
    (draft.beforeAfter?.after ? 1 : 0) +
    (draft.keyMessages?.length ?? 0) +
    Object.values(draft.sections ?? {}).filter((s) => (s?.length ?? 0) > 100).length

  if (filledSlots < 5) {
    return NextResponse.json({
      suggestions: [],
      reason: `1차본 미완성 (${filledSlots} 슬롯) — 5개 이상 채워야 의미있는 risk 추출`,
    })
  }

  const channel = draft.meta?.autoDiagnosis?.channel?.detected ?? 'B2G'
  const existingRiskTexts = (draft.risks ?? []).map((r) => r.risk).join('\n')

  const prompt = `당신은 ${channel} 채널 제안서 평가위원입니다.
다음 1차본을 평가위원의 시각에서 보고, 의심할 만한 risk 3~5개를 도출하세요.
각 risk 에 대해 언더독스가 보유한 자산·실적·차별화로 능동 답변 (mitigation) 도 작성.

[발주처]
${project.client ?? '미상'}

[RFP 핵심]
${rfp?.summary?.slice(0, 500) ?? '(RFP 분석 정보 없음)'}

[1차본]
- 의도: ${draft.intent ?? '(미작성)'}
- Before: ${draft.beforeAfter?.before ?? '(미작성)'}
- After: ${draft.beforeAfter?.after ?? '(미작성)'}
- 핵심 메시지: ${(draft.keyMessages ?? []).join(' / ')}
- 차별화 자산: ${(draft.differentiators ?? [])
    .filter((d) => d.acceptedByPm)
    .map((d) => d.assetId)
    .join(', ') || '(미수락)'}
- 섹션 1 (배경): ${(draft.sections?.['1'] ?? '').slice(0, 300)}
- 섹션 2 (전략): ${(draft.sections?.['2'] ?? '').slice(0, 300)}
- 섹션 6 (임팩트): ${(draft.sections?.['6'] ?? '').slice(0, 300)}

[이미 답변한 risk — 중복 금지]
${existingRiskTexts || '(없음)'}

[지시]
- ${channel} 평가위원이 가장 의심할 만한 risk 부터.
- B2G: 운영 경험·예산 적정성·SROI 검증 가능성·반복 가능성
- B2B: ROI 회수·내부 의사결정·다른 벤더 대비 차별점
- renewal: 이전년도 한계·신규성 부재·연속성 위협
- 능동 답변 (mitigation) 은 반드시 언더독스 자산·실적·구체 숫자 1개 이상 포함.
- severity: 사업 자체 흔드는 → critical, 품질 저하 → major, 부분 영향 → minor.
- source 는 항상 "ai-suggested", acceptedByPm 은 false 로.

JSON 만 출력 (코드 펜스 X):
{
  "suggestions": [
    { "risk": "...", "mitigation": "...", "severity": "critical|major|minor", "source": "ai-suggested", "acceptedByPm": false }
  ]
}`

  let raw: string
  try {
    const r = await invokeAi({
      prompt,
      maxTokens: 4096,
      temperature: 0.4,
      label: 'express/suggest-risks',
    })
    raw = r.raw
  } catch (err) {
    console.error('[suggest-risks] invokeAi failed', err)
    return NextResponse.json(
      { error: 'AI 호출 실패', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }

  let parsed: z.infer<typeof SuggestionsSchema>
  try {
    const json = safeParseJson(raw, 'express/suggest-risks')
    parsed = SuggestionsSchema.parse(json)
  } catch (err) {
    console.error('[suggest-risks] parse failed', err, 'raw:', raw.slice(0, 500))
    return NextResponse.json(
      { error: 'AI 응답 파싱 실패', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }

  return NextResponse.json({ suggestions: parsed.suggestions })
}

/**
 * POST /api/content-hub/submit — 2026-05-19
 *
 * PM (또는 누구든 로그인 사용자) 가 새 자산을 제안. status='developing' 강제.
 * Admin/Director 가 /admin/content-hub 검수 대기 큐에서 승인/반려.
 *
 * AI 자동 보완 옵션 (autoFill=true):
 *  - PM 이 텍스트만 잘 써내면 category·evidenceType·applicableSections·
 *    valueChainStage·keywords·narrativeSnippet 모두 AI 가 추론
 *  - PM 입력 부담 최소화
 *
 * Body:
 *  { name, body, sourceUrl?, submitterNote, projectId?, autoFill? }
 *  또는 (PM이 명시):
 *  { name, body, category, evidenceType, applicableSections, valueChainStage,
 *    narrativeSnippet?, keywords?, submitterNote, ... }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { AssetProposalSchema } from '@/lib/ingest/web-ingester'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ManualSchema = z.object({
  mode: z.literal('manual').optional(),
  name: z.string().min(2).max(120),
  category: z.enum([
    'methodology',
    'content',
    'product',
    'human',
    'data',
    'framework',
  ]),
  evidenceType: z.enum(['quantitative', 'structural', 'case', 'methodology']),
  applicableSections: z.array(
    z.enum([
      'proposal-background',
      'curriculum',
      'coaches',
      'budget',
      'impact',
      'org-team',
      'other',
    ]),
  ),
  valueChainStage: z.enum(['impact', 'input', 'output', 'activity', 'outcome']),
  narrativeSnippet: z.string().min(20).max(800),
  keyNumbers: z.array(z.string()).max(20).optional(),
  keywords: z.array(z.string()).max(25).optional(),
  submitterNote: z.string().max(500).optional(),
  sourceUrl: z.string().url().optional(),
})

const AssistSchema = z.object({
  mode: z.literal('assist'),
  /** PM 이 자유롭게 쓰는 본문 — AI 가 자산 후보로 분석 */
  body: z.string().min(40).max(8000),
  /** PM 이 짐작하는 자산 이름 (옵션 — AI 가 더 좋게 제안할 수 있음) */
  name: z.string().min(2).max(120).optional(),
  submitterNote: z.string().max(500).optional(),
  sourceUrl: z.string().url().optional(),
})

const BodySchema = z.union([ManualSchema, AssistSchema])

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as { id?: string }).id

  try {
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    let assetData: {
      name: string
      category: string
      evidenceType: string
      applicableSections: string[]
      valueChainStage: string
      narrativeSnippet: string
      keyNumbers: string[]
      keywords: string[]
    }

    if ('mode' in parsed.data && parsed.data.mode === 'assist') {
      // AI 보완 모드 — PM 자유 텍스트 → 카테고리·태그·snippet 추론
      const prompt = `당신은 언더독스의 콘텐츠 큐레이터입니다. PM 이 제안한 아래 텍스트를 보고
자산 등록 후보로 정리하세요.

[PM 이 쓴 본문]
${parsed.data.body}

${parsed.data.name ? `[PM 이 짐작한 이름] ${parsed.data.name}\n` : ''}

자산 후보 JSON 출력 (9 필드 모두 포함):
  name (2~120자)
  category: methodology|content|product|human|data|framework
  evidenceType: quantitative|structural|case|methodology
  applicableSections: ["proposal-background"|"curriculum"|...] 1~3개
  valueChainStage: impact|input|output|activity|outcome
  narrativeSnippet: 제안서 본문에 인용할 1~2 문장 한국어 (원본 그대로 X — 요약·재구성)
  keyNumbers: 본문에 명시된 숫자·연도 배열
  keywords: RFP 매칭용 5~10개
  rejected: false (또는 생략)

자산화 부적절하면 {"rejected": true, "rejectionReason": "..."} 만.

JSON 만 출력. 마크다운 펜스 X.`

      const r = await invokeAi({
        prompt,
        maxTokens: AI_TOKENS.STANDARD,
        temperature: 0.3,
        label: 'asset-submit-assist',
      })
      const raw = safeParseJson<unknown>(r.raw, 'asset-submit-assist')
      const v = AssetProposalSchema.safeParse(raw)
      if (!v.success) {
        return NextResponse.json(
          { error: 'AI 응답 형식 오류 — 다시 시도하거나 수동 모드로 전환' },
          { status: 502 },
        )
      }
      if ('rejected' in v.data && v.data.rejected === true) {
        return NextResponse.json(
          {
            error:
              'AI 판단: 자산화 부적절. 이유: ' +
              (v.data.rejectionReason ?? '미상'),
          },
          { status: 400 },
        )
      }
      const accepted = v.data as Exclude<
        typeof v.data,
        { rejected: true }
      >
      assetData = {
        name: accepted.name,
        category: accepted.category,
        evidenceType: accepted.evidenceType,
        applicableSections: accepted.applicableSections,
        valueChainStage: accepted.valueChainStage,
        narrativeSnippet: accepted.narrativeSnippet,
        keyNumbers: accepted.keyNumbers ?? [],
        keywords: accepted.keywords ?? [],
      }
    } else {
      // 수동 모드 — PM이 모든 필드 명시
      const d = parsed.data as z.infer<typeof ManualSchema>
      assetData = {
        name: d.name,
        category: d.category,
        evidenceType: d.evidenceType,
        applicableSections: d.applicableSections,
        valueChainStage: d.valueChainStage,
        narrativeSnippet: d.narrativeSnippet,
        keyNumbers: d.keyNumbers ?? [],
        keywords: d.keywords ?? [],
      }
    }

    const submitterNote =
      'submitterNote' in parsed.data
        ? parsed.data.submitterNote
        : undefined
    const sourceUrl =
      'sourceUrl' in parsed.data ? parsed.data.sourceUrl : undefined

    const created = await prisma.contentAsset.create({
      data: {
        name: assetData.name,
        category: assetData.category,
        applicableSections: assetData.applicableSections as unknown as object,
        valueChainStage: assetData.valueChainStage,
        evidenceType: assetData.evidenceType,
        keywords: assetData.keywords as unknown as object,
        narrativeSnippet: assetData.narrativeSnippet,
        keyNumbers: assetData.keyNumbers as unknown as object,
        status: 'developing', // 검수 대기
        version: 1,
        sourceReferences: sourceUrl ? ([sourceUrl] as unknown as object) : undefined,
        lastReviewedAt: new Date(),
        createdById: userId,
        updatedById: userId,
        submitterNote: submitterNote ?? null,
      },
      select: { id: true, name: true, status: true },
    })

    return NextResponse.json({
      ok: true,
      asset: created,
      message: '검수 대기 등록 완료 — Admin 승인 후 추천 풀에 반영됩니다.',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/content-hub/submit] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

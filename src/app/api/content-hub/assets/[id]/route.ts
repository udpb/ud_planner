/**
 * /api/content-hub/assets/[id] — 단건 조회·수정·삭제
 *
 * Phase H Wave H3 (ADR-010, docs/architecture/content-hub.md §"삭제 vs 아카이브")
 *
 * GET    : 단건 조회 (children · parent 포함)
 * PATCH  : 필드 업데이트 (1 단 계층 · 순환 방지 guard)
 * DELETE : 하드 삭제 — 과거 참조 대비 원칙적으로 차단. 아카이브(PATCH status=archived) 권장.
 *          children 이 있으면 거부.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CATEGORY = z.enum([
  'methodology',
  'content',
  'product',
  'human',
  'data',
  'framework',
])
const VALUE_CHAIN_STAGE = z.enum([
  'impact',
  'input',
  'output',
  'activity',
  'outcome',
])
const EVIDENCE_TYPE = z.enum(['quantitative', 'structural', 'case', 'methodology'])
const STATUS = z.enum(['stable', 'developing', 'archived'])
const SECTION = z.enum([
  'proposal-background',
  'org-team',
  'curriculum',
  'coaches',
  'budget',
  'impact',
  'other',
])

/**
 * PATCH 용 — 모든 필드 optional. 필수 필드가 포함되면 비어있지 않음 검증.
 */
const AssetPatchSchema = z.object({
  name: z.string().min(1).optional(),
  category: CATEGORY.optional(),
  narrativeSnippet: z.string().min(50, '제안서 초안은 최소 50자').optional(),
  applicableSections: z.array(SECTION).min(1).optional(),
  valueChainStage: VALUE_CHAIN_STAGE.optional(),

  parentId: z.string().nullable().optional(),
  evidenceType: EVIDENCE_TYPE.optional(),
  keywords: z.array(z.string()).optional(),
  keyNumbers: z.array(z.string()).optional(),
  sourceReferences: z.array(z.string().url()).optional(),
  programProfileFit: z.any().optional().nullable(),
  status: STATUS.optional(),
  version: z.number().int().positive().optional(),
  lastReviewedAt: z.string().optional(),
})

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────
// GET — 단건
// ─────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }
  const { id } = await params
  const asset = await prisma.contentAsset.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true, status: true } },
    },
  })
  if (!asset) {
    return NextResponse.json({ error: '자산을 찾을 수 없습니다.' }, { status: 404 })
  }
  return NextResponse.json(asset)
}

// ─────────────────────────────────────────
// PATCH — 수정
// ─────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const parsed = AssetPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '검증 실패', issues: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const data = parsed.data

  // 1. 존재 확인
  const current = await prisma.contentAsset.findUnique({
    where: { id },
    include: { children: { select: { id: true } } },
  })
  if (!current) {
    return NextResponse.json({ error: '자산을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 2. 순환 방지 — parentId 가 자기 자신이면 거부
  if (data.parentId !== undefined && data.parentId === id) {
    return NextResponse.json(
      { error: '자기 자신을 부모로 지정할 수 없습니다.' },
      { status: 422 },
    )
  }

  // 3. 1단 계층 guard — parentId 가 지정되면 그 자산이 top-level 이어야 함.
  //    또한 현재 자산이 children 을 가지고 있으면 자식이 있는 상태에서 부모가 될 수 없음
  //    (= child 로 전환 불가, 1단 초과 방지)
  if (data.parentId) {
    const parentRow = await prisma.contentAsset.findUnique({
      where: { id: data.parentId },
      select: { id: true, parentId: true },
    })
    if (!parentRow) {
      return NextResponse.json(
        { error: '부모 자산을 찾을 수 없습니다.' },
        { status: 422 },
      )
    }
    if (parentRow.parentId !== null) {
      return NextResponse.json(
        { error: '1단 계층만 허용됩니다. 부모가 될 수 있는 자산은 top-level 만 가능.' },
        { status: 422 },
      )
    }
    // 현재 자산이 children 을 가지면 자신이 부모 역할 중 → child 로 전환 금지
    if (current.children.length > 0) {
      return NextResponse.json(
        {
          error:
            '이 자산은 자식 자산을 가지고 있어 다른 자산의 하위로 이동할 수 없습니다. 먼저 자식을 분리하세요.',
        },
        { status: 422 },
      )
    }
  }

  const userId = (session.user as { id?: string } | undefined)?.id

  const updated = await prisma.contentAsset.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.narrativeSnippet !== undefined && {
        narrativeSnippet: data.narrativeSnippet,
      }),
      ...(data.applicableSections !== undefined && {
        applicableSections: data.applicableSections,
      }),
      ...(data.valueChainStage !== undefined && {
        valueChainStage: data.valueChainStage,
      }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.evidenceType !== undefined && { evidenceType: data.evidenceType }),
      ...(data.keywords !== undefined && { keywords: data.keywords }),
      ...(data.keyNumbers !== undefined && { keyNumbers: data.keyNumbers }),
      ...(data.sourceReferences !== undefined && {
        sourceReferences: data.sourceReferences,
      }),
      ...(data.programProfileFit !== undefined && {
        programProfileFit: data.programProfileFit ?? undefined,
      }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.version !== undefined && { version: data.version }),
      ...(data.lastReviewedAt !== undefined && {
        lastReviewedAt: data.lastReviewedAt
          ? new Date(data.lastReviewedAt)
          : new Date(),
      }),
      updatedById: userId ?? null,
    },
  })

  return NextResponse.json(updated)
}

// ─────────────────────────────────────────
// DELETE — 하드 삭제 (원칙적으로 지양, 아카이브 권장)
// ─────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }
  const { id } = await params

  const current = await prisma.contentAsset.findUnique({
    where: { id },
    include: { children: { select: { id: true } } },
  })
  if (!current) {
    return NextResponse.json({ error: '자산을 찾을 수 없습니다.' }, { status: 404 })
  }
  if (current.children.length > 0) {
    return NextResponse.json(
      {
        error:
          '자식 자산이 있어 하드 삭제할 수 없습니다. 먼저 자식을 분리하거나 아카이브하세요.',
      },
      { status: 409 },
    )
  }

  await prisma.contentAsset.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

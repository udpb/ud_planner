/**
 * /api/content-hub/assets — 목록 + 생성
 *
 * Phase H Wave H3 (ADR-010, docs/architecture/content-hub.md §"관리자 UI 스펙")
 *
 * GET  : 필터(카테고리·단계·상태·부모·검색)로 ContentAsset 목록 반환
 * POST : 신규 자산 생성
 *
 * 권한: v2.0 는 로그인한 모든 유저 허용 (담당자 1명 전제).
 * 하위 호환 고려해 role 분기 없음 — ADR-010 명시.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────
// 공통 zod 스키마 — 필수 5 필드 + 선택 필드
// ─────────────────────────────────────────

/**
 * AssetCategory · ValueChainStage · EvidenceType · AssetStatus —
 * 런타임에서 DB 문자열을 그대로 저장 (asset-registry.ts 유니온과 1:1).
 */
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
 * 생성·수정 공용 입력 스키마.
 * 필수 5 필드는 .min(1) 혹은 .nonempty 로 강제.
 */
const AssetInputSchema = z.object({
  // 필수 5
  name: z.string().min(1, '이름은 필수'),
  category: CATEGORY,
  narrativeSnippet: z.string().min(50, '제안서 초안은 최소 50자'),
  applicableSections: z.array(SECTION).min(1, '적용 섹션 1개 이상'),
  valueChainStage: VALUE_CHAIN_STAGE,

  // 선택
  parentId: z.string().nullable().optional(),
  evidenceType: EVIDENCE_TYPE.default('structural'),
  keywords: z.array(z.string()).optional().default([]),
  keyNumbers: z.array(z.string()).optional().default([]),
  sourceReferences: z.array(z.string().url('유효한 URL 이어야 함')).optional().default([]),
  programProfileFit: z.any().optional().nullable(),
  status: STATUS.default('stable'),
  version: z.number().int().positive().default(1),
  lastReviewedAt: z.string().optional(),
})

export type AssetInput = z.infer<typeof AssetInputSchema>

// ─────────────────────────────────────────
// GET — 목록
// ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const stage = searchParams.get('stage')
  const status = searchParams.get('status') // 기본은 archived 제외
  const parent = searchParams.get('parent') // 'all' | 'top-level' | 'child'
  const search = searchParams.get('search')

  const where: Record<string, unknown> = {}
  if (category) where.category = category
  if (stage) where.valueChainStage = stage

  // 상태 필터 — 명시 안 되면 archived 숨김
  if (status) {
    where.status = status
  } else {
    where.status = { not: 'archived' }
  }

  // 부모 유무 필터
  if (parent === 'top-level') {
    where.parentId = null
  } else if (parent === 'child') {
    where.parentId = { not: null }
  }

  // 이름 검색
  if (search) {
    where.name = { contains: search, mode: 'insensitive' }
  }

  const assets = await prisma.contentAsset.findMany({
    where,
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { children: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(assets)
}

// ─────────────────────────────────────────
// POST — 생성
// ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const parsed = AssetInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '검증 실패', issues: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const data = parsed.data

  // 1 단 계층 guard — parentId 가 지정되면 그 자산의 parentId 가 null 이어야 함
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
  }

  const userId = (session.user as { id?: string } | undefined)?.id

  const created = await prisma.contentAsset.create({
    data: {
      name: data.name,
      category: data.category,
      parentId: data.parentId ?? null,
      applicableSections: data.applicableSections,
      valueChainStage: data.valueChainStage,
      evidenceType: data.evidenceType,
      keywords: data.keywords ?? [],
      keyNumbers: data.keyNumbers ?? [],
      sourceReferences: data.sourceReferences ?? [],
      programProfileFit: data.programProfileFit ?? undefined,
      narrativeSnippet: data.narrativeSnippet,
      status: data.status,
      version: data.version,
      lastReviewedAt: data.lastReviewedAt
        ? new Date(data.lastReviewedAt)
        : new Date(),
      createdById: userId ?? null,
      updatedById: userId ?? null,
    },
  })

  return NextResponse.json(created, { status: 201 })
}

/**
 * POST /api/admin/seed-content-assets
 *
 * UD_ASSETS_SEED + HIERARCHY_EXAMPLES 를 ContentAsset 테이블에 upsert.
 * 운영 환경에서 새 자산 추가·갱신 시 사용 (CLI npm run db:seed:content-assets 의 web 버전).
 *
 * 멱등 — 같은 id 가 있으면 update, 없으면 insert. 사용자가 UI 로 수정한 자산도
 * 시드 재실행 시 덮어쓰기됨 (주의).
 *
 * 인증: NextAuth 세션 + 역할 ADMIN | DIRECTOR (서버 컴포넌트와 동일 정책).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UD_ASSETS_SEED, type UdAsset } from '@/lib/asset-registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Phase H Wave H5 계층 예시 5건 (prisma/seed-content-assets.ts 와 동기 유지)
const HIERARCHY_EXAMPLES: UdAsset[] = [
  {
    id: 'asset-ai-solopreneur-w1',
    name: 'AI 솔로프리너 — Week 1: 발견',
    category: 'content',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: ['AI', '솔로프리너', '발견', '프롬프트'],
    narrativeSnippet:
      'Week 1: 본인의 강점·기술·관심사를 AI 프롬프트로 추출하고, 시장 검증 가설을 빠르게 테스트한다.',
    keyNumbers: ['1주차', '2시간'],
    status: 'stable',
    lastReviewedAt: '2026-04-24T00:00:00.000Z',
  },
  {
    id: 'asset-ai-solopreneur-w2',
    name: 'AI 솔로프리너 — Week 2: 검증',
    category: 'content',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: ['AI', '솔로프리너', '검증', 'MVP'],
    narrativeSnippet:
      'Week 2: AI 도구로 만든 MVP 를 잠재 고객 5명에게 검증, 학습된 가설을 다음 주차로.',
    keyNumbers: ['2주차', '5명 검증'],
    status: 'stable',
    lastReviewedAt: '2026-04-24T00:00:00.000Z',
  },
  {
    id: 'asset-ai-solopreneur-w3',
    name: 'AI 솔로프리너 — Week 3: 출시',
    category: 'content',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: ['AI', '솔로프리너', '출시', '운영'],
    narrativeSnippet:
      'Week 3: AI 자동화 + 1인 운영 시스템을 구축하고, 출시·과금·운영 리듬을 잡는다.',
    keyNumbers: ['3주차', '출시'],
    status: 'stable',
    lastReviewedAt: '2026-04-24T00:00:00.000Z',
  },
  {
    id: 'asset-ax-guidebook-ch1',
    name: 'AX 가이드북 — Chapter 1: AX 진단',
    category: 'content',
    applicableSections: ['curriculum', 'proposal-background'],
    valueChainStage: 'output',
    evidenceType: 'structural',
    keywords: ['AX', '가이드북', '진단', '평가'],
    narrativeSnippet:
      'Chapter 1: 조직의 AI 전환 (AX) 성숙도를 5 단계로 진단하고, 우선 적용 영역 3개를 도출.',
    keyNumbers: ['5 단계', '3 영역'],
    status: 'stable',
    lastReviewedAt: '2026-04-24T00:00:00.000Z',
  },
  {
    id: 'asset-ax-guidebook-ch2',
    name: 'AX 가이드북 — Chapter 2: AX 실행',
    category: 'content',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: ['AX', '가이드북', '실행', '워크플로우'],
    narrativeSnippet:
      'Chapter 2: 도출된 우선 영역에 AI 도구를 적용해 워크플로우 4종을 자동화하고 효과를 측정.',
    keyNumbers: ['4 워크플로우', '효과 측정'],
    status: 'stable',
    lastReviewedAt: '2026-04-24T00:00:00.000Z',
  },
]

const CHILD_PARENT_MAP: Record<string, string> = {
  'asset-ai-solopreneur-w1': 'asset-ai-solopreneur',
  'asset-ai-solopreneur-w2': 'asset-ai-solopreneur',
  'asset-ai-solopreneur-w3': 'asset-ai-solopreneur',
  'asset-ax-guidebook-ch1': 'asset-ax-guidebook',
  'asset-ax-guidebook-ch2': 'asset-ax-guidebook',
}

export async function POST(_req: NextRequest) {
  // 인증 + 역할 검증
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user || (role !== 'ADMIN' && role !== 'DIRECTOR')) {
    return NextResponse.json(
      { error: 'Forbidden — ADMIN/DIRECTOR 역할 필요' },
      { status: 403 },
    )
  }

  try {
    const log: string[] = []
    let upserted = 0

    // 1 단계: top-level 자산
    for (const asset of UD_ASSETS_SEED) {
      await prisma.contentAsset.upsert({
        where: { id: asset.id },
        create: {
          id: asset.id,
          name: asset.name,
          category: asset.category,
          parentId: null,
          applicableSections: asset.applicableSections as unknown as object,
          valueChainStage: asset.valueChainStage,
          evidenceType: asset.evidenceType,
          keywords: asset.keywords ? (asset.keywords as unknown as object) : undefined,
          programProfileFit: asset.programProfileFit
            ? (asset.programProfileFit as unknown as object)
            : undefined,
          narrativeSnippet: asset.narrativeSnippet,
          keyNumbers: asset.keyNumbers ? (asset.keyNumbers as unknown as object) : undefined,
          status: asset.status,
          version: 1,
          sourceReferences: asset.sourceReferences
            ? (asset.sourceReferences as unknown as object)
            : undefined,
          lastReviewedAt: new Date(asset.lastReviewedAt),
        },
        update: {
          name: asset.name,
          category: asset.category,
          applicableSections: asset.applicableSections as unknown as object,
          valueChainStage: asset.valueChainStage,
          evidenceType: asset.evidenceType,
          keywords: asset.keywords ? (asset.keywords as unknown as object) : undefined,
          programProfileFit: asset.programProfileFit
            ? (asset.programProfileFit as unknown as object)
            : undefined,
          narrativeSnippet: asset.narrativeSnippet,
          keyNumbers: asset.keyNumbers ? (asset.keyNumbers as unknown as object) : undefined,
          status: asset.status,
          sourceReferences: asset.sourceReferences
            ? (asset.sourceReferences as unknown as object)
            : undefined,
          lastReviewedAt: new Date(asset.lastReviewedAt),
        },
      })
      upserted += 1
      log.push(`✓ ${asset.id} (${asset.category} / ${asset.valueChainStage})`)
    }

    // 2 단계: children
    for (const asset of HIERARCHY_EXAMPLES) {
      const parentId = CHILD_PARENT_MAP[asset.id]
      if (!parentId) continue
      await prisma.contentAsset.upsert({
        where: { id: asset.id },
        create: {
          id: asset.id,
          name: asset.name,
          category: asset.category,
          parentId,
          applicableSections: asset.applicableSections as unknown as object,
          valueChainStage: asset.valueChainStage,
          evidenceType: asset.evidenceType,
          keywords: asset.keywords ? (asset.keywords as unknown as object) : undefined,
          programProfileFit: asset.programProfileFit
            ? (asset.programProfileFit as unknown as object)
            : undefined,
          narrativeSnippet: asset.narrativeSnippet,
          keyNumbers: asset.keyNumbers ? (asset.keyNumbers as unknown as object) : undefined,
          status: asset.status,
          version: 1,
          sourceReferences: asset.sourceReferences
            ? (asset.sourceReferences as unknown as object)
            : undefined,
          lastReviewedAt: new Date(asset.lastReviewedAt),
        },
        update: {
          name: asset.name,
          parentId,
          applicableSections: asset.applicableSections as unknown as object,
          valueChainStage: asset.valueChainStage,
          evidenceType: asset.evidenceType,
          keywords: asset.keywords ? (asset.keywords as unknown as object) : undefined,
          narrativeSnippet: asset.narrativeSnippet,
          keyNumbers: asset.keyNumbers ? (asset.keyNumbers as unknown as object) : undefined,
          status: asset.status,
          lastReviewedAt: new Date(asset.lastReviewedAt),
        },
      })
      upserted += 1
      log.push(`✓ ${asset.id} (child of ${parentId})`)
    }

    const total = await prisma.contentAsset.count()
    return NextResponse.json({
      ok: true,
      upserted,
      totalInDb: total,
      breakdown: {
        topLevel: UD_ASSETS_SEED.length,
        children: HIERARCHY_EXAMPLES.length,
      },
      log,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[/api/admin/seed-content-assets] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/projects/[id]/assets — UD Asset 승인/해제 토글
 *
 * Phase G Wave 5 (ADR-009 · docs/architecture/asset-registry.md §"Step 1 매칭 자산 패널").
 *
 * PM 이 Step 1 출력 탭 하단의 매칭 자산 패널에서 "제안서에 포함" 토글을 조작하면
 * 이 엔드포인트로 요청이 온다. Project.acceptedAssetIds (Json? — string[]) 에 해당
 * assetId 를 추가/제거한다.
 *
 * 요청 바디:
 *   { assetId: string, accepted: boolean }
 *
 * 응답:
 *   { acceptedAssetIds: string[] }
 *
 * 인증: NextAuth 세션 필수.
 *
 * 관련:
 *   - ADR-009: docs/decisions/009-asset-registry.md
 *   - ADR-010: docs/decisions/010-content-hub.md (DB 저장소 전환)
 *   - 스펙:    docs/architecture/asset-registry.md · docs/architecture/content-hub.md
 *   - 자산 풀: Prisma.ContentAsset (DB) — getAllAssets() / findAssetById()
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findAssetById } from '@/lib/asset-registry'

// ─────────────────────────────────────────
// 입력 검증 스키마
// ─────────────────────────────────────────

const PostBodySchema = z.object({
  assetId: z.string().min(1).max(200),
  accepted: z.boolean(),
})

type Params = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────
// POST 핸들러 — 토글
// ─────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  // 인증
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // 요청 파싱
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const parsed = PostBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { assetId, accepted } = parsed.data

  // 자산 ID 가 Content Hub(DB) 에 존재하는지 확인 (오탈자·구 ID 방지)
  if (!(await findAssetById(assetId))) {
    return NextResponse.json(
      { error: 'UNKNOWN_ASSET_ID', assetId },
      { status: 404 },
    )
  }

  // 프로젝트 현재 상태 조회
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, acceptedAssetIds: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 })
  }

  // 현재 승인 ID 집합 (JSON 컬럼 → string[])
  const current: string[] = Array.isArray(project.acceptedAssetIds)
    ? (project.acceptedAssetIds as string[]).filter((v) => typeof v === 'string')
    : []

  // 토글 연산
  let next: string[]
  if (accepted) {
    // 이미 있으면 멱등 — 그대로 유지
    next = current.includes(assetId) ? current : [...current, assetId]
  } else {
    next = current.filter((v) => v !== assetId)
  }

  // 저장
  try {
    await prisma.project.update({
      where: { id },
      data: {
        acceptedAssetIds: next as unknown as object, // Prisma.InputJsonValue
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/projects/assets] POST 실패:', err)
    return NextResponse.json({ error: 'DB_UPDATE_FAILED', message }, { status: 500 })
  }

  return NextResponse.json({ acceptedAssetIds: next })
}

/**
 * POST /api/dev/seed-e2e
 *
 * Playwright E2E 전용 seed 엔드포인트 (Phase 4-coach-integration, 2026-05-03).
 *
 * 보호:
 *   - production 에서 무조건 404 반환 — 절대 운영 노출 X
 *   - 헤더 'x-e2e-secret' 가 환경변수 E2E_SECRET 와 일치해야 동작
 *
 * Body: {
 *   userEmail?: string  — default: 'e2e-test@udimpact.ai'
 *   reset?: boolean     — default: false. true 면 기존 e2e 프로젝트 모두 삭제
 * }
 *
 * 응답: {
 *   userId: string
 *   projectId: string  — 본 endpoint 가 생성한 fresh Project ID
 *   message: string
 * }
 *
 * 사용처:
 *   tests/e2e/_fixtures/seed.ts 가 호출 → spec 시작 전 fresh state 보장
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // 1. production 차단
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 2. secret 검증
  const expected = process.env.E2E_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'E2E_SECRET 환경변수 미설정' },
      { status: 503 },
    )
  }
  const provided = req.headers.get('x-e2e-secret')
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. body 파싱
  const body = (await req.json().catch(() => ({}))) as {
    userEmail?: string
    reset?: boolean
  }
  const userEmail = body.userEmail ?? 'e2e-test@udimpact.ai'

  // 4. user upsert
  const user = await prisma.user.upsert({
    where: { email: userEmail },
    create: { email: userEmail, name: 'E2E Test User', role: 'PM' },
    update: {},
  })

  // 5. reset — 기존 e2e 프로젝트 모두 삭제
  if (body.reset) {
    await prisma.project.deleteMany({
      where: {
        pmId: user.id,
        name: { startsWith: '[E2E]' },
      },
    })
  }

  // 6. fresh project 생성
  const project = await prisma.project.create({
    data: {
      name: `[E2E] Test Project ${new Date().toISOString().slice(0, 19)}`,
      client: '[E2E] 한국청년창업진흥원',
      projectType: 'B2G',
      status: 'DRAFT',
      pmId: user.id,
    },
  })

  return NextResponse.json({
    userId: user.id,
    projectId: project.id,
    message: 'E2E seed OK',
  })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/impact-modules
 *
 * ProgramProfile Step 1 IMPACT 모듈 칩 선택기가 사용.
 * DB 에 seed(prisma/seed-data/impact-modules.json, 18건) 가 적재되지 않은 환경에서는
 * 빈 배열을 반환하고, 클라이언트는 하드코딩 fallback 18코드를 사용한다.
 *
 * 인증 불필요 (modules 라우트와 동일한 공개 읽기 정책).
 */
export async function GET() {
  try {
    const modules = await prisma.impactModule.findMany({
      where: { isActive: true },
      orderBy: [{ stageOrder: 'asc' }, { moduleOrder: 'asc' }],
      select: {
        moduleCode: true,
        moduleName: true,
        stage: true,
        coreQuestion: true,
      },
    })
    return NextResponse.json({ modules })
  } catch (err) {
    // DB 비어있음 · 스키마 마이그레이션 미완 등 어떤 상황에서도 UI 는 살려둔다.
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[api/impact-modules] fallback to empty list:', message)
    return NextResponse.json({ modules: [] })
  }
}

/**
 * GET /api/agent/sessions — 세션 목록 조회
 * GET /api/agent/sessions?id=xxx — 특정 세션 로드 (resume)
 *
 * Query params:
 *   - id: 특정 세션 ID (있으면 해당 세션의 full state 반환)
 *   - projectId: 프로젝트별 필터
 */

import { NextRequest, NextResponse } from 'next/server'
import { loadSession, listSessionsFromDb } from '@/lib/planning-agent/state'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('id')
    const projectId = searchParams.get('projectId')

    // 특정 세션 resume
    if (sessionId) {
      const state = await loadSession(sessionId)
      if (!state) {
        return NextResponse.json(
          { error: '세션을 찾을 수 없습니다' },
          { status: 404 },
        )
      }
      return NextResponse.json({ state })
    }

    // 세션 목록
    const sessions = await listSessionsFromDb(projectId ?? undefined)
    return NextResponse.json({ sessions })
  } catch (err: any) {
    console.error('[GET /api/agent/sessions] error:', err)
    return NextResponse.json(
      { error: err.message ?? '세션 조회 실패' },
      { status: 500 },
    )
  }
}

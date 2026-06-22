/**
 * /api/projects/[id]/impact-report — 공식 임팩트 리포트 핸드오프 (BR-IMPACT-1, 2026-06-22)
 *
 * POST : 기존 ImpactForecast(Wave M forecast 정본)를 impact-measurement 에 prediction 으로
 *        써서 공개 리포트(`/view/{shareToken}`)를 생성하고 {sroi, reportUrl, shareToken} 반환.
 *
 * 인증: requireProjectAccess.
 * graceful: 연동 미설정(SERVICE_API_TOKEN 없음) → 503 "연동 미설정". forecast 없음 → 409.
 *           서비스 실패(네트워크/4xx-5xx) → 502. (handoff 가 null 을 반환 — throw 안 함)
 *
 * ⭐ SROI = 렌즈 — 최대화/랭킹 없음. 응답의 sroi 는 그대로 전달만.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/auth-helpers'
import { requestOfficialReport, isHandoffConfigured } from '@/lib/impact/handoff'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params
  const access = await requireProjectAccess(projectId)
  if (!access.ok) return access.response!

  // 연동 미설정 — 명확한 안내(graceful, throw 아님)
  if (!isHandoffConfigured()) {
    return NextResponse.json(
      {
        error:
          '연동 미설정 — SERVICE_API_TOKEN(쓰기 토큰)이 없어 공식 리포트를 생성할 수 없습니다. ' +
          'Vercel 환경변수에 SERVICE_API_TOKEN(+필요 시 SROI_SERVICE_URL)을 추가하세요.',
        configured: false,
      },
      { status: 503 },
    )
  }

  const result = await requestOfficialReport(projectId)
  if (!result) {
    // forecast 없음 / 매핑 0건 / 서비스 실패 — handoff 가 graceful null. 사용자 안내.
    return NextResponse.json(
      {
        error:
          '공식 리포트를 생성하지 못했습니다. 사전 임팩트 리포트(forecast)가 먼저 있어야 하며, ' +
          'impact-measurement 서비스가 응답하지 않으면 잠시 후 다시 시도하세요.',
        configured: true,
      },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, ...result })
}

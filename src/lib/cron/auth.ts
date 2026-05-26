/**
 * Cron 엔드포인트 공통 인증 helper.
 *
 * Vercel Cron 은 `Authorization: Bearer <CRON_SECRET>` 헤더로 호출.
 * CRON_SECRET 미설정 시 개발 편의상 허용 (운영 환경은 반드시 설정).
 */

import { NextRequest, NextResponse } from 'next/server'

export function checkCronAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET
  if (!expected) return null // dev — 허용
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

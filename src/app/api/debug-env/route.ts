import { NextResponse } from 'next/server'

// 임시 디버그 엔드포인트 — 배포 확인 후 삭제
export async function GET() {
  return NextResponse.json({
    hasGoogleId: !!process.env.AUTH_GOOGLE_ID,
    googleIdPrefix: process.env.AUTH_GOOGLE_ID?.slice(0, 10) ?? 'NOT_SET',
    hasGoogleSecret: !!process.env.AUTH_GOOGLE_SECRET,
    googleSecretPrefix: process.env.AUTH_GOOGLE_SECRET?.slice(0, 8) ?? 'NOT_SET',
    hasAuthSecret: !!process.env.AUTH_SECRET,
    nextauthUrl: process.env.NEXTAUTH_URL ?? 'NOT_SET',
    nodeEnv: process.env.NODE_ENV,
  })
}

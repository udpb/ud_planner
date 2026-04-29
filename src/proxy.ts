import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * 경량 프록시 — Next.js 16 의 proxy 컨벤션 (구 middleware).
 * Edge Function 크기 제한(1MB) 준수.
 * NextAuth의 auth() 대신 세션 토큰 쿠키 존재 여부만 확인.
 * 실제 토큰 검증은 서버 컴포넌트/API에서 auth()로 수행.
 */

const publicPaths = ['/login', '/api/auth', '/api/feedback', '/feedback']

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // public 경로는 통과
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 세션 토큰 쿠키 존재 확인 (JWT 전략)
  const sessionToken =
    req.cookies.get('authjs.session-token')?.value ??
    req.cookies.get('__Secure-authjs.session-token')?.value

  if (!sessionToken) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

// 인증 불필요 경로
const publicPaths = ['/login', '/api/auth', '/api/feedback']

export default auth((req) => {
  const { pathname } = req.nextUrl

  // public 경로는 통과
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 미인증 → 로그인 페이지로 리다이렉트
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

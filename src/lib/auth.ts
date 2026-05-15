import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

export const { handlers, auth, signIn, signOut } = NextAuth({
  // trustHost — 환경별 조건부 적용 (보안 default 유지)
  //   - dev (NODE_ENV !== 'production'): 자동 trust (편의)
  //   - Vercel production: VERCEL env 자동 감지 — X-Forwarded-Host 신뢰
  //   - E2E (production build + AUTH_TRUST_HOST=true): 명시 trust
  //   - AUTH_URL 박힌 자체 호스팅: NextAuth 가 그 URL 만 인정 → trust
  //   - 그 외 self-hosted (env 미설정): trust=false → 보안 default
  //
  // 무조건 trustHost=true 는 host header injection 공격 표면 — 피함.
  // 단 Vercel·자체 호스팅에서 명시 설정 있을 땐 안전 가정.
  trustHost:
    process.env.NODE_ENV !== 'production' ||
    process.env.AUTH_TRUST_HOST === 'true' ||
    !!process.env.VERCEL ||
    !!process.env.AUTH_URL,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    // 이메일 로그인 (Google OAuth 없이도 접속 가능)
    Credentials({
      name: '이메일 로그인',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'pm@underdogs.co.kr' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string
        if (!email) return null

        // @udimpact.ai 또는 @underdogs.co.kr 도메인만 허용
        const allowed = email.endsWith('@udimpact.ai') || email.endsWith('@underdogs.co.kr')
        if (!allowed) return null

        // 기존 유저 찾거나 생성
        let user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
          user = await prisma.user.create({
            data: { email, name: email.split('@')[0], role: 'PM' },
          })
        }
        return { id: user.id, email: user.email, name: user.name, role: user.role }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? 'PM'
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
})

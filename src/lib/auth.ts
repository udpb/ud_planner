import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

export const { handlers, auth, signIn, signOut } = NextAuth({
  // NextAuth v5 — production (next start) 모드에서 host 검증 자동 비활성.
  // E2E (playwright webServer 3100) · dev (3000) · Vercel 등 다양한 host 에서 동작하도록 trust.
  // NEXTAUTH_URL / AUTH_URL 환경변수와 mismatch 시 UntrustedHost 에러 방지.
  trustHost: true,
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

import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    // 개발 환경 전용: Google OAuth 없이 로그인
    ...(process.env.NODE_ENV === 'development'
      ? [
          Credentials({
            name: 'Dev Login',
            credentials: {
              email: { label: 'Email', type: 'email', placeholder: 'pm@underdogs.co.kr' },
            },
            async authorize(credentials) {
              const email = credentials?.email as string
              if (!email) return null

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
        ]
      : []),
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

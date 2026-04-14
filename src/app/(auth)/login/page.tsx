'use client'

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'

function LoginForm() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard'
  const error = searchParams.get('error')
  const [devEmail, setDevEmail] = useState('pm@underdogs.co.kr')
  const [loading, setLoading] = useState(false)
  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F8F8]">
      <div className="w-full max-w-sm space-y-6">
        {/* 로고 */}
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            UD<span className="text-primary">·</span>Ops
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            언더독스 교육 기획 자동화 플랫폼
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              로그인에 실패했습니다. 다시 시도해주세요.
            </div>
          )}

          {/* Google OAuth */}
          <button
            onClick={() => {
              setLoading(true)
              signIn('google', { callbackUrl })
            }}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-md border bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google로 로그인
          </button>

          {/* 이메일 로그인 */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">또는</span>
            </div>
          </div>

          <div className="space-y-3">
            <input
              type="email"
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              placeholder="이메일 (@udimpact.ai / @underdogs.co.kr)"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={() => {
                setLoading(true)
                signIn('credentials', { email: devEmail, callbackUrl })
              }}
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? '로그인 중...' : '이메일로 로그인'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Underdogs. All rights reserved.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

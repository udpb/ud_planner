import type { Metadata } from 'next'
import { Poppins, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'

/**
 * Wave U / ActionAI 디자인 시스템 (2026-05-19)
 *   - Primary: Poppins (영문 우선, 한글은 시스템 fallback — Pretendard / Noto Sans KR)
 *   - Mono: JetBrains Mono (라텡 전용)
 *   - 폰트 fallback 체인은 globals.css 의 body 에서 한글 우선순위 보정
 */
const poppins = Poppins({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'UD Ops Workspace', template: '%s | UD Ops' },
  description: '언더독스 교육 기획 자동화 운영 플랫폼',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${poppins.variable} ${jetBrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster richColors position="top-right" />
        {/* Phase 4: Vercel 운영 분석 — 페이지 진입 패턴 + Web Vitals */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}

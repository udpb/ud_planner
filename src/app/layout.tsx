import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'

/**
 * 공식 디자인 킷 260529 타이포그래피 (UI-1, 2026-06-12)
 *   - 국문 본문 = NanumHuman 400/700/800 (--font-sans, 킷 woff2 로컬 셀프호스팅)
 *   - 영문/숫자 강조 표면(큰 지표·kicker) = Poppins 400/500/600 (--font-poppins)
 *   - Mono: JetBrains Mono (코드/라텡 전용 — 킷 스코프 밖, 존치)
 *   - 원본: docs/design-kit/fonts/ → public/fonts/ 복사본
 */
const nanumHuman = localFont({
  src: [
    { path: '../../public/fonts/NanumHuman-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/NanumHuman-Bold.woff2', weight: '700', style: 'normal' },
    { path: '../../public/fonts/NanumHuman-ExtraBold.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
})

const poppins = localFont({
  src: [
    { path: '../../public/fonts/Poppins-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/Poppins-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/Poppins-SemiBold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-poppins',
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
    <html lang="ko" className={`${nanumHuman.variable} ${poppins.variable} ${jetBrainsMono.variable} h-full antialiased`}>
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

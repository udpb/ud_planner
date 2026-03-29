import type { Metadata } from 'next'
import { Nanum_Gothic, Nanum_Gothic_Coding } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'

const nanumGothic = Nanum_Gothic({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '700', '800'],
  display: 'swap',
})

const nanumCoding = Nanum_Gothic_Coding({
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
    <html lang="ko" className={`${nanumGothic.variable} ${nanumCoding.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}

import { Sidebar } from '@/components/layout/sidebar'
import { Providers } from '@/components/providers'

/**
 * Admin 전용 레이아웃 (Phase H Wave H3).
 * 대시보드와 동일한 Sidebar + Providers 를 공유해 관리 UI 가
 * 동일한 쉘 안에서 뜨도록 한다.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </Providers>
  )
}

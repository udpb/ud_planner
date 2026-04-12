import { Sidebar } from '@/components/layout/sidebar'
import { Providers } from '@/components/providers'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </Providers>
  )
}

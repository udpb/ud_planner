'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderKanban,
  Upload,
  Library,
  BarChart3,
  MessageSquareText,
  Settings,
  Sparkles,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/projects', label: '프로젝트', icon: FolderKanban },
  { href: '/ingest', label: '자료 업로드', icon: Upload },
  { href: '/admin/content-hub', label: 'Content Hub', icon: Library },
  { href: '/admin/asset-insights', label: '자산 인사이트', icon: Sparkles },
  { href: '/admin/metrics', label: '운영 지표', icon: BarChart3 },
  { href: '/admin/interview-ingest', label: '전략 인터뷰', icon: MessageSquareText },
  { href: '/settings', label: '설정', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-sidebar">
      {/* 로고 */}
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <span className="text-lg font-extrabold tracking-tight text-sidebar-foreground">
          UD<span className="text-primary">·</span>Ops
        </span>
        <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground uppercase tracking-wider">
          Workspace
        </span>
      </div>

      {/* 내비게이션 */}
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* 코치 DB 동기화 버튼은 재설계 v2 에서 제거됨 (2026-04-15).
         API /api/coaches/sync 는 유지되어 Admin/스크립트에서 호출 가능.
         필요 시 /settings 페이지에 재배치 예정. */}
    </aside>
  )
}

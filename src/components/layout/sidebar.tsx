'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  BookOpen,
  Calculator,
  BarChart3,
  Settings,
  RefreshCw,
  MessageSquare,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/projects', label: '프로젝트', icon: FolderKanban },
  { href: '/coaches', label: '코치 DB', icon: Users },
  { href: '/modules', label: '교육 모듈', icon: BookOpen },
  { href: '/feedback', label: '피드백 관리', icon: MessageSquare },
  { href: '/budget', label: '예산 기준', icon: Calculator },
  { href: '/sroi', label: 'SROI 프록시', icon: BarChart3 },
  { href: '/settings', label: '설정', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-sidebar">
      {/* 로고 */}
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-lg font-bold tracking-tight">UD Ops</span>
        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
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

      {/* 코치 동기화 버튼 */}
      <div className="border-t p-3">
        <form action="/api/coaches/sync" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            코치 DB 동기화
          </button>
        </form>
      </div>
    </aside>
  )
}

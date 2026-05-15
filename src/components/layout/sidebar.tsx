'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderKanban,
  Library,
  Settings,
  Sparkles,
} from 'lucide-react'

/**
 * 좌측 네비게이션 — 2026-05-15 정리:
 *   - "자료 업로드" : RFP 업로드가 Express 안에서 가능 → 제거
 *   - "운영 지표" : 데이터 부족 → 일단 숨김 (라우트 유지, 필요 시 재노출)
 *   - "전략 인터뷰" : Express 2.0 이후 사용 빈도 낮음 → 숨김
 *   - "Content Hub" + "자산 인사이트" → "자산" 그룹으로 묶음 (목록 + 인사이트)
 */
interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  children?: Array<{ href: string; label: string }>
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/projects', label: '프로젝트', icon: FolderKanban },
  {
    href: '/admin/content-hub',
    label: '자산',
    icon: Library,
    children: [
      { href: '/admin/content-hub', label: '목록 (Content Hub)' },
      { href: '/admin/asset-insights', label: '인사이트' },
    ],
  },
  { href: '/settings', label: '설정', icon: Settings },
]

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

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
          {navItems.map(({ href, label, icon: Icon, children }) => {
            const active = isActive(pathname, href)
            // 그룹 내 자식 중 하나라도 활성이면 그룹도 펼침
            const childActive = children?.some((c) => isActive(pathname, c.href))
            const expanded = active || childActive

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
                {/* 자식 항목 — 부모 또는 자식이 활성일 때만 표시 */}
                {children && expanded && (
                  <ul className="ml-7 mt-0.5 space-y-0.5">
                    {children.map((c) => {
                      const cActive = isActive(pathname, c.href)
                      return (
                        <li key={c.href}>
                          <Link
                            href={c.href}
                            className={cn(
                              'flex items-center rounded-md px-3 py-1 text-[11px] transition-colors',
                              cActive
                                ? 'bg-accent text-accent-foreground font-medium'
                                : 'text-muted-foreground/80 hover:bg-accent hover:text-accent-foreground',
                            )}
                          >
                            <Sparkles className="mr-1.5 h-3 w-3 shrink-0 opacity-60" />
                            {c.label}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}

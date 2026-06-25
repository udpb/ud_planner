'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderKanban,
  Library,
  Settings,
  Sparkles,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react'

/**
 * 좌측 네비게이션 — 2026-05-15 정리:
 *   - "자료 업로드" : RFP 업로드가 Express 안에서 가능 → 제거
 *   - "운영 지표" : 데이터 부족 → 일단 숨김 (라우트 유지, 필요 시 재노출)
 *   - "전략 인터뷰" : Express 2.0 이후 사용 빈도 낮음 → 숨김
 *   - "Content Hub" + "자산 인사이트" → "자산" 그룹으로 묶음 (목록 + 인사이트)
 *
 * BR-WS-16 (2026-06-25): interactive 접기 추가 — 토글 시 w-60↔w-16(아이콘만).
 *   localStorage `ud-sidebar-collapsed` 로 영속. 접힘 시 라벨·children·로고 텍스트
 *   숨김, 아이콘 가운데 정렬 + title 툴팁. active(bg-primary) 색 유지.
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
      { href: '/content-hub/submit', label: '+ 새 자산 제안' },
      { href: '/admin/content-hub', label: '목록 (Content Hub)' },
      { href: '/admin/asset-insights', label: '인사이트' },
    ],
  },
  { href: '/settings', label: '설정', icon: Settings },
]

const COLLAPSE_KEY = 'ud-sidebar-collapsed'

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

export function Sidebar() {
  const pathname = usePathname()
  // localStorage 초기값을 lazy initializer 로 1회 복원. (dashboard) 셸은 client
  // 렌더 — window 가 없으면(서버/테스트) 기본값(펼침) 유지.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        // 저장 실패해도 UI 상태는 전환.
      }
      return next
    })
  }

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r bg-sidebar transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* 로고 */}
      <div
        className={cn(
          'flex h-14 items-center border-b border-sidebar-border',
          collapsed ? 'justify-center px-2' : 'px-4',
        )}
      >
        {collapsed ? (
          <span className="text-lg font-extrabold tracking-tight text-sidebar-foreground">
            UD
          </span>
        ) : (
          <>
            <span className="text-lg font-extrabold tracking-tight text-sidebar-foreground">
              UD<span className="text-brand">·</span>Ops
            </span>
            <span className="ml-2 bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground uppercase tracking-wider">
              Workspace
            </span>
          </>
        )}
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
                  title={collapsed ? label : undefined}
                  className={cn(
                    'flex items-center px-3 py-2 text-sm font-medium transition-colors',
                    collapsed ? 'justify-center' : 'gap-3',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && label}
                </Link>
                {/* 자식 항목 — 펼침 상태(collapsed=false)에서 부모/자식 활성일 때만 표시 */}
                {!collapsed && children && expanded && (
                  <ul className="ml-7 mt-0.5 space-y-0.5">
                    {children.map((c) => {
                      const cActive = isActive(pathname, c.href)
                      return (
                        <li key={c.href}>
                          <Link
                            href={c.href}
                            className={cn(
                              'flex items-center px-3 py-1 text-[11px] transition-colors',
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

      {/* 접기/펼치기 토글 — 하단 고정 */}
      <div className="border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          className={cn(
            'flex w-full items-center px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
            collapsed ? 'justify-center' : 'gap-3',
          )}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" />
              접기
            </>
          )}
        </button>
      </div>
    </aside>
  )
}

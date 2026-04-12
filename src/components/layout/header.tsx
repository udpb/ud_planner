'use client'

import { Bell, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSession, signOut } from 'next-auth/react'

interface HeaderProps {
  title?: string
}

export function Header({ title }: HeaderProps) {
  const { data: session } = useSession()
  const user = session?.user
  const initials = user?.name
    ? user.name.slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? 'PM'

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <h1 className="text-base font-semibold">{title}</h1>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Bell className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.image ?? ''} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user?.name ?? '사용자'}</span>
                <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/login' })}>
              <LogOut className="mr-2 h-4 w-4" />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

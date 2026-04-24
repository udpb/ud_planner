'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Initial {
  category?: string
  stage?: string
  status?: string
  parent?: string
  search?: string
}

const CATEGORY_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'methodology', label: '방법론' },
  { value: 'content', label: '콘텐츠' },
  { value: 'product', label: '프로덕트' },
  { value: 'human', label: '휴먼' },
  { value: 'data', label: '데이터' },
  { value: 'framework', label: '프레임워크' },
]
const STAGE_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'impact', label: '① Impact' },
  { value: 'input', label: '② Input' },
  { value: 'output', label: '③ Output' },
  { value: 'activity', label: '④ Activity' },
  { value: 'outcome', label: '⑤ Outcome' },
]
const STATUS_OPTIONS = [
  { value: 'all', label: '활성(archived 제외)' },
  { value: 'stable', label: '안정' },
  { value: 'developing', label: '개발 중' },
  { value: 'archived', label: '아카이브' },
]
const PARENT_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'top-level', label: 'Top-level (부모 없음)' },
  { value: 'child', label: '하위 자산만' },
]

export function FilterBar({ initial }: { initial: Initial }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // URL 이 SSoT — searchParams 변화 시 input 값도 따라가게 key 로 리셋 (React 19 권장 패턴)
  const urlSearch = searchParams.get('search') ?? ''
  const [search, setSearch] = useState(urlSearch)
  const [lastSynced, setLastSynced] = useState(urlSearch)
  if (urlSearch !== lastSynced) {
    // URL 이 외부(뒤로가기 등) 로 변경되면 로컬 상태도 맞춘다 — 이펙트 없이 렌더 중 보정.
    setLastSynced(urlSearch)
    setSearch(urlSearch)
  }

  function pushWith(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === 'all') {
        next.delete(k)
      } else {
        next.set(k, v)
      }
    }
    router.push(`/admin/content-hub${next.toString() ? '?' + next.toString() : ''}`)
  }

  function applySearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    pushWith({ search })
  }

  const hasAny =
    !!initial.category ||
    !!initial.stage ||
    !!initial.status ||
    !!initial.parent ||
    !!initial.search

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-muted-foreground">카테고리</span>
        <Select
          value={initial.category ?? 'all'}
          onValueChange={(v) => v && pushWith({ category: v })}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-muted-foreground">단계</span>
        <Select
          value={initial.stage ?? 'all'}
          onValueChange={(v) => v && pushWith({ stage: v })}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-muted-foreground">상태</span>
        <Select
          value={initial.status ?? 'all'}
          onValueChange={(v) => v && pushWith({ status: v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-muted-foreground">계층</span>
        <Select
          value={initial.parent ?? 'all'}
          onValueChange={(v) => v && pushWith({ parent: v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PARENT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <form onSubmit={applySearch} className="flex flex-col gap-0.5">
        <span className="text-[10px] text-muted-foreground">이름 검색</span>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="예: IMPACT"
            className="h-8 w-48 pl-7"
          />
        </div>
      </form>

      {hasAny && (
        <div className="self-end">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setSearch('')
              router.push('/admin/content-hub')
            }}
          >
            <X className="h-3 w-3" />
            초기화
          </Button>
        </div>
      )}
    </div>
  )
}

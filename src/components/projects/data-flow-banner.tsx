'use client'

import { cn } from '@/lib/utils'
import { ArrowRight, Link2, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface FlowItem {
  label: string
  value: string
  matched: boolean // 현재 스텝에 반영되었는지
  detail?: string  // 매칭 안 됐을 때 안내
}

interface DataFlowBannerProps {
  fromStep: string
  toStep: string
  items: FlowItem[]
  className?: string
}

export function DataFlowBanner({ fromStep, toStep, items, className }: DataFlowBannerProps) {
  const matchedCount = items.filter((i) => i.matched).length
  const total = items.length
  const allMatched = matchedCount === total

  if (total === 0) return null

  return (
    <div className={cn(
      'rounded-lg border px-4 py-3',
      allMatched ? 'border-green-200 bg-green-50/50' : 'border-amber-200 bg-amber-50/50',
      className,
    )}>
      <div className="flex items-center gap-2 text-xs">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-muted-foreground">{fromStep}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">{toStep}</span>
        <span className="ml-auto">
          {allMatched ? (
            <span className="flex items-center gap-1 text-green-700">
              <CheckCircle2 className="h-3 w-3" /> 전체 반영됨
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-700">
              <AlertTriangle className="h-3 w-3" /> {matchedCount}/{total} 반영
            </span>
          )}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <div
            key={i}
            className={cn(
              'group relative inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px]',
              item.matched
                ? 'border-green-200 bg-green-100 text-green-800'
                : 'border-amber-200 bg-amber-100 text-amber-800',
            )}
          >
            {item.matched ? (
              <CheckCircle2 className="h-2.5 w-2.5" />
            ) : (
              <AlertTriangle className="h-2.5 w-2.5" />
            )}
            <span className="font-medium">{item.label}</span>
            {item.value && <span className="text-[10px] opacity-70">({item.value})</span>}
            {/* 미반영 시 호버 툴팁 대신 detail 표시 */}
            {!item.matched && item.detail && (
              <span className="ml-1 hidden group-hover:inline text-[10px]">— {item.detail}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

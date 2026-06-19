'use client'

import { useRouter, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

export interface PipelineStep {
  key: string
  label: string
  sublabel?: string
  done: boolean
  /** B3 (2026-05-19) — Express/RFP 자동 시드 여부 (단계 카드에 뱃지 표시) */
  autoSeeded?: boolean
  /** autoSeeded 시 hover tooltip — "어디서 자동으로 채워졌는지" */
  autoSeedSource?: string
}

interface PipelineNavProps {
  steps: PipelineStep[]
  current: string
}

export function PipelineNav({ steps, current }: PipelineNavProps) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <div className="flex items-center overflow-x-auto gap-0 py-1">
      {steps.map((step, idx) => {
        const isActive = current === step.key

        return (
          <div key={step.key} className="flex items-center shrink-0">
            <button
              onClick={() => router.push(`${pathname}?step=${step.key}`)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 text-sm transition-all',
                isActive
                  ? 'bg-brand/10 text-brand font-semibold'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center text-xs font-bold transition-all',
                  step.done
                    ? 'bg-green-500 text-white'
                    : isActive
                      ? 'bg-primary text-white shadow-sm shadow-primary/40'
                      : 'border border-border bg-muted text-muted-foreground',
                )}
              >
                {step.done ? <Check className="h-3 w-3" /> : idx + 1}
              </span>
              <div className="text-left">
                <div className="flex items-center gap-1 leading-tight">
                  {step.label}
                  {/* B3 — RFP/Express 자동 시드 뱃지 */}
                  {step.autoSeeded && (
                    <span
                      className=" border border-[color:var(--cyan)]/40 bg-[color:var(--cyan)]/10 px-1 py-0 text-[8px] font-semibold uppercase tracking-wider text-[color:var(--cyan)]"
                      title={step.autoSeedSource ?? '자동 시드됨'}
                    >
                      자동
                    </span>
                  )}
                </div>
                {step.sublabel && (
                  <div
                    className={cn(
                      'mt-0.5 text-[11px] leading-tight',
                      isActive ? 'text-brand/70' : 'text-muted-foreground',
                    )}
                  >
                    {step.sublabel}
                  </div>
                )}
              </div>
            </button>

            {idx < steps.length - 1 && (
              <div
                className={cn(
                  'mx-1 h-px w-6 shrink-0',
                  step.done ? 'bg-green-200' : 'bg-border',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

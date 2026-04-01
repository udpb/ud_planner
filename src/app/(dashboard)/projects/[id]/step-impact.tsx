'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, Brain, ArrowRight, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  rfpParsed: any
  initialLogicModel: any
}

const CHAIN_KEYS = ['input', 'activity', 'output', 'outcome', 'impact'] as const
const CHAIN_LABELS: Record<string, string> = {
  input: '투입',
  activity: '활동',
  output: '산출',
  outcome: '성과',
  impact: '임팩트',
}
const CHAIN_COLORS: Record<string, string> = {
  input: 'border-gray-200 bg-gray-50',
  activity: 'border-blue-200 bg-blue-50',
  output: 'border-cyan-200 bg-cyan-50',
  outcome: 'border-violet-200 bg-violet-50',
  impact: 'border-orange-200 bg-orange-50',
}
const CHAIN_TEXT: Record<string, string> = {
  input: 'text-gray-600',
  activity: 'text-blue-700',
  output: 'text-cyan-700',
  outcome: 'text-violet-700',
  impact: 'text-orange-700',
}

export function StepImpact({ projectId, rfpParsed, initialLogicModel }: Props) {
  const [logicModel, setLogicModel] = useState<any>(initialLogicModel)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const pathname = usePathname()

  async function generate() {
    if (!rfpParsed) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/logic-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          summary: rfpParsed.summary,
          objectives: rfpParsed.objectives,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLogicModel(data.logicModel)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">임팩트 로직 모델</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            투입 → 활동 → 산출 → 성과 → 임팩트 체계를 설계합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!rfpParsed && (
            <span className="text-xs text-amber-600">⚠ RFP 분석이 먼저 필요합니다</span>
          )}
          <Button
            onClick={generate}
            disabled={!rfpParsed || loading}
            variant={logicModel ? 'outline' : 'default'}
            className="gap-2"
            size="sm"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4" />
                {logicModel ? 'Logic Model 재생성' : 'Logic Model 생성'}
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {logicModel ? (
        <div className="space-y-5">
          {/* Impact goal banner */}
          <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary/70">
              Impact Goal
            </p>
            <p className="mt-1 text-base font-semibold">{logicModel.impactGoal}</p>
          </div>

          {/* Logic chain */}
          <div className="grid grid-cols-5 gap-3">
            {CHAIN_KEYS.map((key) => (
              <div
                key={key}
                className={cn(
                  'rounded-lg border p-3',
                  CHAIN_COLORS[key],
                )}
              >
                <p
                  className={cn(
                    'mb-2 text-[11px] font-bold uppercase tracking-wide',
                    CHAIN_TEXT[key],
                  )}
                >
                  {CHAIN_LABELS[key]}
                </p>
                <ul className="space-y-1.5">
                  {logicModel[key]?.map((item: string, i: number) => (
                    <li key={i} className="text-xs leading-snug text-foreground">
                      · {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => router.push(`${pathname}?step=rfp`)}
            >
              <ArrowLeft className="h-4 w-4" />
              RFP 분석
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => router.push(`${pathname}?step=curriculum`)}
            >
              커리큘럼 설계로 이동
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed text-sm text-muted-foreground">
          <Brain className="h-10 w-10 opacity-20" />
          <p>Logic Model을 생성하면 임팩트 체계가 표시됩니다</p>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Loader2, ChevronDown, ChevronUp, Save, Shield, Swords, AlertTriangle, Lightbulb,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface StrategicNotes {
  clientHiddenWants?: string
  mustNotFail?: string
  competitorWeakness?: string
  riskFactors?: string[]
  pastSimilarProjects?: string
  winStrategy?: string
}

interface Props {
  projectId: string
}

const FIELDS: Array<{
  key: keyof StrategicNotes
  label: string
  placeholder: string
  icon: any
  color: string
  hint: string
}> = [
  {
    key: 'clientHiddenWants',
    label: '발주처 진짜 의도',
    placeholder: 'RFP에는 안 쓰여있지만 발주처가 진짜 원하는 것은?',
    icon: Shield,
    color: 'text-red-700 bg-red-50 border-red-200',
    hint: '제안서 전반의 톤과 강조점을 결정합니다',
  },
  {
    key: 'mustNotFail',
    label: '절대 실패 금지',
    placeholder: '이 사업에서 절대 실패하면 안 되는 것은? (모집, 수료율 등)',
    icon: AlertTriangle,
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    hint: '제안서에 구체적 대응 방안이 반드시 포함됩니다',
  },
  {
    key: 'competitorWeakness',
    label: '경쟁 우위',
    placeholder: '경쟁사 대비 우리가 확실히 강한 것은?',
    icon: Swords,
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    hint: '차별화 포인트로 제안서에 부각됩니다',
  },
  {
    key: 'winStrategy',
    label: '수주 핵심 전략',
    placeholder: '이 사업을 따기 위한 핵심 전략 한 줄 (자유 입력)',
    icon: Lightbulb,
    color: 'text-green-700 bg-green-50 border-green-200',
    hint: '제안서 전략 방향의 나침반이 됩니다',
  },
]

export function StrategyPanel({ projectId }: Props) {
  const [notes, setNotes] = useState<StrategicNotes>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [isDirty, setIsDirty] = useState(false)

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      if (!res.ok) return
      const project = await res.json()
      setNotes(project.strategicNotes ?? {})
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  const saveNotes = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategicNotes: notes }),
      })
      if (!res.ok) throw new Error('저장 실패')
      setIsDirty(false)
      toast.success('전략 메모 저장 완료 — 이후 생성에 자동 반영됩니다')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const updateField = (key: keyof StrategicNotes, value: string) => {
    setNotes((prev) => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  const filledCount = FIELDS.filter((f) => (notes[f.key] as string)?.trim()).length

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/20">
      {/* 버그 수정 2026-04-21: <button> 안에 <Button> 이 들어가서 HTML invalid + hydration error.
          div + onClick 으로 전환 + 저장 버튼은 stopPropagation 으로 토글 방지. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded(!expanded)
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between p-3 text-left hover:bg-orange-50/40 transition-colors rounded-t-lg select-none"
      >
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-orange-700" />
          <span className="text-sm font-semibold text-orange-900">수주 전략 메모</span>
          <span className="text-[10px] text-orange-600">{filledCount}/{FIELDS.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] gap-1 border-orange-300"
              disabled={saving}
              onClick={(e) => { e.stopPropagation(); saveNotes() }}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              저장
            </Button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-orange-600" /> : <ChevronDown className="h-4 w-4 text-orange-600" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-orange-200 p-3 space-y-2.5">
          {loading ? (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 로드 중...
            </div>
          ) : (
            <>
              <p className="text-[11px] text-orange-700">
                여기 입력한 전략이 Logic Model · 커리큘럼 · 제안서 생성에 자동 반영됩니다.
              </p>

              {FIELDS.map((field) => {
                const Icon = field.icon
                const value = (notes[field.key] as string) ?? ''
                return (
                  <div key={field.key} className={cn('rounded-md border p-2.5', field.color)}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">{field.label}</span>
                    </div>
                    <Textarea
                      placeholder={field.placeholder}
                      className="h-16 text-xs bg-white/80 border-0 focus-visible:ring-1"
                      value={value}
                      onChange={(e) => updateField(field.key, e.target.value)}
                    />
                    <p className="mt-1 text-[9px] opacity-60">{field.hint}</p>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}

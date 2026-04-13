'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Brain, ArrowRight, ArrowLeft, Pencil, Check, X,
  Target, Sparkles, TrendingUp, Award, HelpCircle, BarChart3, Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataFlowBanner } from '@/components/projects/data-flow-banner'
import { ResearchPanel } from '@/components/projects/research-panel'
import { toast } from 'sonner'

interface GoalCandidate {
  goal: string
  rationale: string
  focus: string
  sroiHint: string
}

interface Props {
  projectId: string
  rfpParsed: any
  initialLogicModel: any
}

const CHAIN_KEYS = ['input', 'activity', 'output', 'outcome', 'impact'] as const
const CHAIN_LABELS: Record<string, string> = {
  input: '투입', activity: '활동', output: '산출', outcome: '성과', impact: '임팩트',
}
const CHAIN_COLORS: Record<string, string> = {
  input: 'border-gray-200 bg-gray-50', activity: 'border-blue-200 bg-blue-50',
  output: 'border-cyan-200 bg-cyan-50', outcome: 'border-violet-200 bg-violet-50',
  impact: 'border-orange-200 bg-orange-50',
}
const CHAIN_TEXT: Record<string, string> = {
  input: 'text-gray-600', activity: 'text-blue-700', output: 'text-cyan-700',
  outcome: 'text-violet-700', impact: 'text-orange-700',
}

// Logic Model 아이템 호환 헬퍼 (구: string, 신: {id, text, ...})
function getItemText(item: any): string {
  return typeof item === 'string' ? item : item?.text ?? ''
}
function setItemText(item: any, text: string): any {
  if (typeof item === 'string') return text
  return { ...item, text }
}

const FOCUS_ICONS: Record<string, any> = {
  '역량 강화': Target,
  '경제/생태계 기여': TrendingUp,
  '평가 최적화': Award,
}
const FOCUS_COLORS: Record<string, string> = {
  '역량 강화': 'border-blue-200 bg-blue-50/50 hover:border-blue-400',
  '경제/생태계 기여': 'border-green-200 bg-green-50/50 hover:border-green-400',
  '평가 최적화': 'border-purple-200 bg-purple-50/50 hover:border-purple-400',
}
const FOCUS_SELECTED: Record<string, string> = {
  '역량 강화': 'border-blue-500 bg-blue-50 ring-2 ring-blue-200',
  '경제/생태계 기여': 'border-green-500 bg-green-50 ring-2 ring-green-200',
  '평가 최적화': 'border-purple-500 bg-purple-50 ring-2 ring-purple-200',
}

function analyzeKeywordFlow(rfpParsed: any, logicModel: any) {
  if (!rfpParsed || !logicModel) return []
  const keywords = rfpParsed.keywords ?? []
  const objectives = rfpParsed.objectives ?? []
  const allModelText = [
    ...(logicModel.impact ?? []).map(getItemText),
    ...(logicModel.outcome ?? []).map(getItemText),
    ...(logicModel.output ?? []).map(getItemText),
    ...(logicModel.activity ?? []).map(getItemText),
    ...(logicModel.input ?? []).map(getItemText),
    logicModel.impactGoal ?? '',
  ].join(' ').toLowerCase()

  const items = []
  for (const kw of keywords.slice(0, 5)) {
    items.push({
      label: kw, value: '키워드',
      matched: allModelText.includes(kw.toLowerCase()),
      detail: `Logic Model에 "${kw}" 관련 내용 추가를 검토하세요`,
    })
  }
  for (const obj of objectives.slice(0, 3)) {
    const short = obj.length > 20 ? obj.slice(0, 20) + '…' : obj
    const words = obj.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
    items.push({
      label: short, value: '목표',
      matched: words.some((w: string) => allModelText.includes(w)),
      detail: '이 목표가 Logic Model에 충분히 반영되었는지 확인하세요',
    })
  }
  return items
}

export function StepImpact({ projectId, rfpParsed, initialLogicModel }: Props) {
  // Phase management
  const [phase, setPhase] = useState<'goal' | 'model'>(initialLogicModel ? 'model' : 'goal')
  const [confirmedGoal, setConfirmedGoal] = useState(initialLogicModel?.impactGoal ?? '')

  // Goal candidates
  const [candidates, setCandidates] = useState<GoalCandidate[]>([])
  const [clarifyingQs, setClarifyingQs] = useState<string[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [customGoal, setCustomGoal] = useState('')
  const [loadingGoals, setLoadingGoals] = useState(false)

  // Logic model
  const [logicModel, setLogicModel] = useState<any>(initialLogicModel)
  const [loadingModel, setLoadingModel] = useState(false)
  const [error, setError] = useState('')

  // Inline edit
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number>(-1)
  const [editValue, setEditValue] = useState('')

  // 저장 상태
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const router = useRouter()
  const pathname = usePathname()
  const flowItems = analyzeKeywordFlow(rfpParsed, logicModel)

  // 브라우저 이탈 경고
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // DB 저장
  const saveToDb = useCallback(async () => {
    if (!logicModel) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logicModel, impactGoal: confirmedGoal }),
      })
      if (!res.ok) throw new Error('저장 실패')
      setIsDirty(false)
      toast.success('Logic Model 저장 완료')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }, [logicModel, confirmedGoal, projectId])

  // --- Phase 1: Suggest impact goals ---
  async function suggestGoals() {
    if (!rfpParsed) return
    setLoadingGoals(true)
    setError('')
    try {
      const res = await fetch('/api/ai/suggest-impact-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: rfpParsed.summary,
          objectives: rfpParsed.objectives,
          targetAudience: rfpParsed.targetAudience,
          targetCount: rfpParsed.targetCount,
          evalCriteria: rfpParsed.evalCriteria,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCandidates(data.candidates ?? [])
      setClarifyingQs(data.clarifyingQuestions ?? [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingGoals(false)
    }
  }

  function confirmGoal() {
    const goal = selectedIdx !== null ? candidates[selectedIdx]?.goal : customGoal
    if (!goal) return
    setConfirmedGoal(goal)
    setPhase('model')
  }

  // --- Phase 2: Generate logic model ---
  async function generateModel() {
    if (!rfpParsed || !confirmedGoal) return
    setLoadingModel(true)
    setError('')
    try {
      const res = await fetch('/api/ai/logic-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          summary: rfpParsed.summary,
          objectives: rfpParsed.objectives,
          impactGoal: confirmedGoal,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLogicModel(data.logicModel)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingModel(false)
    }
  }

  // Inline edit helpers
  function startEdit(key: string, index: number, value: any) {
    setEditingKey(key); setEditingIndex(index); setEditValue(getItemText(value))
  }
  function saveEdit() {
    if (!editingKey || editingIndex < 0) return
    setLogicModel((prev: any) => {
      const updated = { ...prev }
      const arr = [...(updated[editingKey!] ?? [])]
      arr[editingIndex] = setItemText(arr[editingIndex], editValue)
      updated[editingKey!] = arr
      return updated
    })
    setEditingKey(null)
    setIsDirty(true)
  }
  function addItem(key: string) {
    setLogicModel((prev: any) => ({ ...prev, [key]: [...(prev[key] ?? []), ''] }))
    startEdit(key, logicModel[key]?.length ?? 0, '')
    setIsDirty(true)
  }
  function removeItem(key: string, index: number) {
    setLogicModel((prev: any) => ({ ...prev, [key]: prev[key].filter((_: any, i: number) => i !== index) }))
    setIsDirty(true)
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-4">
      {/* Data flow banner (only when model exists) */}
      {flowItems.length > 0 && logicModel && (
        <DataFlowBanner fromStep="RFP 분석" toStep="임팩트 설계" items={flowItems} />
      )}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* ============ Phase 1: Goal Selection ============ */}
      {phase === 'goal' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Step 1. 임팩트 목표 설정</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                AI가 3가지 관점의 임팩트 목표를 제안합니다. 하나를 선택하거나 직접 작성하세요.
              </p>
            </div>
            <Button onClick={suggestGoals} disabled={!rfpParsed || loadingGoals} size="sm" className="gap-2">
              {loadingGoals ? <><Loader2 className="h-4 w-4 animate-spin" /> 분석 중...</>
                : <><Sparkles className="h-4 w-4" /> {candidates.length > 0 ? '다시 제안받기' : '임팩트 목표 제안받기'}</>}
            </Button>
          </div>

          {!rfpParsed && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-muted-foreground">
              <Target className="h-8 w-8 opacity-20" />
              <p>RFP 분석이 먼저 필요합니다</p>
            </div>
          )}

          {/* 3 Candidates */}
          {candidates.length > 0 && (
            <div className="grid gap-3 md:grid-cols-3">
              {candidates.map((c, i) => {
                const FocusIcon = FOCUS_ICONS[c.focus] ?? Target
                const isSelected = selectedIdx === i
                return (
                  <button
                    key={i}
                    onClick={() => { setSelectedIdx(i); setCustomGoal('') }}
                    className={cn(
                      'rounded-xl border-2 p-4 text-left transition-all',
                      isSelected ? FOCUS_SELECTED[c.focus] ?? 'border-primary ring-2 ring-primary/20'
                        : FOCUS_COLORS[c.focus] ?? 'border-muted hover:border-primary/50',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <FocusIcon className="h-4 w-4" />
                      <Badge variant="outline" className="text-[10px]">{c.focus}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium leading-snug">{c.goal}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{c.rationale}</p>
                    <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <BarChart3 className="h-3 w-3" />
                      {c.sroiHint}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* AI 질문 */}
          {clarifyingQs.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-blue-800">
                <HelpCircle className="h-3.5 w-3.5" /> AI 확인 요청
              </p>
              <ul className="mt-1.5 space-y-1">
                {clarifyingQs.map((q, i) => (
                  <li key={i} className="text-xs text-blue-700">· {q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Custom goal input */}
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">또는 직접 작성:</p>
            <Textarea
              placeholder="이 사업이 궁극적으로 만들고자 하는 사회적 변화를 한 문장으로 작성하세요..."
              className="h-20 text-sm"
              value={selectedIdx !== null ? candidates[selectedIdx]?.goal ?? '' : customGoal}
              onChange={(e) => { setCustomGoal(e.target.value); setSelectedIdx(null) }}
            />
          </div>

          {/* Confirm */}
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push(`${pathname}?step=rfp`)}>
              <ArrowLeft className="h-4 w-4" /> RFP 분석
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={!confirmedGoal && selectedIdx === null && !customGoal.trim()}
              onClick={confirmGoal}
            >
              이 목표로 Logic Model 생성
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ============ Phase 2: Logic Model ============ */}
      {phase === 'model' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Step 2. 로직 모델 설계</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                확정된 목표를 역추적하여 Logic Model을 생성합니다. 각 항목을 클릭하여 수정할 수 있습니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPhase('goal')} className="gap-1 text-xs">
                <Pencil className="h-3 w-3" /> 목표 변경
              </Button>
              {isDirty && (
                <Button onClick={saveToDb} disabled={saving} variant="outline" size="sm" className="gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saving ? '저장 중...' : '저장'}
                </Button>
              )}
              <Button onClick={generateModel} disabled={loadingModel} variant={logicModel ? 'outline' : 'default'} className="gap-2" size="sm">
                {loadingModel ? <><Loader2 className="h-4 w-4 animate-spin" /> 생성 중...</>
                  : <><Brain className="h-4 w-4" /> {logicModel ? 'Logic Model 재생성' : 'Logic Model 생성'}</>}
              </Button>
            </div>
          </div>

          {/* 외부 리서치 수집 패널 (티키타카) */}
          <ResearchPanel projectId={projectId} />

          {/* Confirmed goal banner */}
          <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary/70">확정된 Impact Goal</p>
            <p className="mt-1 text-base font-semibold">{confirmedGoal}</p>
          </div>

          {logicModel ? (
            <>
              {/* Logic chain — editable */}
              <div className="grid grid-cols-5 gap-3">
                {CHAIN_KEYS.map((key) => (
                  <div key={key} className={cn('rounded-lg border p-3', CHAIN_COLORS[key])}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className={cn('text-[11px] font-bold uppercase tracking-wide', CHAIN_TEXT[key])}>{CHAIN_LABELS[key]}</p>
                      <span className="text-[10px] text-muted-foreground">{logicModel[key]?.length ?? 0}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {logicModel[key]?.map((item: any, i: number) => {
                        const isEditing = editingKey === key && editingIndex === i
                        const text = getItemText(item)
                        const itemId = typeof item === 'object' ? item?.id : null
                        const sroiHint = typeof item === 'object' ? item?.sroiProxy : null
                        return (
                          <li key={i} className="group text-xs leading-snug">
                            {isEditing ? (
                              <div className="flex gap-1">
                                <Input className="h-6 text-xs" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} autoFocus />
                                <button onClick={saveEdit} className="text-green-600"><Check className="h-3 w-3" /></button>
                                <button onClick={() => setEditingKey(null)} className="text-muted-foreground"><X className="h-3 w-3" /></button>
                              </div>
                            ) : (
                              <div className="flex items-start gap-1">
                                <span className="mt-0.5 shrink-0 text-muted-foreground">·</span>
                                <div className="flex-1 cursor-pointer rounded px-0.5 hover:bg-white/60" onClick={() => startEdit(key, i, item)}>
                                  {itemId && <span className="mr-1 font-mono text-[9px] text-muted-foreground">{itemId}</span>}
                                  <span>{text}</span>
                                  {sroiHint && <span className="ml-1 text-[9px] text-primary/60">({sroiHint})</span>}
                                </div>
                                <button onClick={() => removeItem(key, i)} className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    <button onClick={() => addItem(key)} className={cn('mt-2 text-[10px] hover:underline', CHAIN_TEXT[key])}>+ 추가</button>
                  </div>
                ))}
              </div>

              {/* 외부 인사이트 (LLM이 제안한 트렌드/벤치마크/팁) */}
              {logicModel.externalInsights?.length > 0 && (
                <div className="rounded-lg border border-cyan-200 bg-cyan-50/30 p-3 space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-cyan-800">
                    <Sparkles className="h-3.5 w-3.5" /> 외부 인사이트 &amp; 트렌드
                  </p>
                  {logicModel.externalInsights.map((insight: any, i: number) => (
                    <div key={i} className="text-xs text-cyan-700">
                      <span className="mr-1 rounded bg-cyan-100 px-1 py-0.5 text-[9px] font-medium uppercase">
                        {insight.type}
                      </span>
                      {insight.message}
                      {insight.source && (
                        <span className="ml-1 text-[9px] text-cyan-500">— {insight.source}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 미저장 알림 */}
              {isDirty && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                  수정사항이 저장되지 않았습니다
                </p>
              )}

              {/* Nav buttons */}
              <div className="flex justify-between">
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push(`${pathname}?step=rfp`)}>
                  <ArrowLeft className="h-4 w-4" /> RFP 분석
                </Button>
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={saving}
                  onClick={async () => {
                    if (isDirty) await saveToDb()
                    router.push(`${pathname}?step=curriculum`)
                  }}
                >
                  커리큘럼 설계로 이동 <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed text-sm text-muted-foreground">
              <Brain className="h-10 w-10 opacity-20" />
              <p>위 버튼을 눌러 Logic Model을 생성하세요</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

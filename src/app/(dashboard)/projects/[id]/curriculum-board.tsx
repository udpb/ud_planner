'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  GripVertical, Lock, LockOpen, Info, Lightbulb, Sparkles,
  RefreshCw, Video, Users, AlertTriangle, TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { validateCurriculumRules, type RuleViolation } from '@/lib/curriculum-rules'
import { DataFlowBanner } from '@/components/projects/data-flow-banner'

interface CurriculumItem {
  id: string
  sessionNo: number
  title: string
  durationHours: number
  lectureMinutes: number
  practiceMinutes: number
  isTheory: boolean
  isActionWeek: boolean
  isCoaching1on1: boolean
  isLocked: boolean
  date: Date | null
  venue: string | null
  isOnline: boolean
  notes: string | null
  order: number
}

interface CurriculumInsight {
  type: 'info' | 'tip' | 'asset'
  message: string
}

interface Props {
  projectId: string
  initialItems: CurriculumItem[]
  insights?: CurriculumInsight[]
  rfpKeywords?: string[]
  rfpObjectives?: string[]
  logicModelActivities?: string[]
  supplyPrice?: number
  coachAssignmentCount?: number
}

// 세션 카드 (sortable)
function SessionCard({
  item,
  onLockToggle,
  onMinutesChange,
  violations,
  consecutiveTheoryWarning,
}: {
  item: CurriculumItem
  onLockToggle: (id: string) => void
  onMinutesChange: (id: string, field: 'lectureMinutes' | 'practiceMinutes', val: number) => void
  violations: RuleViolation[]
  consecutiveTheoryWarning: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: item.isLocked,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const totalMin = item.lectureMinutes + item.practiceMinutes
  const lectureRatio = totalMin > 0 ? (item.lectureMinutes / totalMin) * 100 : 0

  const hasViolation = violations.some((v) => v.affectedSessions?.includes(item.sessionNo))
  const isBlockViolation = violations.some((v) => v.action === 'BLOCK' && v.affectedSessions?.includes(item.sessionNo))

  return (
    <div ref={setNodeRef} style={style} className={cn(
      'group relative rounded-lg border bg-card transition-colors',
      item.isActionWeek ? 'border-primary/40 bg-primary/5' :
        item.isCoaching1on1 ? 'border-blue-300/50 bg-blue-50/30' :
          item.isLocked ? 'border-muted-foreground/20 bg-muted/30' : '',
      consecutiveTheoryWarning && 'border-amber-300 bg-amber-50/30',
      isBlockViolation && 'ring-1 ring-red-300',
    )}>
      <div className="flex items-start gap-2 p-3">
        {/* 드래그 핸들 */}
        <button
          className={`mt-0.5 shrink-0 text-muted-foreground/30 ${item.isLocked ? 'cursor-not-allowed' : 'cursor-grab hover:text-muted-foreground'}`}
          {...(!item.isLocked ? { ...attributes, ...listeners } : {})}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* 회차 번호 */}
        <span className={cn(
          'mt-0.5 w-6 shrink-0 text-center text-xs font-mono',
          hasViolation ? 'text-amber-600 font-bold' : 'text-muted-foreground',
        )}>
          {item.sessionNo}
        </span>

        {/* 세션 정보 */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-sm leading-tight">{item.title}</span>
            {item.isActionWeek && (
              <Badge className="h-4 px-1.5 text-[10px] bg-primary text-primary-foreground">Action Week</Badge>
            )}
            {item.isCoaching1on1 && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-blue-300 text-blue-600">
                <Video className="h-2.5 w-2.5 mr-0.5" />1:1 코칭
              </Badge>
            )}
            {item.isTheory && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">이론</Badge>
            )}
            {consecutiveTheoryWarning && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-amber-400 text-amber-700 bg-amber-50">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />연속 이론
              </Badge>
            )}
          </div>

          {/* 시간 구성 바 */}
          {!item.isActionWeek && !item.isCoaching1on1 && (
            <div className="space-y-1">
              <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="bg-amber-400" style={{ width: `${lectureRatio}%` }} />
                <div className="bg-primary/60" style={{ width: `${100 - lectureRatio}%` }} />
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                  강의
                  <Input type="number" className="h-5 w-10 px-1 text-[10px] border-0 bg-transparent focus:bg-muted"
                    value={item.lectureMinutes} min={0}
                    onChange={(e) => onMinutesChange(item.id, 'lectureMinutes', Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()} />분
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
                  실습
                  <Input type="number" className="h-5 w-10 px-1 text-[10px] border-0 bg-transparent focus:bg-muted"
                    value={item.practiceMinutes} min={0}
                    onChange={(e) => onMinutesChange(item.id, 'practiceMinutes', Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()} />분
                </span>
                <span className="ml-auto">{item.durationHours}h</span>
              </div>
            </div>
          )}

          {(item.date || item.venue) && (
            <p className="text-[10px] text-muted-foreground">
              {item.date ? new Date(item.date).toLocaleDateString('ko') : ''}
              {item.isOnline ? ' · 온라인' : item.venue ? ` · ${item.venue}` : ''}
            </p>
          )}
        </div>

        {/* 락 버튼 */}
        <button
          className={`shrink-0 p-1 rounded transition-colors ${
            item.isLocked ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100'
          }`}
          onClick={() => onLockToggle(item.id)}
        >
          {item.isLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

const INSIGHT_ICON = {
  info: <Info className="h-3.5 w-3.5 shrink-0 text-blue-500" />,
  tip: <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500" />,
  asset: <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />,
}

export function CurriculumBoard({
  projectId, initialItems, insights = [],
  rfpKeywords = [], rfpObjectives = [], logicModelActivities = [],
  supplyPrice = 0, coachAssignmentCount = 0,
}: Props) {
  const [items, setItems] = useState<CurriculumItem[]>(initialItems)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // --- 실시간 Rule 검증 ---
  const ruleResult = useMemo(() => validateCurriculumRules(
    items.map((i) => ({
      sessionNo: i.sessionNo, isTheory: i.isTheory, isActionWeek: i.isActionWeek,
    }))
  ), [items])

  // 이론 연속 3회 체크 (세션별 하이라이트용)
  const consecutiveTheorySessions = useMemo(() => {
    const set = new Set<number>()
    const sorted = [...items].sort((a, b) => a.sessionNo - b.sessionNo)
    for (let i = 0; i <= sorted.length - 3; i++) {
      if (sorted[i].isTheory && sorted[i + 1].isTheory && sorted[i + 2].isTheory) {
        set.add(sorted[i].sessionNo)
        set.add(sorted[i + 1].sessionNo)
        set.add(sorted[i + 2].sessionNo)
      }
    }
    return set
  }, [items])

  // --- DataFlow: RFP/LogicModel → 커리큘럼 ---
  const flowItems = useMemo(() => {
    if (items.length === 0) return []
    const allTitles = items.map((i) => i.title.toLowerCase()).join(' ')
    const result = []

    for (const kw of rfpKeywords.slice(0, 4)) {
      result.push({
        label: kw, value: '키워드',
        matched: allTitles.includes(kw.toLowerCase()),
        detail: `커리큘럼에 "${kw}" 관련 세션 추가를 검토하세요`,
      })
    }
    for (const act of logicModelActivities.slice(0, 3)) {
      const short = act.length > 15 ? act.slice(0, 15) + '…' : act
      const words = act.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
      result.push({
        label: short, value: '활동',
        matched: words.some((w: string) => allTitles.includes(w)),
        detail: 'Logic Model 활동이 커리큘럼에 반영되어야 합니다',
      })
    }
    return result
  }, [items, rfpKeywords, logicModelActivities])

  // --- 비용 미리보기 ---
  const totalHours = items.reduce((s, i) => s + i.durationHours, 0)
  const groupSessions = items.filter((i) => !i.isCoaching1on1).length
  const estimatedCoachCost = coachAssignmentCount > 0
    ? Math.round(totalHours * 70000 * coachAssignmentCount) // 메인 코치 시급 평균 추정
    : 0
  const estimatedMarginImpact = supplyPrice > 0
    ? ((supplyPrice - estimatedCoachCost) / supplyPrice * 100).toFixed(1)
    : null

  // --- 통계 ---
  const actionWeekCount = items.filter((i) => i.isActionWeek).length
  const coachingCount = items.filter((i) => i.isCoaching1on1).length
  const theoryCount = items.filter((i) => i.isTheory).length
  const theoryRatio = items.length > 0 ? Math.round((theoryCount / items.length) * 100) : 0

  // 순서 변경
  const saveOrder = useCallback(async (reordered: CurriculumItem[]) => {
    setSaving(true)
    try {
      await fetch(`/api/curriculum/${projectId}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: reordered.map((i, idx) => ({ id: i.id, order: idx, sessionNo: idx + 1 })) }),
      })
    } finally { setSaving(false) }
  }, [projectId])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const oldIdx = prev.findIndex((i) => i.id === active.id)
      const newIdx = prev.findIndex((i) => i.id === over.id)
      const reordered = arrayMove(prev, oldIdx, newIdx).map((item, idx) => ({ ...item, sessionNo: idx + 1 }))
      saveOrder(reordered)
      return reordered
    })
  }, [saveOrder])

  const handleLockToggle = useCallback(async (id: string) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, isLocked: !i.isLocked } : i))
    const item = items.find((i) => i.id === id)
    if (!item) return
    await fetch(`/api/curriculum/${projectId}/item`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isLocked: !item.isLocked }),
    })
  }, [items, projectId])

  const handleMinutesChange = useCallback(async (id: string, field: 'lectureMinutes' | 'practiceMinutes', val: number) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: val } : i))
    await fetch(`/api/curriculum/${projectId}/item`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: val }),
    })
  }, [projectId])

  return (
    <div className="space-y-4">
      {/* DataFlow: RFP/Logic Model → 커리큘럼 */}
      {flowItems.length > 0 && (
        <DataFlowBanner fromStep="RFP·임팩트 설계" toStep="커리큘럼" items={flowItems} />
      )}

      {/* 실시간 Rule 위반 경고 */}
      {ruleResult.violations.length > 0 && (
        <div className="space-y-1.5">
          {ruleResult.violations.map((v, i) => (
            <div key={i} className={cn(
              'flex items-start gap-2 rounded-md px-3 py-2 text-xs',
              v.action === 'BLOCK' ? 'bg-red-50 text-red-800 border border-red-200' :
                v.action === 'WARN' ? 'bg-amber-50 text-amber-800' :
                  'bg-blue-50 text-blue-800',
            )}>
              {v.action === 'BLOCK' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" /> :
                v.action === 'WARN' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> :
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />}
              <div>
                <span className="font-medium">[{v.ruleId}] {v.ruleName}</span>
                <p className="mt-0.5">{v.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 구성 요약 바 + 비용 미리보기 */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{items.length}회차</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          AW {actionWeekCount}
        </span>
        <span className="flex items-center gap-1">
          <Video className="h-3 w-3" />
          코칭 {coachingCount}
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          그룹 {groupSessions}
        </span>
        <span className={cn(theoryRatio > 30 ? 'text-red-600 font-medium' : theoryRatio > 25 ? 'text-amber-600' : '')}>
          이론 {theoryRatio}%
          {theoryRatio > 30 && ' ⚠'}
        </span>
        <span className="text-muted-foreground">총 {totalHours}h</span>

        {/* 비용 미리보기 */}
        {estimatedCoachCost > 0 && (
          <span className="ml-auto flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5">
            <TrendingUp className="h-3 w-3" />
            <span>예상 코치비 <strong>{(estimatedCoachCost / 10000).toFixed(0)}만</strong></span>
            {estimatedMarginImpact && (
              <span className={cn(
                'font-medium',
                Number(estimatedMarginImpact) < 10 ? 'text-red-600' : 'text-green-600',
              )}>
                마진 {estimatedMarginImpact}%
              </span>
            )}
          </span>
        )}

        {saving && (
          <span className="flex items-center gap-1 text-muted-foreground/60">
            <RefreshCw className="h-3 w-3 animate-spin" />저장 중
          </span>
        )}
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="space-y-1.5">
          {insights.map((insight, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
              insight.type === 'tip' ? 'bg-amber-50 text-amber-800' :
                insight.type === 'asset' ? 'bg-primary/5 text-primary' :
                  'bg-muted text-muted-foreground'
            }`}>
              {INSIGHT_ICON[insight.type]}
              <span>{insight.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* 세션 목록 */}
      {items.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          AI 패널에서 커리큘럼을 먼저 생성하세요.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {items.map((item) => (
                <SessionCard
                  key={item.id}
                  item={item}
                  onLockToggle={handleLockToggle}
                  onMinutesChange={handleMinutesChange}
                  violations={ruleResult.violations}
                  consecutiveTheoryWarning={consecutiveTheorySessions.has(item.sessionNo)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        드래그로 순서 변경 · 🔒 고정 · 분 입력란으로 시간 조정 · Rule 위반 시 실시간 경고
      </p>
    </div>
  )
}

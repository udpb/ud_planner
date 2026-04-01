'use client'

import { useState, useCallback } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  GripVertical, Lock, LockOpen, Info, Lightbulb, Sparkles,
  RefreshCw, Video, Users,
} from 'lucide-react'

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
}

// 세션 카드 (sortable)
function SessionCard({
  item,
  onLockToggle,
  onMinutesChange,
}: {
  item: CurriculumItem
  onLockToggle: (id: string) => void
  onMinutesChange: (id: string, field: 'lectureMinutes' | 'practiceMinutes', val: number) => void
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

  return (
    <div ref={setNodeRef} style={style} className={`group relative rounded-lg border bg-card transition-colors ${
      item.isActionWeek ? 'border-primary/40 bg-primary/5' :
      item.isCoaching1on1 ? 'border-blue-300/50 bg-blue-50/30' :
      item.isLocked ? 'border-muted-foreground/20 bg-muted/30' : ''
    }`}>
      <div className="flex items-start gap-2 p-3">
        {/* 드래그 핸들 */}
        <button
          className={`mt-0.5 shrink-0 text-muted-foreground/30 ${item.isLocked ? 'cursor-not-allowed' : 'cursor-grab hover:text-muted-foreground'}`}
          {...(!item.isLocked ? { ...attributes, ...listeners } : {})}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* 회차 번호 */}
        <span className="mt-0.5 w-6 shrink-0 text-center text-xs font-mono text-muted-foreground">
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
                  <Input
                    type="number"
                    className="h-5 w-10 px-1 text-[10px] border-0 bg-transparent focus:bg-muted"
                    value={item.lectureMinutes}
                    min={0}
                    onChange={(e) => onMinutesChange(item.id, 'lectureMinutes', Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                  />분
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
                  실습
                  <Input
                    type="number"
                    className="h-5 w-10 px-1 text-[10px] border-0 bg-transparent focus:bg-muted"
                    value={item.practiceMinutes}
                    min={0}
                    onChange={(e) => onMinutesChange(item.id, 'practiceMinutes', Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                  />분
                </span>
                <span className="ml-auto">{item.durationHours}h 총</span>
              </div>
            </div>
          )}

          {/* 날짜/장소 */}
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
            item.isLocked
              ? 'text-primary'
              : 'text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100'
          }`}
          onClick={() => onLockToggle(item.id)}
          title={item.isLocked ? '고정 해제' : '이 세션 고정'}
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

export function CurriculumBoard({ projectId, initialItems, insights = [] }: Props) {
  const [items, setItems] = useState<CurriculumItem[]>(initialItems)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // 순서 변경 저장
  const saveOrder = useCallback(async (reordered: CurriculumItem[]) => {
    setSaving(true)
    try {
      await fetch(`/api/curriculum/${projectId}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: reordered.map((i, idx) => ({ id: i.id, order: idx, sessionNo: idx + 1 })) }),
      })
    } finally {
      setSaving(false)
    }
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

  // 락 토글
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

  // 강의/실습 분 변경 (낙관적 업데이트)
  const handleMinutesChange = useCallback(async (id: string, field: 'lectureMinutes' | 'practiceMinutes', val: number) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: val } : i))
    await fetch(`/api/curriculum/${projectId}/item`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: val }),
    })
  }, [projectId])

  const actionWeekCount = items.filter((i) => i.isActionWeek).length
  const coachingCount = items.filter((i) => i.isCoaching1on1).length
  const theoryCount = items.filter((i) => i.isTheory).length
  const theoryRatio = items.length > 0 ? Math.round((theoryCount / items.length) * 100) : 0

  return (
    <div className="space-y-4">
      {/* 구성 요약 바 */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{items.length}회차</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          Action Week {actionWeekCount}회
        </span>
        <span className="flex items-center gap-1">
          <Video className="h-3 w-3" />
          1:1 코칭 {coachingCount}회
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          그룹 교육 {items.length - coachingCount}회
        </span>
        <span className={theoryRatio > 30 ? 'text-amber-600' : ''}>
          이론 비율 {theoryRatio}%
        </span>
        {saving && (
          <span className="ml-auto flex items-center gap-1 text-muted-foreground/60">
            <RefreshCw className="h-3 w-3 animate-spin" />저장 중
          </span>
        )}
      </div>

      {/* Insights 패널 */}
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

      {/* 드래그 가능한 세션 목록 */}
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
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        드래그로 순서 변경 · 🔒 아이콘으로 세션 고정 · 분 입력란으로 강의/실습 시간 조정
      </p>
    </div>
  )
}

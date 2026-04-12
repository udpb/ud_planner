'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Loader2, Sparkles, CheckCircle2, Circle, ArrowLeft, Target,
  Pencil, Save, X, BarChart3, AlertTriangle, TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataFlowBanner } from '@/components/projects/data-flow-banner'

const SECTIONS = [
  { no: 1, title: '사업 추진 배경 및 필요성' },
  { no: 2, title: '사업 목표 및 추진 전략' },
  { no: 3, title: '임팩트 로직 모델' },
  { no: 4, title: '교육 커리큘럼 및 운영 계획' },
  { no: 5, title: '코치 및 전문가 구성' },
  { no: 6, title: '성과 지표 및 평가 계획' },
  { no: 7, title: '추진 일정 및 예산 계획' },
]

const EVAL_SECTION_MAP: Record<string, number[]> = {
  '배경': [1], '필요성': [1], '추진': [1, 2], '목표': [2], '전략': [2],
  '로직': [3], '임팩트': [3, 6], '커리큘럼': [4], '교육': [4], '운영': [4],
  '코치': [5], '전문': [5], '강사': [5], '인력': [5],
  '성과': [6], '평가': [6], '지표': [6], '일정': [7], '예산': [7], '사업비': [7],
}

function mapEvalToSections(evalCriteria: any[]): Map<number, { items: string[]; totalScore: number }> {
  const result = new Map<number, { items: string[]; totalScore: number }>()
  for (const criteria of evalCriteria) {
    const itemText = (criteria.item ?? '').toLowerCase()
    const matched = new Set<number>()
    for (const [keyword, sectionNos] of Object.entries(EVAL_SECTION_MAP)) {
      if (itemText.includes(keyword)) sectionNos.forEach((n) => matched.add(n))
    }
    if (matched.size === 0) matched.add(2)
    for (const sno of matched) {
      const e = result.get(sno) ?? { items: [], totalScore: 0 }
      e.items.push(`${criteria.item} (${criteria.score}점)`)
      e.totalScore += criteria.score
      result.set(sno, e)
    }
  }
  return result
}

interface SimulationItem {
  criteria: string
  maxScore: number
  score: number
  strength: string
  improvement: string
}

interface Simulation {
  totalScore: number
  maxScore: number
  items: SimulationItem[]
  overallFeedback: string
  topPriority: string
}

interface ProposalSection {
  id: string
  sectionNo: number
  title: string
  content: string
  version: number
  isApproved: boolean
}

interface Props {
  projectId: string
  hasLogicModel: boolean
  initialSections: ProposalSection[]
  evalCriteria: Array<{ item: string; score: number; notes: string }>
}

export function StepProposal({ projectId, hasLogicModel, initialSections, evalCriteria }: Props) {
  const [sections, setSections] = useState<ProposalSection[]>(initialSections)
  const [loadingSection, setLoadingSection] = useState<number | null>(null)
  const [error, setError] = useState('')

  // 편집 상태
  const [editingSectionNo, setEditingSectionNo] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // 시뮬레이션
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [loadingSim, setLoadingSim] = useState(false)

  const router = useRouter()
  const pathname = usePathname()
  const evalSectionMap = mapEvalToSections(evalCriteria)

  // DataFlow
  const flowItems = evalCriteria.slice(0, 6).map((c) => {
    const matched = new Set<number>()
    const itemText = (c.item ?? '').toLowerCase()
    for (const [keyword, sectionNos] of Object.entries(EVAL_SECTION_MAP)) {
      if (itemText.includes(keyword)) sectionNos.forEach((n) => matched.add(n))
    }
    const done = [...matched].every((sno) => sections.some((s) => s.sectionNo === sno))
    return {
      label: c.item, value: `${c.score}점`, matched: done,
      detail: done ? undefined : '해당 섹션이 아직 생성되지 않았습니다',
    }
  })

  // 섹션 생성
  async function genSection(sectionNo: number) {
    setLoadingSection(sectionNo)
    setError('')
    try {
      const res = await fetch('/api/ai/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sectionNo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSections((prev) => {
        const filtered = prev.filter((s) => s.sectionNo !== sectionNo)
        return [...filtered, data.section].sort((a, b) => a.sectionNo - b.sectionNo)
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingSection(null)
    }
  }

  async function genAll() {
    for (const s of SECTIONS) await genSection(s.no)
  }

  // 편집
  function startEdit(section: ProposalSection) {
    setEditingSectionNo(section.sectionNo)
    setEditContent(section.content)
  }

  function cancelEdit() {
    setEditingSectionNo(null)
    setEditContent('')
  }

  async function saveEditContent() {
    const section = sections.find((s) => s.sectionNo === editingSectionNo)
    if (!section) return
    setSavingEdit(true)
    try {
      const res = await fetch('/api/ai/proposal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: section.id, content: editContent }),
      })
      if (!res.ok) throw new Error('저장 실패')
      setSections((prev) =>
        prev.map((s) => s.sectionNo === editingSectionNo ? { ...s, content: editContent } : s)
      )
      setEditingSectionNo(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSavingEdit(false)
    }
  }

  // 평가 시뮬레이션
  async function runSimulation() {
    setLoadingSim(true)
    setError('')
    try {
      const res = await fetch('/api/ai/proposal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSimulation(data.simulation)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingSim(false)
    }
  }

  const completedCount = sections.length
  const progress = (completedCount / SECTIONS.length) * 100

  return (
    <div className="space-y-4">
      {/* DataFlow */}
      {evalCriteria.length > 0 && (
        <DataFlowBanner fromStep="RFP 평가 배점" toStep="제안서 섹션" items={flowItems} />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">제안서 어시스턴트</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            AI 생성 → 직접 편집 → 평가 시뮬레이션으로 제안서를 완성합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!hasLogicModel && (
            <span className="text-xs text-amber-600">⚠ Logic Model 필요</span>
          )}
          <Badge variant="outline" className="font-mono">{completedCount}/{SECTIONS.length}</Badge>
          <Button size="sm" variant="outline" className="gap-1.5"
            disabled={completedCount < 3 || loadingSim}
            onClick={runSimulation}>
            {loadingSim ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
            평가 시뮬레이션
          </Button>
          <Button size="sm" className="gap-1.5"
            disabled={!hasLogicModel || loadingSection !== null}
            onClick={genAll}>
            <Sparkles className="h-3.5 w-3.5" /> 전체 생성
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <Progress value={progress} className="h-1.5" />

      {/* 평가 시뮬레이션 결과 */}
      {simulation && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                평가 시뮬레이션 결과
              </span>
              <span className={cn(
                'text-xl font-bold',
                (simulation.totalScore / simulation.maxScore) >= 0.8 ? 'text-green-600' :
                  (simulation.totalScore / simulation.maxScore) >= 0.6 ? 'text-amber-600' : 'text-red-600',
              )}>
                {simulation.totalScore}<span className="text-sm font-normal text-muted-foreground">/{simulation.maxScore}점</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {/* 항목별 점수 */}
            <div className="space-y-1.5">
              {simulation.items.map((item, i) => (
                <div key={i} className="rounded-md border bg-white px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{item.criteria}</span>
                    <span className={cn(
                      'font-mono font-bold',
                      item.score / item.maxScore >= 0.8 ? 'text-green-600' :
                        item.score / item.maxScore >= 0.6 ? 'text-amber-600' : 'text-red-600',
                    )}>
                      {item.score}/{item.maxScore}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-4 text-[10px]">
                    <span className="text-green-700"><CheckCircle2 className="inline h-2.5 w-2.5 mr-0.5" />{item.strength}</span>
                    <span className="text-amber-700"><AlertTriangle className="inline h-2.5 w-2.5 mr-0.5" />{item.improvement}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 전체 피드백 */}
            <div className="rounded-md bg-white border p-3">
              <p className="text-xs text-muted-foreground">{simulation.overallFeedback}</p>
              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-red-700">
                <TrendingUp className="h-3 w-3" />
                최우선 개선: {simulation.topPriority}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sections grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const done = sections.find((ls) => ls.sectionNo === s.no)
          const isLoading = loadingSection === s.no
          const evalMapping = evalSectionMap.get(s.no)
          const isEditing = editingSectionNo === s.no
          const simItem = simulation?.items.find((si) => {
            const mapped = new Set<number>()
            const itemText = si.criteria.toLowerCase()
            for (const [kw, sns] of Object.entries(EVAL_SECTION_MAP)) {
              if (itemText.includes(kw)) sns.forEach((n) => mapped.add(n))
            }
            return mapped.has(s.no)
          })

          return (
            <Card key={s.no} className={cn(
              done ? 'border-green-200 bg-green-50/30' : '',
              evalMapping && evalMapping.totalScore >= 20 && !done ? 'ring-1 ring-amber-300' : '',
              isEditing ? 'ring-2 ring-primary' : '',
            )}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 pt-4 px-4">
                <div className="flex items-start gap-2">
                  {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                    : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-mono text-muted-foreground">섹션 {s.no}</p>
                      {simItem && (
                        <Badge className={cn(
                          'text-[9px] h-4',
                          simItem.score / simItem.maxScore >= 0.8 ? 'bg-green-100 text-green-800' :
                            simItem.score / simItem.maxScore >= 0.6 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800',
                        )}>
                          {simItem.score}/{simItem.maxScore}점
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-sm leading-snug">{s.title}</CardTitle>
                  </div>
                </div>
                <div className="flex gap-1">
                  {done && !isEditing && (
                    <button onClick={() => startEdit(done)}
                      className="h-7 px-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted">
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  <Button size="sm" variant={done ? 'ghost' : 'outline'}
                    className="h-7 shrink-0 px-2.5 text-xs"
                    disabled={!hasLogicModel || isLoading}
                    onClick={() => genSection(s.no)}>
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? '재생성' : '생성'}
                  </Button>
                </div>
              </CardHeader>

              {/* 평가 배점 대응 */}
              {evalMapping && (
                <div className="px-4 pb-1">
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <Target className="h-3 w-3 text-amber-600" />
                    <span className="text-amber-700 font-medium">평가 반영: {evalMapping.totalScore}점</span>
                  </div>
                </div>
              )}

              {/* 편집 모드 */}
              {isEditing && (
                <CardContent className="px-4 pb-4 pt-1 space-y-2">
                  <Textarea
                    className="min-h-[200px] text-xs leading-relaxed"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 text-xs gap-1">
                      <X className="h-3 w-3" /> 취소
                    </Button>
                    <Button size="sm" onClick={saveEditContent} disabled={savingEdit} className="h-7 text-xs gap-1">
                      <Save className="h-3 w-3" /> {savingEdit ? '저장 중...' : '저장'}
                    </Button>
                  </div>
                </CardContent>
              )}

              {/* 읽기 모드 */}
              {done && !isEditing && (
                <CardContent className="px-4 pb-4 pt-1">
                  <p className="line-clamp-4 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {done.content}
                  </p>
                  {done.version > 1 && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">v{done.version}</p>
                  )}
                  {simItem && simItem.score / simItem.maxScore < 0.7 && (
                    <p className="mt-1.5 text-[10px] text-amber-700 font-medium">
                      → {simItem.improvement}
                    </p>
                  )}
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {/* Back nav */}
      <Button variant="ghost" size="sm" className="gap-1.5"
        onClick={() => router.push(`${pathname}?step=budget`)}>
        <ArrowLeft className="h-4 w-4" /> 예산으로 돌아가기
      </Button>
    </div>
  )
}

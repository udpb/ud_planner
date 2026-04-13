'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Loader2, Sparkles, CheckCircle2, Circle, ArrowLeft, Target,
  Pencil, Save, X, BarChart3, AlertTriangle, TrendingUp,
  ChevronDown, ChevronUp, Shield, ShieldCheck, Wand2, Eye, EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataFlowBanner } from '@/components/projects/data-flow-banner'
import { ResearchPanel } from '@/components/projects/research-panel'
import { StrategyPanel } from '@/components/projects/strategy-panel'

/* ───────────────────────────────────────── 상수 ── */

const SECTIONS = [
  { no: 1, title: '사업 추진 배경 및 필요성' },
  { no: 2, title: '사업 목표 및 추진 전략' },
  { no: 3, title: '임팩트 로직 모델' },
  { no: 4, title: '교육 커리큘럼 및 운영 계획' },
  { no: 5, title: '코치 및 전문가 구성' },
  { no: 6, title: '성과 지표 및 평가 계획' },
  { no: 7, title: '추진 일정 및 예산 계획' },
]

const LENGTH_TARGETS: Record<number, { min: number; max: number }> = {
  1: { min: 800, max: 3000 },
  2: { min: 800, max: 3500 },
  3: { min: 800, max: 2500 },
  4: { min: 1000, max: 4000 },
  5: { min: 800, max: 3000 },
  6: { min: 800, max: 3000 },
  7: { min: 800, max: 3000 },
}

const EVAL_SECTION_MAP: Record<string, number[]> = {
  '배경': [1], '필요성': [1], '추진': [1, 2], '목표': [2], '전략': [2],
  '로직': [3], '임팩트': [3, 6], '커리큘럼': [4], '교육': [4], '운영': [4],
  '코치': [5], '전문': [5], '강사': [5], '인력': [5],
  '성과': [6], '평가': [6], '지표': [6], '일정': [7], '예산': [7], '사업비': [7],
}

/* ───────────────────────────────────── 유틸 함수 ── */

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

function charCountColor(len: number, target: { min: number; max: number }) {
  if (len < target.min * 0.5) return 'text-red-500'
  if (len < target.min) return 'text-amber-500'
  if (len <= target.max) return 'text-green-600'
  return 'text-amber-500'
}

/* ───────────────────────────────────── 타입 정의 ── */

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

/* ─────────────────────────────── 자동 리사이즈 Hook ── */

function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(200, el.scrollHeight)}px`
  }, [value])
  return ref
}

/* ═════════════════════════════════════════════════════
   StepProposal 컴포넌트
   ═════════════════════════════════════════════════════ */

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

  // AI 개선
  const [improvingSection, setImprovingSection] = useState<number | null>(null)

  // 펼치기/접기
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set())

  // 전체 미리보기
  const [previewMode, setPreviewMode] = useState(false)

  const router = useRouter()
  const pathname = usePathname()
  const evalSectionMap = mapEvalToSections(evalCriteria)
  const textareaRef = useAutoResize(editContent)

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

  /* ─── 섹션 생성 ─── */
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

  /* ─── 편집 ─── */
  function startEdit(section: ProposalSection) {
    setEditingSectionNo(section.sectionNo)
    setEditContent(section.content)
    setExpandedSections((prev) => new Set(prev).add(section.sectionNo))
  }

  function cancelEdit() {
    setEditingSectionNo(null)
    setEditContent('')
  }

  const saveEditContent = useCallback(async () => {
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
  }, [sections, editingSectionNo, editContent, projectId])

  // Ctrl+Enter 저장
  function handleEditKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      saveEditContent()
    }
  }

  /* ─── 승인 토글 ─── */
  async function toggleApproval(section: ProposalSection) {
    const next = !section.isApproved
    // 낙관적 업데이트
    setSections((prev) =>
      prev.map((s) => s.id === section.id ? { ...s, isApproved: next } : s)
    )
    try {
      const res = await fetch('/api/ai/proposal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: section.id, isApproved: next }),
      })
      if (!res.ok) {
        // 롤백
        setSections((prev) =>
          prev.map((s) => s.id === section.id ? { ...s, isApproved: !next } : s)
        )
      }
    } catch {
      setSections((prev) =>
        prev.map((s) => s.id === section.id ? { ...s, isApproved: !next } : s)
      )
    }
  }

  /* ─── AI 개선 ─── */
  async function improveSection(sectionNo: number, feedback: string) {
    setImprovingSection(sectionNo)
    setError('')
    try {
      const res = await fetch('/api/ai/proposal/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sectionNo, feedback }),
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
      setImprovingSection(null)
    }
  }

  /* ─── 평가 시뮬레이션 ─── */
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

  /* ─── 펼치기/접기 ─── */
  function toggleExpand(sno: number) {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      next.has(sno) ? next.delete(sno) : next.add(sno)
      return next
    })
  }

  /* ─── 시뮬레이션 항목 매칭 ─── */
  function findSimItem(sno: number) {
    return simulation?.items.find((si) => {
      const mapped = new Set<number>()
      const itemText = si.criteria.toLowerCase()
      for (const [kw, sns] of Object.entries(EVAL_SECTION_MAP)) {
        if (itemText.includes(kw)) sns.forEach((n) => mapped.add(n))
      }
      return mapped.has(sno)
    })
  }

  const completedCount = sections.length
  const approvedCount = sections.filter((s) => s.isApproved).length
  const progress = (completedCount / SECTIONS.length) * 100

  /* ═══════════════════════════ 렌더 ═══════════════════════════ */

  return (
    <div className="space-y-4">
      {/* DataFlow */}
      {evalCriteria.length > 0 && (
        <DataFlowBanner fromStep="RFP 평가 배점" toStep="제안서 섹션" items={flowItems} />
      )}

      {/* 수주 전략 메모 + 외부 리서치 수집 */}
      <StrategyPanel projectId={projectId} />
      <ResearchPanel projectId={projectId} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">제안서 어시스턴트</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            AI 생성 → 직접 편집 → 승인 → 평가 시뮬레이션으로 제안서를 완성합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!hasLogicModel && (
            <span className="text-xs text-amber-600">⚠ Logic Model 필요</span>
          )}
          <Badge variant="outline" className="font-mono">
            {completedCount}/{SECTIONS.length}
            {approvedCount > 0 && (
              <span className="ml-1 text-green-600">({approvedCount} 승인)</span>
            )}
          </Badge>
          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => setPreviewMode(!previewMode)}>
            {previewMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {previewMode ? '카드 뷰' : '전체 미리보기'}
          </Button>
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

      {/* ── 평가 시뮬레이션 결과 ── */}
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

      {/* ── 전체 미리보기 모드 ── */}
      {previewMode && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> 제안서 전체 미리보기
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {SECTIONS.map((s) => {
              const done = sections.find((ls) => ls.sectionNo === s.no)
              return (
                <div key={s.no}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={done ? 'default' : 'outline'} className="text-[10px]">
                      섹션 {s.no}
                    </Badge>
                    <h4 className="text-sm font-semibold">{s.title}</h4>
                    {done?.isApproved && (
                      <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                    )}
                  </div>
                  {done ? (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground pl-2 border-l-2 border-muted">
                      {done.content}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 italic pl-2 border-l-2 border-dashed border-muted">
                      아직 생성되지 않았습니다.
                    </p>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Sections 카드 그리드 ── */}
      {!previewMode && (
        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => {
            const done = sections.find((ls) => ls.sectionNo === s.no)
            const isLoading = loadingSection === s.no
            const isImproving = improvingSection === s.no
            const evalMapping = evalSectionMap.get(s.no)
            const isEditing = editingSectionNo === s.no
            const isExpanded = expandedSections.has(s.no)
            const simItem = findSimItem(s.no)
            const target = LENGTH_TARGETS[s.no]
            const charLen = done?.content.length ?? 0

            return (
              <Card key={s.no} className={cn(
                'transition-all',
                done?.isApproved ? 'border-green-300 bg-green-50/40' :
                  done ? 'border-green-200 bg-green-50/30' : '',
                evalMapping && evalMapping.totalScore >= 20 && !done ? 'ring-1 ring-amber-300' : '',
                isEditing ? 'ring-2 ring-primary' : '',
              )}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 pt-4 px-4">
                  <div className="flex items-start gap-2">
                    {done?.isApproved
                      ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      : done
                        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
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
                        {done && (
                          <span className={cn('text-[10px] font-mono', charCountColor(charLen, target))}>
                            {charLen}자
                          </span>
                        )}
                      </div>
                      <CardTitle className="text-sm leading-snug">{s.title}</CardTitle>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {/* 승인 토글 */}
                    {done && !isEditing && (
                      <button
                        onClick={() => toggleApproval(done)}
                        title={done.isApproved ? '승인 취소' : '승인'}
                        className={cn(
                          'h-7 px-1.5 rounded text-xs hover:bg-muted',
                          done.isApproved ? 'text-green-600' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {done.isApproved ? <ShieldCheck className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {/* 편집 */}
                    {done && !isEditing && (
                      <button onClick={() => startEdit(done)}
                        title="직접 편집"
                        className="h-7 px-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    {/* AI 개선 */}
                    {done && !isEditing && simItem && simItem.score / simItem.maxScore < 0.8 && (
                      <button
                        onClick={() => improveSection(s.no, simItem.improvement)}
                        disabled={isImproving}
                        title="AI 피드백 반영 개선"
                        className="h-7 px-1.5 rounded text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                        {isImproving
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Wand2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {/* 생성/재생성 */}
                    <Button size="sm" variant={done ? 'ghost' : 'outline'}
                      className="h-7 shrink-0 px-2.5 text-xs"
                      disabled={!hasLogicModel || isLoading || isImproving}
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

                {/* ── 편집 모드 ── */}
                {isEditing && (
                  <CardContent className="px-4 pb-4 pt-1 space-y-2">
                    <Textarea
                      ref={textareaRef}
                      className="min-h-[200px] text-xs leading-relaxed resize-none"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                    />
                    {/* 글자수 표시 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className={charCountColor(editContent.length, target)}>
                          {editContent.length}자
                        </span>
                        <span className="text-muted-foreground">
                          / 목표 {target.min}~{target.max}자
                        </span>
                        {editContent.length >= target.min && editContent.length <= target.max && (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">Ctrl+Enter 저장</span>
                        <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 text-xs gap-1">
                          <X className="h-3 w-3" /> 취소
                        </Button>
                        <Button size="sm" onClick={saveEditContent} disabled={savingEdit} className="h-7 text-xs gap-1">
                          <Save className="h-3 w-3" /> {savingEdit ? '저장 중...' : '저장'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}

                {/* ── 읽기 모드 ── */}
                {done && !isEditing && (
                  <CardContent className="px-4 pb-4 pt-1">
                    <p className={cn(
                      'text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap',
                      !isExpanded && 'line-clamp-4',
                    )}>
                      {done.content}
                    </p>

                    {/* 메타 정보 행 */}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {done.version > 1 && (
                          <span className="text-[10px] text-muted-foreground">v{done.version}</span>
                        )}
                        {/* 글자수 vs 목표 범위 */}
                        <span className={cn('text-[10px]', charCountColor(charLen, target))}>
                          {charLen}자
                          <span className="text-muted-foreground"> / {target.min}~{target.max}</span>
                        </span>
                      </div>
                      {/* 펼치기/접기 토글 */}
                      {done.content.length > 200 && (
                        <button
                          onClick={() => toggleExpand(s.no)}
                          className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? (
                            <><ChevronUp className="h-3 w-3" /> 접기</>
                          ) : (
                            <><ChevronDown className="h-3 w-3" /> 전체 보기</>
                          )}
                        </button>
                      )}
                    </div>

                    {/* 시뮬레이션 개선 힌트 */}
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
      )}

      {/* Back nav */}
      <Button variant="ghost" size="sm" className="gap-1.5"
        onClick={() => router.push(`${pathname}?step=budget`)}>
        <ArrowLeft className="h-4 w-4" /> 예산으로 돌아가기
      </Button>
    </div>
  )
}

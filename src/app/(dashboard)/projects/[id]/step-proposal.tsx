'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Loader2, Sparkles, CheckCircle2, Circle, ArrowLeft, Target,
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

// 평가 배점 항목 → 제안서 섹션 매핑 (키워드 기반)
const EVAL_SECTION_MAP: Record<string, number[]> = {
  '배경': [1],
  '필요성': [1],
  '추진': [1, 2],
  '목표': [2],
  '전략': [2],
  '로직': [3],
  '임팩트': [3, 6],
  '커리큘럼': [4],
  '교육': [4],
  '운영': [4],
  '코치': [5],
  '전문': [5],
  '강사': [5],
  '인력': [5],
  '성과': [6],
  '평가': [6],
  '지표': [6],
  '일정': [7],
  '예산': [7],
  '사업비': [7],
}

function mapEvalToSections(evalCriteria: any[]): Map<number, { items: string[]; totalScore: number }> {
  const result = new Map<number, { items: string[]; totalScore: number }>()

  for (const criteria of evalCriteria) {
    const itemText = (criteria.item ?? '').toLowerCase()
    const matchedSections = new Set<number>()

    for (const [keyword, sectionNos] of Object.entries(EVAL_SECTION_MAP)) {
      if (itemText.includes(keyword)) {
        sectionNos.forEach((n) => matchedSections.add(n))
      }
    }

    // 매칭되지 않으면 가장 관련 높은 섹션 2에 기본 배정
    if (matchedSections.size === 0) matchedSections.add(2)

    for (const sno of matchedSections) {
      const existing = result.get(sno) ?? { items: [], totalScore: 0 }
      existing.items.push(`${criteria.item} (${criteria.score}점)`)
      existing.totalScore += criteria.score
      result.set(sno, existing)
    }
  }

  return result
}

interface ProposalSection {
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
  const router = useRouter()
  const pathname = usePathname()

  const evalSectionMap = mapEvalToSections(evalCriteria)

  // Data flow: 어떤 평가 항목이 어떤 섹션에 대응되는지
  const flowItems = evalCriteria.slice(0, 6).map((c) => {
    const matchedSections = new Set<number>()
    const itemText = (c.item ?? '').toLowerCase()
    for (const [keyword, sectionNos] of Object.entries(EVAL_SECTION_MAP)) {
      if (itemText.includes(keyword)) sectionNos.forEach((n) => matchedSections.add(n))
    }
    const sectionsDone = [...matchedSections].every((sno) =>
      sections.some((s) => s.sectionNo === sno)
    )
    return {
      label: c.item,
      value: `${c.score}점`,
      matched: sectionsDone,
      detail: sectionsDone ? undefined : '해당 섹션이 아직 생성되지 않았습니다',
    }
  })

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
    for (const s of SECTIONS) {
      await genSection(s.no)
    }
  }

  const completedCount = sections.length
  const progress = (completedCount / SECTIONS.length) * 100

  return (
    <div className="space-y-4">
      {/* Data Flow: 평가 배점 → 제안서 섹션 */}
      {evalCriteria.length > 0 && (
        <DataFlowBanner
          fromStep="RFP 평가 배점"
          toStep="제안서 섹션"
          items={flowItems}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">제안서 생성</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            AI가 Logic Model과 커리큘럼을 기반으로 7개 섹션의 제안서를 작성합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!hasLogicModel && (
            <span className="text-xs text-amber-600">⚠ Logic Model이 먼저 필요합니다</span>
          )}
          <Badge variant="outline" className="font-mono">
            {completedCount} / {SECTIONS.length}
          </Badge>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!hasLogicModel || loadingSection !== null}
            onClick={genAll}
          >
            <Sparkles className="h-3.5 w-3.5" />
            전체 생성
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Progress bar */}
      <Progress value={progress} className="h-1.5" />

      {/* Sections grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const done = sections.find((ls) => ls.sectionNo === s.no)
          const isLoading = loadingSection === s.no
          const evalMapping = evalSectionMap.get(s.no)

          return (
            <Card
              key={s.no}
              className={cn(
                done ? 'border-green-200 bg-green-50/30' : '',
                evalMapping && evalMapping.totalScore >= 20 && !done ? 'ring-1 ring-amber-300' : '',
              )}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 pt-4 px-4">
                <div className="flex items-start gap-2">
                  {done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                  )}
                  <div>
                    <p className="text-[11px] font-mono text-muted-foreground">섹션 {s.no}</p>
                    <CardTitle className="text-sm leading-snug">{s.title}</CardTitle>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={done ? 'ghost' : 'outline'}
                  className="h-7 shrink-0 px-2.5 text-xs"
                  disabled={!hasLogicModel || isLoading}
                  onClick={() => genSection(s.no)}
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : done ? (
                    '재생성'
                  ) : (
                    '생성'
                  )}
                </Button>
              </CardHeader>

              {/* 평가 배점 대응 표시 */}
              {evalMapping && (
                <div className="px-4 pb-1">
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <Target className="h-3 w-3 text-amber-600" />
                    <span className="text-amber-700 font-medium">
                      평가 반영: {evalMapping.totalScore}점
                    </span>
                    <span className="text-muted-foreground">
                      ({evalMapping.items.join(', ')})
                    </span>
                  </div>
                </div>
              )}

              {done && (
                <CardContent className="px-4 pb-4 pt-1">
                  <p className="line-clamp-3 text-xs text-muted-foreground leading-relaxed">
                    {done.content}
                  </p>
                  {done.version > 1 && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">v{done.version}</p>
                  )}
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {/* Back nav */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => router.push(`${pathname}?step=budget`)}
      >
        <ArrowLeft className="h-4 w-4" />
        예산으로 돌아가기
      </Button>
    </div>
  )
}

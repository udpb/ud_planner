'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Loader2, Sparkles, CheckCircle2, Circle, ArrowLeft, FileSignature,
} from 'lucide-react'

const SECTIONS = [
  { no: 1, title: '사업 추진 배경 및 필요성' },
  { no: 2, title: '사업 목표 및 추진 전략' },
  { no: 3, title: '임팩트 로직 모델' },
  { no: 4, title: '교육 커리큘럼 및 운영 계획' },
  { no: 5, title: '코치 및 전문가 구성' },
  { no: 6, title: '성과 지표 및 평가 계획' },
  { no: 7, title: '추진 일정 및 예산 계획' },
]

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
}

export function StepProposal({ projectId, hasLogicModel, initialSections }: Props) {
  const [sections, setSections] = useState<ProposalSection[]>(initialSections)
  const [loadingSection, setLoadingSection] = useState<number | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()
  const pathname = usePathname()

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
    <div className="space-y-6">
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

          return (
            <Card
              key={s.no}
              className={done ? 'border-green-200 bg-green-50/30' : ''}
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
              {done && (
                <CardContent className="px-4 pb-4 pt-0">
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

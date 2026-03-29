'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Loader2, Sparkles, Brain, BookOpen, FileSignature,
  CheckCircle2, Circle, ChevronRight
} from 'lucide-react'

const PROPOSAL_SECTIONS = [
  { no: 1, title: '사업 추진 배경 및 필요성' },
  { no: 2, title: '사업 목표 및 추진 전략' },
  { no: 3, title: '임팩트 로직 모델' },
  { no: 4, title: '교육 커리큘럼 및 운영 계획' },
  { no: 5, title: '코치 및 전문가 구성' },
  { no: 6, title: '성과 지표 및 평가 계획' },
  { no: 7, title: '추진 일정 및 예산 계획' },
]

interface AiPanelProps {
  projectId: string
  rfpParsed: any
  logicModel: any
  curriculum: any[]
  proposalSections: Array<{ sectionNo: number; title: string; content: string; version: number; isApproved: boolean }>
  onLogicModelGenerated?: (lm: any) => void
}

export function AiPanel({ projectId, rfpParsed, logicModel, curriculum: _curriculum, proposalSections, onLogicModelGenerated }: AiPanelProps) {
  const [loadingLogic, setLoadingLogic] = useState(false)
  const [loadingCurriculum, setLoadingCurriculum] = useState(false)
  const [loadingSection, setLoadingSection] = useState<number | null>(null)
  const [localLogicModel, setLocalLogicModel] = useState(logicModel)
  const [localCurriculum, setLocalCurriculum] = useState<any>(null)
  const [localSections, setLocalSections] = useState(proposalSections)
  const [error, setError] = useState('')

  const hasRfp = !!rfpParsed
  const hasLogic = !!localLogicModel
  const completedSections = localSections.length

  async function genLogicModel() {
    if (!hasRfp) return
    setLoadingLogic(true)
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
      setLocalLogicModel(data.logicModel)
      onLogicModelGenerated?.(data.logicModel)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingLogic(false)
    }
  }

  async function genCurriculum() {
    if (!hasRfp || !hasLogic) return
    setLoadingCurriculum(true)
    setError('')
    try {
      const res = await fetch('/api/ai/curriculum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, rfpParsed, logicModel: localLogicModel }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLocalCurriculum(data.curriculum)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingCurriculum(false)
    }
  }

  async function genProposalSection(sectionNo: number) {
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
      setLocalSections((prev) => {
        const filtered = prev.filter((s) => s.sectionNo !== sectionNo)
        return [...filtered, data.section].sort((a, b) => a.sectionNo - b.sectionNo)
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingSection(null)
    }
  }

  async function genAllProposal() {
    for (const s of PROPOSAL_SECTIONS) {
      await genProposalSection(s.no)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Logic Model */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4 text-purple-500" />
            임팩트 로직 모델
            {hasLogic && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {!hasRfp && (
            <p className="text-xs text-amber-600">⚠️ RFP를 먼저 파싱하세요.</p>
          )}
          {localLogicModel && (
            <div className="space-y-2 text-xs">
              <p className="font-medium text-primary">{localLogicModel.impactGoal}</p>
              <div className="grid grid-cols-1 gap-1">
                {(['impact', 'outcome', 'output', 'activity', 'input'] as const).map((key) => (
                  <div key={key} className="flex gap-2">
                    <span className="w-16 shrink-0 font-mono text-muted-foreground uppercase">{key}</span>
                    <span className="text-muted-foreground">{localLogicModel[key]?.slice(0, 2).join(' / ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Button
            size="sm"
            variant={hasLogic ? 'outline' : 'default'}
            className="w-full"
            disabled={!hasRfp || loadingLogic}
            onClick={genLogicModel}
          >
            {loadingLogic ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />생성 중...</> : hasLogic ? '재생성' : 'Logic Model 생성'}
          </Button>
        </CardContent>
      </Card>

      {/* Step 2: Curriculum */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-blue-500" />
            커리큘럼 자동 설계
            {localCurriculum && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {!hasLogic && (
            <p className="text-xs text-amber-600">⚠️ Logic Model을 먼저 생성하세요.</p>
          )}
          {localCurriculum && (
            <div className="space-y-1 text-xs">
              <div className="flex gap-4 text-muted-foreground">
                <span>총 {localCurriculum.sessions?.length}회차</span>
                <span>{localCurriculum.totalHours}시간</span>
                <span>Action Week {localCurriculum.actionWeekRatio}%</span>
              </div>
              <div className="space-y-0.5">
                {localCurriculum.sessions?.slice(0, 4).map((s: any) => (
                  <div key={s.sessionNo} className="flex items-center gap-2 text-muted-foreground">
                    <ChevronRight className="h-3 w-3" />
                    <span className="font-mono text-xs">{s.sessionNo}.</span>
                    <span>{s.title}</span>
                    {s.isActionWeek && <Badge className="h-4 text-[10px]" variant="secondary">AW</Badge>}
                  </div>
                ))}
                {(localCurriculum.sessions?.length ?? 0) > 4 && (
                  <p className="text-xs text-muted-foreground">... 외 {localCurriculum.sessions.length - 4}회차</p>
                )}
              </div>
            </div>
          )}
          <Button
            size="sm"
            variant={localCurriculum ? 'outline' : 'default'}
            className="w-full"
            disabled={!hasLogic || loadingCurriculum}
            onClick={genCurriculum}
          >
            {loadingCurriculum ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />설계 중...</> : localCurriculum ? '재설계' : '커리큘럼 설계'}
          </Button>
        </CardContent>
      </Card>

      {/* Step 3: Proposal */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileSignature className="h-4 w-4 text-orange-500" />
            제안서 자동 생성
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {completedSections}/7
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {!hasLogic && (
            <p className="text-xs text-amber-600">⚠️ Logic Model을 먼저 생성하세요.</p>
          )}
          <Progress value={(completedSections / 7) * 100} className="h-1.5" />
          <div className="space-y-1">
            {PROPOSAL_SECTIONS.map((s) => {
              const done = localSections.find((ls) => ls.sectionNo === s.no)
              const isLoading = loadingSection === s.no
              return (
                <div key={s.no} className="flex items-center gap-2">
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                  )}
                  <span className="flex-1 text-xs text-muted-foreground">{s.no}. {s.title}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    disabled={!hasLogic || isLoading}
                    onClick={() => genProposalSection(s.no)}
                  >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : done ? '재생성' : '생성'}
                  </Button>
                </div>
              )
            })}
          </div>
          <Separator />
          <Button
            size="sm"
            className="w-full gap-1.5"
            disabled={!hasLogic || loadingSection !== null}
            onClick={genAllProposal}
          >
            <Sparkles className="h-3.5 w-3.5" />
            전체 제안서 생성 (7섹션)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

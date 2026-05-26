'use client'
/**
 * V2Shell — UX v2 (ADR-018) 클라이언트 shell wrapper
 *
 * 4 공통 요소 (TopBar · StageSidebar · NowBar · BrainDock) + Stage 별 main canvas.
 *
 * PR #2 — S1 만 wire up. S2~S5 는 후속 PR.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TopBar, type StageId, type StageStatus } from '@/components/shell/TopBar'
import { StageSidebar } from '@/components/shell/StageSidebar'
import { NowBar } from '@/components/shell/NowBar'
import { BrainDock } from '@/components/shell/BrainDock'
import { S1HeroCenter, type S1AnalysisResult } from '@/components/stages/S1HeroCenter'

export interface V2ShellProps {
  projectId: string
  projectName: string
  stages: { id: StageId; status: StageStatus }[]
  currentStage: StageId
  progressPct: number
  analysis: S1AnalysisResult | null
}

export function V2Shell({
  projectId,
  projectName,
  stages,
  currentStage: initialStage,
  progressPct,
  analysis,
}: V2ShellProps) {
  const router = useRouter()
  const [brainOpen, setBrainOpen] = useState(false)
  const [activeStage, setActiveStage] = useState<StageId>(initialStage)
  const [, startTransition] = useTransition()

  async function handleAnalyze({ file, text }: { file?: File; text?: string }) {
    if (file) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('projectId', projectId)
      // 기존 RFP 파싱 endpoint 활용
      const res = await fetch(`/api/projects/${projectId}/rfp`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      startTransition(() => router.refresh())
      return
    }
    if (text) {
      const res = await fetch(`/api/projects/${projectId}/rfp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      startTransition(() => router.refresh())
    }
  }

  // NowBar action — stage 별 다르게
  const nowBarAction = (() => {
    if (activeStage === 'S1') {
      if (analysis?.projectName) {
        return {
          context: 'S1 RFP 분석 완료',
          message: 'S2 1차본 작성으로 진행',
          actions: [
            {
              label: 'S2 1차본 작성 →',
              onClick: () => setActiveStage('S2'),
              variant: 'primary' as const,
            },
          ],
        }
      }
      return {
        context: 'S1 RFP 분석',
        message: 'RFP 파일 업로드 또는 텍스트 붙여넣기',
        hint: 'AI 가 자동 파싱 · ~30초',
        actions: [],
      }
    }
    if (activeStage === 'S2') {
      return {
        context: 'S2 1차본 작성',
        message: 'PR #3 에서 wire up 예정',
        actions: [],
      }
    }
    if (activeStage === 'S3') {
      return {
        context: 'S3 검수',
        message: 'PR #4 에서 wire up 예정',
        actions: [],
      }
    }
    if (activeStage === 'S4') {
      return {
        context: 'S4 정밀 편집',
        message: 'PR #4 에서 wire up 예정',
        actions: [],
      }
    }
    return {
      context: 'S5 최종 승인',
      message: 'PR #5 에서 wire up 예정',
      actions: [],
    }
  })()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top */}
      <TopBar
        projectName={projectName}
        projectSwitchHref="/projects"
        stages={stages}
        progressPct={progressPct}
        brainOpen={brainOpen}
        onBrainToggle={() => setBrainOpen((v) => !v)}
      />

      {/* Body — sidebar + main + (optional dock) */}
      <div className="flex flex-1">
        <StageSidebar
          stages={stages}
          currentStage={activeStage}
          onStageClick={(id) => setActiveStage(id)}
        />

        {/* Main */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ marginRight: brainOpen ? 320 : 0, transition: 'margin 200ms' }}
        >
          {activeStage === 'S1' && (
            <S1HeroCenter
              projectId={projectId}
              analysis={analysis}
              onAnalyze={handleAnalyze}
              onProceedToS2={() => setActiveStage('S2')}
            />
          )}
          {activeStage === 'S2' && <StagePlaceholder stage="S2" label="1차본 작성" />}
          {activeStage === 'S3' && <StagePlaceholder stage="S3" label="검수" />}
          {activeStage === 'S4' && <StagePlaceholder stage="S4" label="정밀 편집" />}
          {activeStage === 'S5' && <StagePlaceholder stage="S5" label="최종 승인" />}
        </main>

        {/* Brain Dock */}
        <BrainDock
          open={brainOpen}
          onClose={() => setBrainOpen(false)}
          projectId={projectId}
          matchedAssets={[]} // PR #3+ 에서 실데이터
          similarPatterns={[]}
        />
      </div>

      {/* NowBar */}
      <NowBar {...nowBarAction} />
    </div>
  )
}

function StagePlaceholder({ stage, label }: { stage: StageId; label: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-16 text-center">
      <div className="text-3xl">🚧</div>
      <h1 className="text-xl font-semibold">
        {stage} · {label}
      </h1>
      <p className="text-sm text-muted-foreground">
        이 Stage 는 후속 PR (#3~#5) 에서 구현 예정.
      </p>
      <p className="text-[10px] text-muted-foreground">
        ADR-018 Adaptive Stage Layout 참고
      </p>
    </div>
  )
}

'use client'
/**
 * V2Shell — UX v2 (ADR-018 · mockup 1:1)
 *
 * 4 공통 요소: TopBar (stage journey 내장) · SubHeader (사업 메타) · NowBar · BrainDock.
 *
 * Phase A — Shell components 정확 일치 (Tailwind + var() inline).
 * Phase B~F — S1~S5 컴포넌트 단계별 wire up.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TopBar, type StageId, type StageStatus } from '@/components/shell/TopBar'
import { SubHeader } from '@/components/shell/SubHeader'
import { NowBar } from '@/components/shell/NowBar'
import { BrainDock } from '@/components/shell/BrainDock'
import { S1HeroCenter, type S1AnalysisResult } from '@/components/stages/S1HeroCenter'
import { S2ChatCanvas } from '@/components/stages/S2ChatCanvas'
import { S3Checklist, type LensScore, type AssetRow } from '@/components/stages/S3Checklist'

export interface V2ShellProps {
  projectId: string
  projectName: string
  /** 사업 채널 — B2G/B2B/etc. SubHeader meta */
  channel?: string | null
  /** 발주처 */
  client?: string | null
  /** 총 예산 (원) */
  totalBudget?: number | null
  /** 평가배점 개수 */
  evalCount?: number | null
  /** 0~100 진행도 */
  progressPct: number
  /** Stage 5개 상태 */
  stages: { id: StageId; status: StageStatus }[]
  currentStage: StageId
  /** S1 분석 결과 (null 이면 미분석) */
  analysis: S1AnalysisResult | null
  /** S2 슬롯 진행 — ExpressDraft 에서 도출 */
  slotsFilled: number
  slotsTotal: number
}

export function V2Shell({
  projectId,
  projectName,
  channel,
  client,
  totalBudget,
  evalCount,
  progressPct,
  stages,
  currentStage: initialStage,
  analysis,
  slotsFilled,
  slotsTotal,
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
  const nowBarProps = (() => {
    if (activeStage === 'S1') {
      if (analysis?.projectName) {
        return {
          context: 'Next · Stage 02 · 1차본 작성',
          message: 'S2 로 진행해서 AI 자동 60% 채움 + PM 9개 결정',
          hint: '예상 30~45분 · 슬롯 12개 진행도 자동 표시',
          actions: [
            {
              label: 'S2 1차본 작성',
              onClick: () => setActiveStage('S2'),
              variant: 'primary' as const,
            },
          ],
        }
      }
      return {
        context: 'Next · Stage 01 · RFP Analysis',
        message: 'RFP 파일 업로드 또는 텍스트 붙여넣기로 분석을 시작하세요',
        hint: 'AI 가 자동 파싱 · ~30초 이내 · 분석 후 Stage 02 로 이동',
        actions: [
          {
            label: 'RFP 입력 후 활성화',
            variant: 'primary' as const,
            disabled: true,
          },
        ],
      }
    }
    if (activeStage === 'S2') {
      return {
        context: 'Next · Stage 02 · 1차본 작성',
        message: 'S2 Chat-Canvas (Phase C 에서 wire up 예정)',
        hint: '슬롯 12개 진행 · 7 섹션 자동 채움',
        actions: [],
      }
    }
    if (activeStage === 'S3') {
      return {
        context: 'Next · Stage 03 · 검수',
        message: 'S3 Checklist + Diff (Phase D 에서 wire up 예정)',
        hint: '7 lens 점수 + asset 추천 + inline diff',
        actions: [],
      }
    }
    if (activeStage === 'S4') {
      return {
        context: 'Next · Stage 04 · 정밀 편집',
        message: 'S4 Workspace Tabs (Phase E 에서 wire up 예정)',
        hint: 'Curriculum · Coaches · Budget · Proposal 4 tab',
        actions: [],
      }
    }
    return {
      context: 'Next · Stage 05 · 최종 승인',
      message: 'S5 Summary (Phase F 에서 wire up 예정)',
      hint: 'Impact forecast + 3 summary cell + 최종 approve',
      actions: [],
    }
  })()

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--light-beige)' }}>
      {/* Top */}
      <TopBar
        projectName={projectName}
        projectSwitchHref="/projects"
        stages={stages}
        brainOpen={brainOpen}
        onBrainToggle={() => setBrainOpen((v) => !v)}
        onStageClick={(id) => {
          const stage = stages.find((s) => s.id === id)
          if (stage && stage.status !== 'pending') {
            setActiveStage(id)
          }
        }}
      />

      {/* Sub-header (사업 메타) */}
      <SubHeader
        title={projectName}
        v1Href={`/projects/${projectId}`}
        meta={{
          channel,
          client,
          totalBudget,
          evalCount,
          progressPct,
        }}
      />

      {/* Main canvas */}
      <main
        className="flex-1 overflow-y-auto transition-[margin]"
        style={{
          background: 'var(--light-beige)',
          marginRight: brainOpen ? 360 : 0,
          transitionDuration: '200ms',
        }}
      >
        {activeStage === 'S1' && (
          <S1HeroCenter
            projectId={projectId}
            analysis={analysis}
            onAnalyze={handleAnalyze}
            onProceedToS2={() => setActiveStage('S2')}
          />
        )}
        {activeStage === 'S2' && (
          <S2ChatCanvas
            projectId={projectId}
            slotsFilled={slotsFilled}
            slotsTotal={slotsTotal}
          />
        )}
        {activeStage === 'S3' && (
          <S3Checklist
            projectId={projectId}
            overallScore={MOCK_S3.overallScore}
            lenses={MOCK_S3.lenses}
            recommendedAssets={MOCK_S3.assets}
            onProceedToS4={() => setActiveStage('S4')}
          />
        )}
        {activeStage === 'S4' && <StagePlaceholder stage="S4" label="정밀 편집" phase="E" />}
        {activeStage === 'S5' && <StagePlaceholder stage="S5" label="최종 승인" phase="F" />}
      </main>

      {/* Brain Dock */}
      <BrainDock
        open={brainOpen}
        onClose={() => setBrainOpen(false)}
        projectId={projectId}
        matchedAssets={[]}
        similarPatterns={[]}
      />

      {/* NowBar */}
      <NowBar {...nowBarProps} />
    </div>
  )
}

// ─────────────────────────────────────────
// MOCK DATA — Phase D 후속 PR 에서 real Inspector 호출로 교체 예정
// ─────────────────────────────────────────

const MOCK_S3 = {
  overallScore: 78,
  lenses: [
    { name: '시장 통계', score: 95, status: 'pass' as const, hint: '통계청 + 안산시 데이터 인용 정확' },
    { name: '평가배점', score: 88, status: 'pass' as const, hint: '5개 배점 모두 본문 반영' },
    { name: '차별화', score: 62, status: 'weak' as const, hint: '자산 추가 권장 · Brain 5건' },
    { name: 'Before / After', score: 82, status: 'pass' as const, hint: 'SMART 5축 모두 통과' },
    { name: '실행 가능성', score: 80, status: 'pass' as const, hint: '예산 · 기간 · 인력 합리적' },
    { name: 'Risk 대응', score: 68, status: 'weak' as const, hint: '2건 추가 권장' },
    { name: '사회적 가치', score: 85, status: 'pass' as const, hint: 'SROI 2.3억 계산 명확' },
    { name: '발주처 특수', score: null, status: 'unknown' as const, hint: '발주처 정보 부족' },
  ] satisfies LensScore[],
  assets: [
    {
      assetId: 'mock-actt',
      name: 'ACTT 5단계 실행 루프 방법론',
      snippet:
        '창업가의 가설 → 실행 → 검증 → 학습 → 재실행 의 5단계 사이클을 12주에 4번 반복하여...',
      tier: 'high' as const,
      citationCount: 142,
    },
    {
      assetId: 'mock-dogs',
      name: 'DOGS 리더십 — 4 유형 진단 · 코칭',
      snippet:
        'Dynamic · Organize · Generate · Steady 4 유형 진단으로 팀별 맞춤형 코칭...',
      tier: 'high' as const,
      citationCount: 87,
    },
    {
      assetId: 'mock-5d',
      name: '5D 진단 — AI 시대 창업가 5 역량',
      snippet:
        'Discover · Define · Design · Deliver · Direct 5D 사이클로 AI 협력 역량을 정량 측정...',
      tier: 'high' as const,
      citationCount: 54,
    },
    {
      assetId: 'mock-uca',
      name: 'UCA — 임팩트 사이클 진단·코치 매칭',
      snippet:
        'UCA Underdogs Coach Academy 운영의 4 mod 진단 + 코치 풀 자동 매칭...',
      tier: 'mid' as const,
      citationCount: 38,
    },
    {
      assetId: 'mock-impact',
      name: 'IMPACT 6단계 — 18모듈 54질문',
      snippet:
        'I·M·P·A·C·T 6 단계 18 모듈 54 핵심 질문 기반 자산 인계...',
      tier: 'mid' as const,
      citationCount: 31,
    },
  ] satisfies AssetRow[],
}

function StagePlaceholder({
  stage,
  label,
  phase,
}: {
  stage: StageId
  label: string
  phase: string
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-24 text-center">
      <div
        className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[2px]"
        style={{
          color: 'var(--primary-orange)',
          border: '1px solid rgba(232,84,26,.3)',
          background: 'rgba(232,84,26,.06)',
        }}
      >
        Phase {phase} · 구현 예정
      </div>
      <h1
        className="text-[28px] font-bold tracking-[-0.5px]"
        style={{ color: 'var(--dark-charcoal)' }}
      >
        {stage} · {label}
      </h1>
      <p className="text-[13px]" style={{ color: 'var(--subtitle-text)' }}>
        ADR-018 Adaptive Stage Layout · Phase {phase} 진행 중
      </p>
    </div>
  )
}

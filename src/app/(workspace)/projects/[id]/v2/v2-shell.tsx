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
import {
  S4Workspace,
  type CurriculumWeek,
  type CoachInfo,
  type BudgetItem,
  type ProposalSectionRef,
} from '@/components/stages/S4Workspace'
import { S5Summary } from '@/components/stages/S5Summary'

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
  /** S4 Workspace 데이터 (real) */
  s4Curriculum: CurriculumWeek[]
  s4Coaches: CoachInfo[]
  s4Budget: {
    totalKrw: number
    items: BudgetItem[]
    marginPct?: number | null
  }
  s4Proposal: { sections: ProposalSectionRef[] }
  /** S5 데이터 */
  s5InspectorScore: number
  s5SocialValueKrw: number | null
  s5BeneficiaryCount: number | null
  s5ImpactBreakdown: { label: string; valueKrw: number }[]
  s5IsApproved: boolean
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
  s4Curriculum,
  s4Coaches,
  s4Budget,
  s4Proposal,
  s5InspectorScore,
  s5SocialValueKrw,
  s5BeneficiaryCount,
  s5ImpactBreakdown,
  s5IsApproved,
}: V2ShellProps) {
  const router = useRouter()
  const [brainOpen, setBrainOpen] = useState(false)
  const [activeStage, setActiveStage] = useState<StageId>(initialStage)
  const [, startTransition] = useTransition()

  async function handleApprove() {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SUBMITTED' }),
    })
    if (!res.ok) throw new Error(`승인 실패: HTTP ${res.status}`)
    startTransition(() => router.refresh())
  }

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
        context: `Next · Stage 02 · Slot ${slotsFilled} / ${slotsTotal}`,
        message:
          slotsFilled >= slotsTotal
            ? '슬롯 완료 — S3 검수 단계로 진행하세요'
            : '슬롯 채우기 — AI 자동 추천 또는 직접 입력',
        hint: '평균 30~45분 · slot 완료 후 자동 S3 진입',
        actions:
          slotsFilled >= slotsTotal
            ? [
                {
                  label: 'S3 검수로 진행',
                  onClick: () => setActiveStage('S3'),
                  variant: 'primary' as const,
                },
              ]
            : [],
      }
    }
    if (activeStage === 'S3') {
      return {
        context: 'Next · Stage 03 · Asset Boost',
        message: '약점 lens 보강 — Brain 자산 추천 수락 시 점수 +N',
        hint: '또는 보강 없이 바로 Stage 04 정밀 편집 진입 가능',
        actions: [
          {
            label: '바로 S4 정밀 편집',
            onClick: () => setActiveStage('S4'),
            variant: 'primary' as const,
          },
        ],
      }
    }
    if (activeStage === 'S4') {
      return {
        context: 'Next · Stage 04 · Precision Editing',
        message: '모든 도메인 정합성 OK — Stage 05 최종 승인으로 진입 가능',
        hint: '또는 4 탭 (커리큘럼 · 코치 · 예산 · 제안서) 상세 편집 계속',
        actions: [
          {
            label: 'Stage 05 최종 승인',
            onClick: () => setActiveStage('S5'),
            variant: 'primary' as const,
          },
        ],
      }
    }
    return {
      context: 'Next · Stage 05 · Final Approval',
      message: s5IsApproved
        ? '✓ 승인 완료 · 제출됨'
        : '모든 검증 통과 — 메인 캔버스의 승인 버튼 사용',
      hint: s5IsApproved
        ? '편집 잠금 상태. 필요 시 재오픈 가능.'
        : '또는 이전 Stage 로 돌아가서 수정 가능',
      actions: s5IsApproved
        ? []
        : [
            {
              label: '← S4 정밀 편집',
              onClick: () => setActiveStage('S4'),
              variant: 'secondary' as const,
            },
          ],
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
          // pending stage 도 preview 가능 — 데이터 없어도 placeholder 로 보임
          setActiveStage(id)
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
            draftReady={slotsFilled >= 10}
          />
        )}
        {activeStage === 'S4' && (
          <S4Workspace
            projectId={projectId}
            curriculum={s4Curriculum}
            coaches={s4Coaches}
            budget={s4Budget}
            proposal={s4Proposal}
            onProceedToS5={() => setActiveStage('S5')}
          />
        )}
        {activeStage === 'S5' && (
          <S5Summary
            projectId={projectId}
            proposalCompleteCount={
              s4Proposal.sections.filter((s) => s.status === 'complete').length
            }
            proposalTotal={s4Proposal.sections.length || 7}
            inspectorScore={s5InspectorScore}
            marginPct={s4Budget.marginPct ?? null}
            socialValueKrw={s5SocialValueKrw}
            directBeneficiaries={s5BeneficiaryCount}
            indirectBeneficiaries={null}
            roiPct={null}
            impactBreakdown={s5ImpactBreakdown}
            isApproved={s5IsApproved}
            onApprove={handleApprove}
            onBackToS4={() => setActiveStage('S4')}
          />
        )}
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
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-2.5 px-4 py-16 text-center">
      <div
        className="px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[1.5px]"
        style={{
          color: 'var(--primary-orange)',
          border: '1px solid rgba(232,84,26,.3)',
          background: 'rgba(232,84,26,.06)',
        }}
      >
        Phase {phase} · 구현 예정
      </div>
      <h1
        className="text-xl font-bold tracking-[-0.3px]"
        style={{ color: 'var(--dark-charcoal)' }}
      >
        {stage} · {label}
      </h1>
      <p className="text-xs" style={{ color: 'var(--subtitle-text)' }}>
        ADR-018 Adaptive Stage Layout · Phase {phase} 진행 중
      </p>
    </div>
  )
}

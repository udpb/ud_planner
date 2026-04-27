'use client'

/**
 * Step 1 — RFP + 기획 방향 (Phase F Wave 6: Value Chain 3 탭)
 *
 * 레이아웃 (Wave 6 이후):
 *   ┌──────────────────────────────────────────┬──────────────────┐
 *   │ Tabs: ① Impact · ② Input · ③ Output      │ [우] PM 가이드    │
 *   │  - Impact: 기획 방향 편집 (제안배경·컨셉) │                   │
 *   │  - Input:  ProgramProfile 11축            │                   │
 *   │  - Output: RFP 파싱 결과                  │                   │
 *   └──────────────────────────────────────────┴──────────────────┘
 *
 * 데이터 흐름:
 *   - Mount 시: B2 /api/projects/[id]/similar 호출 + B3 analyzeEvalStrategy 계산
 *   - "기획 방향 생성" 클릭 → B1 POST /api/ai/planning-direction
 *   - PM 편집 → "확정" 클릭 → PATCH /api/projects/[id]/rfp
 *
 * 관련:
 *   - ADR-008: docs/decisions/008-impact-value-chain.md
 *   - 구현 계약: docs/architecture/value-chain.md §"Step 1 3 탭 분리"
 *   - 브리프: .claude/agent-briefs/redesign/B4-step-rfp-redesign.md
 *   - 디자인 시스템: .claude/skills/ud-design-system/SKILL.md
 *   - 브랜드 보이스: .claude/skills/ud-brand-voice/SKILL.md
 *   - 데이터 계약: docs/architecture/data-contract.md §1.2 RfpSlice
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VALUE_CHAIN_STAGES } from '@/lib/value-chain'
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  FileText,
  HelpCircle,
  Info,
  Lightbulb,
  Loader2,
  RefreshCcw,
  Sparkles,
  Target,
  Trophy,
  Compass,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RfpParser } from './rfp-parser'
import type { RfpParsed } from '@/lib/claude'
import type { EvalStrategy, SimilarProject } from '@/lib/pipeline-context'
import { analyzeEvalStrategy, sectionLabel } from '@/lib/eval-strategy'
import type {
  PlanningDirectionResponse,
  ProposalConceptCandidate,
} from '@/lib/planning-direction'
import { ProgramProfilePanel } from '@/components/projects/program-profile-panel'
import type { ProgramProfile, RenewalContext, ProjectTaskType } from '@/lib/program-profile'
import { MatchedAssetsPanel } from '@/components/projects/matched-assets-panel'
import type { AssetMatch } from '@/lib/asset-registry-types'

// RfpParser 의 onParsed 콜백은 로컬(좁은) RfpParsed 를 넘기지만,
// 런타임 데이터는 claude.ts 의 전체 RfpParsed 모양 — 경계에서 한 번만 캐스팅.
type RfpParserNarrow = Parameters<
  NonNullable<React.ComponentProps<typeof RfpParser>['onParsed']>
>[0]

// ─────────────────────────────────────────
// 타입 (공개 prop)
// ─────────────────────────────────────────

interface ClarifyingQuestion {
  field: string
  label: string
  question: string
  severity: 'missing' | 'weak' | 'tip'
}

interface Completeness {
  score: number
  breakdown: Record<string, { score: number; max: number; label: string }>
}

export interface StepRfpInitialSlice {
  proposalBackground?: string | null
  proposalConcept?: string | null
  keyPlanningPoints?: string[] | null
  confirmedAt?: string | null
}

export interface StepRfpProps {
  projectId: string
  initialParsed: RfpParsed | null
  /**
   * 이미 저장된 기획 방향 — PM 이 과거에 확정했으면 editedBackground/Concept/Points
   * 초기값으로 복원됨. page.tsx 가 project 레코드에서 읽어 전달.
   */
  initialRfpSlice?: StepRfpInitialSlice
  /** ProgramProfile v1.0 — Phase E Step 6 하단 패널 */
  initialProfile?: ProgramProfile | null
  initialRenewalContext?: RenewalContext | null
  /**
   * Phase G Wave 5 (ADR-009): matchAssetsToRfp() 결과.
   * 서버(page.tsx) 에서 계산해 주입한다. RFP 파싱 없으면 빈 배열.
   */
  assetMatches?: AssetMatch[]
  /** 이미 PM 이 승인한 UD 자산 ID (Project.acceptedAssetIds) */
  initialAcceptedAssetIds?: string[]
}

// ─────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────

const CONCEPT_MAX = 300
const BACKGROUND_MAX_HINT = 900
const POINTS_LENGTH = 3

function padPoints(arr: string[] | null | undefined): string[] {
  const base = Array.isArray(arr) ? [...arr] : []
  while (base.length < POINTS_LENGTH) base.push('')
  return base.slice(0, POINTS_LENGTH)
}

function formatBudgetOk(krw: number | null | undefined): string {
  if (!krw || krw <= 0) return '—'
  return `${(krw / 1e8).toFixed(2)}억`
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function StepRfp({
  projectId,
  initialParsed,
  initialRfpSlice,
  initialProfile,
  initialRenewalContext,
  assetMatches = [],
  initialAcceptedAssetIds = [],
}: StepRfpProps) {
  const router = useRouter()
  const pathname = usePathname()

  // ─ 좌측: 파싱 결과 ─
  const [parsed, setParsed] = useState<RfpParsed | null>(initialParsed)
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([])
  const [completeness, setCompleteness] = useState<Completeness | null>(null)

  // ─ 중앙: 기획 방향 ─
  const [planningDirection, setPlanningDirection] = useState<PlanningDirectionResponse | null>(
    null,
  )
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [selectedConceptIdx, setSelectedConceptIdx] = useState<number | null>(null)
  const [editedBackground, setEditedBackground] = useState<string>(
    initialRfpSlice?.proposalBackground ?? '',
  )
  const [editedConcept, setEditedConcept] = useState<string>(
    initialRfpSlice?.proposalConcept ?? '',
  )
  const [editedPoints, setEditedPoints] = useState<string[]>(
    padPoints(initialRfpSlice?.keyPlanningPoints),
  )

  const isAlreadyConfirmed = !!initialRfpSlice?.confirmedAt
  const [confirmed, setConfirmed] = useState<boolean>(isAlreadyConfirmed)

  // ─ 우측: PM 가이드 ─
  const [similar, setSimilar] = useState<SimilarProject[]>([])
  const [similarLoading, setSimilarLoading] = useState(false)

  const evalStrategy: EvalStrategy | null = useMemo(
    () => (parsed ? analyzeEvalStrategy(parsed.evalCriteria) : null),
    [parsed],
  )

  // Mount: B2 similar 조회
  useEffect(() => {
    let aborted = false
    if (!projectId) return
    setSimilarLoading(true)
    fetch(`/api/projects/${projectId}/similar?topN=5`, { method: 'GET' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`similar ${res.status}`)
        const data = (await res.json()) as SimilarProject[]
        if (!aborted) setSimilar(Array.isArray(data) ? data : [])
      })
      .catch((err: unknown) => {
        if (!aborted) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn('[step-rfp] similar 조회 실패:', msg)
          setSimilar([])
        }
      })
      .finally(() => {
        if (!aborted) setSimilarLoading(false)
      })
    return () => {
      aborted = true
    }
  }, [projectId])

  // RFP 파싱 결과 콜백 (RfpParser 에서 호출)
  // 런타임 응답은 claude.ts 의 전체 RfpParsed — 좁은 타입을 여기서 안전하게 넓힘.
  const handleParsed = useCallback(
    (p: RfpParserNarrow, q: unknown, c: unknown) => {
      setParsed(p as unknown as RfpParsed)
      const qArr: ClarifyingQuestion[] = Array.isArray(q) ? (q as ClarifyingQuestion[]) : []
      setQuestions(qArr)
      const compl: Completeness | null =
        c && typeof c === 'object' && 'score' in (c as object)
          ? (c as Completeness)
          : null
      setCompleteness(compl)
      // 기존에 저장된 확정본이 있으면 그대로 두고, 없으면 초기화.
      if (!isAlreadyConfirmed) {
        setPlanningDirection(null)
        setSelectedConceptIdx(null)
      }
    },
    [isAlreadyConfirmed],
  )

  // B1 planning-direction 호출
  const requestPlanningDirection = useCallback(async () => {
    if (!parsed) {
      toast.error('먼저 RFP 파싱을 완료해주세요.')
      return
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/planning-direction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, similarProjects: similar }),
      })
      const data: unknown = await res.json()
      if (!res.ok) {
        const errMsg =
          typeof data === 'object' && data !== null && 'message' in data
            ? String((data as { message?: unknown }).message ?? 'AI 생성 실패')
            : 'AI 생성 실패'
        throw new Error(errMsg)
      }
      const typed = data as PlanningDirectionResponse
      setPlanningDirection(typed)
      // 기존 편집값이 비어 있을 때만 AI 결과로 초기화 (사용자 작업 보존)
      setEditedBackground((prev) => (prev.trim() ? prev : typed.proposalBackground))
      setEditedPoints((prev) => {
        const hasUser = prev.some((p) => p.trim().length > 0)
        return hasUser ? prev : padPoints(typed.keyPlanningPoints)
      })
      setSelectedConceptIdx((prev) => (prev ?? 0))
      setEditedConcept((prev) =>
        prev.trim() ? prev : typed.proposalConceptCandidates[0]?.oneLiner ?? '',
      )
      toast.success('기획 방향 3개 후보를 생성했습니다.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      toast.error(`기획 방향 생성 실패 — ${msg}`)
    } finally {
      setGenerating(false)
    }
  }, [parsed, projectId, similar])

  // "다시 생성" — PM 이 현재 편집본을 잃을 수 있으므로 action toast 로 확인
  const requestRegenerate = useCallback(() => {
    const hasEdits =
      editedBackground.trim().length > 0 ||
      editedConcept.trim().length > 0 ||
      editedPoints.some((p) => p.trim().length > 0)

    if (!hasEdits) {
      void requestPlanningDirection()
      return
    }

    toast('재생성하면 현재 편집 내용이 사라집니다.', {
      description: '제안배경·컨셉·핵심 포인트가 새 AI 결과로 교체됩니다.',
      action: {
        label: '재생성',
        onClick: () => {
          setEditedBackground('')
          setEditedConcept('')
          setEditedPoints(padPoints(null))
          setSelectedConceptIdx(null)
          void requestPlanningDirection()
        },
      },
    })
  }, [editedBackground, editedConcept, editedPoints, requestPlanningDirection])

  const handleSelectConcept = useCallback(
    (idx: number, candidate: ProposalConceptCandidate) => {
      setSelectedConceptIdx(idx)
      setEditedConcept(candidate.oneLiner.slice(0, CONCEPT_MAX))
    },
    [],
  )

  // PATCH 저장
  const handleConfirm = useCallback(async () => {
    if (!editedBackground.trim()) {
      toast.error('제안배경을 작성해주세요.')
      return
    }
    if (!editedConcept.trim()) {
      toast.error('제안 컨셉을 선택·작성해주세요.')
      return
    }
    const cleanedPoints = editedPoints.map((p) => p.trim()).filter((p) => p.length > 0)
    if (cleanedPoints.length === 0) {
      toast.error('핵심 기획 포인트를 최소 1개 이상 작성해주세요.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/rfp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalBackground: editedBackground.trim(),
          proposalConcept: editedConcept.trim(),
          keyPlanningPoints: cleanedPoints,
          evalStrategy: evalStrategy ?? null,
        }),
      })
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}))
        const msg =
          typeof data === 'object' && data !== null && 'message' in data
            ? String((data as { message?: unknown }).message ?? '저장 실패')
            : '저장 실패'
        throw new Error(msg)
      }
      setConfirmed(true)
      toast.success('기획 방향 저장됨')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      toast.error(`저장 실패 — ${msg}`)
    } finally {
      setSaving(false)
    }
  }, [editedBackground, editedConcept, editedPoints, evalStrategy, projectId, router])

  const canConfirm =
    !!parsed &&
    editedBackground.trim().length > 0 &&
    editedConcept.trim().length > 0 &&
    editedPoints.some((p) => p.trim().length > 0)

  return (
    <div className="flex flex-col gap-4">
      {/* 상단 안내 배너 — 이미 확정된 경우 */}
      {confirmed && (
        <div className="border-brand-left rounded-md bg-muted/40 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Step 1 확정됨</span>
            <span className="text-xs text-muted-foreground">
              — 기획 방향이 저장되어 다음 스텝에 반영됩니다.
            </span>
          </div>
        </div>
      )}

      {/* 메인: 탭(좌) + PM 가이드(우) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        {/* ────────── 좌: Value Chain 3 탭 ────────── */}
        {/* 기본 탭: RFP 미파싱 시 ③ Output 부터 (사용자 흐름 — 먼저 파일 업로드).
            파싱 완료된 프로젝트는 ① Impact 의도부터 보여줌. */}
        <Tabs defaultValue={parsed ? 'impact' : 'output'} className="w-full">
          <TabsList variant="line" className="w-full justify-start border-b">
            <TabsTrigger
              value="impact"
              className="data-active:after:!opacity-100"
              style={{
                ['--vc-underline' as string]: VALUE_CHAIN_STAGES.impact.colorHex,
              }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: VALUE_CHAIN_STAGES.impact.colorHex }}
              />
              {VALUE_CHAIN_STAGES.impact.numberedLabel} 의도
            </TabsTrigger>
            <TabsTrigger
              value="input"
              className="data-active:after:!opacity-100"
              style={{
                ['--vc-underline' as string]: VALUE_CHAIN_STAGES.input.colorHex,
              }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: VALUE_CHAIN_STAGES.input.colorHex }}
              />
              {VALUE_CHAIN_STAGES.input.numberedLabel} 자산
            </TabsTrigger>
            <TabsTrigger
              value="output"
              className="data-active:after:!opacity-100"
              style={{
                ['--vc-underline' as string]: VALUE_CHAIN_STAGES.output.colorHex,
              }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: VALUE_CHAIN_STAGES.output.colorHex }}
              />
              {VALUE_CHAIN_STAGES.output.numberedLabel} RFP
            </TabsTrigger>
          </TabsList>

          {/* ① Impact — 의도 선언 · 기획 방향 편집 */}
          <TabsContent value="impact" className="mt-3 space-y-3">
            <TabIntro
              stageColor={VALUE_CHAIN_STAGES.impact.colorHex}
              title={`${VALUE_CHAIN_STAGES.impact.numberedLabel} 의도 · Before/After`}
              description={VALUE_CHAIN_STAGES.impact.essentialQuestion}
            />
            {!parsed ? (
              <EmptyTabState
                icon={Compass}
                message="③ Output 탭에서 RFP 파싱을 먼저 완료하세요. 파싱이 끝나면 의도 선언과 기획 방향을 작성할 수 있습니다."
              />
            ) : (
              <MiddlePanel
                parsed={parsed}
                planningDirection={planningDirection}
                generating={generating}
                saving={saving}
                selectedConceptIdx={selectedConceptIdx}
                onSelectConcept={handleSelectConcept}
                editedBackground={editedBackground}
                onEditBackground={setEditedBackground}
                editedConcept={editedConcept}
                onEditConcept={setEditedConcept}
                editedPoints={editedPoints}
                onEditPoints={setEditedPoints}
                canConfirm={canConfirm}
                confirmed={confirmed}
                onGenerate={requestPlanningDirection}
                onRegenerate={requestRegenerate}
                onConfirm={handleConfirm}
              />
            )}
          </TabsContent>

          {/* ② Input — 기관 자산 · 예산 규모 · 기간 · 지역 · 경험 자산 */}
          <TabsContent value="input" className="mt-3 space-y-3">
            <TabIntro
              stageColor={VALUE_CHAIN_STAGES.input.colorHex}
              title={`${VALUE_CHAIN_STAGES.input.numberedLabel} 자원 정리`}
              description="이 사업에 투입 가능한 자원(예산·기관 자산·UD 에셋·기간·지역)을 ProgramProfile 11축으로 정리합니다."
            />
            {/*
              TODO (Wave 8): ProgramProfilePanel 에 Input-only 필터 prop 추가.
              지금은 전체 11축을 노출하나 Input 성격(organization · budget ·
              durationMonths · region · pastExperience)만 보여주도록 좁힐 것.

              v1.1: RFP 파싱의 detectedTasks 를 supportStructure.tasks 초기값으로 주입.
              - initialProfile 이 이미 있고 tasks 가 비어 있을 때 (기존 프로젝트 최초 전환)
              - 또는 initialProfile 이 없을 때 (신규 프로젝트 첫 파싱)
              에 한해 detectedTasks 를 반영. PM 이 이미 저장한 tasks 는 보존.
            */}
            <ProgramProfilePanel
              projectId={projectId}
              initialProfile={mergeDetectedTasksIntoProfile(
                initialProfile ?? null,
                parsed?.detectedTasks,
              )}
              initialRenewalContext={initialRenewalContext ?? null}
            />
          </TabsContent>

          {/* ③ Output — RFP 파싱 결과 · 평가 기준 · 요구 산출물 */}
          <TabsContent value="output" className="mt-3 space-y-3">
            <TabIntro
              stageColor={VALUE_CHAIN_STAGES.output.colorHex}
              title={`${VALUE_CHAIN_STAGES.output.numberedLabel} RFP 요구 · 평가 기준`}
              description="RFP 를 업로드·파싱하면 발주기관 요구 산출물과 평가 배점이 구조화됩니다."
            />
            <LeftPanel
              projectId={projectId}
              parsed={parsed}
              questions={questions}
              completeness={completeness}
              onParsed={handleParsed}
            />
            {/* Phase G Wave 5 (ADR-009): 매칭 자산 패널 — RFP 파싱 이후에만 노출 */}
            {parsed && (
              <MatchedAssetsPanel
                projectId={projectId}
                matches={assetMatches}
                initialAcceptedIds={initialAcceptedAssetIds}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* ────────── 우: PM 가이드 (탭과 무관하게 상시 표시) ────────── */}
        <RightPanel
          parsed={parsed}
          evalStrategy={evalStrategy}
          similar={similar}
          similarLoading={similarLoading}
          confirmed={confirmed}
          pathname={pathname}
          router={router}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// TabIntro — 각 탭 상단 단계 헤더
// ─────────────────────────────────────────

interface TabIntroProps {
  stageColor: string
  title: string
  description: string
}

function TabIntro({ stageColor, title, description }: TabIntroProps) {
  return (
    <div
      className="rounded-md border-l-4 bg-muted/30 p-3"
      style={{ borderLeftColor: stageColor }}
    >
      <p className="text-sm font-semibold" style={{ color: stageColor }}>
        {title}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

// ─────────────────────────────────────────
// EmptyTabState — 탭이 비어 있을 때 안내
// ─────────────────────────────────────────

interface EmptyTabStateProps {
  icon: React.ComponentType<{ className?: string }>
  message: string
}

function EmptyTabState({ icon: Icon, message }: EmptyTabStateProps) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-6 text-sm text-muted-foreground">
      <Icon className="h-8 w-8 opacity-40" />
      <p className="max-w-md text-center">{message}</p>
    </div>
  )
}

// ─────────────────────────────────────────
// Helper: detectedTasks → initialProfile.supportStructure.tasks 주입
// ─────────────────────────────────────────

/**
 * RFP 파싱에서 감지된 과업 유형을 Profile 의 supportStructure.tasks 초기값으로 주입.
 *
 * 규칙:
 *   - detectedTasks 가 비어있거나 없으면 profile 그대로 반환
 *   - profile.supportStructure.tasks 가 이미 채워져 있으면 PM 저장값 우선 (보존)
 *   - profile 이 null 이면 null 반환 (panel 이 emptyProfile() 로 새로 만들되
 *     그 후 rfpParsed 변경에 대해 따라오지는 않음 — 한 번의 초기 주입만 수행)
 */
function mergeDetectedTasksIntoProfile(
  profile: ProgramProfile | null,
  detectedTasks: ProjectTaskType[] | undefined,
): ProgramProfile | null {
  if (!detectedTasks || detectedTasks.length === 0) return profile
  if (!profile) {
    // 신규 프로파일은 Panel 의 emptyProfile() 이 생성. 여기서는 null 유지.
    // (alternative: 여기서 emptyProfile 을 구성할 수도 있으나, 기본값 세팅은
    // Panel 이 책임지는 게 관심사 분리에 맞다. 신규 프로젝트의 경우 PM 이
    // 최초 저장하기 전에 detectedTasks 를 수동 체크하면 되므로 실용 손실 적음.)
    return null
  }
  const currentTasks = profile.supportStructure.tasks
  if (Array.isArray(currentTasks) && currentTasks.length > 0) {
    // PM 이 이미 저장한 값이 있으면 건드리지 않음
    return profile
  }
  return {
    ...profile,
    supportStructure: {
      ...profile.supportStructure,
      tasks: detectedTasks,
    },
  }
}

// ─────────────────────────────────────────
// LeftPanel — 파싱 결과 (기존 기능 유지)
// ─────────────────────────────────────────

interface LeftPanelProps {
  projectId: string
  parsed: RfpParsed | null
  questions: ClarifyingQuestion[]
  completeness: Completeness | null
  /**
   * RfpParser 의 onParsed 와 동일 시그니처 — 여기서 넓은 타입으로 복원한다.
   */
  onParsed: (p: RfpParserNarrow, q: unknown, c: unknown) => void
}

function LeftPanel({ projectId, parsed, questions, completeness, onParsed }: LeftPanelProps) {
  const missingCount = questions.filter((q) => q.severity === 'missing').length
  const weakCount = questions.filter((q) => q.severity === 'weak').length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          파싱 결과
        </p>
        {completeness && (
          <span
            className={cn(
              'rounded px-2 py-0.5 text-xs font-medium',
              completeness.score >= 80
                ? 'bg-green-100 text-green-800'
                : completeness.score >= 50
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-700',
            )}
          >
            완전성 {completeness.score}/100
          </span>
        )}
      </div>

      <RfpParser projectId={projectId} initialParsed={parsed} onParsed={onParsed} />

      {/* 파싱 결과 간략 뷰 */}
      {parsed && (
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">사업명</p>
                <p className="font-medium">{parsed.projectName || '—'}</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">발주기관</p>
                <p className="font-medium">{parsed.client || '—'}</p>
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">요약</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {parsed.summary || '—'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">교육 대상</p>
                <p className="text-xs">{parsed.targetAudience || '—'}</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">참여인원</p>
                <p className="text-xs">
                  {parsed.targetCount ? `${parsed.targetCount}명` : '—'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">예산 (VAT)</p>
                <p className="text-sm font-semibold">{formatBudgetOk(parsed.totalBudgetVat)}</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">공급가액</p>
                <p className="text-sm font-semibold">{formatBudgetOk(parsed.supplyPrice)}</p>
              </div>
            </div>

            {parsed.targetStage?.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">창업 단계</p>
                <div className="flex flex-wrap gap-1">
                  {parsed.targetStage.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {parsed.objectives?.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">사업 목표</p>
                <ul className="space-y-0.5">
                  {parsed.objectives.map((o, i) => (
                    <li key={i} className="flex gap-2 text-xs">
                      <span className="mt-0.5 shrink-0 text-primary">·</span>
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.evalCriteria?.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">평가 배점</p>
                <div className="space-y-1">
                  {parsed.evalCriteria.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="truncate pr-2">{c.item}</span>
                      <span className="shrink-0 font-mono font-medium text-primary">
                        {c.score}점
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI 확인 요청 */}
      {questions.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold text-yellow-900">
              <HelpCircle className="h-4 w-4" />
              AI 확인 요청 ({questions.length}건)
              {missingCount > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  필수 {missingCount}
                </Badge>
              )}
              {weakCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  보완 {weakCount}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {questions.map((q, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-md border px-3 py-2 text-xs',
                  q.severity === 'missing' && 'border-red-200 bg-red-50',
                  q.severity === 'weak' && 'border-yellow-200 bg-yellow-50',
                  q.severity === 'tip' && 'border-blue-200 bg-blue-50',
                )}
              >
                <div className="flex items-start gap-2">
                  {q.severity === 'missing' && (
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
                  )}
                  {q.severity === 'weak' && (
                    <Info className="mt-0.5 h-3 w-3 shrink-0 text-yellow-600" />
                  )}
                  {q.severity === 'tip' && (
                    <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-blue-500" />
                  )}
                  <div>
                    <span className="font-medium">{q.label}</span>
                    <p className="mt-0.5 text-muted-foreground">{q.question}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// MiddlePanel — 기획 방향
// ─────────────────────────────────────────

interface MiddlePanelProps {
  parsed: RfpParsed | null
  planningDirection: PlanningDirectionResponse | null
  generating: boolean
  saving: boolean
  selectedConceptIdx: number | null
  onSelectConcept: (idx: number, candidate: ProposalConceptCandidate) => void
  editedBackground: string
  onEditBackground: (v: string) => void
  editedConcept: string
  onEditConcept: (v: string) => void
  editedPoints: string[]
  onEditPoints: (v: string[]) => void
  canConfirm: boolean
  confirmed: boolean
  onGenerate: () => void
  onRegenerate: () => void
  onConfirm: () => void
}

function MiddlePanel(props: MiddlePanelProps) {
  const {
    parsed,
    planningDirection,
    generating,
    saving,
    selectedConceptIdx,
    onSelectConcept,
    editedBackground,
    onEditBackground,
    editedConcept,
    onEditConcept,
    editedPoints,
    onEditPoints,
    canConfirm,
    confirmed,
    onGenerate,
    onRegenerate,
    onConfirm,
  } = props

  const hasDirection =
    !!planningDirection || editedBackground.trim().length > 0 || editedConcept.trim().length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          기획 방향
        </p>
        {planningDirection?.derivedChannel && (
          <Badge variant="outline" className="text-[10px]">
            채널: {planningDirection.derivedChannel}
          </Badge>
        )}
      </div>

      {!parsed && (
        <div className="flex h-80 flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed text-sm text-muted-foreground">
          <Compass className="h-8 w-8 opacity-40" />
          <p>RFP 파싱을 완료하면 기획 방향을 생성할 수 있습니다.</p>
        </div>
      )}

      {parsed && !hasDirection && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Sparkles className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm font-medium">
                제안배경·컨셉 후보·핵심 포인트를 한 번에 생성합니다.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                평가배점 상위 항목과 유사 수주 프로젝트를 반영해 3개 컨셉을 제안합니다.
              </p>
            </div>
            <Button onClick={onGenerate} disabled={generating} className="gap-2">
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  기획 방향 생성
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {parsed && hasDirection && (
        <>
          {/* 제안배경 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  제안배경 초안
                </span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  권장 600~900자 · 현재 {editedBackground.length}자
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Textarea
                value={editedBackground}
                onChange={(e) => onEditBackground(e.target.value)}
                placeholder="정책 → 시장 → 현장 3단 구성으로 작성하세요."
                className="min-h-[200px] text-sm leading-relaxed"
                maxLength={BACKGROUND_MAX_HINT + 200}
              />
            </CardContent>
          </Card>

          {/* 컨셉 후보 */}
          {planningDirection && planningDirection.proposalConceptCandidates.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  제안 컨셉 후보
                  <span className="text-[10px] font-normal text-muted-foreground">
                    3개 중 1개 선택 후 편집
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {planningDirection.proposalConceptCandidates.map((c, i) => {
                    const isSelected = selectedConceptIdx === i
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onSelectConcept(i, c)}
                        aria-pressed={isSelected}
                        className={cn(
                          'flex h-full flex-col gap-2 rounded-md border p-3 text-left transition-colors',
                          'hover:border-primary/60 hover:bg-primary/5',
                          isSelected
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                            : 'border-border bg-background',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-tight">{c.title}</p>
                          {isSelected && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                          )}
                        </div>
                        <p className="text-xs leading-relaxed text-foreground/80">
                          {c.oneLiner}
                        </p>
                        <p className="mt-auto text-[11px] leading-relaxed text-muted-foreground">
                          {c.rationale}
                        </p>
                      </button>
                    )
                  })}
                </div>

                {selectedConceptIdx !== null && (
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">
                        선택된 컨셉 (편집 가능 · 최대 {CONCEPT_MAX}자)
                      </label>
                      <span className="text-[10px] text-muted-foreground">
                        {editedConcept.length}/{CONCEPT_MAX}
                      </span>
                    </div>
                    <Input
                      value={editedConcept}
                      onChange={(e) => onEditConcept(e.target.value.slice(0, CONCEPT_MAX))}
                      placeholder="한 줄 컨셉 문장"
                      className="text-sm"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 컨셉 후보가 아직 없고 기존 저장 값만 있는 경우 */}
          {!planningDirection && editedConcept.trim().length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  제안 컨셉 (저장됨)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Input
                  value={editedConcept}
                  onChange={(e) => onEditConcept(e.target.value.slice(0, CONCEPT_MAX))}
                  className="text-sm"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  후보 3개를 다시 받으려면 &lsquo;다시 생성&rsquo; 을 누르세요.
                </p>
              </CardContent>
            </Card>
          )}

          {/* 핵심 기획 포인트 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Target className="h-4 w-4 text-primary" />
                핵심 기획 포인트
                <span className="text-[10px] font-normal text-muted-foreground">
                  각 1문장 · 평가배점 상위 2 항목 직접 대응 권장
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {editedPoints.map((p, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                    {i + 1}
                  </div>
                  <Input
                    value={p}
                    onChange={(e) => {
                      const next = [...editedPoints]
                      next[i] = e.target.value
                      onEditPoints(next)
                    }}
                    placeholder={`포인트 ${i + 1}`}
                    className="border-brand-left flex-1 text-sm"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 하단 액션 */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              disabled={generating}
              className="gap-1.5 text-xs"
            >
              <RefreshCcw className={cn('h-3.5 w-3.5', generating && 'animate-spin')} />
              다시 생성
            </Button>

            <Button
              onClick={onConfirm}
              disabled={!canConfirm || saving}
              className="gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  {confirmed ? '변경 저장' : '기획 방향 확정'}
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// RightPanel — PM 가이드 (D3 전 placeholder + 데이터 요약)
// ─────────────────────────────────────────

interface RightPanelProps {
  parsed: RfpParsed | null
  evalStrategy: EvalStrategy | null
  similar: SimilarProject[]
  similarLoading: boolean
  confirmed: boolean
  pathname: string
  router: { push: (url: string) => void }
}

function RightPanel({
  parsed,
  evalStrategy,
  similar,
  similarLoading,
  confirmed,
  pathname,
  router,
}: RightPanelProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        PM 가이드
      </p>

      {!parsed && (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed text-sm text-muted-foreground">
          <Target className="h-6 w-6 opacity-40" />
          <p className="text-xs">파싱 후 가이드가 표시됩니다.</p>
        </div>
      )}

      {parsed && (
        <>
          {/* 카드 1: 평가 전략 요약 */}
          {evalStrategy && evalStrategy.topItems.length > 0 && (
            <Card className="border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-xs font-semibold">
                  <Trophy className="h-4 w-4 text-primary" />
                  평가 전략 Top 3
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {evalStrategy.topItems.map((item, i) => (
                  <div
                    key={`${item.name}-${i}`}
                    className="rounded-md border bg-background p-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium leading-tight">{item.name}</p>
                      <Badge
                        className={cn(
                          'shrink-0 text-[10px]',
                          i === 0
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground',
                        )}
                      >
                        {item.points}점
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {sectionLabel(item.section)}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        전체 {Math.round(item.weight * 100)}%
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {item.guidance}
                    </p>
                  </div>
                ))}
                {evalStrategy.overallGuidance.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <ul className="space-y-1">
                      {evalStrategy.overallGuidance.map((g, i) => (
                        <li
                          key={i}
                          className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground"
                        >
                          <span className="mt-0.5 shrink-0 text-primary">·</span>
                          {g}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* 카드 2: 유사 프로젝트 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-xs font-semibold">
                <FileText className="h-4 w-4 text-primary" />
                유사 프로젝트
                {similarLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {!similarLoading && similar.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  유사 수주 프로젝트가 아직 없습니다.
                </p>
              )}
              {similar.slice(0, 3).map((p) => (
                <div
                  key={p.projectId}
                  className="rounded-md border bg-background p-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-tight">{p.name}</p>
                    <span className="shrink-0 text-[10px] font-mono text-muted-foreground">
                      {Math.round(p.similarity * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {p.client && (
                      <span className="text-[10px] text-muted-foreground">{p.client}</span>
                    )}
                    {p.budget != null && p.budget > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        · {formatBudgetOk(p.budget)}
                      </span>
                    )}
                    {p.isBidWon === true && (
                      <Badge className="bg-green-100 text-[10px] text-green-800">수주</Badge>
                    )}
                    {p.isBidWon === false && (
                      <Badge className="bg-red-100 text-[10px] text-red-700">미수주</Badge>
                    )}
                  </div>
                  {p.keyStrategy && (
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                      {p.keyStrategy}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 카드 3: D3 placeholder */}
          <Card className="border-dashed">
            <CardContent className="p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                준비 중
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                평가위원 관점 리뷰 · 당선 레퍼런스 매칭 · 흔한 실수 체크리스트가 이후 릴리즈에
                추가됩니다.
              </p>
            </CardContent>
          </Card>

          {/* 다음 스텝 이동 */}
          {confirmed && (
            <Button
              variant="default"
              className="w-full gap-2"
              onClick={() => router.push(`${pathname}?step=curriculum`)}
            >
              커리큘럼으로 이동
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </>
      )}
    </div>
  )
}

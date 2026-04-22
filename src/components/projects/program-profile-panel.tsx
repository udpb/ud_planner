'use client'

/**
 * ProgramProfilePanel — Step 1 하단 풀폭 패널 (Phase E Step 6)
 *
 * 제1원칙: RFP·클라이언트 요구에 맞춘 설득력 있는 제안서 + 언더독스 차별화.
 * 이 11축이 커리큘럼·제안서 AI 의 사고 프레임을 결정한다.
 *
 * 관련:
 *   - docs/architecture/program-profile.md (v1.0 스펙)
 *   - src/lib/program-profile.ts (타입 + normalizeProfile + validateProfile)
 *   - src/lib/proposal-rules.ts (formatIssueForUI + hasBlocker)
 *   - src/lib/planning-principles.ts (첫 원칙 힌트)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Lightbulb,
  Save,
  X,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import {
  type ProgramProfile,
  type RenewalContext,
  type ProfileIssue,
  type TargetStage,
  type Demographic,
  type BusinessDomain,
  type Geography,
  type ParticipantTier,
  type ProgramFormat,
  type DeliveryMode,
  type ProjectTaskType,
  type CoachingStyle,
  type MethodologyPrimary,
  type SelectionStyle,
  type CompetitionRatio,
  type ChannelType,
  type ClientTier,
  type PrimaryImpact,
  type AftercareScope,
  TARGET_STAGE_VALUES,
  DEMOGRAPHIC_VALUES,
  BUSINESS_DOMAIN_VALUES,
  GEOGRAPHY_VALUES,
  PARTICIPANT_TIER_VALUES,
  FORMAT_VALUES,
  DELIVERY_MODE_VALUES,
  PROJECT_TASK_VALUES,
  COACHING_STYLE_VALUES,
  METHODOLOGY_VALUES,
  SELECTION_STYLE_VALUES,
  COMPETITION_RATIO_VALUES,
  CHANNEL_TYPE_VALUES,
  CLIENT_TIER_VALUES,
  PRIMARY_IMPACT_VALUES,
  AFTERCARE_SCOPE_VALUES,
  normalizeProfile,
  validateProfile,
  computeBudgetTier,
} from '@/lib/program-profile'
import { formatIssueForUI, hasBlocker } from '@/lib/proposal-rules'

// ─────────────────────────────────────────
// 상수
// ─────────────────────────────────────────

/** 18개 IMPACT 모듈 코드 (I·M·P·A·C·T × 3) — DB 미시드 시 fallback 으로 사용 */
const FALLBACK_IMPACT_MODULES: readonly ImpactModuleOption[] = [
  { moduleCode: 'I-1', moduleName: 'I-1' },
  { moduleCode: 'I-2', moduleName: 'I-2' },
  { moduleCode: 'I-3', moduleName: 'I-3' },
  { moduleCode: 'M-1', moduleName: 'M-1' },
  { moduleCode: 'M-2', moduleName: 'M-2' },
  { moduleCode: 'M-3', moduleName: 'M-3' },
  { moduleCode: 'P-1', moduleName: 'P-1' },
  { moduleCode: 'P-2', moduleName: 'P-2' },
  { moduleCode: 'P-3', moduleName: 'P-3' },
  { moduleCode: 'A-1', moduleName: 'A-1' },
  { moduleCode: 'A-2', moduleName: 'A-2' },
  { moduleCode: 'A-3', moduleName: 'A-3' },
  { moduleCode: 'C-1', moduleName: 'C-1' },
  { moduleCode: 'C-2', moduleName: 'C-2' },
  { moduleCode: 'C-3', moduleName: 'C-3' },
  { moduleCode: 'T-1', moduleName: 'T-1' },
  { moduleCode: 'T-2', moduleName: 'T-2' },
  { moduleCode: 'T-3', moduleName: 'T-3' },
] as const

/** /api/impact-modules 응답의 단일 레코드 형태 (panel 에서만 사용) */
interface ImpactModuleOption {
  moduleCode: string
  moduleName: string
  stage?: string
  coreQuestion?: string
}

/** 자주 쓰이는 비즈니스 분야 태그 (엑셀 사용 빈도 기반 상위) */
const FREQUENT_BIZ_DOMAINS: readonly BusinessDomain[] = [
  '식품/농업',
  '문화/예술',
  '유통/커머스',
  '제조/하드웨어',
  '교육',
  '사회/복지',
] as const

// ─────────────────────────────────────────
// 기본값 팩토리
// ─────────────────────────────────────────

function emptyProfile(): ProgramProfile {
  const now = new Date().toISOString()
  return {
    targetStage: '예비창업_아이디어유',
    targetSegment: {
      demographic: [],
      businessDomain: [],
      geography: '일반',
    },
    scale: {
      budgetKrw: 0,
      budgetTier: '1억_미만',
      participants: '20명_이하',
      durationMonths: 6,
    },
    formats: [],
    delivery: {
      mode: '하이브리드',
      usesLMS: true,
      onlineRatio: 50,
      usesAICoach: false,
    },
    supportStructure: {
      tasks: [],
      fourLayerSupport: true,
      coachingStyle: '혼합',
      externalSpeakers: false,
    },
    methodology: {
      primary: 'IMPACT',
      impactModulesUsed: [],
    },
    selection: {
      style: '서류+PT',
      stages: 2,
      competitionRatio: '미공개',
      publicVoting: false,
      evaluatorCount: 5,
    },
    channel: {
      type: 'B2G',
      clientTier: '광역지자체',
      isRenewal: false,
    },
    primaryImpact: ['역량개발'],
    aftercare: {
      hasAftercare: false,
      scope: [],
      tierCount: 0,
    },
    version: '1.1',
    updatedAt: now,
  }
}

function emptyRenewalContext(): RenewalContext {
  return {
    previousRoundNumber: 1,
    lastYearKPI: [{ metric: '', target: 0, actual: 0, unit: '' }],
    lastYearLessons: '',
    aspectsToImprove: [],
    aspectsToKeep: [],
  }
}

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

export interface ProgramProfilePanelProps {
  projectId: string
  initialProfile: ProgramProfile | null
  initialRenewalContext: RenewalContext | null
  onSaved?: (p: ProgramProfile, r: RenewalContext | null) => void
}

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

export function ProgramProfilePanel({
  projectId,
  initialProfile,
  initialRenewalContext,
  onSaved,
}: ProgramProfilePanelProps) {
  const [profile, setProfileState] = useState<ProgramProfile>(
    () => normalizeProfile(initialProfile ?? emptyProfile()),
  )
  const [renewalContext, setRenewalContextState] = useState<RenewalContext | null>(
    initialRenewalContext,
  )
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [impactModules, setImpactModules] = useState<readonly ImpactModuleOption[]>(
    FALLBACK_IMPACT_MODULES,
  )
  const issuesAnchorRef = useRef<HTMLDivElement>(null)

  // IMPACT 18모듈 fetch — 실패·빈 응답이면 하드코딩 fallback 유지
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/impact-modules')
        if (!res.ok) return
        const data = (await res.json()) as { modules?: ImpactModuleOption[] }
        if (cancelled) return
        if (Array.isArray(data.modules) && data.modules.length > 0) {
          setImpactModules(data.modules)
        }
      } catch {
        // 네트워크 오류 → fallback 유지
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 이슈 계산 (매 렌더)
  const issues: ProfileIssue[] = useMemo(
    () => validateProfile(profile, renewalContext),
    [profile, renewalContext],
  )
  const hasBlockerNow = useMemo(() => hasBlocker(issues), [issues])

  // 자동 연동 래퍼 — 어떤 필드든 바뀌면 normalize 통과
  const updateProfile = useCallback(
    (patch: (p: ProgramProfile) => ProgramProfile) => {
      setProfileState((prev) => {
        const next = patch(prev)
        return normalizeProfile(next)
      })
    },
    [],
  )

  // isRenewal 토글 확인 다이얼로그
  const handleRenewalToggle = useCallback(
    (next: boolean) => {
      if (!next && renewalContext) {
        // OFF 전환 — 데이터 손실 확인
        toast('연속사업 컨텍스트를 지울까요?', {
          description: '작년 레슨런·KPI 등 입력한 내용이 사라집니다.',
          action: {
            label: '지우고 끄기',
            onClick: () => {
              updateProfile((p) => ({
                ...p,
                channel: { ...p.channel, isRenewal: false },
              }))
              setRenewalContextState(null)
            },
          },
        })
        return
      }
      updateProfile((p) => ({
        ...p,
        channel: { ...p.channel, isRenewal: next },
      }))
      if (next && !renewalContext) {
        setRenewalContextState(emptyRenewalContext())
      }
    },
    [renewalContext, updateProfile],
  )

  // 저장
  const handleSave = useCallback(async () => {
    if (hasBlockerNow) {
      issuesAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      toast.error('블로커를 먼저 해결해 주세요.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programProfile: profile,
          renewalContext: profile.channel.isRenewal ? renewalContext : null,
        }),
      })
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}))
        const msg =
          typeof data === 'object' && data !== null && 'error' in data
            ? JSON.stringify((data as { error?: unknown }).error)
            : '저장 실패'
        throw new Error(msg)
      }
      setLastSaved(new Date())
      toast.success('사업 프로파일 저장됨')
      onSaved?.(profile, profile.channel.isRenewal ? renewalContext : null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      toast.error(`저장 실패 — ${msg}`)
    } finally {
      setSaving(false)
    }
  }, [hasBlockerNow, onSaved, profile, projectId, renewalContext])

  const saveDisabled = saving || hasBlockerNow

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-[280px]">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <span className="inline-block h-4 w-1 rounded-sm bg-primary" />
              사업 프로파일 (ProgramProfile)
              <Badge variant="outline" className="text-[10px]">
                v1.1
              </Badge>
            </CardTitle>
            <p className="mt-1.5 text-xs text-muted-foreground">
              이 축들이 커리큘럼·제안서 AI 의 사고 프레임을 결정합니다. RFP 평가 배점과
              언더독스 차별화를 정확히 타겟팅하려면 여기부터 정밀하게 채워주세요. 특히
              과업 유형은 RFP 파싱에서 자동 체크되며, PM 이 최종 확인해 주세요.
            </p>
            {lastSaved && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                마지막 저장 {lastSaved.toLocaleTimeString('ko-KR')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={saveDisabled}
              className="gap-2"
              title={
                hasBlockerNow
                  ? '[블로커] 저장 전에 해결 필요'
                  : undefined
              }
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              프로파일 저장
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── 이슈 카드 ── */}
        {issues.length > 0 && (
          <div ref={issuesAnchorRef} className="space-y-2">
            {issues.map((issue) => (
              <IssueCard key={issue.code} issue={issue} />
            ))}
          </div>
        )}

        {/* ── 핵심 5축 (발주처 · 대상 · 과업 유형 · 방법론 · 심사) ── */}
        {/*
            v1.1: 과업 유형(Tasks) 을 다섯 번째 핵심 축으로 승격.
            2×2 → 2×3 으로 재배치. 과업 유형은 RFP 파싱에서 자동 감지되므로
            PM 이 가장 먼저 눈으로 확인해야 할 축 중 하나.
        */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChannelAxis
            profile={profile}
            renewalContext={renewalContext}
            onProfileChange={updateProfile}
            onRenewalContextChange={setRenewalContextState}
            onRenewalToggle={handleRenewalToggle}
          />
          <TargetAxis profile={profile} onProfileChange={updateProfile} />
          <TasksAxis profile={profile} onProfileChange={updateProfile} />
          <MethodologyAxis
            profile={profile}
            onProfileChange={updateProfile}
            impactModules={impactModules}
          />
          <SelectionAxis profile={profile} onProfileChange={updateProfile} />
        </div>

        {/* ── 상세 7축 토글 ── */}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails((v) => !v)}
            className="gap-1.5 text-xs"
          >
            {showDetails ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                상세 7축 접기
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                상세 7축 보기
              </>
            )}
          </Button>

          {showDetails && (
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ScaleAxis profile={profile} onProfileChange={updateProfile} />
              <BusinessDomainAxis profile={profile} onProfileChange={updateProfile} />
              <FormatsAxis profile={profile} onProfileChange={updateProfile} />
              <DeliveryAxis profile={profile} onProfileChange={updateProfile} />
              <SupportStructureAxis profile={profile} onProfileChange={updateProfile} />
              <PrimaryImpactAxis profile={profile} onProfileChange={updateProfile} />
              <AftercareAxis profile={profile} onProfileChange={updateProfile} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────
// IssueCard — Gate 3 4-layer (title · body · scoringImpact · diff · fixHint)
// ─────────────────────────────────────────

function IssueCard({ issue }: { issue: ProfileIssue }) {
  const ui = formatIssueForUI(issue)
  const isBlock = ui.severity === 'block'
  return (
    <div
      className={cn(
        'rounded-md border p-3 text-xs',
        isBlock
          ? 'border-2 border-primary bg-primary/5'
          : 'border-border bg-muted/30',
      )}
    >
      <div className="flex items-start gap-2">
        {isBlock ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold leading-tight">{ui.title}</p>
            <Badge
              variant={isBlock ? 'default' : 'secondary'}
              className={cn(
                'text-[10px]',
                isBlock && 'bg-primary text-primary-foreground',
              )}
            >
              {isBlock ? '블로커' : '경고'}
            </Badge>
          </div>
          <p className="leading-relaxed text-foreground/90">{ui.body}</p>
          {ui.scoringImpact && (
            <p className="rounded bg-background/80 p-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground/80">배점 영향 · </span>
              {ui.scoringImpact}
            </p>
          )}
          {ui.differentiationLoss && (
            <p className="rounded bg-background/80 p-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground/80">차별화 손실 · </span>
              {ui.differentiationLoss}
            </p>
          )}
          {ui.fixHint && (
            <p className="flex gap-1.5 rounded bg-background/80 p-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
              <span>
                <span className="font-semibold text-foreground/80">해결 경로 · </span>
                {ui.fixHint}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 공통 — 축 섹션 프레임
// ─────────────────────────────────────────

interface AxisFrameProps {
  title: string
  hint?: string
  children: React.ReactNode
}

function AxisFrame({ title, hint, children }: AxisFrameProps) {
  return (
    <section className="border-brand-left space-y-2">
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        {hint && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

// 작은 태그 토글 그룹 (multi-select chips)
interface ChipGroupProps<T extends string> {
  values: readonly T[]
  selected: T[]
  onChange: (next: T[]) => void
  max?: number
}

function ChipGroup<T extends string>({ values, selected, onChange, max }: ChipGroupProps<T>) {
  const toggle = (v: T) => {
    const has = selected.includes(v)
    if (has) {
      onChange(selected.filter((s) => s !== v))
    } else {
      if (max && selected.length >= max) {
        toast.error(`최대 ${max}개까지 선택 가능합니다.`)
        return
      }
      onChange([...selected, v])
    }
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => {
        const active = selected.includes(v)
        return (
          <button
            key={v}
            type="button"
            onClick={() => toggle(v)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              active
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}

// Tag Input (쉼표·Enter 구분)
interface TagInputProps {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  minCount?: number
}

function TagInput({ value, onChange, placeholder, minCount }: TagInputProps) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const t = draft.trim()
    if (!t) return
    if (value.includes(t)) {
      setDraft('')
      return
    }
    onChange([...value, t])
    setDraft('')
  }
  const remove = (v: string) => onChange(value.filter((x) => x !== v))

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              className="opacity-60 hover:opacity-100"
              aria-label={`${v} 제거`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit()
            }
          }}
          placeholder={placeholder}
          className="h-8 text-xs"
        />
        <Button type="button" size="sm" variant="outline" onClick={commit} className="h-8 text-xs">
          추가
        </Button>
      </div>
      {minCount !== undefined && value.length < minCount && (
        <p className="text-[10px] text-amber-700">
          최소 {minCount}개 입력 권장 — 현재 {value.length}개
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// 핵심 축 1 — 발주처 (channel) + renewalContext
// ─────────────────────────────────────────

interface AxisProps {
  profile: ProgramProfile
  onProfileChange: (patch: (p: ProgramProfile) => ProgramProfile) => void
}

interface ChannelAxisProps extends AxisProps {
  renewalContext: RenewalContext | null
  onRenewalContextChange: (r: RenewalContext | null) => void
  onRenewalToggle: (next: boolean) => void
}

function ChannelAxis({
  profile,
  onProfileChange,
  renewalContext,
  onRenewalContextChange,
  onRenewalToggle,
}: ChannelAxisProps) {
  return (
    <AxisFrame
      title="① 발주처 · 연속사업"
      hint="발주처 톤이 커리큘럼·제안서 AI 프롬프트 전역에 주입됩니다. 재계약은 반드시 작년 성과+레슨런을 채워야 '처음 뵙는' 톤이 사라집니다."
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="mb-1 text-xs">유형</Label>
          <Select
            value={profile.channel.type}
            onValueChange={(v) => {
              if (!v) return
              onProfileChange((p) => ({
                ...p,
                channel: { ...p.channel, type: v as ChannelType },
              }))
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_TYPE_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 text-xs">발주처 단계</Label>
          <Select
            value={profile.channel.clientTier}
            onValueChange={(v) => {
              if (!v) return
              onProfileChange((p) => ({
                ...p,
                channel: { ...p.channel, clientTier: v as ClientTier },
              }))
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_TIER_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2">
        <Switch
          checked={profile.channel.isRenewal}
          onCheckedChange={(v) => onRenewalToggle(v)}
        />
        <Label className="text-xs font-medium">연속사업 (재계약)</Label>
        {profile.channel.isRenewal && (
          <Badge variant="default" className="ml-auto bg-primary text-[10px] text-primary-foreground">
            renewalContext 필수
          </Badge>
        )}
      </div>

      {profile.channel.isRenewal && (
        <RenewalContextEditor
          value={renewalContext}
          onChange={onRenewalContextChange}
        />
      )}
    </AxisFrame>
  )
}

// ─── RenewalContext sub-card ─────────────────────────
function RenewalContextEditor({
  value,
  onChange,
}: {
  value: RenewalContext | null
  onChange: (r: RenewalContext | null) => void
}) {
  const rc = value ?? emptyRenewalContext()

  const update = (patch: Partial<RenewalContext>) => {
    onChange({ ...rc, ...patch })
  }

  const updateKpi = (
    idx: number,
    patch: Partial<RenewalContext['lastYearKPI'][number]>,
  ) => {
    const next = [...rc.lastYearKPI]
    next[idx] = { ...next[idx], ...patch }
    update({ lastYearKPI: next })
  }

  const addKpi = () => {
    update({
      lastYearKPI: [
        ...rc.lastYearKPI,
        { metric: '', target: 0, actual: 0, unit: '' },
      ],
    })
  }
  const removeKpi = (idx: number) => {
    update({ lastYearKPI: rc.lastYearKPI.filter((_, i) => i !== idx) })
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
      <p className="text-[11px] font-semibold text-primary">
        연속사업 컨텍스트 — 작년 데이터가 있어야 재계약 심사가 통과합니다
      </p>

      <div>
        <Label className="mb-1 text-xs">몇 기수째</Label>
        <Input
          type="number"
          min={1}
          value={rc.previousRoundNumber || ''}
          onChange={(e) =>
            update({ previousRoundNumber: Number(e.target.value) || 0 })
          }
          className="h-8 w-24 text-sm"
        />
      </div>

      <div>
        <Label className="mb-1 text-xs">작년 레슨런 (50자+)</Label>
        <Textarea
          value={rc.lastYearLessons}
          onChange={(e) => update({ lastYearLessons: e.target.value })}
          placeholder="A 세션 이탈률이 높았음 → B 로 대체. 참여자 만족도 78점 (목표 85 미달) 원인 …"
          className="min-h-[80px] text-xs"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          현재 {rc.lastYearLessons.length}자
        </p>
      </div>

      <div>
        <Label className="mb-1 text-xs">개선 영역 (최소 2개)</Label>
        <TagInput
          value={rc.aspectsToImprove}
          onChange={(next) => update({ aspectsToImprove: next })}
          placeholder="예: 심사 시간 단축, 코치 배정 속도 개선"
          minCount={2}
        />
      </div>

      <div>
        <Label className="mb-1 text-xs">유지할 우수 요소</Label>
        <TagInput
          value={rc.aspectsToKeep}
          onChange={(next) => update({ aspectsToKeep: next })}
          placeholder="예: 4중지원체계, 월 1회 오프라인 리뷰"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">작년 핵심 KPI</Label>
          <Button type="button" size="sm" variant="outline" onClick={addKpi} className="h-7 text-[11px]">
            + KPI 추가
          </Button>
        </div>
        <div className="mt-1.5 space-y-1.5">
          {rc.lastYearKPI.map((kpi, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_70px_70px_60px_28px] gap-1.5"
            >
              <Input
                value={kpi.metric}
                onChange={(e) => updateKpi(i, { metric: e.target.value })}
                placeholder="지표"
                className="h-8 text-xs"
              />
              <Input
                type="number"
                value={kpi.target || ''}
                onChange={(e) => updateKpi(i, { target: Number(e.target.value) || 0 })}
                placeholder="목표"
                className="h-8 text-xs"
              />
              <Input
                type="number"
                value={kpi.actual || ''}
                onChange={(e) => updateKpi(i, { actual: Number(e.target.value) || 0 })}
                placeholder="실제"
                className="h-8 text-xs"
              />
              <Input
                value={kpi.unit}
                onChange={(e) => updateKpi(i, { unit: e.target.value })}
                placeholder="단위"
                className="h-8 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeKpi(i)}
                className="h-8 w-7 p-0"
                aria-label="KPI 제거"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 핵심 축 2 — 대상 (stage + demographic + geography)
// ─────────────────────────────────────────

function TargetAxis({ profile, onProfileChange }: AxisProps) {
  return (
    <AxisFrame
      title="② 대상 세그먼트"
      hint="누가(대상)는 문제정의 4요소 중 첫째. 세그먼트가 구체적일수록 과업 이해도 배점이 살아납니다."
    >
      <div>
        <Label className="mb-1 text-xs">창업 단계</Label>
        <Select
          value={profile.targetStage}
          onValueChange={(v) => {
            if (!v) return
            onProfileChange((p) => ({ ...p, targetStage: v as TargetStage }))
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TARGET_STAGE_VALUES.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-1 text-xs">인구통계 (복수 선택)</Label>
        <ChipGroup<Demographic>
          values={DEMOGRAPHIC_VALUES}
          selected={profile.targetSegment.demographic}
          onChange={(next) =>
            onProfileChange((p) => ({
              ...p,
              targetSegment: { ...p.targetSegment, demographic: next },
            }))
          }
        />
      </div>

      <div>
        <Label className="mb-1 text-xs">지역성</Label>
        <Select
          value={profile.targetSegment.geography}
          onValueChange={(v) => {
            if (!v) return
            onProfileChange((p) => ({
              ...p,
              targetSegment: { ...p.targetSegment, geography: v as Geography },
            }))
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GEOGRAPHY_VALUES.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </AxisFrame>
  )
}

// ─────────────────────────────────────────
// 핵심 축 3 — 과업 유형 (Tasks, v1.1)
// ─────────────────────────────────────────
//
// 제1원칙: 각 체크박스는 RFP 평가 배점 한 카테고리에 직접 연결된다.
// 힌트 문구는 "왜 중요한가 + 어떤 배점에 걸리는가" 를 한 줄로 담는다.
//
// UX: RFP 파싱에서 detectedTasks 가 들어오면 step-rfp 가 이 배열을
//     supportStructure.tasks 초기값으로 주입. PM 은 이 화면에서 최종 확인.

interface TaskOption {
  value: ProjectTaskType
  label: string
  hint: string
}

const TASK_OPTIONS: readonly TaskOption[] = [
  {
    value: '모객',
    label: '모객',
    hint: '참여자 모집·홍보 — 필수 과업이 있으면 모집 전략이 제안서에 들어가야 배점',
  },
  {
    value: '심사_선발',
    label: '심사·선발',
    hint: '공모·선정 단계가 있으면 심사위원 구성·단계·기준이 별도 배점',
  },
  {
    value: '교류_네트워킹',
    label: '교류·네트워킹',
    hint: '기수 내·외부 네트워킹 — 기업 파트너·동문 연결 자산이 차별화 포인트',
  },
  {
    value: '멘토링_코칭',
    label: '멘토링·코칭',
    hint: '1:1 또는 팀 기반 코칭 — 4중 지원 체계를 여기서 증명',
  },
  {
    value: '컨설팅_산출물',
    label: '컨설팅·산출물',
    hint: '명확한 deliverable (보고서·실물·디자인) — 산출물 수준이 수행 능력 증빙',
  },
  {
    value: '행사_운영',
    label: '행사 운영',
    hint: '데모데이·박람회·페스티벌 등 이벤트 — 운영 역량·집객 실적이 배점',
  },
] as const

function TasksAxis({ profile, onProfileChange }: AxisProps) {
  const selected = profile.supportStructure.tasks ?? []
  const toggle = (v: ProjectTaskType) => {
    const next = selected.includes(v)
      ? selected.filter((x) => x !== v)
      : [...selected, v]
    onProfileChange((p) => ({
      ...p,
      supportStructure: { ...p.supportStructure, tasks: next },
    }))
  }
  return (
    <AxisFrame
      title={`③ 과업 유형 (${selected.length}/6)`}
      hint="이 사업에 실제로 포함되는 과업만 체크하세요. RFP 파싱이 1차로 자동 감지하고, PM 이 여기서 확인합니다. 각 과업은 RFP 평가 배점 한 카테고리와 직결되므로 빠지면 해당 배점을 통째로 잃을 수 있습니다."
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TASK_OPTIONS.map((opt) => {
          const active = selected.includes(opt.value)
          return (
            <label
              key={opt.value}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs transition-colors',
                active
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background hover:border-primary/40',
              )}
            >
              <Checkbox
                checked={active}
                onCheckedChange={() => toggle(opt.value)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p
                  className={cn(
                    'text-sm font-medium leading-tight',
                    active ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {opt.label}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {opt.hint}
                </p>
              </div>
            </label>
          )
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-[11px] text-amber-700">
          과업이 비어 있습니다 — RFP 파싱 결과를 먼저 확인하거나, 이 사업 구성 요소를
          직접 체크하세요. 빈 상태로 진행하면 "과업 이해도" 배점이 감점됩니다.
        </p>
      )}
    </AxisFrame>
  )
}

// ─────────────────────────────────────────
// 핵심 축 4 — 방법론
// ─────────────────────────────────────────

interface MethodologyAxisProps extends AxisProps {
  impactModules: readonly ImpactModuleOption[]
}

function MethodologyAxis({
  profile,
  onProfileChange,
  impactModules,
}: MethodologyAxisProps) {
  return (
    <AxisFrame
      title="③ 방법론"
      hint="IMPACT 는 창업교육 전용 프레임. 로컬상권·공모전·매칭 사업에 억지로 적용하면 과업 이해도에서 감점됩니다."
    >
      <div>
        <Label className="mb-1 text-xs">주 방법론</Label>
        <Select
          value={profile.methodology.primary}
          onValueChange={(v) => {
            if (!v) return
            onProfileChange((p) => ({
              ...p,
              methodology: { ...p.methodology, primary: v as MethodologyPrimary },
            }))
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHODOLOGY_VALUES.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {profile.methodology.primary === '커스텀' && (
        <div>
          <Label className="mb-1 text-xs">커스텀 프레임명</Label>
          <Input
            value={profile.methodology.customFrameworkName ?? ''}
            onChange={(e) =>
              onProfileChange((p) => ({
                ...p,
                methodology: {
                  ...p.methodology,
                  customFrameworkName: e.target.value,
                },
              }))
            }
            placeholder="예: 청년마을 정착지원 프레임"
            className="h-8 text-sm"
          />
        </div>
      )}

      {profile.methodology.primary === 'IMPACT' && (
        <div>
          <Label className="mb-1 text-xs">
            사용 IMPACT 모듈 ({impactModules.length}개 중)
          </Label>
          <ImpactModuleChips
            options={impactModules}
            selected={profile.methodology.impactModulesUsed}
            onChange={(next) =>
              onProfileChange((p) => ({
                ...p,
                methodology: { ...p.methodology, impactModulesUsed: next },
              }))
            }
          />
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            IMPACT 18모듈 중 <span className="font-semibold text-foreground/80">5개 이상 명시</span>
            가 &apos;자체 방법론 활용도&apos; 배점의 경쟁사 대비 우위점입니다. 세션과 모듈이 매핑될수록
            제안서의 &apos;체계성&apos; 서술이 구체화됩니다.
          </p>
        </div>
      )}
    </AxisFrame>
  )
}

// IMPACT 모듈 칩 — DB name 은 tooltip 으로만 노출, 칩 라벨은 moduleCode 유지
interface ImpactModuleChipsProps {
  options: readonly ImpactModuleOption[]
  selected: string[]
  onChange: (next: string[]) => void
}

function ImpactModuleChips({ options, selected, onChange }: ImpactModuleChipsProps) {
  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter((v) => v !== code))
    } else {
      onChange([...selected, code])
    }
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt.moduleCode)
        const tooltip =
          opt.moduleName && opt.moduleName !== opt.moduleCode
            ? `${opt.moduleCode} · ${opt.moduleName}`
            : opt.moduleCode
        return (
          <button
            key={opt.moduleCode}
            type="button"
            title={tooltip}
            onClick={() => toggle(opt.moduleCode)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              active
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            {opt.moduleCode}
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────
// 핵심 축 4 — 심사·선발
// ─────────────────────────────────────────

function SelectionAxis({ profile, onProfileChange }: AxisProps) {
  return (
    <AxisFrame
      title="④ 심사 · 선발"
      hint="공모전·대중심사 여부가 커리큘럼의 심사 단계 설계를 지배합니다."
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="mb-1 text-xs">스타일</Label>
          <Select
            value={profile.selection.style}
            onValueChange={(v) => {
              if (!v) return
              onProfileChange((p) => ({
                ...p,
                selection: { ...p.selection, style: v as SelectionStyle },
              }))
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SELECTION_STYLE_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 text-xs">경쟁률</Label>
          <Select
            value={profile.selection.competitionRatio}
            onValueChange={(v) => {
              if (!v) return
              onProfileChange((p) => ({
                ...p,
                selection: {
                  ...p.selection,
                  competitionRatio: v as CompetitionRatio,
                },
              }))
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPETITION_RATIO_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="mb-1 text-xs">심사 단계 수</Label>
          <Input
            type="number"
            min={1}
            value={profile.selection.stages || ''}
            onChange={(e) =>
              onProfileChange((p) => ({
                ...p,
                selection: { ...p.selection, stages: Number(e.target.value) || 1 },
              }))
            }
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Checkbox
            checked={profile.selection.publicVoting}
            onCheckedChange={(v) => {
              const next = Boolean(v)
              onProfileChange((p) => ({
                ...p,
                selection: {
                  ...p.selection,
                  publicVoting: next,
                  // OFF 전환 시 가중치 자동 정리 — 숨겨진 값이 저장돼
                  // 다음 세션에서 혼란을 주는 것을 방지
                  publicVotingWeight: next ? p.selection.publicVotingWeight : undefined,
                },
              }))
            }}
          />
          <Label className="text-xs">대중심사 병행</Label>
        </div>
      </div>

      {profile.selection.publicVoting && (
        <div>
          <Label className="mb-1 text-xs">대중심사 가중치 (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={5}
            value={profile.selection.publicVotingWeight ?? ''}
            onChange={(e) => {
              const raw = e.target.value
              const num = raw === '' ? undefined : Math.max(0, Math.min(100, Number(raw) || 0))
              onProfileChange((p) => ({
                ...p,
                selection: { ...p.selection, publicVotingWeight: num },
              }))
            }}
            placeholder="예: 10"
            className="h-8 w-28 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            한지 공모전의 10% 대중심사처럼 &apos;시장성 검증을 심사에 내장&apos; 한 구조는
            &apos;차별화&apos; 배점을 독점합니다.
          </p>
        </div>
      )}
    </AxisFrame>
  )
}

// ─────────────────────────────────────────
// 상세 축 — Scale
// ─────────────────────────────────────────

function ScaleAxis({ profile, onProfileChange }: AxisProps) {
  const tier = computeBudgetTier(profile.scale.budgetKrw)
  return (
    <AxisFrame title="규모">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="mb-1 text-xs">예산 (원, VAT)</Label>
          <Input
            type="number"
            min={0}
            value={profile.scale.budgetKrw || ''}
            onChange={(e) =>
              onProfileChange((p) => ({
                ...p,
                scale: { ...p.scale, budgetKrw: Number(e.target.value) || 0 },
              }))
            }
            placeholder="100000000"
            className="h-8 text-sm"
          />
          <div className="mt-1">
            <Badge variant="outline" className="text-[10px]">
              자동: {tier}
            </Badge>
          </div>
        </div>
        <div>
          <Label className="mb-1 text-xs">참여 인원</Label>
          <Select
            value={profile.scale.participants}
            onValueChange={(v) => {
              if (!v) return
              onProfileChange((p) => ({
                ...p,
                scale: { ...p.scale, participants: v as ParticipantTier },
              }))
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PARTICIPANT_TIER_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="mb-1 text-xs">사업 기간 (개월)</Label>
        <Input
          type="number"
          min={1}
          value={profile.scale.durationMonths || ''}
          onChange={(e) =>
            onProfileChange((p) => ({
              ...p,
              scale: { ...p.scale, durationMonths: Number(e.target.value) || 1 },
            }))
          }
          className="h-8 w-24 text-sm"
        />
      </div>
    </AxisFrame>
  )
}

// ─────────────────────────────────────────
// 상세 축 — 비즈니스 분야
// ─────────────────────────────────────────

function BusinessDomainAxis({ profile, onProfileChange }: AxisProps) {
  const freq = FREQUENT_BIZ_DOMAINS.filter(
    (d) => !profile.targetSegment.businessDomain.includes(d),
  )
  return (
    <AxisFrame title="비즈니스 분야 (복수)">
      {freq.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] text-muted-foreground">자주 쓰이는 태그</p>
          <div className="flex flex-wrap gap-1.5">
            {freq.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() =>
                  onProfileChange((p) => ({
                    ...p,
                    targetSegment: {
                      ...p.targetSegment,
                      businessDomain: [...p.targetSegment.businessDomain, d],
                    },
                  }))
                }
                className="rounded-full border border-dashed border-primary/40 bg-background px-2 py-0.5 text-[11px] text-primary/80 hover:bg-primary/5"
              >
                + {d}
              </button>
            ))}
          </div>
        </div>
      )}
      <ChipGroup<BusinessDomain>
        values={BUSINESS_DOMAIN_VALUES}
        selected={profile.targetSegment.businessDomain}
        onChange={(next) =>
          onProfileChange((p) => ({
            ...p,
            targetSegment: { ...p.targetSegment, businessDomain: next },
          }))
        }
      />
    </AxisFrame>
  )
}

// ─────────────────────────────────────────
// 상세 축 — Formats
// ─────────────────────────────────────────

function FormatsAxis({ profile, onProfileChange }: AxisProps) {
  return (
    <AxisFrame title="프로그램 포맷 (복수)">
      <ChipGroup<ProgramFormat>
        values={FORMAT_VALUES}
        selected={profile.formats}
        onChange={(next) =>
          onProfileChange((p) => ({ ...p, formats: next }))
        }
      />
      {profile.formats.includes('공모전') && (
        <p className="text-[10px] text-muted-foreground">
          공모전 포함 → 심사 스타일이 자동으로 공모전형/대중심사로 동기화됩니다.
        </p>
      )}
    </AxisFrame>
  )
}

// ─────────────────────────────────────────
// 상세 축 — Delivery
// ─────────────────────────────────────────

function DeliveryAxis({ profile, onProfileChange }: AxisProps) {
  return (
    <AxisFrame title="운영 방식">
      <div>
        <Label className="mb-1.5 text-xs">모드</Label>
        <RadioGroup
          value={profile.delivery.mode}
          onValueChange={(v) => {
            if (!v) return
            onProfileChange((p) => ({
              ...p,
              delivery: { ...p.delivery, mode: v as DeliveryMode },
            }))
          }}
          className="flex gap-3"
        >
          {DELIVERY_MODE_VALUES.map((m) => (
            <label key={m} className="flex items-center gap-1.5 text-xs">
              <RadioGroupItem value={m} />
              {m}
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={profile.delivery.usesLMS}
          onCheckedChange={(v) =>
            onProfileChange((p) => ({
              ...p,
              delivery: { ...p.delivery, usesLMS: v },
            }))
          }
        />
        <Label className="text-xs">
          LMS 사용 <span className="text-[10px] text-primary">· 권장 ON</span>
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={profile.delivery.usesAICoach}
          onCheckedChange={(v) =>
            onProfileChange((p) => ({
              ...p,
              delivery: { ...p.delivery, usesAICoach: v },
            }))
          }
        />
        <Label className="text-xs">AI 코치 (EduBot)</Label>
      </div>

      {profile.delivery.mode === '하이브리드' && (
        <div>
          <Label className="mb-1 text-xs">
            온라인 비율 {profile.delivery.onlineRatio}%
          </Label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={profile.delivery.onlineRatio}
            onChange={(e) =>
              onProfileChange((p) => ({
                ...p,
                delivery: {
                  ...p.delivery,
                  onlineRatio: Number(e.target.value),
                },
              }))
            }
            className="w-full accent-primary"
          />
        </div>
      )}
    </AxisFrame>
  )
}

// ─────────────────────────────────────────
// 상세 축 — 지원 구조
// ─────────────────────────────────────────

function SupportStructureAxis({ profile, onProfileChange }: AxisProps) {
  // 비창업 지원 필드 표출 조건
  const showNonStartup =
    profile.targetStage === '비창업자' ||
    profile.methodology.primary === '로컬브랜드' ||
    profile.methodology.primary === '글로컬' ||
    profile.methodology.primary === '공모전설계' ||
    profile.methodology.primary === '매칭'
  const showMatchingOperator = profile.methodology.primary === '매칭'
  const nonStartup = profile.supportStructure.nonStartupSupport ?? {}

  return (
    <AxisFrame
      title="지원 구조"
      hint="이 축의 과업 유형은 상단 '③ 과업 유형' 핵심 축에서 체크합니다. 여기서는 언더독스 고유 자산 · 코칭 스타일 · 외부 연사 · 비창업 보조만 다룹니다."
    >
      <div className="flex items-start gap-2">
        <Switch
          checked={profile.supportStructure.fourLayerSupport}
          onCheckedChange={(v) =>
            onProfileChange((p) => ({
              ...p,
              supportStructure: { ...p.supportStructure, fourLayerSupport: v },
            }))
          }
        />
        <div className="flex-1">
          <Label
            className="flex items-center gap-1.5 text-xs"
            title="4중 지원 체계: 전문멘토 + 컨설턴트 풀 + 전담 코치 + 동료 네트워크. 언더독스 고유 운영 자산."
          >
            4중 지원 체계
            <Info className="h-3 w-3 text-muted-foreground" aria-hidden />
          </Label>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground/80">4중 지원 체계</span>: 전문멘토 +
            컨설턴트 풀 + 전담 코치 + 동료 네트워크. 언더독스 고유 운영 자산으로,
            "수행 역량·차별화" 배점의 정량 근거입니다. 멘토링·코칭 과업이 있을 때 켜는 것이
            기본 권장.
          </p>
        </div>
      </div>

      <div>
        <Label className="mb-1.5 text-xs">코칭 스타일</Label>
        <RadioGroup
          value={profile.supportStructure.coachingStyle}
          onValueChange={(v) => {
            if (!v) return
            onProfileChange((p) => ({
              ...p,
              supportStructure: {
                ...p.supportStructure,
                coachingStyle: v as CoachingStyle,
              },
            }))
          }}
          className="flex flex-wrap gap-3"
        >
          {COACHING_STYLE_VALUES.map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-xs">
              <RadioGroupItem value={s} />
              {s}
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={profile.supportStructure.externalSpeakers}
          onCheckedChange={(v) =>
            onProfileChange((p) => ({
              ...p,
              supportStructure: {
                ...p.supportStructure,
                externalSpeakers: v,
                // OFF 시 수치 정리 — 숨겨진 값 저장 방지
                externalSpeakerCount: v ? p.supportStructure.externalSpeakerCount : undefined,
              },
            }))
          }
        />
        <Label className="text-xs">외부 연사 활용</Label>
      </div>

      {profile.supportStructure.externalSpeakers && (
        <div>
          <Label className="mb-1 text-xs">외부 연사 수 (회차)</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={profile.supportStructure.externalSpeakerCount ?? ''}
            onChange={(e) => {
              const raw = e.target.value
              const num = raw === '' ? undefined : Math.max(1, Math.min(50, Number(raw) || 1))
              onProfileChange((p) => ({
                ...p,
                supportStructure: { ...p.supportStructure, externalSpeakerCount: num },
              }))
            }}
            placeholder="예: 6"
            className="h-8 w-28 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            외부 연사 수는 &apos;차별화&apos; 배점의 정량 포화 근거. &apos;N명 외부 전문가&apos;
            구체 수치가 경쟁사 대비 우위를 만듭니다.
          </p>
        </div>
      )}

      {showNonStartup && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
          <p className="text-[11px] font-semibold text-primary">
            비창업 사업용 지원 구조 — 창업교육과 다른 평가 축이 작동합니다
          </p>

          <div>
            <Label className="mb-1 text-xs">운영 조율체 (비창업 사업)</Label>
            <Input
              value={nonStartup.coordinationBody ?? ''}
              onChange={(e) =>
                onProfileChange((p) => ({
                  ...p,
                  supportStructure: {
                    ...p.supportStructure,
                    nonStartupSupport: {
                      ...p.supportStructure.nonStartupSupport,
                      coordinationBody: e.target.value,
                    },
                  },
                }))
              }
              placeholder="상권강화기구 · 운영사무국 · 장인 협의체 등"
              className="h-8 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              비창업 사업은 창업교육과 다른 지원 구조가 필요합니다. 운영 조율체가 없으면
              평가위원이 &apos;사업 지속성&apos; 배점을 의심합니다.
            </p>
          </div>

          <div>
            <Label className="mb-1 text-xs">도메인 파트너</Label>
            <TagInput
              value={nonStartup.domainPartners ?? []}
              onChange={(next) =>
                onProfileChange((p) => ({
                  ...p,
                  supportStructure: {
                    ...p.supportStructure,
                    nonStartupSupport: {
                      ...p.supportStructure.nonStartupSupport,
                      domainPartners: next,
                    },
                  },
                }))
              }
              placeholder="예: 상인 협의체, 공예 네트워크, 임직원 멘토 풀"
            />
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              도메인 파트너 실명·풀 수치는 &apos;수행 능력&apos; 배점의 핵심 근거입니다.
              언더독스의 93개 시·군·구 · 300명+ 전문 멘토 자산이 여기서 살아납니다.
            </p>
          </div>

          {showMatchingOperator && (
            <div className="flex items-start gap-2">
              <Switch
                checked={nonStartup.matchingOperator ?? false}
                onCheckedChange={(v) =>
                  onProfileChange((p) => ({
                    ...p,
                    supportStructure: {
                      ...p.supportStructure,
                      nonStartupSupport: {
                        ...p.supportStructure.nonStartupSupport,
                        matchingOperator: v,
                      },
                    },
                  }))
                }
              />
              <div>
                <Label className="text-xs">매칭 운영자 보유</Label>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  매칭 운영자 유무가 매칭형 사업의 &apos;운영 품질&apos; 평가를 좌우합니다.
                  코오롱 프로보노형에서는 필수.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </AxisFrame>
  )
}

// ─────────────────────────────────────────
// 상세 축 — 주 임팩트 (1~3)
// ─────────────────────────────────────────

function PrimaryImpactAxis({ profile, onProfileChange }: AxisProps) {
  const count = profile.primaryImpact.length
  return (
    <AxisFrame title={`주 임팩트 (${count}/3)`}>
      <ChipGroup<PrimaryImpact>
        values={PRIMARY_IMPACT_VALUES}
        selected={profile.primaryImpact}
        onChange={(next) =>
          onProfileChange((p) => ({ ...p, primaryImpact: next }))
        }
        max={3}
      />
      {count === 0 && (
        <p className="text-[10px] text-amber-700">
          최소 1개를 선택하세요 — 저장 시 역량개발로 자동 설정됩니다.
        </p>
      )}
    </AxisFrame>
  )
}

// ─────────────────────────────────────────
// 상세 축 — 사후관리
// ─────────────────────────────────────────

function AftercareAxis({ profile, onProfileChange }: AxisProps) {
  return (
    <AxisFrame title="사후관리">
      <div className="flex items-center gap-2">
        <Switch
          checked={profile.aftercare.hasAftercare}
          onCheckedChange={(v) =>
            onProfileChange((p) => ({
              ...p,
              aftercare: { ...p.aftercare, hasAftercare: v },
            }))
          }
        />
        <Label className="text-xs">사후관리 계획 있음</Label>
      </div>

      {profile.aftercare.hasAftercare && (
        <>
          <div>
            <Label className="mb-1 text-xs">사후 스코프 (복수)</Label>
            <ChipGroup<AftercareScope>
              values={AFTERCARE_SCOPE_VALUES}
              selected={profile.aftercare.scope}
              onChange={(next) =>
                onProfileChange((p) => ({
                  ...p,
                  aftercare: { ...p.aftercare, scope: next },
                }))
              }
            />
          </div>
          <div>
            <Label className="mb-1 text-xs">단계 수 (예: 한지 4단 = 4)</Label>
            <Input
              type="number"
              min={0}
              value={profile.aftercare.tierCount || ''}
              onChange={(e) =>
                onProfileChange((p) => ({
                  ...p,
                  aftercare: {
                    ...p.aftercare,
                    tierCount: Number(e.target.value) || 0,
                  },
                }))
              }
              className="h-8 w-24 text-sm"
            />
          </div>
        </>
      )}
    </AxisFrame>
  )
}

// Re-export for convenience
export type { ProgramProfile, RenewalContext }

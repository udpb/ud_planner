'use client'
/**
 * PmInputsEditor — Phase L1 / K7 (2026-05-29)
 *
 * PM 이 LLM 단독으로 모를 외부 reality 를 입력:
 *   1. 발주처 통화/미팅 결과 (의사결정자 의중·숨은 요구)
 *   2. 본 사업 전담 코치 명단 (실명·이력)
 *   3. 평가위원 정보 (관심사·KPI)
 *   4. 자유 메모 (참고만, 본문 X)
 *
 * UX 원칙:
 *   - 시작 = 모두 빈 상태 — 채우면 채울수록 1차본 quality ↑
 *   - 디바운스 자동 저장 (1.2s)
 *   - 섹션별 expand/collapse (조용한 UI — 사이드바 안 어수선)
 *   - 추가/삭제 inline 버튼
 *
 * 위치: ExpressShell 사이드바 4번째 탭 "PM 입력"
 * 저장: POST /api/express/pm-inputs (전체 draft 안 보내고 pmInputs 만 patch)
 *
 * 관련 schema: src/lib/express/schema.ts §7.5 PmInputs
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, Phone, Users, ScaleIcon, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { PmInputs } from '@/lib/express/schema'

type CallNote = NonNullable<PmInputs['callNotes']>[number]
type Coach = NonNullable<PmInputs['assignedCoaches']>[number]
type Evaluator = NonNullable<PmInputs['evaluators']>[number]

interface Props {
  projectId: string
  /** 초기값 — 없으면 빈 입력 시작 */
  initial?: PmInputs | null
  /** 저장 성공 시 콜백 (ExpressShell 가 draft 동기화) */
  onSaved?: (pmInputs: PmInputs) => void
}

const SECTION_CONFIG = [
  {
    key: 'callNotes' as const,
    label: '발주처 통화·미팅',
    icon: Phone,
    description: '의사결정자 의중·숨은 요구 (1차본 sections.1·2 에 반영)',
    maxItems: 5,
  },
  {
    key: 'assignedCoaches' as const,
    label: '전담 코치 명단',
    icon: Users,
    description: '실명·이력 (sections.4 운영체계 차별화)',
    maxItems: 10,
  },
  {
    key: 'evaluators' as const,
    label: '평가위원 정보',
    icon: ScaleIcon,
    description: '관심사·KPI (sections.6·7 톤 조정)',
    maxItems: 10,
  },
] as const

export function PmInputsEditor({ projectId, initial, onSaved }: Props) {
  const [pmInputs, setPmInputs] = useState<PmInputs>(initial ?? {})
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    callNotes: false,
    assignedCoaches: false,
    evaluators: false,
    freeNotes: false,
  })
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialJsonRef = useRef<string>(JSON.stringify(initial ?? {}))

  /**
   * 서버 검증 통과 가능한 상태인지 가벼운 client-side 사전 확인.
   * 빈 draft 항목 (callNote summary < 20자 등) 이면 서버에 안 보내고 silent skip.
   * 사용자가 추가 클릭 직후 빈 상태로 400 오류를 받지 않도록 함.
   */
  function isPostable(input: PmInputs): boolean {
    if (input.callNotes) {
      for (const n of input.callNotes) {
        if (!n.summary || n.summary.length < 20) return false
      }
    }
    if (input.assignedCoaches) {
      for (const c of input.assignedCoaches) {
        if (!c.name || c.name.length === 0) return false
      }
    }
    if (input.evaluators) {
      for (const e of input.evaluators) {
        if (!e.name || e.name.length === 0) return false
      }
    }
    return true
  }

  // Debounced auto-save
  function scheduleSave(next: PmInputs) {
    setPmInputs(next)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const json = JSON.stringify({
        callNotes: next.callNotes,
        assignedCoaches: next.assignedCoaches,
        evaluators: next.evaluators,
        freeNotes: next.freeNotes,
      })
      // Skip if unchanged
      if (json === initialJsonRef.current) return
      // Skip if any item is incomplete — 서버 400 방지, 사용자가 채우면 자동 재시도
      if (!isPostable(next)) {
        setError(null)
        return
      }
      setSaving(true)
      setError(null)
      try {
        const res = await fetch('/api/express/pm-inputs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, pmInputs: next }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(data?.error ?? `HTTP ${res.status}`)
        }
        initialJsonRef.current = json
        setSavedAt(new Date())
        if (data?.pmInputs) onSaved?.(data.pmInputs)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        toast.error(`PM 입력 저장 실패: ${msg.slice(0, 60)}`)
      } finally {
        setSaving(false)
      }
    }, 1200)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  function toggle(key: string) {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }))
  }

  // ── Add/remove handlers (sections-typed) ──
  function addCallNote() {
    const list = [...(pmInputs.callNotes ?? [])]
    if (list.length >= 5) return
    list.push({ summary: '' })
    scheduleSave({ ...pmInputs, callNotes: list })
    setOpenSections((s) => ({ ...s, callNotes: true }))
  }
  function updateCallNote(i: number, patch: Partial<CallNote>) {
    const list = [...(pmInputs.callNotes ?? [])]
    list[i] = { ...list[i], ...patch }
    scheduleSave({ ...pmInputs, callNotes: list })
  }
  function removeCallNote(i: number) {
    const list = [...(pmInputs.callNotes ?? [])]
    list.splice(i, 1)
    scheduleSave({ ...pmInputs, callNotes: list.length > 0 ? list : undefined })
  }

  function addCoach() {
    const list = [...(pmInputs.assignedCoaches ?? [])]
    if (list.length >= 10) return
    list.push({ name: '' })
    scheduleSave({ ...pmInputs, assignedCoaches: list })
    setOpenSections((s) => ({ ...s, assignedCoaches: true }))
  }
  function updateCoach(i: number, patch: Partial<Coach>) {
    const list = [...(pmInputs.assignedCoaches ?? [])]
    list[i] = { ...list[i], ...patch }
    scheduleSave({ ...pmInputs, assignedCoaches: list })
  }
  function removeCoach(i: number) {
    const list = [...(pmInputs.assignedCoaches ?? [])]
    list.splice(i, 1)
    scheduleSave({
      ...pmInputs,
      assignedCoaches: list.length > 0 ? list : undefined,
    })
  }

  function addEvaluator() {
    const list = [...(pmInputs.evaluators ?? [])]
    if (list.length >= 10) return
    list.push({ name: '' })
    scheduleSave({ ...pmInputs, evaluators: list })
    setOpenSections((s) => ({ ...s, evaluators: true }))
  }
  function updateEvaluator(i: number, patch: Partial<Evaluator>) {
    const list = [...(pmInputs.evaluators ?? [])]
    list[i] = { ...list[i], ...patch }
    scheduleSave({ ...pmInputs, evaluators: list })
  }
  function removeEvaluator(i: number) {
    const list = [...(pmInputs.evaluators ?? [])]
    list.splice(i, 1)
    scheduleSave({
      ...pmInputs,
      evaluators: list.length > 0 ? list : undefined,
    })
  }

  // ── Counts for summary ──
  const counts = {
    callNotes: pmInputs.callNotes?.length ?? 0,
    assignedCoaches: pmInputs.assignedCoaches?.length ?? 0,
    evaluators: pmInputs.evaluators?.length ?? 0,
    freeNotes: pmInputs.freeNotes?.length ?? 0,
  }
  const totalCount =
    counts.callNotes + counts.assignedCoaches + counts.evaluators + (counts.freeNotes > 0 ? 1 : 0)

  return (
    <div className="space-y-3">
      {/* Header summary */}
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
        <div className="flex items-start gap-2">
          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="flex-1 leading-relaxed">
            <p className="font-semibold text-foreground">PM 외부 reality 입력</p>
            <p className="mt-0.5 text-muted-foreground">
              LLM 이 모르는 정보 — 통화 결과·전담 코치·평가위원 의중. 채우면 1차본이 더 와닿는다.
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              현재 입력 {totalCount}건 · {' '}
              {saving
                ? '저장 중…'
                : savedAt
                  ? `${formatRelativeTime(savedAt)} 저장됨`
                  : '아직 변경 없음'}
              {error && <span className="ml-1 text-destructive">· 저장 실패</span>}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground/80">
              💡 통화 노트 summary 20자 이상 · 코치·평가위원은 이름 필수 (입력 완료될 때까지 저장 보류)
            </p>
          </div>
        </div>
      </div>

      {/* 1. Call Notes */}
      <CollapsibleSection
        open={openSections.callNotes}
        onToggle={() => toggle('callNotes')}
        config={SECTION_CONFIG[0]}
        count={counts.callNotes}
      >
        <div className="space-y-2">
          {(pmInputs.callNotes ?? []).map((cn, i) => (
            <div
              key={i}
              className="space-y-1.5 rounded border border-border/60 bg-card p-2.5 text-xs"
            >
              <div className="flex gap-1.5">
                <Input
                  placeholder="YYYY-MM-DD"
                  value={cn.date ?? ''}
                  onChange={(e) => updateCallNote(i, { date: e.target.value })}
                  className="h-7 flex-1 text-xs"
                />
                <Input
                  placeholder="담당자 (이름·직책)"
                  value={cn.contact ?? ''}
                  onChange={(e) => updateCallNote(i, { contact: e.target.value })}
                  className="h-7 flex-[2] text-xs"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeCallNote(i)}
                  className="h-7 w-7 shrink-0 text-destructive/70 hover:text-destructive"
                  title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea
                placeholder="통화 핵심 내용 (의사결정자 의중·숨은 요구·평가 강조점)"
                value={cn.summary}
                onChange={(e) => updateCallNote(i, { summary: e.target.value })}
                rows={2}
                className="text-xs"
                maxLength={800}
              />
              <p className="text-right text-[10px] text-muted-foreground">{cn.summary.length}/800</p>
            </div>
          ))}
          <AddButton
            onClick={addCallNote}
            disabled={counts.callNotes >= 5}
            label={`통화 노트 추가 (${counts.callNotes}/5)`}
          />
        </div>
      </CollapsibleSection>

      {/* 2. Assigned Coaches */}
      <CollapsibleSection
        open={openSections.assignedCoaches}
        onToggle={() => toggle('assignedCoaches')}
        config={SECTION_CONFIG[1]}
        count={counts.assignedCoaches}
      >
        <div className="space-y-2">
          {(pmInputs.assignedCoaches ?? []).map((coach, i) => (
            <div key={i} className="space-y-1.5 rounded border border-border/60 bg-card p-2.5 text-xs">
              <div className="flex gap-1.5">
                <Input
                  placeholder="이름"
                  value={coach.name}
                  onChange={(e) => updateCoach(i, { name: e.target.value })}
                  className="h-7 flex-1 text-xs"
                />
                <select
                  value={coach.role ?? ''}
                  onChange={(e) => updateCoach(i, { role: e.target.value || undefined })}
                  className="h-7 rounded border border-input bg-background px-2 text-xs"
                >
                  <option value="">역할</option>
                  <option value="lead">lead (총괄)</option>
                  <option value="main">main (주강)</option>
                  <option value="support">support (보조)</option>
                </select>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeCoach(i)}
                  className="h-7 w-7 shrink-0 text-destructive/70 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                placeholder="핵심 이력 (1줄 — 前 직장·경력 연수·전문 분야)"
                value={coach.background ?? ''}
                onChange={(e) => updateCoach(i, { background: e.target.value })}
                className="h-7 text-xs"
                maxLength={300}
              />
            </div>
          ))}
          <AddButton
            onClick={addCoach}
            disabled={counts.assignedCoaches >= 10}
            label={`코치 추가 (${counts.assignedCoaches}/10)`}
          />
        </div>
      </CollapsibleSection>

      {/* 3. Evaluators */}
      <CollapsibleSection
        open={openSections.evaluators}
        onToggle={() => toggle('evaluators')}
        config={SECTION_CONFIG[2]}
        count={counts.evaluators}
      >
        <div className="space-y-2">
          <p className="rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            ⚠ 본문에 실명 노출 X — LLM 이 관심사·KPI 톤만 반영
          </p>
          {(pmInputs.evaluators ?? []).map((ev, i) => (
            <div key={i} className="space-y-1.5 rounded border border-border/60 bg-card p-2.5 text-xs">
              <div className="flex gap-1.5">
                <Input
                  placeholder='이름 또는 "평가위원 A"'
                  value={ev.name}
                  onChange={(e) => updateEvaluator(i, { name: e.target.value })}
                  className="h-7 flex-1 text-xs"
                />
                <Input
                  placeholder="소속/직책"
                  value={ev.affiliation ?? ''}
                  onChange={(e) => updateEvaluator(i, { affiliation: e.target.value })}
                  className="h-7 flex-[1.5] text-xs"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeEvaluator(i)}
                  className="h-7 w-7 shrink-0 text-destructive/70 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                placeholder='관심사 (예: "재무 건전성", "정량 KPI 측정")'
                value={ev.focus ?? ''}
                onChange={(e) => updateEvaluator(i, { focus: e.target.value })}
                className="h-7 text-xs"
                maxLength={300}
              />
            </div>
          ))}
          <AddButton
            onClick={addEvaluator}
            disabled={counts.evaluators >= 10}
            label={`평가위원 추가 (${counts.evaluators}/10)`}
          />
        </div>
      </CollapsibleSection>

      {/* 4. Free Notes */}
      <CollapsibleSection
        open={openSections.freeNotes}
        onToggle={() => toggle('freeNotes')}
        config={{
          key: 'freeNotes',
          label: '자유 메모',
          icon: StickyNote,
          description: '참고만 — 본문에 그대로 X (작년 운영사·경쟁 정보 등)',
          maxItems: 0,
        }}
        count={counts.freeNotes > 0 ? 1 : 0}
      >
        <Textarea
          placeholder="자유 메모 — LLM 이 본문에 안 박지만 컨텍스트로 활용. 예: 작년 운영사 디캠프 · 평가 가중치 변경 · 발주처 내부 정치 등"
          value={pmInputs.freeNotes ?? ''}
          onChange={(e) =>
            scheduleSave({ ...pmInputs, freeNotes: e.target.value || undefined })
          }
          rows={4}
          className="text-xs"
          maxLength={2000}
        />
        <p className="mt-1 text-right text-[10px] text-muted-foreground">
          {(pmInputs.freeNotes ?? '').length}/2000
        </p>
      </CollapsibleSection>
    </div>
  )
}

interface SectionConfig {
  key: string
  label: string
  icon: typeof Phone
  description: string
  maxItems: number
}

function CollapsibleSection({
  open,
  onToggle,
  config,
  count,
  children,
}: {
  open: boolean
  onToggle: () => void
  config: SectionConfig
  count: number
  children: React.ReactNode
}) {
  const Icon = config.icon
  return (
    <div className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold">{config.label}</span>
          {count > 0 && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {count}
            </span>
          )}
        </div>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="border-t border-border/60 p-2.5">
          <p className="mb-2 text-[10px] text-muted-foreground">{config.description}</p>
          {children}
        </div>
      )}
    </div>
  )
}

function AddButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void
  disabled: boolean
  label: string
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={cn('w-full text-xs', disabled && 'opacity-50')}
    >
      <Plus className="mr-1 h-3.5 w-3.5" />
      {label}
    </Button>
  )
}

function formatRelativeTime(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 5) return '방금'
  if (sec < 60) return `${sec}초 전`
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

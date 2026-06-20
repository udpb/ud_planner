'use client'

/**
 * 턴 기반 프로그램 기획 인테이크 (Client Component) — BR-3b
 *
 * 4단계 (v1.2 §01·§09):
 *   ① 토대잡기 — RFP 미리채움 + 목표 확인/수정 · 선례 · 담당자 의도 → "기획 시작"
 *   ② 갈림길  — openGates 를 카드로. 고른 값 → decisions[axis] 누적 → 재호출(턴)
 *   ③ 자동조립 — decisionLog 를 D0~D8 순서로 (decision·rationale·evidence·source 배지·conflictNote)
 *   ④ 1차안   — openGates 0건일 때 결정로그 + 구조.
 *               structure.kind==='sessions'(T1~T3) → 회차표 / 'individual'·'event'(T4/T5) → 단계 리스트.
 *               LLM 제안 수치는 인라인 편집 가능(빈칸 채우기 아님 — 확인/수정).
 *
 * 엔진은 읽기만 — 이 컴포넌트는 POST /api/projects/[id]/program-design 로 ProgramPlan 을 소비.
 * 디자인킷: radius 0, accent 면 최소(ask_human·핵심 라벨만), 킷 토큰만, rule-board.tsx 톤.
 */

import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type {
  DecisionLogEntry,
  DecisionSource,
  DecisionStep,
  NonSessionStage,
  PlanGate,
  PlanSession,
  PlanStructure,
  ProgramPlan,
} from '@/lib/program-design/plan-types'

// ─────────────────────────────────────────────────────────────────
// 미리채움 타입 (서버 컴포넌트가 RfpParsed 에서 추출)
// ─────────────────────────────────────────────────────────────────

export interface RfpPreview {
  projectName: string | null
  client: string | null
  targetAudience: string | null
  targetCount: number | null
  eduStartDate: string | null
  eduEndDate: string | null
  totalBudgetVat: number | null
  objectives: string[]
}

// ─────────────────────────────────────────────────────────────────
// 라벨 (UI 표시용 — 코드 enum 은 그대로)
// ─────────────────────────────────────────────────────────────────

const STEP_LABEL: Record<DecisionStep, string> = {
  D0: 'D0 목표',
  D1: 'D1 운영 유형',
  D2: 'D2 사전학습·선발',
  D3: 'D3 킥오프',
  D4: 'D4 본체',
  D5: 'D5 코칭',
  D6: 'D6 특강·옵션',
  D7: 'D7 발표·행사',
  D8: 'D8 검수',
}

const STEP_ORDER: DecisionStep[] = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']

const SOURCE_LABEL: Record<DecisionSource, string> = {
  precedent: '선례',
  intent: '담당자 의도',
  goal: '목표',
  rfp: 'RFP',
  human: '사람 결정',
  rule: '규칙',
}

// source 배지 — accent 는 사람/의도/선례(=토대 우선순위) 강조에만, 규칙/RFP 는 중립.
const SOURCE_STYLE: Record<DecisionSource, { bg: string; fg: string; border: string }> = {
  precedent: { bg: 'var(--accent-88)', fg: 'var(--accent)', border: 'var(--accent)' },
  intent: { bg: 'var(--accent-88)', fg: 'var(--accent)', border: 'var(--accent)' },
  human: { bg: 'var(--accent-88)', fg: 'var(--accent)', border: 'var(--accent)' },
  goal: { bg: 'var(--neutral-60)', fg: 'var(--soft-ink)', border: 'var(--line)' },
  rfp: { bg: 'var(--neutral-60)', fg: 'var(--soft-ink)', border: 'var(--line)' },
  rule: { bg: 'var(--neutral-60)', fg: 'var(--muted)', border: 'var(--line)' },
}

const GATE_REASON_LABEL: Record<PlanGate['reason'], string> = {
  ask_human: '사람 결정',
  no_approved_rule: '규칙 없음',
  ambiguous_signal: '신호 모호',
  conflict: '충돌',
}

const SESSION_KIND_LABEL: Record<PlanSession['kind'], string> = {
  theory: '이론',
  workshop: '워크숍',
  coaching: '코칭',
  event: '행사',
  milestone: '마일스톤',
  prelearning: '사전학습',
}

// ─────────────────────────────────────────────────────────────────
// 값 표시 헬퍼
// ─────────────────────────────────────────────────────────────────

function optionLabel(opt: unknown): string {
  if (opt === null || opt === undefined) return ''
  if (typeof opt === 'string' || typeof opt === 'number' || typeof opt === 'boolean') {
    return String(opt)
  }
  if (typeof opt === 'object') {
    const o = opt as Record<string, unknown>
    const label = o.label ?? o.title ?? o.name ?? o.type ?? o.value
    if (label !== undefined) return String(label)
  }
  try {
    return JSON.stringify(opt)
  } catch {
    return '(값)'
  }
}

/** 게이트 옵션 → decisions 에 저장할 값 (type/value 우선, 없으면 옵션 자체). */
function optionValue(opt: unknown): unknown {
  if (opt && typeof opt === 'object') {
    const o = opt as Record<string, unknown>
    if (o.type !== undefined) return o.type
    if (o.value !== undefined) return o.value
  }
  return opt
}

function shortText(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return '(값)'
  }
}

// ─────────────────────────────────────────────────────────────────
// 게이트 카드
// ─────────────────────────────────────────────────────────────────

function GateCard({
  gate,
  pending,
  disabled,
  onAnswer,
}: {
  gate: PlanGate
  pending: unknown
  disabled: boolean
  onAnswer: (axis: string, value: unknown) => void
}) {
  const [freeText, setFreeText] = useState('')
  const options = Array.isArray(gate.options) ? gate.options : []
  const isAskHuman = gate.reason === 'ask_human'

  return (
    <div
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--line)',
        borderLeft: isAskHuman ? '3px solid var(--accent)' : '1px solid var(--line)',
        padding: 16,
        display: 'grid',
        gap: 12,
      }}
    >
      {/* 헤더: step + reason */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
          {STEP_LABEL[gate.step]} · <span style={{ color: 'var(--soft-ink)' }}>{gate.axis}</span>
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 8px',
            border: `1px solid ${isAskHuman ? 'var(--accent)' : 'var(--line)'}`,
            background: isAskHuman ? 'var(--accent-88)' : 'transparent',
            color: isAskHuman ? 'var(--accent)' : 'var(--muted)',
          }}
        >
          {GATE_REASON_LABEL[gate.reason]}
        </span>
      </div>

      {/* 질문 */}
      <h3
        style={{
          fontSize: 15,
          fontWeight: 800,
          color: 'var(--ink)',
          lineHeight: 1.4,
          wordBreak: 'keep-all',
        }}
      >
        {gate.question}
      </h3>

      {/* why */}
      <p style={{ fontSize: 12, color: 'var(--soft-ink)', lineHeight: 1.7, wordBreak: 'keep-all' }}>
        {gate.why}
      </p>

      {/* recommended 배지 */}
      {gate.recommended !== undefined && gate.recommended !== null && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--soft-ink)',
            background: 'var(--neutral-90)',
            padding: '6px 8px',
            wordBreak: 'keep-all',
          }}
        >
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>추천</span>{' '}
          {shortText(gate.recommended)}
        </div>
      )}

      {/* 선택지 */}
      {options.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {options.map((opt, i) => {
            const val = optionValue(opt)
            const label = optionLabel(opt)
            const isRecommended =
              gate.recommended !== undefined &&
              shortText(optionValue(gate.recommended)) === shortText(val)
            const isSelected = pending !== undefined && shortText(pending) === shortText(val)
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => onAnswer(gate.axis, val)}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '6px 12px',
                  cursor: disabled ? 'default' : 'pointer',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--line)'}`,
                  background: isSelected ? 'var(--accent-88)' : 'var(--paper)',
                  color: isSelected ? 'var(--accent)' : 'var(--ink)',
                  wordBreak: 'keep-all',
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                {label || `옵션 ${i + 1}`}
                {isRecommended && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)' }}>· 추천</span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        // 선택지 없으면 자유 텍스트 응답.
        <div style={{ display: 'grid', gap: 6 }}>
          <Textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="여기에 결정 내용을 적어주세요 (예: 운영 유형 코드 또는 방향)"
            rows={2}
            disabled={disabled}
            style={{ fontSize: 13 }}
          />
          <div>
            <Button
              type="button"
              size="sm"
              disabled={disabled || freeText.trim().length === 0}
              onClick={() => onAnswer(gate.axis, freeText.trim())}
            >
              이 결정으로 진행
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 결정 로그 (③ 자동조립 / ④ 1차안 상단)
// ─────────────────────────────────────────────────────────────────

function DecisionLogList({ log }: { log: DecisionLogEntry[] }) {
  // D0~D8 순서로 정렬.
  const sorted = useMemo(() => {
    const idx = (s: DecisionStep) => STEP_ORDER.indexOf(s)
    return [...log].sort((a, b) => idx(a.step) - idx(b.step))
  }, [log])

  if (sorted.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--muted)' }}>
        아직 자동 해소된 결정이 없습니다 (승인된 규칙이 적거나 RFP 신호가 약함).
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 2, border: '1px solid var(--line)' }}>
      {sorted.map((d, i) => {
        const s = SOURCE_STYLE[d.source]
        return (
          <div
            key={`${d.axis}-${i}`}
            style={{
              background: i % 2 === 0 ? 'var(--paper)' : 'var(--neutral-90)',
              padding: '10px 14px',
              display: 'grid',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', minWidth: 64 }}>
                {STEP_LABEL[d.step]}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  background: s.bg,
                  color: s.fg,
                  border: `1px solid ${s.border}`,
                }}
              >
                {SOURCE_LABEL[d.source]}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  wordBreak: 'keep-all',
                }}
              >
                {d.decision}
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--soft-ink)', lineHeight: 1.6, wordBreak: 'keep-all' }}>
              {d.rationale}
            </p>
            <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <span>
                근거: <strong style={{ color: 'var(--soft-ink)' }}>{d.evidence.source}</strong>
              </span>
              {typeof d.evidence.n === 'number' && <span>n = {d.evidence.n}</span>}
              {d.evidence.stat && <span style={{ wordBreak: 'keep-all' }}>{d.evidence.stat}</span>}
            </div>
            {d.conflictNote && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--soft-ink)',
                  borderLeft: '2px solid var(--accent)',
                  paddingLeft: 8,
                  wordBreak: 'keep-all',
                }}
              >
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>충돌 양보: </span>
                {d.conflictNote}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 구조 (④ 1차안) — 회차표(T1~T3) vs 단계 리스트(T4/T5). 인라인 편집.
// ─────────────────────────────────────────────────────────────────

/** 인라인 편집 셀 — AI 제안 값을 사람이 확인/수정. */
function EditableCell({
  value,
  onChange,
  width,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  width?: number | string
  placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: width ?? '100%',
        fontSize: 12,
        color: 'var(--ink)',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px dashed var(--line)',
        padding: '2px 0',
        outline: 'none',
        fontFamily: 'inherit',
      }}
    />
  )
}

function SessionTableView({
  sessions,
  onEdit,
}: {
  sessions: PlanSession[]
  onEdit: (index: number, patch: Partial<PlanSession>) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 2, border: '1px solid var(--line)' }}>
      {/* 헤더 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '60px 1fr 70px 110px 80px',
          gap: 8,
          background: 'var(--ink)',
          color: 'var(--paper)',
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        <span>회차</span>
        <span>제목</span>
        <span>시간(h)</span>
        <span>형식</span>
        <span>종류</span>
      </div>
      {sessions.map((s, i) => (
        <div key={i} style={{ display: 'grid', gap: 4, background: i % 2 === 0 ? 'var(--paper)' : 'var(--neutral-90)', padding: '8px 12px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 70px 110px 80px',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <EditableCell value={s.no} onChange={(v) => onEdit(i, { no: v })} />
            <EditableCell value={s.title} onChange={(v) => onEdit(i, { title: v })} />
            <EditableCell
              value={s.hours === null ? '' : String(s.hours)}
              placeholder="—"
              onChange={(v) => {
                const n = v.trim() === '' ? null : Number(v)
                onEdit(i, { hours: n !== null && Number.isFinite(n) ? n : null })
              }}
            />
            <EditableCell value={s.format} onChange={(v) => onEdit(i, { format: v })} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {SESSION_KIND_LABEL[s.kind] ?? s.kind}
            </span>
          </div>
          {s.rationale && (
            <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, wordBreak: 'keep-all' }}>
              {s.rationale}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function StageListView({
  stages,
  kind,
  onEdit,
}: {
  stages: NonSessionStage[]
  kind: 'individual' | 'event'
  onEdit: (index: number, patch: Partial<NonSessionStage>) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p style={{ fontSize: 11, color: 'var(--muted)' }}>
        {kind === 'individual'
          ? '개별 밀착형(T4) — 회차표가 아닌 단계 구조입니다.'
          : '행사 운영형(T5) — 회차표가 아닌 행사 설계 단계입니다.'}
      </p>
      <div style={{ display: 'grid', gap: 2, border: '1px solid var(--line)' }}>
        {stages.map((st, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              gap: 12,
              background: i % 2 === 0 ? 'var(--paper)' : 'var(--neutral-90)',
              padding: '10px 14px',
              alignItems: 'start',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', minWidth: 24 }}>
              {i + 1}
            </span>
            <div style={{ display: 'grid', gap: 6 }}>
              <EditableCell value={st.label} onChange={(v) => onEdit(i, { label: v })} />
              <Textarea
                value={st.content}
                onChange={(e) => onEdit(i, { content: e.target.value })}
                rows={2}
                style={{ fontSize: 12 }}
              />
              {st.rationale && (
                <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, wordBreak: 'keep-all' }}>
                  {st.rationale}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StructureView({
  structure,
  onStructureChange,
}: {
  structure: PlanStructure
  onStructureChange: (next: PlanStructure) => void
}) {
  if (structure.kind === 'pending') {
    return (
      <p style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'keep-all' }}>{structure.note}</p>
    )
  }

  if (structure.kind === 'sessions') {
    return (
      <SessionTableView
        sessions={structure.sessions}
        onEdit={(index, patch) => {
          const next = structure.sessions.map((s, i) => (i === index ? { ...s, ...patch } : s))
          onStructureChange({ kind: 'sessions', sessions: next })
        }}
      />
    )
  }

  // individual | event
  return (
    <StageListView
      stages={structure.stages}
      kind={structure.kind}
      onEdit={(index, patch) => {
        const next = structure.stages.map((st, i) => (i === index ? { ...st, ...patch } : st))
        onStructureChange({ kind: structure.kind, stages: next })
      }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────
// 섹션 헤더
// ─────────────────────────────────────────────────────────────────

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        borderBottom: '2px solid var(--ink)',
        paddingBottom: 6,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
        }}
      >
        {kicker}
      </span>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{title}</h2>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 메인 — 턴 루프
// ─────────────────────────────────────────────────────────────────

export function ProgramDesignFlow({
  projectId,
  rfpPreview,
}: {
  projectId: string
  rfpPreview: RfpPreview
}) {
  // ① 토대잡기 입력
  const [goalText, setGoalText] = useState(rfpPreview.objectives.join('\n'))
  const [precedent, setPrecedent] = useState('')
  const [intent, setIntent] = useState('')
  const [started, setStarted] = useState(false)

  // 턴 상태
  const [decisions, setDecisions] = useState<Record<string, unknown>>({})
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, unknown>>({})
  const [plan, setPlan] = useState<ProgramPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // ④ 구조 인라인 편집 오버레이 (서버 plan 위에 사람 수정).
  const [structureOverride, setStructureOverride] = useState<PlanStructure | null>(null)

  const callEngine = useCallback(
    async (nextDecisions: Record<string, unknown>) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/projects/${projectId}/program-design`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            intent: intent.trim() ? { summary: intent.trim() } : undefined,
            precedent: precedent.trim() ? { summary: precedent.trim() } : undefined,
            // 목표 확인/수정 텍스트는 의도와 분리해 decisions['goalNote'] 로 함께 전달
            // (엔진은 모르는 축이면 무시 — 게이트 응답만 해소에 쓰임).
            decisions: nextDecisions,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`)
        }
        const nextPlan = data.plan as ProgramPlan
        setPlan(nextPlan)
        setStructureOverride(null)
        setPendingAnswers({})
        if (nextPlan.openGates.length === 0) {
          toast.success('1차안 완성 — 결정 로그와 구조를 확인하세요.')
        } else {
          toast.success(`다음 갈림길 ${nextPlan.openGates.length}건 — 결정 후 진행됩니다.`)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error('기획 생성 실패: ' + msg.slice(0, 160))
      } finally {
        setLoading(false)
      }
    },
    [projectId, intent, precedent],
  )

  const handleStart = useCallback(() => {
    setStarted(true)
    // 목표 확인/수정 텍스트를 goalNote 로 동봉 (엔진이 모르면 무시 — 잡음 0).
    const seed: Record<string, unknown> = {}
    if (goalText.trim()) seed.goalNote = goalText.trim()
    setDecisions(seed)
    void callEngine(seed)
  }, [goalText, callEngine])

  const handleAnswer = useCallback(
    (axis: string, value: unknown) => {
      // 선택 즉시 pending 표시 후 누적 재호출 (턴 진행).
      setPendingAnswers((p) => ({ ...p, [axis]: value }))
      const next = { ...decisions, [axis]: value }
      setDecisions(next)
      void callEngine(next)
    },
    [decisions, callEngine],
  )

  const handleSave = useCallback(async () => {
    if (!plan || plan.openGates.length > 0) return
    setSaving(true)
    try {
      // 인라인 편집이 있으면 그 구조로 저장 (서버는 plan 을 다시 만들지만,
      // 저장 payload 는 사람이 본 최종안 — 여기선 단순화: 서버 재호출 후 저장).
      const res = await fetch(`/api/projects/${projectId}/program-design`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          intent: intent.trim() ? { summary: intent.trim() } : undefined,
          precedent: precedent.trim() ? { summary: precedent.trim() } : undefined,
          decisions,
          save: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`)
      toast.success('1차안을 저장했습니다.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('저장 실패: ' + msg.slice(0, 160))
    } finally {
      setSaving(false)
    }
  }, [plan, projectId, intent, precedent, decisions])

  const effectiveStructure = structureOverride ?? plan?.structure ?? null
  const hasGates = !!plan && plan.openGates.length > 0
  const isDraftReady = !!plan && plan.openGates.length === 0

  // ── ① 토대잡기 (시작 전) ──
  if (!started) {
    return (
      <div style={{ display: 'grid', gap: 24, maxWidth: 880 }}>
        <section style={{ display: 'grid', gap: 12 }}>
          <SectionTitle kicker="STEP 1" title="토대잡기 — RFP 위에서 시작" />

          {/* RFP 미리채움 (틴트박스 그리드) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 2,
              border: '1px solid var(--line)',
            }}
          >
            {[
              { label: '사업', value: rfpPreview.projectName ?? '—' },
              { label: '발주', value: rfpPreview.client ?? '—' },
              {
                label: '대상',
                value:
                  (rfpPreview.targetAudience ?? '—') +
                  (rfpPreview.targetCount ? ` / ${rfpPreview.targetCount}명` : ''),
              },
              {
                label: '교육 기간',
                value:
                  rfpPreview.eduStartDate || rfpPreview.eduEndDate
                    ? `${rfpPreview.eduStartDate ?? '?'} ~ ${rfpPreview.eduEndDate ?? '?'}`
                    : '—',
              },
            ].map((cell, i) => (
              <div
                key={cell.label}
                style={{ background: i % 2 === 0 ? 'var(--paper)' : 'var(--neutral-90)', padding: '10px 14px' }}
              >
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{cell.label}</div>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 700, wordBreak: 'keep-all' }}>
                  {cell.value}
                </div>
              </div>
            ))}
          </div>

          {/* 목표 확인/수정 */}
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
              목표 확인 · 수정{' '}
              <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(RFP 에서 읽은 목표 — 필요 시 고치세요)</span>
            </label>
            <Textarea
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              rows={3}
              placeholder="이 프로그램이 달성해야 할 목표"
              style={{ fontSize: 13 }}
            />
          </div>

          {/* 선례 */}
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
              선례{' '}
              <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(이전에 비슷한 거 했으면 — 어떻게 운영했는지)</span>
            </label>
            <Textarea
              value={precedent}
              onChange={(e) => setPrecedent(e.target.value)}
              rows={2}
              placeholder="작년/지난번에는 어떻게 진행했는지 (있으면)"
              style={{ fontSize: 13 }}
            />
          </div>

          {/* 담당자 의도 */}
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
              담당자 운영 의도{' '}
              <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(꼭 지키고 싶은 운영 방식 — 있으면)</span>
            </label>
            <Textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={2}
              placeholder="예: 킥오프는 길게, 코칭은 후반에 몰아서"
              style={{ fontSize: 13 }}
            />
          </div>

          <div>
            <Button type="button" onClick={handleStart} disabled={loading}>
              {loading ? '엔진 호출 중…' : '기획 시작'}
            </Button>
          </div>
        </section>
      </div>
    )
  }

  // ── ②③④ 턴 진행 ──
  return (
    <div style={{ display: 'grid', gap: 28, maxWidth: 880 }}>
      {/* 진행 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => setStarted(false)}>
          ← 토대잡기 수정
        </Button>
        {plan?.operatingType && (
          <span style={{ fontSize: 12, color: 'var(--soft-ink)' }}>
            운영 유형: <strong style={{ fontWeight: 700 }}>{plan.operatingType}</strong>
          </span>
        )}
        {plan && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            승인 규칙 {plan.meta.approvedRuleCount}/{plan.meta.totalRuleCount} ·{' '}
            {hasGates ? `갈림길 ${plan.openGates.length}건` : '1차안 완성'}
          </span>
        )}
        {loading && <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>처리 중…</span>}
      </div>

      {/* ② 갈림길 (게이트) */}
      {hasGates && (
        <section style={{ display: 'grid', gap: 12 }}>
          <SectionTitle kicker="STEP 2" title="큰 갈림길 — 사람이 결정" />
          <p style={{ fontSize: 12, color: 'var(--soft-ink)', lineHeight: 1.6, wordBreak: 'keep-all' }}>
            엔진이 자동으로 정하기엔 모호한 결정만 묻습니다. 고르면 다음 턴으로 진행됩니다.
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            {plan!.openGates.map((gate, i) => (
              <GateCard
                key={`${gate.axis}-${i}`}
                gate={gate}
                pending={pendingAnswers[gate.axis]}
                disabled={loading}
                onAnswer={handleAnswer}
              />
            ))}
          </div>
        </section>
      )}

      {/* ③ 자동조립 — 결정 로그 (게이트 진행 중에도 누적분 표시) */}
      {plan && plan.decisionLog.length > 0 && (
        <section style={{ display: 'grid', gap: 12 }}>
          <SectionTitle
            kicker={isDraftReady ? 'STEP 4 · 결정 로그' : 'STEP 3'}
            title={isDraftReady ? '확정된 설계 결정' : '자동으로 정한 결정 (안 물어본 것 + 이유)'}
          />
          <DecisionLogList log={plan.decisionLog} />
        </section>
      )}

      {/* ④ 1차안 — 구조 (게이트 0건일 때만) */}
      {isDraftReady && effectiveStructure && (
        <section style={{ display: 'grid', gap: 12 }}>
          <SectionTitle kicker="STEP 4 · 구조" title="프로그램 구조 (수치 수정 가능)" />
          <p style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'keep-all' }}>
            AI 가 제안한 값입니다 — 빈칸을 채우는 게 아니라 확인·수정하세요 (밑줄 셀 클릭).
            {plan?.meta.model ? ` · 모델: ${plan.meta.model}` : ''}
          </p>
          <StructureView structure={effectiveStructure} onStructureChange={setStructureOverride} />

          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <Button type="button" disabled={saving || loading} onClick={handleSave}>
              {saving ? '저장 중…' : '1차안 저장'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void callEngine(decisions)}
            >
              구조 다시 생성
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

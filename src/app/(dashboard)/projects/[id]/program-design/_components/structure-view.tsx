'use client'

/**
 * BR-3c / BR-WS-4 — 구조 뷰: 회차 타임라인(T1~T3) vs 단계 리스트(T4/T5)
 *
 *   - structure.kind==='sessions' (T1~T3) → 회차를 **kind별 색 타임라인**
 *     (이론/워크숍/코칭/행사/마일스톤/사전학습). 좌측 색 레일 + 회차 노드.
 *   - structure.kind==='individual'|'event' (T4/T5) → **단계 리스트** (회차표 강요 금지).
 *   - structure.kind==='pending' → note.
 *
 * 수치는 AI 제안값 — 인라인 편집(확인·수정). BR-3b 의 편집 동작 보존.
 *
 * BR-WS-4 (결함3 재배치): PM 이 직접 회차/단계를 재배치한다.
 *   - 순서변경: ↑↓ 버튼 (HTML5 draggable 대신 접근성·키보드 친화 — 라이브러리 0).
 *   - 추가/삭제: + 회차 추가 / 휴지통.
 *   - 종류변경(회차): kind 드롭다운(6종) → 색 레일 자동 반영.
 *   전부 `onStructureChange(next)` 로 상위 반영 (저장은 캔버스의 handleSave 경로).
 *   ⚠️ plan-types.ts 계약 수정 0 — 기존 PlanSession[]/NonSessionStage[] 의 순서·길이 조작만.
 *
 * 디자인킷: radius 0, kind 색은 accent 1개 + dark 위계 (시안/구 그라데이션 금지),
 *   틴트박스 그리드 톤. 핸들 아이콘은 lucide.
 */

import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react'

import { Textarea } from '@/components/ui/textarea'
import type {
  NonSessionStage,
  PlanSession,
  PlanStructure,
} from '@/lib/program-design/plan-types'

// ── 회차 종류 라벨 + 색 (kind별) ──
// accent 1개 + dark 위계만 (디자인킷 — 시안·구 그라데이션 금지).
//   이론/사전학습 = 다크 계열(차분) / 워크숍·실행 = accent(핵심) / 코칭 = accent-52(연한 강조)
//   / 발표·마일스톤 = ink(앵커).
const SESSION_KIND: Record<
  PlanSession['kind'],
  { label: string; color: string }
> = {
  prelearning: { label: '사전학습', color: 'var(--muted)' },
  theory: { label: '이론', color: 'var(--dark-25)' },
  workshop: { label: '워크숍', color: 'var(--accent)' },
  coaching: { label: '코칭', color: 'var(--accent-52)' },
  event: { label: '행사', color: 'var(--ink)' },
  milestone: { label: '마일스톤', color: 'var(--ink)' },
}

/** kind 드롭다운 옵션 순서 (PlanSession['kind'] 6종). */
const SESSION_KIND_ORDER: PlanSession['kind'][] = [
  'prelearning',
  'theory',
  'workshop',
  'coaching',
  'event',
  'milestone',
]

/** 배열 원소 i 를 dir(-1 위 / +1 아래) 로 이동한 새 배열 (불변). 경계면 원본 그대로. */
function moveItem<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= arr.length) return arr
  const next = arr.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

// ── 재배치 핸들 버튼 (↑↓·삭제) — 라이브러리 0, lucide 아이콘만 ──
function HandleButton({
  label,
  disabled,
  onClick,
  children,
  danger,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        padding: 0,
        background: 'transparent',
        border: '1px solid var(--line)',
        color: disabled ? 'var(--line)' : danger ? 'var(--accent)' : 'var(--soft-ink)',
        cursor: disabled ? 'default' : 'pointer',
        lineHeight: 0,
      }}
    >
      {children}
    </button>
  )
}

/** 인라인 편집 셀 — AI 제안 값을 사람이 확인·수정 (밑줄 셀). */
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
        fontSize: 13,
        fontWeight: 700,
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

// ─────────────────────────────────────────────────────────────────
// T1~T3 — 회차 타임라인 (kind별 색) + 재배치(BR-WS-4)
// ─────────────────────────────────────────────────────────────────

/** 새 회차 기본값 (브리프: kind 'workshop'·hours null·rationale ''). */
function newSession(index: number): PlanSession {
  return {
    no: `W${index + 1}`,
    title: '',
    hours: null,
    format: '',
    kind: 'workshop',
    rationale: '',
  }
}

function SessionTimeline({
  sessions,
  onChange,
}: {
  sessions: PlanSession[]
  /** 회차 배열 전체 교체 (편집·순서변경·추가·삭제 공통 — 상위가 structure 로 감쌈). */
  onChange: (next: PlanSession[]) => void
}) {
  const edit = (index: number, patch: Partial<PlanSession>) =>
    onChange(sessions.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* 범례 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: 'var(--muted)' }}>
        {Object.entries(SESSION_KIND).map(([k, v]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, background: v.color, display: 'inline-block' }} />
            {v.label}
          </span>
        ))}
      </div>

      {/* 타임라인 — 좌 색 레일 + 회차 노드 */}
      <div style={{ display: 'grid', gap: 2 }}>
        {sessions.map((s, i) => {
          const meta = SESSION_KIND[s.kind] ?? { label: s.kind, color: 'var(--muted)' }
          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '6px max-content max-content 1fr',
                gap: 12,
                background: i % 2 === 0 ? 'var(--paper)' : 'var(--neutral-90)',
                borderLeft: '1px solid var(--line)',
                borderRight: '1px solid var(--line)',
                borderTop: i === 0 ? '1px solid var(--line)' : 'none',
                borderBottom: i === sessions.length - 1 ? '1px solid var(--line)' : 'none',
                padding: '10px 14px 10px 0',
                alignItems: 'start',
              }}
            >
              {/* kind 색 레일 */}
              <span style={{ background: meta.color, width: 6, alignSelf: 'stretch' }} aria-hidden />

              {/* 재배치 핸들 (↑↓·삭제) */}
              <div
                style={{
                  display: 'grid',
                  gap: 3,
                  justifyItems: 'center',
                  paddingTop: 2,
                  color: 'var(--muted)',
                }}
              >
                <GripVertical size={14} aria-hidden style={{ color: 'var(--line)' }} />
                <HandleButton
                  label="위로 이동"
                  disabled={i === 0}
                  onClick={() => onChange(moveItem(sessions, i, -1))}
                >
                  <ChevronUp size={14} />
                </HandleButton>
                <HandleButton
                  label="아래로 이동"
                  disabled={i === sessions.length - 1}
                  onClick={() => onChange(moveItem(sessions, i, 1))}
                >
                  <ChevronDown size={14} />
                </HandleButton>
                <HandleButton
                  label="회차 삭제"
                  danger
                  onClick={() => onChange(sessions.filter((_, k) => k !== i))}
                >
                  <Trash2 size={13} />
                </HandleButton>
              </div>

              {/* 회차 번호 + kind 드롭다운 */}
              <div style={{ display: 'grid', gap: 6, justifyItems: 'start', minWidth: 72, paddingTop: 2 }}>
                <EditableCell value={s.no} onChange={(v) => edit(i, { no: v })} width={56} />
                <select
                  value={s.kind}
                  aria-label="회차 종류"
                  onChange={(e) => edit(i, { kind: e.target.value as PlanSession['kind'] })}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 4px',
                    color: meta.color,
                    border: `1px solid ${meta.color}`,
                    background: 'var(--paper)',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {SESSION_KIND_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {SESSION_KIND[k].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 제목 + 형식/시간 + rationale */}
              <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                <EditableCell value={s.title} onChange={(v) => edit(i, { title: v })} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    형식
                    <EditableCell value={s.format} onChange={(v) => edit(i, { format: v })} width={120} />
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    시간(h)
                    <EditableCell
                      value={s.hours === null ? '' : String(s.hours)}
                      placeholder="—"
                      width={44}
                      onChange={(v) => {
                        const n = v.trim() === '' ? null : Number(v)
                        edit(i, { hours: n !== null && Number.isFinite(n) ? n : null })
                      }}
                    />
                  </span>
                </div>
                {s.rationale && (
                  <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, wordBreak: 'keep-all' }}>
                    {s.rationale}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 회차 추가 */}
      <div>
        <button
          type="button"
          onClick={() => onChange([...sessions, newSession(sessions.length)])}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--accent)',
            background: 'transparent',
            border: '1px dashed var(--accent)',
            padding: '6px 12px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Plus size={14} />
          회차 추가
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// T4/T5 — 단계 리스트 (회차표 아님) + 재배치(BR-WS-4)
// ─────────────────────────────────────────────────────────────────

/** 새 단계 기본값. */
function newStage(): NonSessionStage {
  return { label: '', content: '', rationale: '' }
}

function StageList({
  stages,
  kind,
  onChange,
}: {
  stages: NonSessionStage[]
  kind: 'individual' | 'event'
  /** 단계 배열 전체 교체 (편집·순서변경·추가·삭제 공통). */
  onChange: (next: NonSessionStage[]) => void
}) {
  const edit = (index: number, patch: Partial<NonSessionStage>) =>
    onChange(stages.map((st, i) => (i === index ? { ...st, ...patch } : st)))

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--soft-ink)',
          background: 'var(--neutral-90)',
          borderLeft: '3px solid var(--accent)',
          padding: '8px 12px',
          wordBreak: 'keep-all',
        }}
      >
        {kind === 'individual'
          ? '개별 밀착형 — 회차표가 아닌 단계 구조입니다 (개별 사업체마다 일정이 달라 정기 회차표를 만들지 않습니다).'
          : '행사 운영형 — 회차표가 아닌 행사 설계 단계입니다 (본체가 커리큘럼이 아니라 행사 설계입니다).'}
      </div>
      <div style={{ display: 'grid', gap: 2, border: '1px solid var(--line)' }}>
        {stages.map((st, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: 'max-content max-content 1fr',
              gap: 14,
              background: i % 2 === 0 ? 'var(--paper)' : 'var(--neutral-90)',
              padding: '12px 16px',
              alignItems: 'start',
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: 'var(--accent)',
                minWidth: 28,
                lineHeight: 1.4,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            {/* 재배치 핸들 */}
            <div style={{ display: 'grid', gap: 3, justifyItems: 'center', paddingTop: 2 }}>
              <HandleButton
                label="위로 이동"
                disabled={i === 0}
                onClick={() => onChange(moveItem(stages, i, -1))}
              >
                <ChevronUp size={14} />
              </HandleButton>
              <HandleButton
                label="아래로 이동"
                disabled={i === stages.length - 1}
                onClick={() => onChange(moveItem(stages, i, 1))}
              >
                <ChevronDown size={14} />
              </HandleButton>
              <HandleButton
                label="단계 삭제"
                danger
                onClick={() => onChange(stages.filter((_, k) => k !== i))}
              >
                <Trash2 size={13} />
              </HandleButton>
            </div>
            <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <EditableCell value={st.label} onChange={(v) => edit(i, { label: v })} />
              <Textarea
                value={st.content}
                onChange={(e) => edit(i, { content: e.target.value })}
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
      {/* 단계 추가 */}
      <div>
        <button
          type="button"
          onClick={() => onChange([...stages, newStage()])}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--accent)',
            background: 'transparent',
            border: '1px dashed var(--accent)',
            padding: '6px 12px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Plus size={14} />
          단계 추가
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// StructureView — 분기 라우터
// ─────────────────────────────────────────────────────────────────

export function StructureView({
  structure,
  onStructureChange,
}: {
  structure: PlanStructure
  onStructureChange: (next: PlanStructure) => void
}) {
  if (structure.kind === 'pending') {
    return <p style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'keep-all' }}>{structure.note}</p>
  }

  if (structure.kind === 'sessions') {
    return (
      <SessionTimeline
        sessions={structure.sessions}
        onChange={(next) => onStructureChange({ kind: 'sessions', sessions: next })}
      />
    )
  }

  // individual | event — 단계 리스트 (회차표 강요 금지).
  return (
    <StageList
      stages={structure.stages}
      kind={structure.kind}
      onChange={(next) => onStructureChange({ kind: structure.kind, stages: next })}
    />
  )
}

'use client'

/**
 * BR-3c — 구조 뷰: 회차 타임라인(T1~T3) vs 단계 리스트(T4/T5)
 *
 *   - structure.kind==='sessions' (T1~T3) → 회차를 **kind별 색 타임라인**
 *     (이론/워크숍/코칭/행사/마일스톤/사전학습). 좌측 색 레일 + 회차 노드.
 *   - structure.kind==='individual'|'event' (T4/T5) → **단계 리스트** (회차표 강요 금지).
 *   - structure.kind==='pending' → note.
 *
 * 수치는 AI 제안값 — 인라인 편집(확인·수정). BR-3b 의 편집 동작 보존.
 * 디자인킷: radius 0, kind 색은 accent 1개 + dark 위계 (시안/구 그라데이션 금지),
 *   틴트박스 그리드 톤.
 */

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
// T1~T3 — 회차 타임라인 (kind별 색)
// ─────────────────────────────────────────────────────────────────

function SessionTimeline({
  sessions,
  onEdit,
}: {
  sessions: PlanSession[]
  onEdit: (index: number, patch: Partial<PlanSession>) => void
}) {
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
                gridTemplateColumns: '6px max-content 1fr',
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

              {/* 회차 번호 + kind 칩 */}
              <div style={{ display: 'grid', gap: 6, justifyItems: 'start', minWidth: 64, paddingTop: 2 }}>
                <EditableCell value={s.no} onChange={(v) => onEdit(i, { no: v })} width={56} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    color: meta.color,
                    border: `1px solid ${meta.color}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {meta.label}
                </span>
              </div>

              {/* 제목 + 형식/시간 + rationale */}
              <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                <EditableCell value={s.title} onChange={(v) => onEdit(i, { title: v })} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    형식
                    <EditableCell value={s.format} onChange={(v) => onEdit(i, { format: v })} width={120} />
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    시간(h)
                    <EditableCell
                      value={s.hours === null ? '' : String(s.hours)}
                      placeholder="—"
                      width={44}
                      onChange={(v) => {
                        const n = v.trim() === '' ? null : Number(v)
                        onEdit(i, { hours: n !== null && Number.isFinite(n) ? n : null })
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
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// T4/T5 — 단계 리스트 (회차표 아님)
// ─────────────────────────────────────────────────────────────────

function StageList({
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
              gridTemplateColumns: 'max-content 1fr',
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
            <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
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
        onEdit={(index, patch) => {
          const next = structure.sessions.map((s, i) => (i === index ? { ...s, ...patch } : s))
          onStructureChange({ kind: 'sessions', sessions: next })
        }}
      />
    )
  }

  // individual | event — 단계 리스트 (회차표 강요 금지).
  return (
    <StageList
      stages={structure.stages}
      kind={structure.kind}
      onEdit={(index, patch) => {
        const next = structure.stages.map((st, i) => (i === index ? { ...st, ...patch } : st))
        onStructureChange({ kind: structure.kind, stages: next })
      }}
    />
  )
}

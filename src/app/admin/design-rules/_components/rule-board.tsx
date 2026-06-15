'use client'

/**
 * /admin/design-rules 검수 보드 (Client Component) — BR-2
 *
 * 서버 컴포넌트가 loadDesignRules() 한 규칙 배열을 받아:
 *  - ruleType 별 그룹(A~G + Z) 헤더 + 카운트
 *  - 각 규칙 카드: condition / recommend(펼침) / rationale / evidence / confidence 막대 /
 *    decisionPolicy 배지 / status 배지
 *  - 승인 / 반려 / 메모 액션 → PATCH /api/admin/design-rules/[id] → 낙관적 갱신 + toast
 *  - 상단 진행 요약 (approved / draft / rejected)
 *
 * 디자인킷 260529: radius 0, accent 면적 최소(confidence 막대·ask_human 라벨만),
 *   틴트박스 그리드(gap 2px + 셀 배경 교차), 킷 토큰만(--accent/--ink/--paper/--muted/--line).
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type {
  DesignRule,
  RuleStatus,
  RuleType,
  DecisionPolicy,
} from '@/lib/program-design/design-rule'

// ─────────────────────────────────────────────────────────────────
// 라벨 (UI 표시용 — 코드 enum 은 그대로)
// ─────────────────────────────────────────────────────────────────

const RULE_TYPE_ORDER: RuleType[] = [
  'A_operatingType',
  'B_typeProfile',
  'C_flowGrammar',
  'D_budgetStructure',
  'E_immersionSet',
  'F_audienceDefault',
  'G_inputGate',
  'Z_meta',
]

const RULE_TYPE_LABEL: Record<RuleType, { code: string; ko: string }> = {
  A_operatingType: { code: 'A', ko: '운영 유형' },
  B_typeProfile: { code: 'B', ko: '유형 프로파일' },
  C_flowGrammar: { code: 'C', ko: '흐름 문법' },
  D_budgetStructure: { code: 'D', ko: '예산 구조' },
  E_immersionSet: { code: 'E', ko: '몰입 세트' },
  F_audienceDefault: { code: 'F', ko: '대상 기본값' },
  G_inputGate: { code: 'G', ko: '입력 게이트' },
  Z_meta: { code: 'Z', ko: '메타' },
}

const DIMENSION_LABEL: Record<string, string> = {
  always: '항상',
  operatingType: '운영유형',
  channel: '채널',
  targetStage: '단계',
  demographic: '대상',
  budgetBand: '예산대',
  goalType: '목표유형',
}

const POLICY_LABEL: Record<DecisionPolicy, string> = {
  auto: '자동 적용',
  ask_human: '사람 결정 게이트',
  auto_unless_conflict: '자동 (충돌 시 양보)',
}

const STATUS_LABEL: Record<RuleStatus, string> = {
  draft: '검토 대기',
  approved: '승인',
  rejected: '반려',
}

// 상태 배지 색 — SKILL §7 팔레트 (DRAFT=yellow / approved=green / rejected=red).
const STATUS_STYLE: Record<RuleStatus, { bg: string; fg: string; border: string }> = {
  draft: { bg: '#FEF7E6', fg: '#8A6D1A', border: '#E8D9A8' },
  approved: { bg: '#E8F3EC', fg: '#2E6B43', border: '#BCDCC6' },
  rejected: { bg: '#FBE9E7', fg: '#B23A2E', border: '#EBC3BD' },
}

// ─────────────────────────────────────────────────────────────────
// recommend.value 펼침 (객체/트리/세트를 보기 좋게)
// ─────────────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function formatScalar(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

/** recommend.value 를 key: value 행으로 펼친다 (1단계 + 중첩은 JSON pretty). */
function RecommendValue({ value }: { value: unknown }) {
  if (value === undefined) {
    return <span style={{ color: 'var(--muted)' }}>—</span>
  }
  if (!isPlainObject(value)) {
    return <span style={{ color: 'var(--soft-ink)' }}>{formatScalar(value)}</span>
  }
  const entries = Object.entries(value)
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {entries.map(([k, v]) => (
        <div
          key={k}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(120px, max-content) 1fr',
            gap: 8,
            background: 'var(--neutral-90)',
            padding: '4px 8px',
          }}
        >
          <span
            style={{
              color: 'var(--muted)',
              fontSize: 12,
              fontWeight: 600,
              wordBreak: 'keep-all',
            }}
          >
            {k}
          </span>
          <span style={{ color: 'var(--soft-ink)', fontSize: 12, lineHeight: 1.6 }}>
            {isPlainObject(v) || Array.isArray(v) ? (
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                  fontSize: 12,
                }}
              >
                {JSON.stringify(v, null, 2)}
              </pre>
            ) : (
              formatScalar(v)
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// confidence 막대
// ─────────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          position: 'relative',
          width: 88,
          height: 6,
          background: 'var(--neutral-30)',
        }}
        aria-hidden
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${pct}%`,
            background: 'var(--accent)',
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 30 }}>
        {pct}%
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 규칙 카드
// ─────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  busy,
  onAction,
}: {
  rule: DesignRule
  busy: boolean
  onAction: (status: RuleStatus, reviewerNote?: string) => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(rule.reviewerNote ?? '')

  const s = STATUS_STYLE[rule.status]
  const isGate = rule.decisionPolicy === 'ask_human'

  const matchLabel = rule.condition.match
    ? Array.isArray(rule.condition.match)
      ? rule.condition.match.join(', ')
      : rule.condition.match
    : null

  return (
    <div
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--line)',
        padding: 16,
        display: 'grid',
        gap: 12,
      }}
    >
      {/* 헤더: id + 상태 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
              color: 'var(--muted)',
              letterSpacing: '0.02em',
            }}
          >
            {rule.id}
          </span>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: 'var(--ink)',
              lineHeight: 1.4,
              wordBreak: 'keep-all',
            }}
          >
            {rule.title}
          </h3>
        </div>
        <span
          style={{
            flexShrink: 0,
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 8px',
            background: s.bg,
            color: s.fg,
            border: `1px solid ${s.border}`,
          }}
        >
          {STATUS_LABEL[rule.status]}
        </span>
      </div>

      {/* 정책 + 조건 메타 행 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {/* decisionPolicy — ask_human 만 accent 강조 */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 8px',
            border: `1px solid ${isGate ? 'var(--accent)' : 'var(--line)'}`,
            background: isGate ? 'var(--accent-88)' : 'transparent',
            color: isGate ? 'var(--accent)' : 'var(--muted)',
          }}
          title={`decisionPolicy: ${rule.decisionPolicy}`}
        >
          {POLICY_LABEL[rule.decisionPolicy]}
        </span>
        {/* 조건 */}
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          조건:{' '}
          <strong style={{ color: 'var(--soft-ink)', fontWeight: 700 }}>
            {DIMENSION_LABEL[rule.condition.dimension] ?? rule.condition.dimension}
          </strong>
          {matchLabel ? (
            <span style={{ color: 'var(--soft-ink)' }}> = {matchLabel}</span>
          ) : null}
        </span>
        {/* confidence */}
        <div style={{ marginLeft: 'auto' }}>
          <ConfidenceBar value={rule.confidence} />
        </div>
      </div>

      {/* recommend */}
      <div style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
          권장 ({rule.recommend.kind}) → {rule.recommend.target}
        </span>
        <RecommendValue value={rule.recommend.value} />
      </div>

      {/* rationale */}
      <p style={{ fontSize: 13, color: 'var(--soft-ink)', lineHeight: 1.7, wordBreak: 'keep-all' }}>
        {rule.rationale}
      </p>

      {/* evidence */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--muted)',
          background: 'var(--neutral-90)',
          padding: '6px 8px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <span>
          근거: <strong style={{ color: 'var(--soft-ink)' }}>{rule.evidence.source}</strong>
        </span>
        {typeof rule.evidence.n === 'number' && <span>n = {rule.evidence.n}</span>}
        {rule.evidence.stat && (
          <span style={{ wordBreak: 'keep-all' }}>{rule.evidence.stat}</span>
        )}
      </div>

      {/* 기존 reviewerNote */}
      {rule.reviewerNote && !noteOpen && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--soft-ink)',
            borderLeft: '2px solid var(--ink)',
            paddingLeft: 8,
          }}
        >
          <span style={{ color: 'var(--muted)', fontWeight: 700 }}>검수 메모: </span>
          {rule.reviewerNote}
        </div>
      )}

      {/* 메모 입력 */}
      {noteOpen && (
        <div style={{ display: 'grid', gap: 6 }}>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="검수 메모 (반려 사유·수정 요청 등)"
            rows={2}
            disabled={busy}
            style={{ fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onAction(rule.status, note)}
            >
              메모 저장
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setNote(rule.reviewerNote ?? '')
                setNoteOpen(false)
              }}
            >
              취소
            </Button>
          </div>
        </div>
      )}

      {/* 액션 */}
      {!noteOpen && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
          <Button
            type="button"
            size="sm"
            disabled={busy || rule.status === 'approved'}
            onClick={() => onAction('approved')}
          >
            승인
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || rule.status === 'rejected'}
            onClick={() => onAction('rejected', note || undefined)}
          >
            반려
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setNoteOpen(true)}
          >
            메모
          </Button>
          {rule.status !== 'draft' && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onAction('draft')}
            >
              대기로 되돌리기
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 보드 (전체)
// ─────────────────────────────────────────────────────────────────

export function RuleBoard({ initialRules }: { initialRules: DesignRule[] }) {
  const [rules, setRules] = useState<DesignRule[]>(initialRules)
  const [busyId, setBusyId] = useState<string | null>(null)

  const summary = useMemo(() => {
    const c = { approved: 0, draft: 0, rejected: 0 }
    for (const r of rules) c[r.status] += 1
    return c
  }, [rules])

  const grouped = useMemo(() => {
    const m = new Map<RuleType, DesignRule[]>()
    for (const t of RULE_TYPE_ORDER) m.set(t, [])
    for (const r of rules) {
      const arr = m.get(r.ruleType)
      if (arr) arr.push(r)
    }
    return m
  }, [rules])

  async function handleAction(id: string, status: RuleStatus, reviewerNote?: string) {
    const prev = rules
    // 낙관적 갱신.
    setBusyId(id)
    setRules((rs) =>
      rs.map((r) =>
        r.id === id
          ? { ...r, status, ...(reviewerNote !== undefined ? { reviewerNote: reviewerNote || undefined } : {}) }
          : r,
      ),
    )
    try {
      const body: { status: RuleStatus; reviewerNote?: string } = { status }
      if (reviewerNote !== undefined) body.reviewerNote = reviewerNote
      const r = await fetch(`/api/admin/design-rules/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`)
      // 서버 권위 값으로 동기화 (reviewerNote 제거 등 반영).
      setRules((rs) => rs.map((x) => (x.id === id ? (data.rule as DesignRule) : x)))
      toast.success(
        status === 'approved'
          ? '승인됨 — BR-3 생성기 소비 대상에 합류'
          : status === 'rejected'
            ? '반려됨'
            : status === 'draft'
              ? '검토 대기로 되돌림'
              : '저장됨',
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setRules(prev) // 롤백.
      toast.error('저장 실패: ' + msg.slice(0, 120))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* 진행 요약 — 틴트박스 그리드 (gap 2px) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 2,
          border: '1px solid var(--line)',
        }}
      >
        {[
          { label: '전체', value: rules.length, bg: 'var(--paper)' },
          { label: '승인', value: summary.approved, bg: 'var(--neutral-90)' },
          { label: '검토 대기', value: summary.draft, bg: 'var(--paper)' },
          { label: '반려', value: summary.rejected, bg: 'var(--neutral-90)' },
        ].map((cell) => (
          <div key={cell.label} style={{ background: cell.bg, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
              {cell.label}
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: 'var(--ink)',
                fontFamily: 'var(--font-num, inherit)',
              }}
            >
              {cell.value}
            </div>
          </div>
        ))}
      </div>

      {/* 그룹별 규칙 */}
      {RULE_TYPE_ORDER.map((t) => {
        const list = grouped.get(t) ?? []
        if (list.length === 0) return null
        const lab = RULE_TYPE_LABEL[t]
        return (
          <section key={t} style={{ display: 'grid', gap: 12 }}>
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
                  fontFamily: 'var(--font-num, inherit)',
                  fontSize: 18,
                  fontWeight: 800,
                  color: 'var(--accent)',
                }}
              >
                {lab.code}
              </span>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
                {lab.ko}
              </h2>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{list.length}건</span>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {list.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  busy={busyId === rule.id}
                  onAction={(status, note) => handleAction(rule.id, status, note)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

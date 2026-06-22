'use client'

/**
 * ②기획의도 (PlanningIntent) — 하이브리드 카드 (BR-WS-3, 재설계 v1 §5 ②)
 *
 * "맥락의 못": RFP→바로 커리큘럼으로 가서 딱딱하게 떨어지던 문제(진단1)의 해결.
 * 하이브리드:
 *   1. AI 가 4카드 초안(목표해석·작년대비·차별점·리스크)을 깐다 — 각 confidence.
 *   2. confidence=low(또는 빈) 카드 = "?" 핀 → PM 이 **대화**로 채운다.
 *   3. PM 은 카드를 직접 편집해도 된다(§3 원칙2 — AI 는 깔고 PM 이 결정).
 *   4. "확정 → 커리큘럼 반영" → PUT 저장(strategicNotes) → ③의 '왜'로 내려감.
 *
 * 디자인킷 260529: accent #F05519 1개 · radius 0 · 틴트/보더 박스 · NanumHuman/Poppins.
 * 점수·게이트 없음(진단3). 강제값 0 — 전부 default.
 *
 * 마운트: ProgramWorkspace 의 'design' stage content 최상단(additive, ProgramDesignFlow 위).
 * 이 컴포넌트는 server-only planning-intent.ts 에서 **타입만** import(런타임 미포함).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

import type {
  PlanningIntentDraft,
  IntentFieldKey,
  IntentCard,
} from '@/lib/program-design/planning-intent'

// ─────────────────────────────────────────────────────────────────
// 카드 메타 (라벨·설명·매핑 표시)
// ─────────────────────────────────────────────────────────────────

interface CardMeta {
  key: IntentFieldKey
  kicker: string
  title: string
  hint: string
  /** 대화 입력 placeholder. */
  prompt: string
}

const CARD_META: CardMeta[] = [
  {
    key: 'goalInterpretation',
    kicker: '목표 해석',
    title: 'RFP 목표를 우리 관점으로',
    hint: 'RFP 가 말한 목표를 우리 기획 관점으로 재해석',
    prompt: '예: 정주(定住) = 단순 정착이 아니라 "체류형 창업"으로 본다',
  },
  {
    key: 'yearOverYear',
    kicker: '작년 대비',
    title: '무엇이 달라져야 하나',
    hint: '작년 운영 대비 이번에 바꿀 점 (작년 암묵지는 PM 이 채움)',
    prompt: '예: 작년엔 이론이 많았다 → 이번엔 실습/코칭 비중을 키운다',
  },
  {
    key: 'differentiation',
    kicker: '차별점',
    title: '우리 우위',
    hint: '경쟁 대비 언더독스의 강점·차별점',
    prompt: '예: 제주 현지 코치 38명 밀착 — 타사가 못 따라옴',
  },
  {
    key: 'risk',
    kicker: '리스크',
    title: '담당자가 우려할 것',
    hint: '핵심 리스크부터 한 줄씩 (첫 줄 = 절대 실패 금지)',
    prompt: '예: 중도이탈·정주 실패 우려 → 액션위크로 몰입 유지',
  },
]

const WIN_STRATEGY_META: CardMeta = {
  key: 'winStrategy',
  kicker: '메인 전략',
  title: '(선택) 수주 핵심 전략',
  hint: 'PM 자유 입력 — 이 사업의 메인 솔루션·승부수',
  prompt: '예: "체류형 + 현지코치 밀착"을 전면에 내세운다',
}

// ─────────────────────────────────────────────────────────────────
// 토큰 헬퍼 (인라인 스타일 — program-design-flow 톤)
// ─────────────────────────────────────────────────────────────────

const box = (accent: boolean): React.CSSProperties => ({
  border: '1px solid var(--line)',
  borderLeft: accent ? '3px solid var(--accent)' : '3px solid var(--line)',
  background: 'var(--paper, #fff)',
  padding: 14,
})

// ─────────────────────────────────────────────────────────────────
// 단일 카드
// ─────────────────────────────────────────────────────────────────

function IntentCardView({
  meta,
  card,
  busy,
  onEdit,
  onChat,
}: {
  meta: CardMeta
  card: IntentCard
  busy: boolean
  onEdit: (value: string) => void
  onChat: (message: string) => void
}) {
  const isLow = card.confidence === 'low' || !card.value.trim()
  const [chatOpen, setChatOpen] = useState(isLow)
  const [chatText, setChatText] = useState('')
  // editText === null → 비편집. 문자열 → 편집 중(열 때 card.value 로 시드).
  const [editText, setEditText] = useState<string | null>(null)
  const editing = editText !== null

  return (
    <div style={box(!isLow)}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: isLow ? 'var(--soft-ink, #777)' : 'var(--accent)',
          }}
        >
          {meta.kicker}
        </span>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{meta.title}</h3>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 700,
            color: isLow ? 'var(--soft-ink, #999)' : '#1a7f37',
          }}
          aria-label={isLow ? '대화로 채우기' : '확정'}
        >
          {isLow ? '? 대화로' : '✓ 확정'}
        </span>
      </div>

      <p style={{ fontSize: 11, color: 'var(--soft-ink, #888)', marginBottom: 8 }}>{meta.hint}</p>

      {/* 값 — 표시 / 인라인 편집 */}
      {editing ? (
        <div style={{ marginBottom: 8 }}>
          <Textarea
            value={editText ?? ''}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            style={{ fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <Button
              size="sm"
              onClick={() => {
                onEdit((editText ?? '').trim())
                setEditText(null)
              }}
            >
              저장
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditText(null)}>
              취소
            </Button>
          </div>
        </div>
      ) : (
        <div
          style={{
            fontSize: 13,
            color: card.value.trim() ? 'var(--ink)' : 'var(--soft-ink, #999)',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            marginBottom: 8,
            minHeight: 20,
          }}
        >
          {card.value.trim() || '— (아직 비어 있음 — AI 초안이 없거나 PM 입력 대기)'}
        </div>
      )}

      {/* 액션 바 */}
      {!editing && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setEditText(card.value)}
            style={linkBtn}
          >
            직접 편집
          </button>
          <button
            type="button"
            onClick={() => setChatOpen((v) => !v)}
            style={linkBtn}
          >
            {chatOpen ? '대화 닫기' : '대화로 채우기'}
          </button>
        </div>
      )}

      {/* 대화 입력 — confidence low 카드의 "?" 핀 흐름 */}
      {chatOpen && !editing && (
        <div style={{ marginTop: 8, borderTop: '1px dashed var(--line)', paddingTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--soft-ink, #888)', marginBottom: 4 }}>
            🤖 {meta.prompt}
          </div>
          <Textarea
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="여기에 답하면 AI 가 카드 문장으로 다듬어 채웁니다…"
            rows={2}
            disabled={busy}
            style={{ fontSize: 13 }}
          />
          <div style={{ marginTop: 6 }}>
            <Button
              size="sm"
              disabled={busy || !chatText.trim()}
              onClick={() => {
                onChat(chatText.trim())
                setChatText('')
              }}
            >
              {busy ? '정제 중…' : '채우기'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--accent)',
  cursor: 'pointer',
  textDecoration: 'underline',
}

// ─────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  /** RFP 분석 완료 여부 — false 면 안내만(초안 생성 불가). */
  hasRfp: boolean
  /** load-workspace 가 strategicNotes 에서 시드한 초안 (없으면 빈 초안). */
  initialDraft: PlanningIntentDraft
  /** 저장된 의도가 이미 있는지(=시드가 채워졌는지). false 면 자동 초안 1회 권유. */
  hasSavedIntent: boolean
}

export function PlanningIntent({
  projectId,
  hasRfp,
  initialDraft,
  hasSavedIntent,
}: Props) {
  const [draft, setDraft] = useState<PlanningIntentDraft>(initialDraft)
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [busyField, setBusyField] = useState<IntentFieldKey | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // 자동 초안 1회 가드 (저장된 의도 없을 때만)
  const autoTried = useRef(false)

  const generateDraft = useCallback(async () => {
    setLoadingDraft(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/planning-intent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'draft' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      // 자동초안은 winStrategy 등 PM 입력값을 덮지 않도록 기존 값 우선 보존.
      setDraft((prev) => ({
        ...(data.draft as PlanningIntentDraft),
        winStrategy: prev.winStrategy.value.trim()
          ? prev.winStrategy
          : (data.draft as PlanningIntentDraft).winStrategy,
      }))
      setSaved(false)
      toast.success('AI 의도 초안을 깔았습니다 — "?" 카드를 대화로 채우세요.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('초안 생성 실패: ' + msg.slice(0, 160))
    } finally {
      setLoadingDraft(false)
    }
  }, [projectId])

  // 저장된 의도가 없고 RFP 있으면 자동 1회 초안.
  useEffect(() => {
    if (autoTried.current) return
    if (!hasRfp || hasSavedIntent) return
    autoTried.current = true
    void generateDraft()
  }, [hasRfp, hasSavedIntent, generateDraft])

  const setField = useCallback((key: IntentFieldKey, card: IntentCard) => {
    setDraft((prev) => ({ ...prev, [key]: card }))
    setSaved(false)
  }, [])

  const handleEdit = useCallback(
    (key: IntentFieldKey, value: string) => {
      // PM 직접 편집 → 값 있으면 high(확정), 비우면 low.
      setField(key, { value, confidence: value.trim() ? 'high' : 'low' })
    },
    [setField],
  )

  const handleChat = useCallback(
    async (key: IntentFieldKey, message: string) => {
      setBusyField(key)
      try {
        const res = await fetch(`/api/projects/${projectId}/planning-intent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'refine',
            field: key,
            pmMessage: message,
            currentDraft: draft,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
        const value = typeof data.value === 'string' ? data.value : message
        // 대화로 채운 값 = PM 확정 → high.
        setField(key, { value, confidence: 'high' })
        toast.success('카드를 채웠습니다.')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error('정제 실패: ' + msg.slice(0, 160))
      } finally {
        setBusyField(null)
      }
    },
    [projectId, draft, setField],
  )

  const handleConfirm = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/planning-intent`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draft }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setSaved(true)
      toast.success('기획의도 확정 — ③ 각 회차의 "왜"로 내려갑니다.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('저장 실패: ' + msg.slice(0, 160))
    } finally {
      setSaving(false)
    }
  }, [projectId, draft])

  // RFP 없으면 안내만.
  if (!hasRfp) {
    return (
      <div style={{ ...box(true), maxWidth: 880, marginBottom: 16 }}>
        <strong style={{ fontWeight: 700 }}>기획의도는 RFP 분석 위에서 시작합니다.</strong>{' '}
        위 ① RFP 분석을 먼저 마친 뒤, AI 가 의도 초안을 깔아드립니다.
      </div>
    )
  }

  return (
    <section style={{ maxWidth: 880, marginBottom: 20 }}>
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          borderBottom: '2px solid var(--ink)',
          paddingBottom: 6,
          marginBottom: 12,
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
          ② 기획의도
        </span>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>왜 이렇게 가는가</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Button size="sm" variant="outline" disabled={loadingDraft} onClick={generateDraft}>
            {loadingDraft ? 'AI 초안 깔는 중…' : 'AI 초안 다시'}
          </Button>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--soft-ink, #777)', marginBottom: 12, lineHeight: 1.6 }}>
        AI 가 의도 초안을 깔고, 확신 낮은(<strong>?</strong>) 카드는 PM 이 대화로 채웁니다. 직접
        편집해도 됩니다 — 결정과 변형은 PM 의 몫입니다. 채워진 의도가 ③ 커리큘럼·제안서의 &quot;왜&quot;로
        내려갑니다.
      </p>

      {/* 4 카드 */}
      <div style={{ display: 'grid', gap: 10 }}>
        {CARD_META.map((meta) => (
          <IntentCardView
            key={meta.key}
            meta={meta}
            card={draft[meta.key]}
            busy={busyField === meta.key}
            onEdit={(value) => handleEdit(meta.key, value)}
            onChat={(message) => handleChat(meta.key, message)}
          />
        ))}

        {/* 선택 — 메인 전략 */}
        <IntentCardView
          meta={WIN_STRATEGY_META}
          card={draft.winStrategy}
          busy={busyField === 'winStrategy'}
          onEdit={(value) => handleEdit('winStrategy', value)}
          onChat={(message) => handleChat('winStrategy', message)}
        />
      </div>

      {/* 확정 바 */}
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderTop: '1px solid var(--line)',
          paddingTop: 12,
        }}
      >
        <Button disabled={saving} onClick={handleConfirm}>
          {saving ? '저장 중…' : '기획의도 확정 → 커리큘럼 반영'}
        </Button>
        {saved && (
          <span style={{ fontSize: 12, color: '#1a7f37', fontWeight: 600 }}>
            ✓ 저장됨 — ③ 각 회차의 &quot;왜&quot;로 내려갑니다.
          </span>
        )}
      </div>
    </section>
  )
}

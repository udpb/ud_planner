'use client'

/**
 * ②기획의도 (PlanningIntent) — 클린 통합 표면 (BR-WS-3s, 재설계 §9.2)
 *
 * "맥락의 못": RFP→바로 커리큘럼으로 가서 딱딱하게 떨어지던 문제(진단1)의 해결.
 * 하이브리드:
 *   1. AI 가 4카드 초안(목표해석·작년대비·차별점·리스크)을 깐다 — 각 confidence.
 *   2. confidence=low(또는 빈) 카드 = "?" → PM 이 **대화**로 채운다.
 *      (BR-WS-21) 대화 제출 = AI 후보 2~3개 카드 → PM 클릭 = 그 항목 즉시 입력(서버 재호출 없음).
 *   3. PM 은 카드를 직접 편집해도 된다(§3 원칙2 — AI 는 깔고 PM 이 결정).
 *   4. "확정 → 커리큘럼 반영" → PUT 저장(strategicNotes) → ③의 '왜'로 내려감.
 *
 * §9.2 표면(BR-WS-3s, 2026-06-23): 보더 박스 4개("폼 벽") → **틴트 그리드 한 덩어리**
 *   (paper↔neutral 교차, gap 1px). 대화 입력은 **한 번에 1개만**(openKey 단일 상태,
 *   기본 닫힘) — 마운트 즉시 textarea 4개가 펼쳐지던 폼 벽 제거.
 *   확정 카드 = success 체크 + 한 줄 값 + 작은 고치기 링크.
 *   미확정 카드 = accent ? + 라벨 + 한 줄 hint + 대화로 채우기(accent 링크).
 *
 * 디자인킷 260529: accent #F05519 1개 · radius 0 · 틴트 그리드 · NanumHuman/Poppins.
 * 점수·게이트 없음(진단3). 강제값 0 — 전부 default.
 * **로직(generateDraft·handleEdit·handleSuggest·handleConfirm·자동초안 useEffect·setField·
 *   fetch)은 BR-WS-3 골격 그대로 — BR-WS-21 에서 대화 정제(refine 단일값)를
 *   후보 제안(suggest 2~3개 → 클릭=채움)으로 교체.**
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
// 토큰 헬퍼
// ─────────────────────────────────────────────────────────────────

/** RFP 미선행 안내 박스(가벼운 stroke). */
const noticeBox: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderLeft: '3px solid var(--accent)',
  background: 'var(--paper, #fff)',
  padding: 14,
}

/** 작은 액션 링크(고치기·대화로 채우기). accent 강조 1포인트, 밑줄 없음. */
const actionLink: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--accent)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

/** 작은 muted 링크(고치기 — 확정 카드용). */
const mutedLink: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--muted, #888)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

/** 후보 카드(선택 버튼) — 차분한 선택지. 디자인킷: radius 0·accent 1포인트·틴트. */
const candidateCard: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'var(--paper, #fff)',
  border: '1px solid var(--line)',
  borderLeft: '3px solid var(--accent)',
  borderRadius: 0,
  padding: '10px 12px',
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--ink)',
  cursor: 'pointer',
  wordBreak: 'keep-all',
  whiteSpace: 'pre-wrap',
}

// ─────────────────────────────────────────────────────────────────
// 단일 카드 행 (§9.2 틴트 그리드 셀 — 차분한 한 줄)
// ─────────────────────────────────────────────────────────────────

function IntentCardRow({
  meta,
  card,
  busy,
  tint,
  chatOpen,
  candidates,
  onToggleChat,
  onEdit,
  onChat,
  onPickCandidate,
}: {
  meta: CardMeta
  card: IntentCard
  busy: boolean
  /** 틴트 그리드 교차 배경 (true = neutral 면). */
  tint: boolean
  /** 이 카드의 대화 입력이 열려 있는가 (부모 단일 상태). */
  chatOpen: boolean
  /** 이 카드의 AI 후보(대화 → suggest 결과). 빈 배열이면 미표시. */
  candidates: string[]
  onToggleChat: () => void
  onEdit: (value: string) => void
  /** "→ 후보 보기" — pmMessage(빈 문자열 가능)로 후보 요청. */
  onChat: (message: string) => void
  /** 후보 클릭 → 그 값으로 즉시 채움(서버 재호출 없음). */
  onPickCandidate: (value: string) => void
}) {
  const isLow = card.confidence === 'low' || !card.value.trim()
  const [chatText, setChatText] = useState('')
  // editText === null → 비편집. 문자열 → 편집 중(열 때 card.value 로 시드).
  const [editText, setEditText] = useState<string | null>(null)
  const editing = editText !== null

  return (
    <div
      style={{
        background: tint ? 'var(--neutral-90)' : 'var(--paper, #fff)',
        padding: '12px 14px',
      }}
    >
      {/* 행: [상태아이콘] [라벨] [값/안내] … [액션] */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        {/* 상태 아이콘 — 확정=success 체크 / 미확정=accent ? */}
        <span
          aria-label={isLow ? '미확정 — 대화로 채우기' : '확정'}
          style={{
            flex: '0 0 auto',
            width: 14,
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1.4,
            color: isLow ? 'var(--accent)' : '#1a7f37',
          }}
        >
          {isLow ? '?' : '✓'}
        </span>

        {/* 라벨(kicker) */}
        <span
          style={{
            flex: '0 0 auto',
            minWidth: 64,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isLow ? 'var(--muted, #999)' : 'var(--soft-ink, #555)',
            paddingTop: 1,
          }}
        >
          {meta.kicker}
        </span>

        {/* 값(확정) 또는 hint(미확정) — 한 줄, 편집 중이면 인라인 입력 */}
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          {editing ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <Textarea
                value={editText ?? ''}
                onChange={(e) => setEditText(e.target.value)}
                rows={2}
                style={{ fontSize: 13 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
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
          ) : card.value.trim() ? (
            <span
              style={{
                fontSize: 13,
                color: 'var(--ink)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'keep-all',
              }}
            >
              {card.value.trim()}
            </span>
          ) : (
            <span
              style={{
                fontSize: 12,
                color: 'var(--muted, #999)',
                lineHeight: 1.5,
                wordBreak: 'keep-all',
              }}
            >
              {meta.hint}
            </span>
          )}
        </div>

        {/* 우측 액션 — 확정=고치기(muted) / 미확정=대화로 채우기(accent) */}
        {!editing && (
          <div style={{ flex: '0 0 auto', display: 'flex', gap: 10, alignItems: 'baseline' }}>
            {isLow ? (
              <button type="button" onClick={onToggleChat} style={actionLink}>
                {chatOpen ? '닫기' : '대화로 채우기'}
              </button>
            ) : (
              <>
                <button type="button" onClick={onToggleChat} style={mutedLink}>
                  대화
                </button>
                <button type="button" onClick={() => setEditText(card.value)} style={mutedLink}>
                  고치기
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 대화 입력 — 한 번에 1개만(부모 openKey), 행 아래 인라인 1줄 + accent → */}
      {chatOpen && !editing && (
        <div
          style={{
            marginTop: 8,
            marginLeft: 24,
            display: 'grid',
            gap: 6,
            borderTop: '1px solid var(--line)',
            paddingTop: 8,
          }}
        >
          <Textarea
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder={meta.prompt}
            rows={2}
            disabled={busy}
            style={{ fontSize: 13 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                // pmMessage 는 선택 — 비어도 RFP·초안 맥락으로 후보 요청.
                onChat(chatText.trim())
              }}
            >
              {busy ? 'AI 후보 만드는 중…' : candidates.length ? '→ 후보 다시' : '→ 후보 보기'}
            </Button>
            <span style={{ fontSize: 11, color: 'var(--muted, #999)' }}>
              힌트는 선택 — 비워두면 RFP·맥락으로 제안합니다
            </span>
          </div>

          {/* AI 후보 카드 — 클릭 = 그 값으로 즉시 채움(서버 재호출 없음) */}
          {candidates.length > 0 && (
            <div style={{ display: 'grid', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--soft-ink, #555)' }}>
                마음에 드는 후보를 누르면 이 카드에 바로 들어갑니다
              </span>
              {candidates.map((c, ci) => (
                <button
                  key={ci}
                  type="button"
                  disabled={busy}
                  onClick={() => onPickCandidate(c)}
                  style={candidateCard}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
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
  // 대화 입력 열림 — 한 번에 1개만(§9.2 폼 벽 제거). 기본 닫힘.
  const [openKey, setOpenKey] = useState<IntentFieldKey | null>(null)
  // 대화 → AI 후보(BR-WS-21). 열린 카드(openKey)의 후보만 표시 — 필드별 보관.
  const [candidates, setCandidates] = useState<Partial<Record<IntentFieldKey, string[]>>>({})
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

  // 대화 제출 → suggest(후보 2~3개) 요청. 단일 값으로 덮지 않고 PM 이 카드로 고른다.
  // pmMessage 는 선택(빈 문자열 가능) — 비면 RFP·초안 맥락으로 후보 제안.
  const handleSuggest = useCallback(
    async (key: IntentFieldKey, message: string) => {
      setBusyField(key)
      try {
        const res = await fetch(`/api/projects/${projectId}/planning-intent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'suggest',
            field: key,
            // 빈 힌트는 보내지 않음(undefined → 서버가 맥락 기반 제안).
            ...(message ? { pmMessage: message } : {}),
            currentDraft: draft,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
        const list: string[] = Array.isArray(data.candidates)
          ? data.candidates.filter((c: unknown): c is string => typeof c === 'string' && !!c.trim())
          : []
        setCandidates((prev) => ({ ...prev, [key]: list }))
        if (!list.length) toast.error('후보를 만들지 못했습니다 — 힌트를 더 적어 다시 시도해주세요.')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error('후보 생성 실패: ' + msg.slice(0, 160))
      } finally {
        setBusyField(null)
      }
    },
    [projectId, draft],
  )

  // 후보 클릭 → 그 값으로 즉시 채움(서버 재호출 없음). 대화 닫고 후보 비움.
  const pickCandidate = useCallback(
    (key: IntentFieldKey, value: string) => {
      setField(key, { value, confidence: 'high' })
      setCandidates((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setOpenKey(null)
      toast.success('✓ 채움 — 카드에 반영했습니다.')
    },
    [setField],
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

  // 대화 입력 토글 — 한 번에 1개만(이미 열린 키 다시 누르면 닫기).
  // 닫을 때 그 카드의 후보도 비운다(맥락 정리).
  const toggleChat = useCallback((key: IntentFieldKey) => {
    setOpenKey((prev) => {
      if (prev === key) {
        setCandidates((c) => {
          const next = { ...c }
          delete next[key]
          return next
        })
        return null
      }
      return key
    })
  }, [])

  // RFP 없으면 안내만.
  if (!hasRfp) {
    return (
      <div style={{ ...noticeBox, maxWidth: 880, marginBottom: 16 }}>
        <strong style={{ fontWeight: 700 }}>기획의도는 RFP 분석 위에서 시작합니다.</strong>{' '}
        위 ① RFP 분석을 먼저 마친 뒤, AI 가 의도 초안을 깔아드립니다.
      </div>
    )
  }

  // 카드 메타 순서 = CARD_META 4 + winStrategy (틴트 교차 인덱스 산정용)
  const rows = [...CARD_META, WIN_STRATEGY_META]

  return (
    <section style={{ maxWidth: 880, marginBottom: 20 }}>
      {/* 헤더 — kicker + 한 줄 부제 + 작은 AI 초안 다시 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          borderBottom: '2px solid var(--ink)',
          paddingBottom: 6,
          marginBottom: 10,
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
          기획의도
        </span>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>왜 이렇게 가는가</h2>
        <div style={{ marginLeft: 'auto' }}>
          <Button size="sm" variant="ghost" disabled={loadingDraft} onClick={generateDraft}>
            {loadingDraft ? 'AI 초안 깔는 중…' : 'AI 초안 다시'}
          </Button>
        </div>
      </div>

      {/* 틴트 그리드 — 보더 박스 4개 → 한 덩어리 (gap 1px, paper↔neutral 교차) */}
      <div
        style={{
          display: 'grid',
          gap: 1,
          background: 'var(--line)',
          border: '1px solid var(--line)',
        }}
      >
        {rows.map((meta, i) => (
          <IntentCardRow
            key={meta.key}
            meta={meta}
            card={draft[meta.key]}
            busy={busyField === meta.key}
            tint={i % 2 === 1}
            chatOpen={openKey === meta.key}
            candidates={candidates[meta.key] ?? []}
            onToggleChat={() => toggleChat(meta.key)}
            onEdit={(value) => handleEdit(meta.key, value)}
            onChat={(message) => handleSuggest(meta.key, message)}
            onPickCandidate={(value) => pickCandidate(meta.key, value)}
          />
        ))}
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

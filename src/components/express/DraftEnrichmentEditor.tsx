'use client'
/**
 * DraftEnrichmentEditor — Phase M F4 (LLM 오류 안전망)
 *
 * AI 가 자동 생성한 messageHierarchy / sectionMeta 를 PM 이 검토 + 인라인 편집.
 *
 * 위치: S5 Summary 아래 collapsible 카드.
 * 데이터: 자체적으로 /api/projects/[id] 로 expressDraft fetch.
 * 저장: /api/express/save (debounced — 사용자가 멈춘 후 1초 뒤 저장).
 *
 * 편집 가능:
 *   - messageHierarchy[i].key / sub[j] / quantProofs[j]
 *   - sectionMeta[N].subtitle / headline
 *
 * 비편집:
 *   - sub 또는 quantProofs 추가/삭제 (1차본은 AI 생성된 항목만 검토)
 *   - 새 hierarchy 항목 추가 (3개 한도 — AI 가 채움)
 *
 * 향후 확장:
 *   - 항목 추가/삭제 버튼
 *   - "AI 재생성" 버튼
 *   - undo
 */

import { useEffect, useRef, useState } from 'react'
import type { MessageHierarchy, SectionMeta } from '@/lib/express/schema'

const SECTION_LABELS: Record<string, string> = {
  '1': '제안 배경 및 목적',
  '2': '추진 전략 및 방법론',
  '3': '교육 커리큘럼',
  '4': '운영 체계 및 코치진',
  '5': '예산 및 경제성',
  '6': '기대 성과 및 임팩트',
  '7': '수행 역량 및 실적',
}

export interface DraftEnrichmentEditorProps {
  projectId: string
}

export function DraftEnrichmentEditor({ projectId }: DraftEnrichmentEditorProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hierarchy, setHierarchy] = useState<MessageHierarchy | null>(null)
  const [sectionMeta, setSectionMeta] = useState<SectionMeta | null>(null)
  const [draft, setDraft] = useState<any>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 펼칠 때만 fetch
  useEffect(() => {
    if (!open || draft) return
    setLoading(true)
    setError(null)
    fetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((data) => {
        const ed = data?.project?.expressDraft ?? data?.expressDraft ?? null
        if (!ed) {
          setError('expressDraft 없음 — S2 챗봇 사용 후 다시 시도')
          return
        }
        setDraft(ed)
        setHierarchy((ed.messageHierarchy as MessageHierarchy) ?? [])
        setSectionMeta((ed.sectionMeta as SectionMeta) ?? {})
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [open, projectId, draft])

  // Debounced save
  function scheduleSave(nextHierarchy: MessageHierarchy, nextMeta: SectionMeta) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!draft) return
      setSaving(true)
      try {
        const updatedDraft = {
          ...draft,
          messageHierarchy: nextHierarchy,
          sectionMeta: nextMeta,
          meta: { ...draft.meta, lastUpdatedAt: new Date().toISOString() },
        }
        const res = await fetch('/api/express/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, draft: updatedDraft }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setDraft(updatedDraft)
        setSavedAt(new Date())
        setError(null)
      } catch (e) {
        setError(`저장 실패: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setSaving(false)
      }
    }, 1000)
  }

  function updateHierarchyKey(i: number, value: string) {
    if (!hierarchy) return
    const next = hierarchy.map((h, idx) => (idx === i ? { ...h, key: value } : h))
    setHierarchy(next)
    scheduleSave(next, sectionMeta ?? {})
  }

  function updateHierarchySub(i: number, j: number, value: string) {
    if (!hierarchy) return
    const next = hierarchy.map((h, idx) =>
      idx === i ? { ...h, sub: h.sub.map((s, sj) => (sj === j ? value : s)) } : h,
    )
    setHierarchy(next)
    scheduleSave(next, sectionMeta ?? {})
  }

  function addHierarchySub(i: number) {
    if (!hierarchy) return
    const next = hierarchy.map((h, idx) =>
      idx === i && h.sub.length < 5 ? { ...h, sub: [...h.sub, ''] } : h,
    )
    setHierarchy(next)
    scheduleSave(next, sectionMeta ?? {})
  }

  function removeHierarchySub(i: number, j: number) {
    if (!hierarchy) return
    const next = hierarchy.map((h, idx) =>
      idx === i ? { ...h, sub: h.sub.filter((_, sj) => sj !== j) } : h,
    )
    setHierarchy(next)
    scheduleSave(next, sectionMeta ?? {})
  }

  function updateHierarchyQuant(i: number, j: number, value: string) {
    if (!hierarchy) return
    const next = hierarchy.map((h, idx) =>
      idx === i ? { ...h, quantProofs: h.quantProofs.map((q, qj) => (qj === j ? value : q)) } : h,
    )
    setHierarchy(next)
    scheduleSave(next, sectionMeta ?? {})
  }

  function addHierarchyQuant(i: number) {
    if (!hierarchy) return
    const next = hierarchy.map((h, idx) =>
      idx === i && h.quantProofs.length < 5 ? { ...h, quantProofs: [...h.quantProofs, ''] } : h,
    )
    setHierarchy(next)
    scheduleSave(next, sectionMeta ?? {})
  }

  function removeHierarchyQuant(i: number, j: number) {
    if (!hierarchy) return
    const next = hierarchy.map((h, idx) =>
      idx === i ? { ...h, quantProofs: h.quantProofs.filter((_, qj) => qj !== j) } : h,
    )
    setHierarchy(next)
    scheduleSave(next, sectionMeta ?? {})
  }

  function updateSectionMeta(k: string, field: 'subtitle' | 'headline', value: string) {
    if (!sectionMeta) return
    const next = {
      ...sectionMeta,
      [k]: { ...(sectionMeta as Record<string, any>)[k], [field]: value },
    } as SectionMeta
    setSectionMeta(next)
    scheduleSave(hierarchy ?? [], next)
  }

  const hierarchyCount = hierarchy?.length ?? 0
  const sectionMetaCount = sectionMeta ? Object.keys(sectionMeta).length : 0

  return (
    <div
      className="no-print mb-6 border"
      style={{
        background: 'var(--secondary-cream, #faf7f0)',
        borderColor: 'var(--hairline-strong, #e4dfd6)',
        borderLeft: '4px solid var(--primary-orange, #f05519)',
      }}
    >
      {/* Header — clickable to toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:opacity-90"
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: 'var(--primary-orange)' }}>
            AI 생성 결과 검토 · 편집
          </div>
          <div className="mt-1 text-[10px]" style={{ color: 'var(--subtitle-text)' }}>
            messageHierarchy {hierarchyCount}개 · sectionMeta {sectionMetaCount}개
            {savedAt && ` · 저장됨 ${savedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
            {saving && ' · 저장 중...'}
          </div>
        </div>
        <div className="text-base font-semibold" style={{ color: 'var(--body-text, #333)' }}>
          {open ? '▾' : '▸'}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t px-4 py-4" style={{ borderColor: 'var(--hairline, #ece8df)' }}>
          {loading && (
            <div className="py-4 text-center text-xs" style={{ color: 'var(--subtitle-text)' }}>
              불러오는 중...
            </div>
          )}
          {error && (
            <div
              className="mb-3 px-3 py-2 text-xs"
              style={{
                color: 'var(--primary-orange)',
                background: 'rgba(240,85,25,.08)',
                border: '1px solid rgba(240,85,25,.3)',
              }}
            >
              ● {error}
            </div>
          )}

          {/* messageHierarchy */}
          {hierarchy && hierarchy.length > 0 && (
            <div className="mb-6">
              <div
                className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px]"
                style={{ color: 'var(--body-text, #333)' }}
              >
                💬 핵심 메시지 hierarchy ({hierarchy.length}개)
              </div>
              <div className="space-y-3">
                {hierarchy.map((item, i) => (
                  <div
                    key={i}
                    className="border p-3"
                    style={{ background: '#fff', borderColor: 'var(--hairline, #ece8df)' }}
                  >
                    {/* key */}
                    <label className="block">
                      <span className="text-[9px] font-semibold uppercase tracking-[1px]" style={{ color: 'var(--subtitle-text)' }}>
                        Key #{i + 1} (8~80자)
                      </span>
                      <input
                        type="text"
                        value={item.key}
                        onChange={(e) => updateHierarchyKey(i, e.target.value)}
                        maxLength={80}
                        className="mt-1 w-full border px-2 py-1.5 text-xs"
                        style={{ borderColor: 'var(--hairline-strong, #e4dfd6)' }}
                      />
                      <div className="mt-0.5 text-[9px]" style={{ color: 'var(--subtitle-text)' }}>
                        {item.key.length}자
                      </div>
                    </label>

                    {/* sub */}
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[9px] font-semibold uppercase tracking-[1px]" style={{ color: 'var(--subtitle-text)' }}>
                          Sub ({item.sub.length}/5 · 15~200자)
                        </span>
                        {item.sub.length < 5 && (
                          <button
                            onClick={() => addHierarchySub(i)}
                            className="text-[10px] underline hover:no-underline"
                            style={{ color: 'var(--primary-orange)' }}
                          >
                            + 추가
                          </button>
                        )}
                      </div>
                      {item.sub.map((s, j) => (
                        <div key={j} className="mb-1 flex gap-1">
                          <textarea
                            value={s}
                            onChange={(e) => updateHierarchySub(i, j, e.target.value)}
                            maxLength={200}
                            rows={2}
                            className="flex-1 border px-2 py-1 text-xs"
                            style={{ borderColor: 'var(--hairline-strong, #e4dfd6)' }}
                          />
                          <button
                            onClick={() => removeHierarchySub(i, j)}
                            className="px-1.5 text-[10px] hover:underline"
                            style={{ color: 'var(--subtitle-text)' }}
                            title="삭제"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* quantProofs */}
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[9px] font-semibold uppercase tracking-[1px]" style={{ color: 'var(--subtitle-text)' }}>
                          정량 근거 ({item.quantProofs.length}/5 · 5~150자)
                        </span>
                        {item.quantProofs.length < 5 && (
                          <button
                            onClick={() => addHierarchyQuant(i)}
                            className="text-[10px] underline hover:no-underline"
                            style={{ color: 'var(--primary-orange)' }}
                          >
                            + 추가
                          </button>
                        )}
                      </div>
                      {item.quantProofs.map((q, j) => (
                        <div key={j} className="mb-1 flex gap-1">
                          <input
                            type="text"
                            value={q}
                            onChange={(e) => updateHierarchyQuant(i, j, e.target.value)}
                            maxLength={150}
                            className="flex-1 border px-2 py-1 text-xs"
                            style={{ borderColor: 'var(--hairline-strong, #e4dfd6)' }}
                          />
                          <button
                            onClick={() => removeHierarchyQuant(i, j)}
                            className="px-1.5 text-[10px] hover:underline"
                            style={{ color: 'var(--subtitle-text)' }}
                            title="삭제"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* sectionMeta */}
          {sectionMeta && Object.keys(sectionMeta).length > 0 && (
            <div>
              <div
                className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px]"
                style={{ color: 'var(--body-text, #333)' }}
              >
                📐 Section Meta — One Page One Thesis ({Object.keys(sectionMeta).length}개)
              </div>
              <div className="space-y-3">
                {Object.entries(sectionMeta).map(([k, meta]) => {
                  const m = meta as { subtitle?: string; headline?: string }
                  return (
                    <div
                      key={k}
                      className="border p-3"
                      style={{ background: '#fff', borderColor: 'var(--hairline, #ece8df)' }}
                    >
                      <div className="mb-2 text-xs font-semibold" style={{ color: 'var(--body-text, #333)' }}>
                        {k}. {SECTION_LABELS[k] ?? k}
                      </div>
                      <label className="block">
                        <span className="text-[9px] font-semibold uppercase tracking-[1px]" style={{ color: 'var(--subtitle-text)' }}>
                          Subtitle (": 부제" 형식 · 80자 이내)
                        </span>
                        <input
                          type="text"
                          value={m.subtitle ?? ''}
                          onChange={(e) => updateSectionMeta(k, 'subtitle', e.target.value)}
                          maxLength={80}
                          placeholder=": 부제"
                          className="mt-1 w-full border px-2 py-1.5 text-xs"
                          style={{ borderColor: 'var(--hairline-strong, #e4dfd6)' }}
                        />
                      </label>
                      <label className="mt-2 block">
                        <span className="text-[9px] font-semibold uppercase tracking-[1px]" style={{ color: 'var(--subtitle-text)' }}>
                          Headline (단일 주장 · 200자 이내 · 큰따옴표 자동 추가)
                        </span>
                        <textarea
                          value={m.headline ?? ''}
                          onChange={(e) => updateSectionMeta(k, 'headline', e.target.value)}
                          maxLength={200}
                          rows={2}
                          placeholder="평가위원이 5초에 이해할 한 줄 주장 (정량 포함 권장)"
                          className="mt-1 w-full border px-2 py-1.5 text-xs"
                          style={{ borderColor: 'var(--hairline-strong, #e4dfd6)' }}
                        />
                        <div className="mt-0.5 text-[9px]" style={{ color: 'var(--subtitle-text)' }}>
                          {(m.headline ?? '').length}자
                        </div>
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && (!hierarchy || hierarchy.length === 0) && (!sectionMeta || Object.keys(sectionMeta).length === 0) && (
            <div className="py-4 text-center text-xs" style={{ color: 'var(--subtitle-text)' }}>
              AI 가 아직 hierarchy / sectionMeta 를 생성하지 않았습니다. S2 챗봇에서 keyMessages 와 sections 를 채우면 자동 생성됩니다.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

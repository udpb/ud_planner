'use client'

/**
 * ConceptCanvas — 우 캔버스 pane: "맺힘"(컨셉이 좁혀져 캔버스에 박힘) (ADR-031 Wave 2)
 *
 * 좌측 ConceptChat 의 대화가 좁혀온 결과를 실시간으로 비춘다. 3상태:
 *   - empty(picks 0): "왼쪽 대화로 컨셉을 잡아갑니다" 안내.
 *   - maturing(picks 있고 concept 없음): 좁혀온 경로(선택 라벨) 칩만.
 *   - assembled(concept 있음): win-theme + 핵심 메시지 3 + 차별점 + 근거 칩 + 좁혀온 경로
 *     + "컨셉 확정 → 구조 잡기" 버튼 → PUT 저장 → 성공 시 onConfirmed (단계 종료).
 *
 * 승인 목업(concept_derivation_via_chat 우측)과 항목 일치. 점수/합격/SROI 단정 없음(W1 엔진 가드).
 * 데이터(picks·concept)는 부모(ProgramWorkspace)가 보유 — 이 컴포넌트는 렌더 + 확정 PUT 만.
 *
 * 디자인킷 260529: accent #F05519 1개 · radius 0 · 틴트 박스 · NanumHuman/Poppins.
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type {
  ConceptShape,
  ConceptPick,
} from '@/lib/program-design/concept-synth'

interface Props {
  projectId: string
  /** 좌 대화가 누적한 선택 — maturing/좁혀온 경로 표시. */
  picks: ConceptPick[]
  /** done→assemble 로 조립된 컨셉(있으면 assembled 상태). 없으면 empty/maturing. */
  concept: ConceptShape | null
  /** 확정 PUT 성공 → 부모가 단계 종료(ProgramDesignFlow 진행)로 전환. */
  onConfirmed: (concept: ConceptShape) => void
}

// ─────────────────────────────────────────────────────────────────
// 토큰 헬퍼 (PlanningIntent 미러 — 디자인킷 일관)
// ─────────────────────────────────────────────────────────────────

/** 가벼운 안내 박스(accent stroke). */
const noticeBox: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderLeft: '3px solid var(--accent)',
  background: 'var(--paper, #fff)',
  padding: 16,
  fontSize: 13,
  color: 'var(--soft-ink, #555)',
  lineHeight: 1.6,
}

/** 좁혀온 경로 칩(선택 라벨). */
const pathChip: React.CSSProperties = {
  display: 'inline-block',
  background: 'var(--neutral-90)',
  border: '1px solid var(--line)',
  padding: '3px 9px',
  fontSize: 12,
  color: 'var(--soft-ink, #555)',
  wordBreak: 'keep-all',
}

/** 근거 칩(grounding — 종류별 라벨). */
const groundingChip: React.CSSProperties = {
  display: 'inline-block',
  background: 'var(--paper, #fff)',
  border: '1px solid var(--line)',
  borderLeft: '3px solid var(--accent)',
  padding: '3px 9px',
  fontSize: 11,
  color: 'var(--soft-ink, #555)',
  wordBreak: 'keep-all',
}

const GROUNDING_KIND_LABEL: Record<ConceptShape['grounding'][number]['kind'], string> = {
  rfp: 'RFP',
  winning: '당선',
  asset: '자산',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--accent)',
      }}
    >
      {children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────

export function ConceptCanvas({ projectId, picks, concept, onConfirmed }: Props) {
  const [saving, setSaving] = useState(false)

  const handleConfirm = useCallback(async () => {
    if (!concept || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/concept`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`)
      }
      toast.success('컨셉 확정 — 구조 잡기로 내려갑니다.')
      onConfirmed(concept)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('컨셉 저장 실패: ' + msg.slice(0, 160))
    } finally {
      setSaving(false)
    }
  }, [concept, saving, projectId, onConfirmed])

  // ── empty: 아직 선택 없음 ──
  if (picks.length === 0 && !concept) {
    return (
      <div style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>컨셉 캔버스</SectionLabel>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>
            컨셉이 여기 맺힙니다
          </h2>
        </div>
        <div style={noticeBox}>
          <strong style={{ fontWeight: 700, color: 'var(--ink)' }}>
            왼쪽 대화로 컨셉을 잡아갑니다.
          </strong>{' '}
          각도 → 차별점 → 발주처에 답할 한 줄을 골라가면, 좁혀온 컨셉이 이 캔버스에
          win-theme·핵심 메시지·근거로 맺힙니다. 강제 없이 카드 클릭·자유 입력만 반영됩니다.
        </div>
      </div>
    )
  }

  // ── maturing/assembled 공통: 좁혀온 경로 ──
  const derivationPath = concept?.derivationPath?.length
    ? concept.derivationPath
    : picks.map((p) => p.label).filter((l) => !!l && !!l.trim())

  return (
    <div style={{ maxWidth: 720, display: 'grid', gap: 18 }}>
      {/* 헤더 */}
      <div>
        <SectionLabel>컨셉 캔버스</SectionLabel>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>
          {concept ? '맺힌 컨셉' : '컨셉을 좁혀가는 중'}
        </h2>
      </div>

      {/* maturing 안내 (concept 아직 없음) */}
      {!concept && (
        <div style={noticeBox}>
          왼쪽 대화에서 선택을 이어가세요. 마지막 단계까지 고르면 컨셉이 조립돼 여기 맺힙니다.
        </div>
      )}

      {/* assembled: win-theme */}
      {concept && (
        <div
          style={{
            border: '1px solid var(--line)',
            borderLeft: '4px solid var(--accent)',
            background: 'var(--neutral-90)',
            padding: '16px 18px',
          }}
        >
          <SectionLabel>win-theme</SectionLabel>
          <p
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: 'var(--ink)',
              lineHeight: 1.45,
              marginTop: 6,
              wordBreak: 'keep-all',
            }}
          >
            {concept.winTheme}
          </p>
        </div>
      )}

      {/* assembled: 핵심 메시지 3 */}
      {concept && concept.keyMessages.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <SectionLabel>핵심 메시지 3</SectionLabel>
          <div
            style={{
              display: 'grid',
              gap: 1,
              background: 'var(--line)',
              border: '1px solid var(--line)',
            }}
          >
            {concept.keyMessages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'baseline',
                  background: i % 2 === 1 ? 'var(--neutral-90)' : 'var(--paper, #fff)',
                  padding: '11px 14px',
                }}
              >
                <span
                  style={{
                    flex: '0 0 auto',
                    fontSize: 13,
                    fontWeight: 800,
                    color: 'var(--accent)',
                    lineHeight: 1.5,
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--ink)',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'keep-all',
                  }}
                >
                  {m}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* assembled: 차별점 */}
      {concept && concept.differentiation && (
        <div style={{ display: 'grid', gap: 6 }}>
          <SectionLabel>차별점</SectionLabel>
          <p
            style={{
              fontSize: 13,
              color: 'var(--ink)',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              wordBreak: 'keep-all',
            }}
          >
            {concept.differentiation}
          </p>
        </div>
      )}

      {/* assembled: 근거 칩 */}
      {concept && concept.grounding.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <SectionLabel>근거</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {concept.grounding.map((g, i) => (
              <span key={i} style={groundingChip}>
                <strong style={{ fontWeight: 700, color: 'var(--accent)' }}>
                  {GROUNDING_KIND_LABEL[g.kind] ?? g.kind}
                </strong>{' '}
                {g.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 좁혀온 경로 (maturing/assembled 공통) */}
      {derivationPath.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <SectionLabel>좁혀온 경로</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {derivationPath.map((label, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && (
                  <span style={{ color: 'var(--muted, #999)', fontSize: 12 }} aria-hidden>
                    →
                  </span>
                )}
                <span style={pathChip}>{label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 확정 바 (assembled 일 때만) */}
      {concept && (
        <div
          style={{
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderTop: '1px solid var(--line)',
            paddingTop: 14,
          }}
        >
          <Button disabled={saving} onClick={handleConfirm}>
            {saving ? '저장 중…' : '컨셉 확정 → 구조 잡기'}
          </Button>
          <span style={{ fontSize: 11, color: 'var(--muted, #999)' }}>
            확정하면 이 컨셉으로 구조·커리큘럼을 이어갑니다 (나중에 다시 잡을 수 있어요).
          </span>
        </div>
      )}
    </div>
  )
}

'use client'

/**
 * BR-3c — 시각적 결정 로그 (D0~D8 + source 배지)
 *
 * decisionLog 를 D0~D8 순서로 렌더. 각 결정 = decision + rationale + source 배지
 * (의도/선례/RFP/규칙/사람/목표) + evidence + conflictNote.
 *
 * 디자인킷: 틴트박스 그리드(gap 2px paper↔neutral-90), radius 0, accent 면 최소
 *   (source 배지의 토대 우선순위(의도·선례·사람)에만 accent — 규칙/RFP 는 중립).
 *
 * BR-3b 의 DecisionLogList 를 분리·고도화한 것 — 데이터 형태(ProgramPlan)는 동일.
 */

import { useMemo } from 'react'
import type {
  DecisionLogEntry,
  DecisionSource,
  DecisionStep,
} from '@/lib/program-design/plan-types'

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

// source 배지 — 토대 우선순위(사람·의도·선례)만 accent 강조, 규칙/RFP/목표는 중립.
const SOURCE_STYLE: Record<DecisionSource, { bg: string; fg: string; border: string }> = {
  precedent: { bg: 'var(--accent-88)', fg: 'var(--accent)', border: 'var(--accent)' },
  intent: { bg: 'var(--accent-88)', fg: 'var(--accent)', border: 'var(--accent)' },
  human: { bg: 'var(--accent-88)', fg: 'var(--accent)', border: 'var(--accent)' },
  goal: { bg: 'var(--neutral-60)', fg: 'var(--soft-ink)', border: 'var(--line)' },
  rfp: { bg: 'var(--neutral-60)', fg: 'var(--soft-ink)', border: 'var(--line)' },
  rule: { bg: 'var(--neutral-60)', fg: 'var(--muted)', border: 'var(--line)' },
}

export function DecisionLog({ log }: { log: DecisionLogEntry[] }) {
  const sorted = useMemo(() => {
    const idx = (s: DecisionStep) => STEP_ORDER.indexOf(s)
    return [...log].sort((a, b) => idx(a.step) - idx(b.step))
  }, [log])

  if (sorted.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'keep-all' }}>
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
              padding: '12px 16px',
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              gap: 14,
              alignItems: 'start',
            }}
          >
            {/* 좌: 단계 칸 (타임라인 앵커) */}
            <div style={{ display: 'grid', gap: 6, justifyItems: 'start', minWidth: 88 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: 'var(--ink)',
                  background: 'var(--neutral-60)',
                  padding: '2px 8px',
                  whiteSpace: 'nowrap',
                }}
              >
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
                  whiteSpace: 'nowrap',
                }}
              >
                {SOURCE_LABEL[d.source]}
              </span>
            </div>

            {/* 우: 결정 본문 */}
            <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', wordBreak: 'keep-all' }}>
                {d.decision}
              </span>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--soft-ink)',
                  lineHeight: 1.6,
                  wordBreak: 'keep-all',
                }}
              >
                {d.rationale}
              </p>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <span>
                  근거 <strong style={{ color: 'var(--soft-ink)' }}>{d.evidence.source}</strong>
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
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>충돌 양보 </span>
                  {d.conflictNote}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

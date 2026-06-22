'use client'

/**
 * BR-3c — 기획요소 칩 (선발 설계 / 사전진단 / 사후연계)
 *
 * decisionLog 에서 기획요소 신호를 골라 칩으로 표시 (있으면):
 *   - 선발 설계   : D2 축 (preLearning·선발·심사 관련 결정)
 *   - 사전진단    : D2 의 사전학습/진단 결정 (DOGS/ACTT/5D 등)
 *   - 사후연계    : D7 축 (발표·행사·연계·사후 멘토링 결정)
 *
 * 엔진을 바꾸지 않고 plan.decisionLog 만 읽어 분류 — 신호가 없으면 칩 0개(렌더 X).
 * 디자인킷: 틴트 칩, accent 면 최소.
 */

import type { DecisionLogEntry } from '@/lib/program-design/plan-types'

interface PlanningElement {
  key: string
  label: string
  detail: string
}

/** 결정 1건이 어떤 기획요소에 해당하는지 분류 (없으면 null). */
function classify(d: DecisionLogEntry): { key: string; label: string } | null {
  const hay = `${d.axis} ${d.decision}`.toLowerCase()
  // 사전진단 — D2 의 진단/사전학습.
  if (
    /진단|dogs|actt|5d|사전학습|prelearning|prelearn/i.test(hay) ||
    d.axis.includes('preLearning')
  ) {
    return { key: 'prediagnosis', label: '사전진단·사전학습' }
  }
  // 선발 설계 — D2 의 선발·심사.
  if (d.step === 'D2' && /선발|심사|모집|선정|select/i.test(hay)) {
    return { key: 'selection', label: '선발 설계' }
  }
  // 사후연계 — D7 의 발표·행사·연계·사후.
  if (d.step === 'D7' || /연계|사후|발표|행사|멘토링|네트워킹|후속/i.test(hay)) {
    return { key: 'followup', label: '사후연계·발표' }
  }
  return null
}

export function PlanningElements({ log }: { log: DecisionLogEntry[] }) {
  const elements: PlanningElement[] = []
  const seen = new Set<string>()
  for (const d of log) {
    const c = classify(d)
    if (!c || seen.has(c.key)) continue
    seen.add(c.key)
    elements.push({ key: c.key, label: c.label, detail: d.decision })
  }

  if (elements.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {elements.map((el) => (
        <span
          key={el.key}
          title={el.detail}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: 'var(--ink)',
            background: 'var(--paper)',
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--accent)',
            padding: '5px 10px',
            wordBreak: 'keep-all',
          }}
        >
          <strong style={{ fontWeight: 700 }}>{el.label}</strong>
          <span style={{ color: 'var(--muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {el.detail}
          </span>
        </span>
      ))}
    </div>
  )
}

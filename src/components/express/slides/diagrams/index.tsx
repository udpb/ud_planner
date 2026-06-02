'use client'
/**
 * Diagram Pattern Library — Phase N3 (2026-05-29)
 *
 * 8 핵심 도식화 패턴. 모두 디자인 시스템 (Action Orange · NanumHuman · 8pt grid · radius 0) 준수.
 *
 * 패턴:
 *   1. ProcessFlow      — 횡 N단계 → chevron arrows
 *   2. Matrix2x2        — 4분면 비교
 *   3. HierarchyTree    — top-down 위계
 *   4. Timeline         — 월/주차 간트
 *   5. KpiGrid          — 빅 넘버 + 라벨 그리드
 *   6. ComparisonTable  — 좌/우 비교
 *   7. ArchitectureStack — 레이어 스택
 *   8. BeforeAfter      — 변화 강조 (← → )
 */

import React from 'react'

// ─────────────────────────────────────────
// 공통 헤더
// ─────────────────────────────────────────

function SectionHeader({ kicker, headline }: { kicker?: string; headline: string }) {
  return (
    <div style={{ marginBottom: 'var(--ud-gap-element)' }}>
      {kicker && <span className="ud-label en">{kicker}</span>}
      <h2 className="ud-section-title" style={{ marginTop: 'var(--ud-s-2)' }}>
        {headline}
      </h2>
    </div>
  )
}

// ─────────────────────────────────────────
// 1. ProcessFlow — 횡 N단계
// ─────────────────────────────────────────

export interface ProcessFlowProps {
  kicker?: string
  headline: string
  steps: { num?: string; label: string; description?: string }[]
}

export function ProcessFlow({ kicker, headline, steps }: ProcessFlowProps) {
  return (
    <div>
      <SectionHeader kicker={kicker} headline={headline} />
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 'var(--ud-s-5)' }}>
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <div
              style={{
                flex: 1,
                padding: 'var(--ud-s-5) var(--ud-s-3)',
                background: i === 0 ? 'var(--ud-accent-88)' : 'var(--ud-neutral-60)',
                borderTop: '2px solid var(--ud-ink)',
                borderBottom: '2px solid var(--ud-ink)',
                borderLeft: i === 0 ? '2px solid var(--ud-ink)' : 'none',
                borderRight: i === steps.length - 1 ? '2px solid var(--ud-ink)' : 'none',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--ud-s-2)',
              }}
            >
              {s.num && (
                <span className="ud-label en" style={{ color: 'var(--ud-accent)' }}>
                  {s.num}
                </span>
              )}
              <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)', lineHeight: 1.3 }}>
                {s.label}
              </p>
              {s.description && (
                <p className="ud-caption" style={{ lineHeight: 1.4 }}>{s.description}</p>
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderTop: '40px solid transparent',
                  borderBottom: '40px solid transparent',
                  borderLeft: '20px solid var(--ud-ink)',
                  alignSelf: 'center',
                  marginLeft: -1,
                  marginRight: -1,
                  zIndex: 2,
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 2. Matrix2x2 — 2x2 quadrant
// ─────────────────────────────────────────

export interface Matrix2x2Props {
  kicker?: string
  headline: string
  axisX: { label: string; low: string; high: string }
  axisY: { label: string; low: string; high: string }
  quadrants: { q: 'TL' | 'TR' | 'BL' | 'BR'; label: string; description?: string; highlight?: boolean }[]
}

export function Matrix2x2({ kicker, headline, axisX, axisY, quadrants }: Matrix2x2Props) {
  const getQ = (key: string) => quadrants.find((q) => q.q === key)
  return (
    <div>
      <SectionHeader kicker={kicker} headline={headline} />
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gridTemplateRows: '1fr 28px', gap: 0, marginTop: 'var(--ud-s-5)' }}>
        {/* Y axis label */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          <span className="ud-label">{axisY.label}</span>
        </div>
        {/* Grid 2x2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', border: '2px solid var(--ud-ink)' }}>
          {(['TL', 'TR', 'BL', 'BR'] as const).map((key, i) => {
            const q = getQ(key)
            const isTop = i < 2
            const isLeft = i % 2 === 0
            return (
              <div
                key={key}
                style={{
                  padding: 'var(--ud-s-4)',
                  background: q?.highlight ? 'var(--ud-accent-88)' : 'var(--ud-paper)',
                  borderRight: !isLeft ? 'none' : '1px solid var(--ud-ink)',
                  borderLeft: 'none',
                  borderBottom: !isTop ? 'none' : '1px solid var(--ud-ink)',
                  borderTop: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--ud-s-2)',
                }}
              >
                {q ? (
                  <>
                    <span className="ud-label en" style={{ color: q.highlight ? 'var(--ud-accent)' : 'var(--ud-muted)' }}>{key}</span>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)' }}>{q.label}</p>
                    {q.description && <p className="ud-caption" style={{ lineHeight: 1.4 }}>{q.description}</p>}
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
        {/* X axis empty corner */}
        <div />
        {/* X axis label + endpoints */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 'var(--ud-s-2)' }}>
          <span className="ud-caption">← {axisX.low}</span>
          <span className="ud-label">{axisX.label}</span>
          <span className="ud-caption">{axisX.high} →</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 3. KpiGrid — 빅 넘버 + 라벨
// ─────────────────────────────────────────

export interface KpiGridProps {
  kicker?: string
  headline: string
  kpis: { value: string; label: string; sublabel?: string }[]
  columns?: 3 | 4 | 5
}

export function KpiGrid({ kicker, headline, kpis, columns = 3 }: KpiGridProps) {
  return (
    <div>
      <SectionHeader kicker={kicker} headline={headline} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 0,
          marginTop: 'var(--ud-s-5)',
          border: '2px solid var(--ud-ink)',
        }}
      >
        {kpis.map((kpi, i) => (
          <div
            key={i}
            data-block="kpi"
            style={{
              padding: 'var(--ud-s-5) var(--ud-s-4)',
              borderRight: i % columns < columns - 1 ? '1px solid var(--ud-line)' : 'none',
              borderBottom: i < kpis.length - columns ? '1px solid var(--ud-line)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--ud-s-2)',
            }}
          >
            <p
              className="en"
              style={{
                margin: 0,
                fontSize: 'calc(var(--ud-type-display) * 0.7)',
                fontWeight: 700,
                color: 'var(--ud-accent)',
                lineHeight: 1,
              }}
            >
              {kpi.value}
            </p>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)' }}>{kpi.label}</p>
            {kpi.sublabel && <p className="ud-caption">{kpi.sublabel}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 4. HierarchyTree — top-down 위계
// ─────────────────────────────────────────

export interface HierarchyTreeProps {
  kicker?: string
  headline: string
  root: { label: string; sublabel?: string }
  children: { label: string; sublabel?: string; children?: { label: string }[] }[]
}

export function HierarchyTree({ kicker, headline, root, children }: HierarchyTreeProps) {
  return (
    <div>
      <SectionHeader kicker={kicker} headline={headline} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--ud-s-5)', marginTop: 'var(--ud-s-5)' }}>
        {/* Root */}
        <div
          style={{
            background: 'var(--ud-ink)',
            color: 'var(--ud-paper)',
            padding: 'var(--ud-s-4) var(--ud-s-6)',
            minWidth: 200,
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)' }}>{root.label}</p>
          {root.sublabel && (
            <p className="ud-caption" style={{ color: 'var(--ud-dark-70)', marginTop: 'var(--ud-s-1)' }}>
              {root.sublabel}
            </p>
          )}
        </div>
        {/* Connector */}
        <div style={{ width: 2, height: 24, background: 'var(--ud-ink)' }} />
        {/* Children row */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${children.length}, 1fr)`, gap: 'var(--ud-s-3)', width: '100%' }}>
          {children.map((c, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ud-s-3)', alignItems: 'center' }}>
              <div className="ud-box-stroke" style={{ minWidth: '100%', textAlign: 'center' }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--ud-type-body)' }}>{c.label}</p>
                {c.sublabel && <p className="ud-caption" style={{ marginTop: 'var(--ud-s-1)' }}>{c.sublabel}</p>}
              </div>
              {c.children && c.children.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ud-s-2)', width: '100%' }}>
                  {c.children.map((cc, ci) => (
                    <div key={ci} className="ud-box-tint" style={{ padding: 'var(--ud-s-2) var(--ud-s-3)' }}>
                      <p className="ud-caption" style={{ color: 'var(--ud-ink)', fontWeight: 500 }}>
                        {cc.label}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 5. Timeline — 월/주차 간트
// ─────────────────────────────────────────

export interface TimelineProps {
  kicker?: string
  headline: string
  units: string[] // ['M1', 'M2', ..., 'M6']
  tracks: {
    name: string
    bars: { startIdx: number; endIdx: number; label?: string; accent?: boolean }[]
  }[]
}

export function Timeline({ kicker, headline, units, tracks }: TimelineProps) {
  return (
    <div>
      <SectionHeader kicker={kicker} headline={headline} />
      <div style={{ marginTop: 'var(--ud-s-5)' }}>
        {/* Header units */}
        <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${units.length}, 1fr)`, gap: 0, borderBottom: '2px solid var(--ud-ink)', paddingBottom: 'var(--ud-s-2)' }}>
          <span />
          {units.map((u, i) => (
            <span key={i} className="ud-label en" style={{ textAlign: 'center' }}>
              {u}
            </span>
          ))}
        </div>
        {/* Tracks */}
        {tracks.map((t, ti) => (
          <div
            key={ti}
            style={{
              display: 'grid',
              gridTemplateColumns: `120px repeat(${units.length}, 1fr)`,
              gap: 0,
              borderBottom: ti < tracks.length - 1 ? '1px solid var(--ud-line)' : 'none',
              padding: 'var(--ud-s-3) 0',
              position: 'relative',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)' }}>{t.name}</span>
            {/* Bars overlay */}
            <div
              style={{
                gridColumn: `2 / span ${units.length}`,
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: `repeat(${units.length}, 1fr)`,
                gap: 0,
              }}
            >
              {t.bars.map((b, bi) => (
                <div
                  key={bi}
                  style={{
                    gridColumn: `${b.startIdx + 1} / span ${b.endIdx - b.startIdx + 1}`,
                    background: b.accent ? 'var(--ud-accent)' : 'var(--ud-ink)',
                    color: 'var(--ud-paper)',
                    padding: 'var(--ud-s-2) var(--ud-s-3)',
                    fontSize: 'var(--ud-type-caption)',
                    fontWeight: 500,
                  }}
                >
                  {b.label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 6. ComparisonTable — 좌/우
// ─────────────────────────────────────────

export interface ComparisonTableProps {
  kicker?: string
  headline: string
  leftLabel: string
  rightLabel: string
  rows: { dim: string; left: string; right: string; advantageOnRight?: boolean }[]
}

export function ComparisonTable({ kicker, headline, leftLabel, rightLabel, rows }: ComparisonTableProps) {
  return (
    <div>
      <SectionHeader kicker={kicker} headline={headline} />
      <table className="ud-table" style={{ marginTop: 'var(--ud-s-5)' }}>
        <thead>
          <tr>
            <th style={{ width: '25%' }}>구분</th>
            <th style={{ width: '37.5%' }}>{leftLabel}</th>
            <th style={{ width: '37.5%', background: 'var(--ud-accent-88)' }}>{rightLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600, color: 'var(--ud-ink)' }}>{r.dim}</td>
              <td>{r.left}</td>
              <td
                style={{
                  background: r.advantageOnRight ? 'var(--ud-accent-88)' : 'transparent',
                  fontWeight: r.advantageOnRight ? 600 : 400,
                  color: r.advantageOnRight ? 'var(--ud-ink)' : 'var(--ud-soft-ink)',
                }}
              >
                {r.right}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────
// 7. ArchitectureStack — 레이어 스택
// ─────────────────────────────────────────

export interface ArchitectureStackProps {
  kicker?: string
  headline: string
  layers: { name: string; items: string[]; accent?: boolean }[]
}

export function ArchitectureStack({ kicker, headline, layers }: ArchitectureStackProps) {
  return (
    <div>
      <SectionHeader kicker={kicker} headline={headline} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ud-s-2)', marginTop: 'var(--ud-s-5)' }}>
        {layers.map((l, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              border: '2px solid var(--ud-ink)',
              background: l.accent ? 'var(--ud-accent-88)' : 'var(--ud-paper)',
            }}
          >
            <div
              style={{
                padding: 'var(--ud-s-4)',
                background: 'var(--ud-ink)',
                color: 'var(--ud-paper)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 'var(--ud-type-body)' }}>{l.name}</span>
            </div>
            <div
              style={{
                padding: 'var(--ud-s-4)',
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(l.items.length, 4)}, 1fr)`,
                gap: 'var(--ud-s-3)',
              }}
            >
              {l.items.map((item, ii) => (
                <div key={ii} className="ud-box-stroke" style={{ padding: 'var(--ud-s-3)' }}>
                  <p style={{ margin: 0, fontSize: 'var(--ud-type-caption)', color: 'var(--ud-ink)', fontWeight: 500 }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 8. BeforeAfter — 변화 강조
// ─────────────────────────────────────────

export interface BeforeAfterProps {
  kicker?: string
  headline: string
  before: { label: string; description?: string; metrics?: string[] }
  after: { label: string; description?: string; metrics?: string[] }
  /** 가용 높이를 채워 박스를 신장 (DECK-2 페이지 채움) */
  fill?: boolean
}

export function BeforeAfter({ kicker, headline, before, after, fill = false }: BeforeAfterProps) {
  return (
    <div style={fill ? { display: 'flex', flexDirection: 'column', height: '100%', width: '100%' } : undefined}>
      <SectionHeader kicker={kicker} headline={headline} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 60px 1fr',
          gap: 'var(--ud-s-4)',
          alignItems: 'stretch',
          marginTop: 'var(--ud-s-5)',
          flex: fill ? 1 : undefined,
        }}
      >
        {/* Before */}
        <div className="ud-box-stroke" data-block="before-after-side" style={{ padding: 'var(--ud-s-5)' }}>
          <span className="ud-label en" style={{ color: 'var(--ud-muted)' }}>BEFORE</span>
          <p style={{ margin: 'var(--ud-s-3) 0 0', fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-soft-ink)' }}>
            {before.label}
          </p>
          {before.description && (
            <p className="ud-caption" style={{ marginTop: 'var(--ud-s-2)' }}>{before.description}</p>
          )}
          {before.metrics && before.metrics.length > 0 && (
            <ul style={{ margin: 'var(--ud-s-3) 0 0', paddingLeft: 'var(--ud-s-4)' }}>
              {before.metrics.map((m, i) => (
                <li key={i} data-block="ba-metric" className="ud-caption">{m}</li>
              ))}
            </ul>
          )}
        </div>
        {/* Arrow */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: 0,
              height: 0,
              borderTop: '24px solid transparent',
              borderBottom: '24px solid transparent',
              borderLeft: '36px solid var(--ud-accent)',
            }}
          />
        </div>
        {/* After */}
        <div data-block="before-after-side" style={{ padding: 'var(--ud-s-5)', background: 'var(--ud-accent-88)', border: '2px solid var(--ud-accent)' }}>
          <span className="ud-label en">AFTER</span>
          <p style={{ margin: 'var(--ud-s-3) 0 0', fontWeight: 700, fontSize: 'var(--ud-type-body)', color: 'var(--ud-ink)' }}>
            {after.label}
          </p>
          {after.description && (
            <p style={{ margin: 'var(--ud-s-2) 0 0', fontSize: 'var(--ud-type-caption)', color: 'var(--ud-soft-ink)', lineHeight: 1.5 }}>
              {after.description}
            </p>
          )}
          {after.metrics && after.metrics.length > 0 && (
            <ul style={{ margin: 'var(--ud-s-3) 0 0', paddingLeft: 'var(--ud-s-4)' }}>
              {after.metrics.map((m, i) => (
                <li key={i} data-block="ba-metric" className="ud-caption" style={{ color: 'var(--ud-ink)', fontWeight: 500 }}>
                  {m}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

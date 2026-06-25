'use client'

/**
 * BudgetCalcCanvas — 예산 자동화 캔버스 (BR-WS-14 / SI-budget-calc)
 *
 * 워크스페이스 "예산 자동화" 단계의 진짜 적산 표시. 마운트 시
 * `POST /api/projects/[id]/budget-calc` 를 호출 → 결정론 적산(budget-rules.json
 * 기반) 결과를 표시한다. **단가·비율은 전부 서버(budget-rules.json) 출처** — 이
 * 컴포넌트는 표시·편집만(하드코딩 0).
 *
 * 구성:
 *   1. 워터폴 요약 (R → VAT → R' → IC/IDC → DR).
 *   2. AC(실비) / PC(인건비) 라인 — 금액 **인라인 편집**(client state 만, 이번엔 미저장).
 *   3. OR(영업이익) · 마진율 — 편집값 반영해 재계산.
 *   4. 경고 배지 (적자/마진 부족/재검토).
 *   세션·코치 없으면 "커리큘럼·코치 먼저" 안내.
 *
 * 디자인킷 260529: accent #F05519 1개 · radius 0 · 틴트 박스(neutral-90 + accent border).
 * 편집은 client state — 저장은 이번 범위 밖(향후 Budget 레코드 연계, ADR 후보).
 */

import { useEffect, useMemo, useState } from 'react'

import type { BudgetLine, BudgetResult } from '@/lib/program-design/budget-calc'

interface BudgetInputEcho {
  channel: 'B2G' | 'B2B'
  sessionCount: number
  coachCount: number
  durationMonths: number
  hasBudget: boolean
}

interface ApiResponse {
  result: BudgetResult
  input: BudgetInputEcho
}

interface Props {
  projectId: string
}

// ─────────────────────────────────────────────────────────────────
// 포맷 헬퍼
// ─────────────────────────────────────────────────────────────────

/** 원 → "n.nn억 / n백만 / n원". */
function formatWon(v: number): string {
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}억`
  if (v >= 1e6) return `${Math.round(v / 1e6).toLocaleString()}백만`
  return `${Math.round(v).toLocaleString()}원`
}

// ─────────────────────────────────────────────────────────────────
// 인라인 스타일 토큰 (디자인킷 — BudgetSummaryCanvas 와 동일 언어)
// ─────────────────────────────────────────────────────────────────

const tintBox: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderLeft: '3px solid var(--accent)',
  background: 'var(--neutral-90)',
  padding: 16,
  fontSize: 13,
  color: 'var(--soft-ink)',
  lineHeight: 1.6,
}

const cellBase: React.CSSProperties = {
  border: '1px solid var(--line)',
  background: 'var(--neutral-90)',
  padding: 12,
}

// ─────────────────────────────────────────────────────────────────
// 적산 라인 (인라인 편집 가능) — client state 만, 미저장.
// ─────────────────────────────────────────────────────────────────

function LineRow({
  line,
  onAmount,
}: {
  line: BudgetLine
  onAmount: (v: number) => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid var(--line-soft)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--ink)' }}>{line.label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          {line.basis}
        </div>
      </div>
      <input
        type="number"
        value={line.amount}
        onChange={(e) => onAmount(Number(e.target.value) || 0)}
        aria-label={`${line.label} 금액 (원)`}
        style={{
          width: 130,
          textAlign: 'right',
          border: '1px solid var(--line)',
          background: 'var(--paper)',
          padding: '4px 8px',
          fontSize: 13,
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────

export function BudgetCalcCanvas({ projectId }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // PM 편집값 (라인 amount override) — index 키. 미저장(client state 만).
  const [acEdits, setAcEdits] = useState<Record<number, number>>({})
  const [pcEdits, setPcEdits] = useState<Record<number, number>>({})

  useEffect(() => {
    // projectId 당 1회 마운트 적산 — 초기 state(loading=true·error=null)면 충분해
    // 동기 setState 리셋을 두지 않는다(불필요한 cascading render 방지).
    let alive = true
    fetch(`/api/projects/${projectId}/budget-calc`, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            message?: string
          }
          throw new Error(body.message ?? `적산 실패 (${res.status})`)
        }
        return (await res.json()) as ApiResponse
      })
      .then((json) => {
        if (!alive) return
        setData(json)
        setAcEdits({})
        setPcEdits({})
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : '적산 실패')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [projectId])

  // PM 편집 반영한 라인 (amount override).
  const acLines = useMemo<BudgetLine[]>(
    () =>
      (data?.result.acLines ?? []).map((l, i) =>
        i in acEdits ? { ...l, amount: acEdits[i] } : l,
      ),
    [data, acEdits],
  )
  const pcLines = useMemo<BudgetLine[]>(
    () =>
      (data?.result.pcLines ?? []).map((l, i) =>
        i in pcEdits ? { ...l, amount: pcEdits[i] } : l,
      ),
    [data, pcEdits],
  )

  // 편집값으로 AC/PC/OR/마진 재계산 (워터폴 DR/R' 은 서버값 고정).
  const recomputed = useMemo(() => {
    if (!data) return null
    const { waterfall } = data.result
    const ac = acLines.reduce((s, l) => s + l.amount, 0)
    const pc = pcLines.reduce((s, l) => s + l.amount, 0)
    const or = waterfall.DR - pc - ac
    const marginRate = waterfall.Rprime > 0 ? or / waterfall.Rprime : 0
    // 경고 재산출 (편집 반영).
    const warnings: string[] = []
    if (!data.input.hasBudget) {
      warnings.push('총예산(R)이 없습니다 — RFP 분석에서 총 예산을 먼저 입력하세요.')
    }
    if (ac + pc > waterfall.DR) {
      warnings.push('실비(AC)+인건비(PC)가 사업예산(DR)을 초과합니다 — 적자 위험.')
    }
    if (waterfall.Rprime > 0 && marginRate < 0.05) {
      warnings.push(`마진율 ${(marginRate * 100).toFixed(1)}% — 권장 하한(5%) 미만.`)
    } else if (waterfall.Rprime > 0 && marginRate > 0.2) {
      warnings.push(`마진율 ${(marginRate * 100).toFixed(1)}% — 권장 상한(20%) 초과.`)
    }
    return { ac, pc, or, marginRate, warnings }
  }, [data, acLines, pcLines])

  if (loading) {
    return (
      <div style={{ ...tintBox, maxWidth: 880 }}>
        <strong style={{ fontWeight: 700 }}>예산 적산 중…</strong>
        <p style={{ marginTop: 8 }}>
          2026 단가표 + 워터폴로 커리큘럼·코치 기반 bottom-up 적산을 계산합니다.
        </p>
      </div>
    )
  }

  if (error || !data || !recomputed) {
    return (
      <div style={{ ...tintBox, maxWidth: 880 }}>
        <strong style={{ fontWeight: 700 }}>예산 적산을 불러오지 못했습니다.</strong>
        <p style={{ marginTop: 8 }}>{error ?? '알 수 없는 오류'}</p>
      </div>
    )
  }

  const { waterfall } = data.result
  const { input } = data
  const noInputs = input.sessionCount === 0 && input.coachCount === 0

  const waterfallCells: { label: string; value: number; sub?: string }[] = [
    { label: '총예산 R (VAT 포함)', value: waterfall.R },
    { label: 'VAT', value: waterfall.VAT, sub: 'R × 10% / 1.1' },
    { label: "공급가 R'", value: waterfall.Rprime, sub: 'R − VAT' },
    { label: '간접비 IC', value: waterfall.IC, sub: "R' × 15%" },
    { label: 'IDC', value: waterfall.IDC, sub: "R' × 1.5%" },
    { label: '사업예산 DR', value: waterfall.DR, sub: "R' − IC − IDC" },
  ]

  const marginPct = recomputed.marginRate * 100
  const marginColor =
    recomputed.marginRate < 0.05 || recomputed.or < 0
      ? 'var(--accent)'
      : 'var(--ink)'

  return (
    <div style={{ maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 입력 부족 안내 */}
      {noInputs && (
        <div style={tintBox}>
          <strong style={{ fontWeight: 700 }}>
            커리큘럼·코치를 먼저 확정하면 적산이 정밀해집니다.
          </strong>
          <p style={{ marginTop: 8 }}>
            현재 회차·코치 입력이 없어 워터폴·운영/홍보/디자인 기본 라인만 적산했습니다.{' '}
            <strong>프로그램 기획</strong>(회차)·<strong>코치 매칭</strong>을 진행한 뒤
            다시 이 단계를 열면 코칭료·강의료가 채워집니다.
          </p>
        </div>
      )}

      {/* ── 워터폴 ── */}
      <section>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
          재무 워터폴
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 2,
          }}
        >
          {waterfallCells.map((c, i) => (
            <div
              key={c.label}
              style={{
                ...cellBase,
                background: i === 5 ? 'var(--neutral-60)' : 'var(--neutral-90)',
                borderTop: i === 5 ? '3px solid var(--accent)' : '1px solid var(--line)',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.label}</div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 17,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatWon(c.value)}
              </div>
              {c.sub && (
                <div style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 2 }}>
                  {c.sub}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── AC 실비 ── */}
      <section>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
          실비 (AC) — bottom-up 적산 초안
        </h3>
        <div style={{ ...tintBox, borderLeft: '1px solid var(--line)', padding: '4px 16px' }}>
          {acLines.length === 0 ? (
            <p style={{ padding: '8px 0', fontSize: 12, color: 'var(--muted)' }}>
              적산된 실비 라인이 없습니다 (단가표 매칭 0).
            </p>
          ) : (
            acLines.map((l, i) => (
              <LineRow
                key={`ac-${i}`}
                line={l}
                onAmount={(v) => setAcEdits((p) => ({ ...p, [i]: v }))}
              />
            ))
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0 4px',
              fontWeight: 700,
              fontSize: 13,
              color: 'var(--ink)',
            }}
          >
            <span>실비 합계 (AC)</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatWon(recomputed.ac)}
            </span>
          </div>
        </div>
      </section>

      {/* ── PC 인건비 ── */}
      <section>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
          인건비 (PC) — 투입인력 초안
        </h3>
        <div style={{ ...tintBox, borderLeft: '1px solid var(--line)', padding: '4px 16px' }}>
          {pcLines.length === 0 ? (
            <p style={{ padding: '8px 0', fontSize: 12, color: 'var(--muted)' }}>
              적산된 인건비 라인이 없습니다 (기간 0 또는 단가표 매칭 0).
            </p>
          ) : (
            pcLines.map((l, i) => (
              <LineRow
                key={`pc-${i}`}
                line={l}
                onAmount={(v) => setPcEdits((p) => ({ ...p, [i]: v }))}
              />
            ))
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0 4px',
              fontWeight: 700,
              fontSize: 13,
              color: 'var(--ink)',
            }}
          >
            <span>인건비 합계 (PC)</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatWon(recomputed.pc)}
            </span>
          </div>
        </div>
      </section>

      {/* ── OR · 마진 ── */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 2,
        }}
      >
        <div style={{ ...cellBase, borderTop: '3px solid var(--accent)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            영업이익 OR (DR − PC − AC)
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 20,
              fontWeight: 700,
              color: marginColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatWon(recomputed.or)}
          </div>
        </div>
        <div style={{ ...cellBase, borderTop: '3px solid var(--accent)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>마진율 (OR / R&apos;)</div>
          <div
            style={{
              marginTop: 4,
              fontSize: 20,
              fontWeight: 700,
              color: marginColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {marginPct.toFixed(1)}%
          </div>
        </div>
      </section>

      {/* ── 경고 ── */}
      {recomputed.warnings.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recomputed.warnings.map((w, i) => (
            <div
              key={i}
              role="alert"
              style={{
                border: '1px solid var(--accent)',
                borderLeft: '3px solid var(--accent)',
                background: 'var(--accent-88)',
                padding: '8px 12px',
                fontSize: 12,
                color: 'var(--ink)',
              }}
            >
              {w}
            </div>
          ))}
        </section>
      )}

      {/* 근거 + 편집 안내 */}
      <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
        근거: {data.result.source} · 채널 {input.channel} · {input.sessionCount}회차 ·
        코치 {input.coachCount}명 · {input.durationMonths}개월. 금액은 PM 편집 초안입니다
        (수정값은 OR·마진에 즉시 반영, 단가·비율은 2026 단가표 출처). 이번 단계에서는
        편집값이 저장되지 않습니다.
      </p>
    </div>
  )
}

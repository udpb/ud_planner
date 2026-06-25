'use client'

/**
 * BudgetCalcCanvas — 예산 자동화 캔버스 (BR-WS-14 / BR-WS-15 live 연동)
 *
 * 워크스페이스 "예산 자동화" 단계의 진짜 적산 표시. **BR-WS-15: 단계 간 라이브 연동** —
 * 더 이상 마운트 시 API 를 fetch 하지 않고, 공유 Live Plan(WorkspacePlanContext)의
 * 회차(sessions)·필요 코치 수(coachCount)·총예산·채널·기간 + 서버가 주입한 단가표
 * (budgetRules)로 **client 에서 calcBudget 을 즉시 호출**(useMemo)한다. 커리큘럼 회차를
 * 바꾸면 코칭료·강의료·코치 수가 즉시 따라오고 마진율이 실시간 재계산된다.
 *
 * **단가·비율은 전부 서버(budget-rules.json) 출처** — 이 컴포넌트는 표시·편집만
 * (하드코딩 0). calcBudget 은 순수 함수(client-safe, BR-WS-15 분리) — node:fs 번들 X.
 *
 * 구성:
 *   1. 워터폴 요약 (R → VAT → R' → IC/IDC → DR).
 *   2. AC(실비) / PC(인건비) 라인 — 금액 **인라인 편집**(client state 만, 이번엔 미저장).
 *   3. OR(영업이익) · 마진율 — 편집값 반영해 재계산.
 *   4. 경고 배지 (적자/마진 부족/재검토).
 *   세션·코치 없으면 "커리큘럼·코치 먼저" 안내. budgetRules 미주입이면 안내(server 로드 실패).
 *
 * 디자인킷 260529: accent #F05519 1개 · radius 0 · 틴트 박스(neutral-90 + accent border).
 * 편집은 client state — 저장은 이번 범위 밖(향후 Budget 레코드 연계, ADR 후보).
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  calcBudget,
  type BudgetCalcInput,
  type BudgetLine,
} from '@/lib/program-design/budget-calc'
import {
  applyBudgetOps,
  type BudgetLineRef,
  type BudgetOp,
} from '@/lib/program-design/budget-ops'

import { useWorkspacePlan } from './WorkspacePlanContext'

/**
 * BR-WS-22: 대화가 해석한 예산 조정 ops(라인 override). ProgramWorkspace 가
 * 단조 증가 id 와 함께 주입 — 같은 객체를 두 번 적용하지 않게 useEffect 에서 id 가드.
 * (design 의 incomingOps 미러 — 별도 채널이라 design ops 와 섞이지 않음.)
 */
interface IncomingBudgetOps {
  id: string
  ops: BudgetOp[]
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

export function BudgetCalcCanvas({
  incomingOps,
}: {
  /** BR-WS-22: 대화 → 라인 override ops(단조 id). 없으면 대화 연동 없음(기존 동작). */
  incomingOps?: IncomingBudgetOps | null
} = {}) {
  // BR-WS-15: 공유 Live Plan 구독 — 회차/코치수/예산/채널/기간/단가표.
  // BR-WS-22: setBudgetLines 로 현재 라인을 context 에 보고(대화가 구독).
  const {
    sessions,
    coachCount,
    totalBudget,
    channel,
    durationMonths,
    budgetRules,
    setBudgetLines,
  } = useWorkspacePlan()

  // PM 편집값 (라인 amount override) — **라벨 키**(BR-WS-15). 라이브 재적산으로 라인
  // 구성이 바뀌어도(회차 변경) index 어긋남 없이: 살아남은 라벨의 편집만 적용되고
  // 사라진 라벨의 편집은 자연히 무시된다(별도 리셋 불필요). 미저장(client state 만).
  const [acEdits, setAcEdits] = useState<Record<string, number>>({})
  const [pcEdits, setPcEdits] = useState<Record<string, number>>({})

  // ── BR-WS-22: 대화 → 라인 override 수신(design 의 incomingOps 미러) ──
  // 단조 id 가드: 같은 incomingOps 객체를 두 번 적용하지 않게 마지막 처리한 id 를 기억.
  // applyBudgetOps 는 순수 — 현재 ac/pcEdits 맵에 setLine(설정)/resetLine(삭제)만 반영.
  const lastOpsIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!incomingOps) return
    if (lastOpsIdRef.current === incomingOps.id) return // 이미 적용한 ops — 이중 적용 방지.
    lastOpsIdRef.current = incomingOps.id
    const ops = incomingOps.ops
    if (ops.length === 0) return
    let cancelled = false
    // setState 는 microtask 경계 이후에만 호출 — react-hooks/set-state-in-effect 규칙 회피
    // (AutoRecommendedPool 패턴: 동기 setState 금지). id-guard 가 이미 이중 적용 방지.
    // applyBudgetOps 는 {ac,pc} 통합 맵 순수 변환 — AC/PC 각각 functional 업데이트로 반영
    // (자기 섹션 op 만 그 맵에 쓰므로 섹션별 분리 적용 결과는 동일).
    void Promise.resolve().then(() => {
      if (cancelled) return
      setAcEdits((prevAc) => applyBudgetOps({ ac: prevAc, pc: {} }, ops).ac)
      setPcEdits((prevPc) => applyBudgetOps({ ac: {}, pc: prevPc }, ops).pc)
    })
    return () => {
      cancelled = true
    }
  }, [incomingOps])

  // ── 라이브 적산: 단가표 + Live Plan 입력으로 client 에서 calcBudget(useMemo) ──
  // 회차(sessions)·코치수·예산·채널·기간이 변하면 즉시 재계산. node:fs 번들 X(순수).
  const base = useMemo(() => {
    if (!budgetRules) return null
    const calcSessions: BudgetCalcInput['sessions'] = (sessions ?? []).map(
      (s) => ({ kind: s.kind, hours: s.hours, title: s.title }),
    )
    return calcBudget(budgetRules, {
      totalBudget,
      channel,
      sessions: calcSessions,
      coachCount,
      durationMonths,
    })
  }, [budgetRules, sessions, totalBudget, channel, coachCount, durationMonths])

  // 적산 입력 에코(안내·근거 표기용).
  const sessionCount = sessions?.length ?? 0

  // PM 편집 반영한 라인 (라벨 키 amount override).
  const acLines = useMemo<BudgetLine[]>(
    () =>
      (base?.acLines ?? []).map((l) =>
        l.label in acEdits ? { ...l, amount: acEdits[l.label] } : l,
      ),
    [base, acEdits],
  )
  const pcLines = useMemo<BudgetLine[]>(
    () =>
      (base?.pcLines ?? []).map((l) =>
        l.label in pcEdits ? { ...l, amount: pcEdits[l.label] } : l,
      ),
    [base, pcEdits],
  )

  // 편집값으로 AC/PC/OR/마진 재계산 (워터폴 DR/R' 은 적산값 고정).
  const recomputed = useMemo(() => {
    if (!base) return null
    const { waterfall } = base
    const ac = acLines.reduce((s, l) => s + l.amount, 0)
    const pc = pcLines.reduce((s, l) => s + l.amount, 0)
    const or = waterfall.DR - pc - ac
    const marginRate = waterfall.Rprime > 0 ? or / waterfall.Rprime : 0
    // 경고 재산출 (편집 반영).
    const warnings: string[] = []
    if (!(totalBudget > 0)) {
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
    // DR 분할(각/DR) — 관찰값 비교용. 재분배 아님(진단만, ADR-030).
    const split = {
      pcRate: waterfall.DR > 0 ? pc / waterfall.DR : 0,
      acRate: waterfall.DR > 0 ? ac / waterfall.DR : 0,
      orRate: waterfall.DR > 0 ? or / waterfall.DR : 0,
    }
    // drSplitObserved 가드 진단 (편집 반영) — OR 이 관찰 range 밖이면 "왜"를 짚는다.
    const observed = budgetRules?.waterfall?.drSplitObserved
    if (waterfall.DR > 0 && observed?.orRate) {
      const obsOr = observed.orRate
      const obsAc = observed.acRate
      const orRange = obsOr.range
      const outOfRange =
        (orRange
          ? split.orRate < orRange[0] || split.orRate > orRange[1]
          : false) || split.orRate > 0.2
      if (outOfRange) {
        const pct = (n: number) => (n * 100).toFixed(1)
        const obsAcStr =
          obsAc && typeof obsAc.median === 'number'
            ? ` AC 계산 ${pct(split.acRate)}% vs 관찰 중앙 ${pct(obsAc.median)}% —`
            : ` AC 계산 ${pct(split.acRate)}% —`
        warnings.push(
          `마진 ${pct(split.orRate)}% (DR 기준) — 관찰 중앙 ${pct(obsOr.median)}% 밖.${obsAcStr} 운영비/행사/회차/코치등급/투입률 점검. (강제 보정 없음 — 직접 조정)`,
        )
      }
    }
    return { ac, pc, or, marginRate, split, warnings }
  }, [base, acLines, pcLines, totalBudget, budgetRules])

  // ── BR-WS-22: 현재 라인을 context 로 보고(대화 동봉 근거) — sessions 의 onSessionsChange 미러 ──
  // acLines/pcLines(편집 반영분)를 BudgetLineRef[] 로 평탄화해 setBudgetLines. 직렬화 가드로
  // 동일 내용이면 setState skip(무한 갱신 방지). marginRate 는 라인에 안 싣고 chat 이 별도 전송.
  const reportedLines = useMemo<BudgetLineRef[]>(
    () => [
      ...acLines.map((l) => ({ section: 'AC' as const, label: l.label, amount: l.amount })),
      ...pcLines.map((l) => ({ section: 'PC' as const, label: l.label, amount: l.amount })),
    ],
    [acLines, pcLines],
  )
  const reportSig = JSON.stringify(reportedLines)
  const lastReportSigRef = useRef<string | null>(null)
  useEffect(() => {
    if (lastReportSigRef.current === reportSig) return // 동일 라인 — 보고 skip.
    lastReportSigRef.current = reportSig
    setBudgetLines(reportedLines)
  }, [reportSig, reportedLines, setBudgetLines])

  // 단가표 미주입(server 로드 실패) — 적산 불가 안내.
  if (!base || !recomputed) {
    return (
      <div style={{ ...tintBox, maxWidth: 880 }}>
        <strong style={{ fontWeight: 700 }}>예산 단가표를 불러오지 못했습니다.</strong>
        <p style={{ marginTop: 8 }}>
          2026 단가표(budget-rules.json) 로드에 실패해 적산을 계산할 수 없습니다.
          운영자에게 문의하거나 페이지를 새로고침하세요.
        </p>
      </div>
    )
  }

  const { waterfall } = base
  const noInputs = sessionCount === 0 && coachCount === 0

  const waterfallCells: { label: string; value: number; sub?: string }[] = [
    { label: '총예산 R (VAT 포함)', value: waterfall.R },
    { label: 'VAT', value: waterfall.VAT, sub: 'R × 10% / 1.1' },
    { label: "공급가 R'", value: waterfall.Rprime, sub: 'R − VAT' },
    { label: '간접비 IC', value: waterfall.IC, sub: "R' × 15%" },
    { label: 'IDC', value: waterfall.IDC, sub: "R' × 1.5%" },
    { label: '사업예산 DR', value: waterfall.DR, sub: "R' − IC − IDC" },
  ]

  // 관찰 분할 참조 (drSplitObserved median, DR 기준) — PM 현실 기준 인지용.
  const observed = budgetRules?.waterfall?.drSplitObserved
  const obsPct = (n: number | undefined) =>
    typeof n === 'number' ? `${(n * 100).toFixed(0)}%` : '—'
  const calcPct = (n: number) => `${(n * 100).toFixed(0)}%`

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
                onAmount={(v) => setAcEdits((p) => ({ ...p, [l.label]: v }))}
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
                onAmount={(v) => setPcEdits((p) => ({ ...p, [l.label]: v }))}
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

      {/* ── 관찰 분할 참조 (drSplitObserved) — 현실 기준 vs 계산값 ── */}
      {observed && (
        <section>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--ink)',
              marginBottom: 4,
            }}
          >
            실예산 관찰 분할 (참조 · DR 기준)
          </h3>
          <div style={tintBox}>
            <p style={{ margin: 0 }}>
              26개 실예산 관찰 중앙:{' '}
              <strong style={{ fontWeight: 700 }}>
                인건비 {obsPct(observed.pcRate?.median)} · 실비{' '}
                {obsPct(observed.acRate?.median)} · 마진{' '}
                {obsPct(observed.orRate?.median)}
              </strong>{' '}
              (DR 기준).
            </p>
            <p style={{ margin: '6px 0 0' }}>
              현재 적산:{' '}
              <strong
                style={{
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                인건비 {calcPct(recomputed.split.pcRate)} · 실비{' '}
                {calcPct(recomputed.split.acRate)} · 마진{' '}
                {calcPct(recomputed.split.orRate)}
              </strong>
              . 관찰값은 현실 기준 참조일 뿐 — 강제 보정 없음(저비용 프로그램이면 그대로
              낮게 나옵니다).
            </p>
          </div>
        </section>
      )}

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

      {/* 근거 + 편집 안내 (라이브: 커리큘럼 회차·코치수 변경 즉시 반영) */}
      <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
        근거: {base.source} · 채널 {channel} · {sessionCount}회차 · 코치 {coachCount}명 ·{' '}
        {durationMonths}개월. 커리큘럼 회차를 바꾸면 코치 수·적산이 즉시 따라옵니다.
        금액은 PM 편집 초안입니다 (수정값은 OR·마진에 즉시 반영, 단가·비율은 2026 단가표
        출처). 이번 단계에서는 편집값이 저장되지 않습니다.
      </p>
    </div>
  )
}

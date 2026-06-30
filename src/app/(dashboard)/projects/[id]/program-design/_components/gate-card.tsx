'use client'

/**
 * BR-3c — 읽을 수 있는 게이트 카드
 *
 *   - axis==='operatingType' → **운영 유형 선택 카드**: T1~T5 날코드 대신
 *     이름(정규 강좌형/몰입 캠프형/장기 여정형/개별 밀착형/행사 운영형)
 *     + 한 줄 설명 + 실측 프로파일(기간·회차·코칭) + 추천 accent 강조.
 *     이름·설명·실측은 모두 `OperatingTypeMeta`(design-rules.json B 프로파일)에서.
 *   - 그 외 axis → 일반 게이트(질문 + why + 선택지/자유텍스트).
 *
 * 응답 → onAnswer(axis, value) → BR-3b 턴 루프 그대로 (재호출).
 * 디자인킷: radius 0, accent 면 최소(추천·ask_human 만), 킷 토큰만.
 */

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { PlanGate } from '@/lib/program-design/plan-types'
import type { ConceptShape } from '@/lib/program-design/concept-synth'
import type { OperatingTypeMeta } from './operating-type-meta'
import {
  AXES,
  anchorMetrics,
  axisProfile,
  biasTypeFromConcept,
  nearestType,
  roundedMetricValue,
  type AxisVector,
} from './concept-to-axes'

const GATE_REASON_LABEL: Record<PlanGate['reason'], string> = {
  ask_human: '사람 결정',
  no_approved_rule: '규칙 없음',
  ambiguous_signal: '신호 모호',
  conflict: '충돌',
}

// ─────────────────────────────────────────────────────────────────
// 값 헬퍼 (BR-3b 보존 — 옵션 객체 → 라벨/값)
// ─────────────────────────────────────────────────────────────────

function optionLabel(opt: unknown): string {
  if (opt === null || opt === undefined) return ''
  if (typeof opt === 'string' || typeof opt === 'number' || typeof opt === 'boolean') return String(opt)
  if (typeof opt === 'object') {
    const o = opt as Record<string, unknown>
    const label = o.label ?? o.title ?? o.name ?? o.type ?? o.value
    if (label !== undefined) return String(label)
  }
  try {
    return JSON.stringify(opt)
  } catch {
    return '(값)'
  }
}

function optionValue(opt: unknown): unknown {
  if (opt && typeof opt === 'object') {
    const o = opt as Record<string, unknown>
    if (o.type !== undefined) return o.type
    if (o.value !== undefined) return o.value
  }
  return opt
}

function shortText(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return '(값)'
  }
}

// ─────────────────────────────────────────────────────────────────
// 운영 유형 카드 (이름 + 설명 + 실측 + 추천 강조)
// ─────────────────────────────────────────────────────────────────

function OperatingTypeChoice({
  meta,
  recommended,
  selected,
  disabled,
  onPick,
}: {
  meta: OperatingTypeMeta
  recommended: boolean
  selected: boolean
  disabled: boolean
  onPick: () => void
}) {
  const accent = recommended || selected
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      aria-pressed={selected}
      style={{
        textAlign: 'left',
        display: 'grid',
        gap: 8,
        padding: 14,
        cursor: disabled ? 'default' : 'pointer',
        background: selected ? 'var(--accent-88)' : 'var(--paper)',
        border: `1px solid ${accent ? 'var(--accent)' : 'var(--line)'}`,
        borderLeft: `3px solid ${accent ? 'var(--accent)' : 'var(--line)'}`,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {/* 헤더: 코드 + 이름 + 추천 배지 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{meta.type}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', wordBreak: 'keep-all' }}>
          {meta.name}
        </span>
        {recommended && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              background: 'var(--accent-88)',
              padding: '1px 6px',
            }}
          >
            추천
          </span>
        )}
      </div>

      {/* 한 줄 설명 */}
      <p style={{ fontSize: 12, color: 'var(--soft-ink)', lineHeight: 1.6, wordBreak: 'keep-all' }}>
        {meta.description}
      </p>

      {/* 실측 프로파일 칩 (기간·회차·코칭 등) */}
      {meta.metrics.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {meta.metrics.map((m, i) => (
            <span
              key={i}
              style={{
                fontSize: 11,
                color: 'var(--soft-ink)',
                background: 'var(--neutral-60)',
                padding: '3px 8px',
                whiteSpace: 'nowrap',
                wordBreak: 'keep-all',
              }}
            >
              <span style={{ color: 'var(--muted)' }}>{m.label}</span>{' '}
              <strong style={{ fontWeight: 700 }}>{m.value}</strong>
            </span>
          ))}
        </div>
      )}

      {/* 근거 출처 */}
      <span style={{ fontSize: 10, color: 'var(--muted)' }}>
        실측 {meta.source.label}
        {typeof meta.source.n === 'number' ? ` · n=${meta.source.n}` : ''}
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// 운영 유형 축 컨트롤 (ADR-031 W3) — 박스 선택 → 축 조정 + 추천 + 실측 앵커
//   ① 컨셉-도출 추천 배너  ② 3 슬라이더 + 시간 통째 토글  ③ 최근접 유형 실측 앵커
//   확정 → onAnswer(axis, nearestType) — 기존 post 계약(T1~T5 값) 그대로.
// ─────────────────────────────────────────────────────────────────

/** 축 슬라이더 1개 (0~100, 좌/우 라벨). */
function AxisSlider({
  label,
  left,
  right,
  value,
  disabled,
  onChange,
}: {
  label: string
  left: string
  right: string
  value: number
  disabled: boolean
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: value < 50 ? 'var(--ink)' : 'var(--muted)',
          }}
        >
          {left}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--muted)' }}>
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: value > 50 ? 'var(--ink)' : 'var(--muted)',
          }}
        >
          {right}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        style={{ width: '100%', accentColor: 'var(--accent)', cursor: disabled ? 'default' : 'pointer' }}
      />
    </div>
  )
}

function OperatingTypeAxes({
  gate,
  metas,
  concept,
  disabled,
  pending,
  onAnswer,
}: {
  gate: PlanGate
  metas: OperatingTypeMeta[]
  concept: ConceptShape | null
  disabled: boolean
  pending: unknown
  onAnswer: (axis: string, value: unknown) => void
}) {
  // 추천 = 컨셉 바이어스(있으면) → fallback 엔진 gate.recommended → fallback 첫 유형.
  const conceptBias = biasTypeFromConcept(concept, metas)
  const engineRecType =
    gate.recommended !== undefined && gate.recommended !== null
      ? shortText(optionValue(gate.recommended))
      : undefined
  const engineRecMeta = metas.find((m) => m.type === engineRecType) ?? null
  const recommendedMeta = conceptBias.recommended ?? engineRecMeta ?? metas[0] ?? null
  const recommendedWhy = conceptBias.recommended
    ? conceptBias.why
    : engineRecMeta
      ? `엔진이 RFP 신호로 ${engineRecMeta.name}을(를) 출발점으로 제안합니다`
      : '실측 중앙값 프로파일을 출발점으로 시작합니다'

  // 초기 축 = 추천 유형의 축 프로파일 (없으면 중립).
  const initialAxes: AxisVector = recommendedMeta
    ? axisProfile(recommendedMeta)
    : { tempo: 50, cohort: 50, mode: 15, wholeTime: false }
  const [axes, setAxes] = useState<AxisVector>(initialAxes)

  const resolved = nearestType(axes, metas)
  const isPending = pending !== undefined && resolved !== null && shortText(pending) === resolved.type

  const set = (patch: Partial<AxisVector>) => setAxes((a) => ({ ...a, ...patch }))

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* ① 컨셉-도출 추천 배너 */}
      {recommendedMeta && (
        <div
          style={{
            display: 'grid',
            gap: 2,
            border: '1px solid var(--accent)',
            borderLeft: '3px solid var(--accent)',
            background: 'var(--accent-88)',
            padding: '10px 12px',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', wordBreak: 'keep-all' }}>
            <span style={{ color: 'var(--accent)' }}>
              {concept ? '이 컨셉이면 → ' : '추천 → '}
            </span>
            {recommendedMeta.name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--soft-ink)', lineHeight: 1.5, wordBreak: 'keep-all' }}>
            {recommendedWhy}. 아래 축을 직접 조정하면 추천을 따르지 않아도 됩니다.
          </span>
        </div>
      )}

      {/* ② 축 슬라이더 3 + 시간 통째 토글 */}
      <div style={{ display: 'grid', gap: 12, border: '1px solid var(--line)', padding: 14 }}>
        {AXES.map((ax) => (
          <AxisSlider
            key={ax.key}
            label={ax.key === 'tempo' ? '운영 호흡' : ax.key === 'cohort' ? '단위' : '본체'}
            left={ax.left}
            right={ax.right}
            value={axes[ax.key]}
            disabled={disabled}
            onChange={(v) => set({ [ax.key]: v } as Partial<AxisVector>)}
          />
        ))}

        {/* 시간 통째 토글 (대상이 종일·합숙 가능) */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--ink)',
            cursor: disabled ? 'default' : 'pointer',
            paddingTop: 4,
            borderTop: '1px solid var(--line)',
          }}
        >
          <input
            type="checkbox"
            checked={axes.wholeTime}
            disabled={disabled}
            onChange={(e) => set({ wholeTime: e.target.checked })}
            style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
          />
          대상이 시간을 통째로 낼 수 있음{' '}
          <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(청년·청소년 종일·합숙 등)</span>
        </label>
      </div>

      {/* ③ 현재 축 → 최근접 유형 + 실측 앵커 */}
      {resolved && (
        <div style={{ display: 'grid', gap: 8, border: '1px solid var(--line)', borderLeft: '3px solid var(--ink)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{resolved.type}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', wordBreak: 'keep-all' }}>
              {resolved.name}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              — 라벨은 지금 축 위치의 요약입니다
            </span>
          </div>

          {/* 실측 앵커 칩 (기간·회차·예산 중앙 + n=) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {anchorMetrics(resolved).map((m, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  color: 'var(--soft-ink)',
                  background: 'var(--neutral-60)',
                  padding: '3px 8px',
                  whiteSpace: 'nowrap',
                  wordBreak: 'keep-all',
                }}
              >
                <span style={{ color: 'var(--muted)' }}>{m.label}</span>{' '}
                <strong style={{ fontWeight: 700 }}>{roundedMetricValue(m.value)}</strong>
              </span>
            ))}
            <span
              style={{
                fontSize: 11,
                color: 'var(--muted)',
                background: 'var(--neutral-60)',
                padding: '3px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              실측 {resolved.source.label}
              {typeof resolved.source.n === 'number' ? ` · n=${resolved.source.n}` : ''}
            </span>
          </div>

          {/* 확정 — 현재 nearestType 으로 기존 post 계약(T1~T5). */}
          <div style={{ paddingTop: 2 }}>
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => onAnswer(gate.axis, resolved.type)}
            >
              {isPending ? '진행 중…' : `${resolved.name}(${resolved.type})으로 진행`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// GateCard — 게이트 1건
// ─────────────────────────────────────────────────────────────────

export function GateCard({
  gate,
  pending,
  disabled,
  operatingTypeMeta,
  concept,
  onAnswer,
}: {
  gate: PlanGate
  pending: unknown
  disabled: boolean
  /** axis==='operatingType' 일 때 이름·실측 lookup (design-rules B 프로파일에서). */
  operatingTypeMeta: OperatingTypeMeta[]
  /** ADR-031 W3: 확정 컨셉 — operatingType 게이트 추천 바이어스용(없으면 엔진 fallback). */
  concept?: ConceptShape | null
  onAnswer: (axis: string, value: unknown) => void
}) {
  const [freeText, setFreeText] = useState('')
  // ADR-031 W3 안전망: 축이 아니라 기존 5박스를 직접 보고 싶을 때 펼침.
  const [showRawTypes, setShowRawTypes] = useState(false)
  const isAskHuman = gate.reason === 'ask_human'
  const isOperatingType = gate.axis === 'operatingType'
  const options = Array.isArray(gate.options) ? gate.options : []

  return (
    <div
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--line)',
        borderLeft: isAskHuman ? '3px solid var(--accent)' : '1px solid var(--line)',
        padding: 16,
        display: 'grid',
        gap: 12,
      }}
    >
      {/* 헤더: step + reason */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
          {gate.step} · <span style={{ color: 'var(--soft-ink)' }}>{gate.axis}</span>
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 8px',
            border: `1px solid ${isAskHuman ? 'var(--accent)' : 'var(--line)'}`,
            background: isAskHuman ? 'var(--accent-88)' : 'transparent',
            color: isAskHuman ? 'var(--accent)' : 'var(--muted)',
          }}
        >
          {GATE_REASON_LABEL[gate.reason]}
        </span>
      </div>

      {/* 질문 */}
      <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.4, wordBreak: 'keep-all' }}>
        {gate.question}
      </h3>

      {/* why */}
      <p style={{ fontSize: 12, color: 'var(--soft-ink)', lineHeight: 1.7, wordBreak: 'keep-all' }}>
        {gate.why}
      </p>

      {/* recommended 배지 (운영 유형 외 게이트 — 운영 유형은 카드 내부에서 추천 강조) */}
      {!isOperatingType && gate.recommended !== undefined && gate.recommended !== null && (
        <div style={{ fontSize: 11, color: 'var(--soft-ink)', background: 'var(--neutral-90)', padding: '6px 8px', wordBreak: 'keep-all' }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>추천</span> {shortText(gate.recommended)}
        </div>
      )}

      {/* ── 운영 유형: 축 재구성(ADR-031 W3) — 추천 배너 + 슬라이더 + 실측 앵커 ── */}
      {isOperatingType && operatingTypeMeta.length > 0 ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <OperatingTypeAxes
            gate={gate}
            metas={operatingTypeMeta}
            concept={concept ?? null}
            disabled={disabled}
            pending={pending}
            onAnswer={onAnswer}
          />

          {/* 안전망 — 기존 5유형 박스 직접 보기(접이식). 아무것도 잃지 않음. */}
          <div style={{ display: 'grid', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowRawTypes((v) => !v)}
              style={{
                justifySelf: 'start',
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--muted)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {showRawTypes ? '유형 직접 보기 닫기 ▲' : '유형 직접 보기 (5종 전체) ▼'}
            </button>
            {showRawTypes && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                {operatingTypeMeta.map((meta) => {
                  const recommended =
                    gate.recommended !== undefined &&
                    shortText(optionValue(gate.recommended)) === meta.type
                  const selected = pending !== undefined && shortText(pending) === meta.type
                  return (
                    <OperatingTypeChoice
                      key={meta.type}
                      meta={meta}
                      recommended={recommended}
                      selected={selected}
                      disabled={disabled}
                      onPick={() => onAnswer(gate.axis, meta.type)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : options.length > 0 ? (
        // ── 일반 게이트: 선택지 칩 ──
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {options.map((opt, i) => {
            const val = optionValue(opt)
            const label = optionLabel(opt)
            const isRecommended =
              gate.recommended !== undefined && shortText(optionValue(gate.recommended)) === shortText(val)
            const isSelected = pending !== undefined && shortText(pending) === shortText(val)
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => onAnswer(gate.axis, val)}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '6px 12px',
                  cursor: disabled ? 'default' : 'pointer',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--line)'}`,
                  background: isSelected ? 'var(--accent-88)' : 'var(--paper)',
                  color: isSelected ? 'var(--accent)' : 'var(--ink)',
                  wordBreak: 'keep-all',
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                {label || `옵션 ${i + 1}`}
                {isRecommended && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)' }}>· 추천</span>}
              </button>
            )
          })}
        </div>
      ) : (
        // ── 선택지 없음: 자유 텍스트 ──
        <div style={{ display: 'grid', gap: 6 }}>
          <Textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="여기에 결정 내용을 적어주세요 (예: 운영 방향 또는 값)"
            rows={2}
            disabled={disabled}
            style={{ fontSize: 13 }}
          />
          <div>
            <Button
              type="button"
              size="sm"
              disabled={disabled || freeText.trim().length === 0}
              onClick={() => onAnswer(gate.axis, freeText.trim())}
            >
              이 결정으로 진행
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

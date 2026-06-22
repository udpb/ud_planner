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
import type { OperatingTypeMeta } from './operating-type-meta'

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
// GateCard — 게이트 1건
// ─────────────────────────────────────────────────────────────────

export function GateCard({
  gate,
  pending,
  disabled,
  operatingTypeMeta,
  onAnswer,
}: {
  gate: PlanGate
  pending: unknown
  disabled: boolean
  /** axis==='operatingType' 일 때 이름·실측 lookup (design-rules B 프로파일에서). */
  operatingTypeMeta: OperatingTypeMeta[]
  onAnswer: (axis: string, value: unknown) => void
}) {
  const [freeText, setFreeText] = useState('')
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

      {/* ── 운영 유형: 이름+설명+실측 카드 ── */}
      {isOperatingType && operatingTypeMeta.length > 0 ? (
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

/**
 * scripts/aggregate-design-patterns.ts — ProgramDesignPattern 집계 (BR-1 · ADR-028)
 *
 * LLM 없음 — 순수 코드. `data/program-design/extracted/*.json` 전부 로드 →
 * 채널별·targetStage별·demographic별 세그먼트 × 각 축의 분포를
 * `data/program-design/_aggregate.json` 으로 출력한다.
 *
 * 집계 형태 (섹션 05 가설 매트릭스 검증용 — 세그먼트 키 × 축 키 중첩 객체):
 *   segments.channel["B2G"].axes["operatingFormat.coaching"] = {
 *     n, nullCount, nullRate, confidenceAvg,
 *     fields: {
 *       "types[]": { kind: 'categorical', counts: { '1:1': 3, ... } },
 *       "totalRounds": { kind: 'numeric', n, min, p50, avg, max },
 *       ...
 *     }
 *   }
 *
 * 사용: npx tsx scripts/aggregate-design-patterns.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  programDesignPatternSchema,
  type ProgramDesignPattern,
} from '../src/lib/program-design/operating-format'

const EXTRACTED_DIR = path.join(process.cwd(), 'data', 'program-design', 'extracted')
const OUT_PATH = path.join(process.cwd(), 'data', 'program-design', '_aggregate.json')

// ── 통계 수집 구조 ────────────────────────────────────────────────

interface NumericStat {
  kind: 'numeric'
  values: number[]
}
interface CategoricalStat {
  kind: 'categorical'
  counts: Record<string, number>
}
type FieldStat = NumericStat | CategoricalStat

interface AxisAgg {
  n: number
  nullCount: number
  confidenceSum: number
  /** confidence 가 존재하는 축에서만 카운트 (intensity 는 confidence 없음). */
  confidenceN: number
  fields: Record<string, FieldStat>
}

type AxesAgg = Record<string, AxisAgg>

function getAxisAgg(axes: AxesAgg, key: string): AxisAgg {
  if (!axes[key]) axes[key] = { n: 0, nullCount: 0, confidenceSum: 0, confidenceN: 0, fields: {} }
  return axes[key]
}

function recordLeaf(agg: AxisAgg, fieldPath: string, v: unknown): void {
  if (v === null || v === undefined) return
  if (typeof v === 'number') {
    const f = (agg.fields[fieldPath] ??= { kind: 'numeric', values: [] })
    if (f.kind === 'numeric') f.values.push(v)
    return
  }
  const label = typeof v === 'boolean' ? String(v) : typeof v === 'string' ? v : null
  if (label === null) return
  const f = (agg.fields[fieldPath] ??= { kind: 'categorical', counts: {} })
  if (f.kind === 'categorical') f.counts[label] = (f.counts[label] ?? 0) + 1
}

/** 축 value 를 deep-walk 하며 leaf(숫자/문자열/불리언)를 fieldPath 별로 수집. */
function walkValue(agg: AxisAgg, fieldPath: string, v: unknown): void {
  if (v === null || v === undefined) return
  if (Array.isArray(v)) {
    for (const item of v) walkValue(agg, `${fieldPath}[]`, item)
    return
  }
  if (typeof v === 'object') {
    for (const [k, child] of Object.entries(v)) {
      walkValue(agg, fieldPath ? `${fieldPath}.${k}` : k, child)
    }
    return
  }
  recordLeaf(agg, fieldPath || '(value)', v)
}

interface AxisLike {
  value: unknown
  confidence?: number
}

function recordAxis(axes: AxesAgg, axisKey: string, a: AxisLike): void {
  const agg = getAxisAgg(axes, axisKey)
  agg.n++
  const empty = a.value === null || (Array.isArray(a.value) && a.value.length === 0)
  if (empty) agg.nullCount++
  if (typeof a.confidence === 'number') {
    agg.confidenceSum += a.confidence
    agg.confidenceN++
  }
  if (!empty) walkValue(agg, '', a.value)
}

/** 패턴 1건의 모든 축을 axes 수집기에 기록. */
function recordPattern(axes: AxesAgg, p: ProgramDesignPattern): void {
  for (const [k, a] of Object.entries(p.profileSnapshot)) {
    recordAxis(axes, `profileSnapshot.${k}`, a)
  }
  for (const [k, a] of Object.entries(p.operatingFormat)) {
    recordAxis(axes, `operatingFormat.${k}`, a)
  }
  recordAxis(axes, 'contentMix', p.contentMix)
  recordAxis(axes, 'sessions', p.sessions)
  recordAxis(axes, 'validity', p.validity)
  recordAxis(axes, 'kpiTargets', p.kpiTargets)
  // intensity — confidence 없는 파생값. null 판정: 두 수치 모두 null.
  recordAxis(axes, 'intensity', {
    value:
      p.intensity.totalEducationHours === null && p.intensity.totalWeeks === null
        ? null
        : { totalEducationHours: p.intensity.totalEducationHours, totalWeeks: p.intensity.totalWeeks },
  })
}

// ── 직렬화 (수집기 → 출력 JSON) ──────────────────────────────────

function p50(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

function serializeAxes(axes: AxesAgg): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [axisKey, agg] of Object.entries(axes)) {
    const fields: Record<string, unknown> = {}
    for (const [fp, stat] of Object.entries(agg.fields)) {
      if (stat.kind === 'numeric') {
        const sorted = [...stat.values].sort((a, b) => a - b)
        fields[fp] = {
          kind: 'numeric',
          n: sorted.length,
          min: sorted[0],
          p50: round2(p50(sorted)),
          avg: round2(sorted.reduce((s, v) => s + v, 0) / sorted.length),
          max: sorted[sorted.length - 1],
        }
      } else {
        fields[fp] = { kind: 'categorical', counts: stat.counts }
      }
    }
    out[axisKey] = {
      n: agg.n,
      nullCount: agg.nullCount,
      nullRate: round2(agg.nullCount / Math.max(1, agg.n)),
      confidenceAvg: agg.confidenceN > 0 ? round2(agg.confidenceSum / agg.confidenceN) : null,
      fields,
    }
  }
  return out
}

// ── main ─────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(EXTRACTED_DIR)) {
    console.error(`❌ ${EXTRACTED_DIR} 없음 — extract-design-patterns.ts 를 먼저 실행하세요.`)
    process.exit(1)
  }
  const files = fs.readdirSync(EXTRACTED_DIR).filter((f) => f.endsWith('.json'))
  if (files.length === 0) {
    console.error('❌ extracted/*.json 0건')
    process.exit(1)
  }

  const patterns: ProgramDesignPattern[] = []
  const invalid: string[] = []
  for (const f of files.sort()) {
    const raw = JSON.parse(fs.readFileSync(path.join(EXTRACTED_DIR, f), 'utf8'))
    const r = programDesignPatternSchema.safeParse(raw)
    if (r.success) patterns.push(r.data)
    else {
      invalid.push(f)
      console.warn(`⚠️ zod 불일치 — 집계 제외: ${f}`)
    }
  }

  // 세그먼트 버킷: channel · targetStage · demographic(복수 — 다중 버킷 카운트)
  const overall: AxesAgg = {}
  const segments: Record<string, Record<string, { count: number; axes: AxesAgg }>> = {
    channel: {},
    targetStage: {},
    demographic: {},
  }
  const bucket = (dim: keyof typeof segments, key: string) => {
    const k = key || '(null)'
    if (!segments[dim][k]) segments[dim][k] = { count: 0, axes: {} }
    return segments[dim][k]
  }

  for (const p of patterns) {
    recordPattern(overall, p)
    const channel = p.profileSnapshot.channel.value ?? '(null)'
    const stage = p.profileSnapshot.targetStage.value ?? '(null)'
    const demos = p.profileSnapshot.demographic.value ?? []
    const chB = bucket('channel', channel)
    chB.count++
    recordPattern(chB.axes, p)
    const stB = bucket('targetStage', stage)
    stB.count++
    recordPattern(stB.axes, p)
    for (const d of demos.length > 0 ? demos : ['(null)']) {
      const dB = bucket('demographic', d)
      dB.count++
      recordPattern(dB.axes, p)
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    totalDocs: patterns.length,
    invalidFiles: invalid,
    overall: { count: patterns.length, axes: serializeAxes(overall) },
    segments: Object.fromEntries(
      Object.entries(segments).map(([dim, buckets]) => [
        dim,
        Object.fromEntries(
          Object.entries(buckets).map(([k, b]) => [k, { count: b.count, axes: serializeAxes(b.axes) }]),
        ),
      ]),
    ),
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), 'utf8')
  console.log(
    `✅ 집계 완료 — ${patterns.length}건 (제외 ${invalid.length}) → ${path.relative(process.cwd(), OUT_PATH)}`,
  )
}

main()

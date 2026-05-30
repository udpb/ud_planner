/**
 * Slide Pattern Schema — Phase O3 (2026-05-30)
 *
 * 슬라이드 1장 = 의미 단위. 각 슬라이드는 다음으로 구성:
 *   - headline (한 문장 핵심 메시지)
 *   - kicker (섹션 라벨)
 *   - diagram (시각화 패턴 + 데이터)
 *   - evidence (근거 0~3건)
 *   - caption (보조 설명)
 *
 * 도식화 패턴 8종 — design-kit/slides/diagrams 컴포넌트와 1:1 매핑.
 *
 * 이 schema 는 LLM 이 생성하는 slideSpec 의 정답 형태.
 * produce-ultimate-draft 가 sections.N 마다 1~3 슬라이드 생성.
 */

import { z } from 'zod'

export const DIAGRAM_PATTERNS = [
  'process-flow',
  'matrix-2x2',
  'kpi-grid',
  'hierarchy-tree',
  'timeline',
  'comparison-table',
  'architecture-stack',
  'before-after',
  // 텍스트 only (도형 없음 — 표지·인덱스·섹션 divider)
  'text-only',
] as const

export type DiagramPattern = (typeof DIAGRAM_PATTERNS)[number]

// ─────────────────────────────────────────
// 각 패턴별 데이터 스키마
// ─────────────────────────────────────────

export const ProcessFlowDataSchema = z.object({
  steps: z
    .array(
      z.object({
        num: z.string().max(8).optional(),
        label: z.string().min(2).max(40),
        description: z.string().max(120).optional(),
      }),
    )
    .min(3)
    .max(7),
})

export const Matrix2x2DataSchema = z.object({
  axisX: z.object({
    label: z.string().min(2).max(30),
    low: z.string().max(20),
    high: z.string().max(20),
  }),
  axisY: z.object({
    label: z.string().min(2).max(30),
    low: z.string().max(20),
    high: z.string().max(20),
  }),
  quadrants: z
    .array(
      z.object({
        q: z.enum(['TL', 'TR', 'BL', 'BR']),
        label: z.string().min(2).max(60),
        description: z.string().max(140).optional(),
        highlight: z.boolean().optional(),
      }),
    )
    .min(2)
    .max(4),
})

export const KpiGridDataSchema = z.object({
  columns: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  kpis: z
    .array(
      z.object({
        value: z.string().min(1).max(20),
        label: z.string().min(1).max(20),
        sublabel: z.string().max(60).optional(),
      }),
    )
    .min(3)
    .max(10),
})

export const HierarchyTreeDataSchema = z.object({
  root: z.object({
    label: z.string().min(2).max(60),
    sublabel: z.string().max(80).optional(),
  }),
  children: z
    .array(
      z.object({
        label: z.string().min(2).max(40),
        sublabel: z.string().max(60).optional(),
        children: z.array(z.object({ label: z.string().max(60) })).max(4).optional(),
      }),
    )
    .min(2)
    .max(5),
})

export const TimelineDataSchema = z.object({
  units: z.array(z.string().min(1).max(10)).min(3).max(12),
  tracks: z
    .array(
      z.object({
        name: z.string().min(2).max(40),
        bars: z
          .array(
            z.object({
              startIdx: z.number().int().min(0),
              endIdx: z.number().int().min(0),
              label: z.string().max(40).optional(),
              accent: z.boolean().optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1)
    .max(6),
})

export const ComparisonTableDataSchema = z.object({
  leftLabel: z.string().min(1).max(40),
  rightLabel: z.string().min(1).max(40),
  rows: z
    .array(
      z.object({
        dim: z.string().min(2).max(40),
        left: z.string().min(1).max(80),
        right: z.string().min(1).max(80),
        advantageOnRight: z.boolean().optional(),
      }),
    )
    .min(2)
    .max(8),
})

export const ArchitectureStackDataSchema = z.object({
  layers: z
    .array(
      z.object({
        name: z.string().min(2).max(40),
        items: z.array(z.string().min(1).max(40)).min(1).max(6),
        accent: z.boolean().optional(),
      }),
    )
    .min(2)
    .max(6),
})

export const BeforeAfterDataSchema = z.object({
  before: z.object({
    label: z.string().min(2).max(80),
    description: z.string().max(200).optional(),
    metrics: z.array(z.string().max(60)).max(4).optional(),
  }),
  after: z.object({
    label: z.string().min(2).max(80),
    description: z.string().max(200).optional(),
    metrics: z.array(z.string().max(60)).max(4).optional(),
  }),
})

// ─────────────────────────────────────────
// 슬라이드 spec (1 슬라이드 = 1 spec)
// ─────────────────────────────────────────

export const SlideSpecSchema = z.object({
  /** 섹션 라벨 — 예: "01 제안 배경 및 목적" */
  kicker: z.string().min(2).max(60),
  /** 한 문장 헤드라인 (One Page One Thesis 핵심 메시지) */
  headline: z.string().min(8).max(120),
  /** 보조 캡션 (60자 이내) */
  caption: z.string().max(100).optional(),
  /** 도식화 패턴 + 데이터 */
  diagram: z.object({
    pattern: z.enum(DIAGRAM_PATTERNS),
    data: z.unknown(), // 위 데이터 스키마 중 하나 — 패턴별 validate
  }),
  /** 근거 0~3건 (정량·출처) */
  evidence: z
    .array(
      z.object({
        text: z.string().min(2).max(150),
        source: z.string().max(80).optional(),
      }),
    )
    .max(3)
    .optional(),
  /** 어느 sections.N 에 속한 슬라이드인지 (1~7) */
  sectionNum: z.enum(['1', '2', '3', '4', '5', '6', '7']),
  /** 슬라이드 순서 (섹션 내) */
  order: z.number().int().min(1).max(5),
})
export type SlideSpec = z.infer<typeof SlideSpecSchema>

/**
 * 패턴별 데이터 schema 매핑 — 추가 검증.
 */
export const DIAGRAM_DATA_SCHEMA: Record<DiagramPattern, z.ZodSchema | null> = {
  'process-flow': ProcessFlowDataSchema,
  'matrix-2x2': Matrix2x2DataSchema,
  'kpi-grid': KpiGridDataSchema,
  'hierarchy-tree': HierarchyTreeDataSchema,
  timeline: TimelineDataSchema,
  'comparison-table': ComparisonTableDataSchema,
  'architecture-stack': ArchitectureStackDataSchema,
  'before-after': BeforeAfterDataSchema,
  'text-only': null,
}

/**
 * SlideSpec 의 diagram.data 가 pattern 과 일치하는지 검증.
 */
/**
 * 자산 ID 코드·인용 마커를 본문/근거에서 제거 (P1 — 평가위원 노출 방지).
 * - "[자산 인용: cmpl...]" / "[자산 인용: ...]" 헤더 제거
 * - 괄호 안 cuid 코드 "(cmpl1a2b3c...)" 제거
 * - 단독 cuid 토큰 (cmpl + 20+ 영숫자) 제거
 * 일반 텍스트·정상 출처(통계청 2023.12 등)는 보존.
 */
const ASSET_CITE_MARKER = /\[\s*자산\s*인용\s*:[^\]]*\]/g
const PAREN_CUID = /\(\s*c[a-z0-9]{24,}\s*\)/gi
const BARE_CUID = /\bc[a-z0-9]{24,}\b/gi

export function stripAssetIdMarkers(text: string | undefined | null): string {
  if (!text) return ''
  return text
    .replace(ASSET_CITE_MARKER, '')
    .replace(PAREN_CUID, '')
    .replace(BARE_CUID, '')
    .replace(/\[\s*\]/g, '') // 빈 대괄호 잔여
    .replace(/\(\s*\)/g, '') // 빈 괄호 잔여
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,·])/g, '$1')
    .trim()
}

/** 문자열 길이 clamp 헬퍼 — 비문자열·undefined 는 그대로. */
const cut = (s: unknown, n: number): unknown => (typeof s === 'string' && s.length > n ? s.slice(0, n).trimEnd() : s)
const cutArr = (a: unknown, n: number): unknown => (Array.isArray(a) ? a.map((x) => cut(x, n)) : a)

/**
 * diagram.data 의 string 필드를 패턴별 schema max 로 truncate (drop 대신 clamp).
 * 길이 초과만으로 슬라이드 전체가 reject 되어 내용이 사라지는 것 방지 (visually-complete).
 * 구조(타입/필수 필드) 오류는 clamp 후에도 남아 정상적으로 reject.
 */
function clampDiagramData(pattern: DiagramPattern, raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const d: any = JSON.parse(JSON.stringify(raw))
  switch (pattern) {
    case 'process-flow':
      if (Array.isArray(d.steps)) d.steps.forEach((s: any) => { s.num = cut(s?.num, 8); s.label = cut(s?.label, 40); s.description = cut(s?.description, 120) })
      break
    case 'matrix-2x2':
      ;[d.axisX, d.axisY].forEach((ax: any) => { if (ax) { ax.label = cut(ax.label, 30); ax.low = cut(ax.low, 20); ax.high = cut(ax.high, 20) } })
      if (Array.isArray(d.quadrants)) d.quadrants.forEach((q: any) => { q.label = cut(q?.label, 60); q.description = cut(q?.description, 140) })
      break
    case 'kpi-grid':
      if (Array.isArray(d.kpis)) d.kpis.forEach((k: any) => { k.value = cut(k?.value, 20); k.label = cut(k?.label, 20); k.sublabel = cut(k?.sublabel, 60) })
      break
    case 'hierarchy-tree':
      if (d.root) { d.root.label = cut(d.root.label, 60); d.root.sublabel = cut(d.root.sublabel, 80) }
      if (Array.isArray(d.children)) d.children.forEach((c: any) => { c.label = cut(c?.label, 40); c.sublabel = cut(c?.sublabel, 60); if (Array.isArray(c.children)) c.children.forEach((g: any) => { g.label = cut(g?.label, 60) }) })
      break
    case 'timeline':
      d.units = cutArr(d.units, 10)
      if (Array.isArray(d.tracks)) d.tracks.forEach((t: any) => { t.name = cut(t?.name, 40); if (Array.isArray(t.bars)) t.bars.forEach((b: any) => { b.label = cut(b?.label, 40) }) })
      break
    case 'comparison-table':
      d.leftLabel = cut(d.leftLabel, 40); d.rightLabel = cut(d.rightLabel, 40)
      if (Array.isArray(d.rows)) d.rows.forEach((r: any) => { r.dim = cut(r?.dim, 40); r.left = cut(r?.left, 80); r.right = cut(r?.right, 80) })
      break
    case 'architecture-stack':
      if (Array.isArray(d.layers)) d.layers.forEach((l: any) => { l.name = cut(l?.name, 40); l.items = cutArr(l?.items, 40) })
      break
    case 'before-after':
      ;[d.before, d.after].forEach((b: any) => { if (b) { b.label = cut(b.label, 80); b.description = cut(b.description, 200); b.metrics = cutArr(b.metrics, 60) } })
      break
  }
  return d
}

export function validateSlideSpec(spec: unknown): { ok: true; spec: SlideSpec } | { ok: false; error: string } {
  const base = SlideSpecSchema.safeParse(spec)
  if (!base.success) {
    return { ok: false, error: base.error.issues[0]?.message ?? 'invalid SlideSpec' }
  }
  const data = base.data
  const dataSchema = DIAGRAM_DATA_SCHEMA[data.diagram.pattern]
  if (dataSchema) {
    // 길이 초과로 인한 drop 방지 — clamp 후 검증 (구조 오류는 그대로 reject)
    data.diagram.data = clampDiagramData(data.diagram.pattern, data.diagram.data)
    const dataValidation = dataSchema.safeParse(data.diagram.data)
    if (!dataValidation.success) {
      return {
        ok: false,
        error: `${data.diagram.pattern} data invalid: ${dataValidation.error.issues[0]?.message ?? 'unknown'}`,
      }
    }
  }
  // P1 — 자산 ID 코드 sanitize (headline / caption / evidence)
  data.headline = stripAssetIdMarkers(data.headline)
  if (data.caption) data.caption = stripAssetIdMarkers(data.caption)
  if (Array.isArray(data.evidence)) {
    data.evidence = data.evidence.map((e) => ({
      ...e,
      text: stripAssetIdMarkers(e.text),
      source: e.source ? stripAssetIdMarkers(e.source) : e.source,
    }))
  }
  return { ok: true, spec: data }
}

/**
 * SectionRecommendation — 어떤 섹션엔 어떤 패턴이 잘 맞는지 hint.
 * LLM 이 자유롭게 선택할 수 있지만, 이 기본 매핑을 prompt 에 주입.
 */
export const SECTION_DEFAULT_PATTERNS: Record<string, DiagramPattern[]> = {
  '1': ['before-after', 'kpi-grid', 'text-only'], // 배경·목적
  '2': ['matrix-2x2', 'architecture-stack', 'process-flow'], // 추진 전략
  '3': ['process-flow', 'timeline', 'hierarchy-tree'], // 커리큘럼
  '4': ['hierarchy-tree', 'architecture-stack', 'kpi-grid'], // 운영 체계
  '5': ['kpi-grid', 'comparison-table'], // 예산
  '6': ['kpi-grid', 'before-after', 'timeline'], // 임팩트
  '7': ['kpi-grid', 'timeline', 'comparison-table'], // 수행 실적
}

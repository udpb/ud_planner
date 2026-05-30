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
export function validateSlideSpec(spec: unknown): { ok: true; spec: SlideSpec } | { ok: false; error: string } {
  const base = SlideSpecSchema.safeParse(spec)
  if (!base.success) {
    return { ok: false, error: base.error.issues[0]?.message ?? 'invalid SlideSpec' }
  }
  const data = base.data
  const dataSchema = DIAGRAM_DATA_SCHEMA[data.diagram.pattern]
  if (dataSchema) {
    const dataValidation = dataSchema.safeParse(data.diagram.data)
    if (!dataValidation.success) {
      return {
        ok: false,
        error: `${data.diagram.pattern} data invalid: ${dataValidation.error.issues[0]?.message ?? 'unknown'}`,
      }
    }
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

/**
 * DeckSpec — 덱-우선 저작 스펙↔렌더 계약 (DECK-3, ADR-025 Phase 3)
 *
 * 한 줄 요약: **JSON 직렬화 가능한 DeckSpec 이 DECK-2 리치 컴포넌트를 구동**한다.
 * 손코딩 React(`deck-v3.tsx`) 대신, 이 스펙(JSON)을 `render-spec.tsx`(deckSpecToElements)가
 * 동일한 컴포넌트로 렌더 → DECK-2 동등 밀도 PDF.
 *
 * 설계 원칙:
 *   - **순수 JSON** — React 노드 없음. LLM(author.ts)이 만들고, zod 로 런타임 검증한 뒤 렌더.
 *   - 각 슬라이드 = `kind` 판별 유니온. 각 kind 는 DECK-2 컴포넌트(`rich/index.tsx`)·
 *     diagrams(`BeforeAfter`)·표지/디바이더/마무리(DECK-1) props 를 **1:1** 로 담는다.
 *   - 컴포넌트 props 인터페이스를 **그대로 스펙으로 승격** → `render-spec.tsx` 매핑이 단순.
 *   - 본문 슬라이드는 근거(`evidence`)를 가질 수 있다(밴드는 컴포넌트가 렌더). 근거 =
 *     수치(figure) + 무엇을 증명(proves) + 출처(source). "출처 태그"만 금지.
 *
 * ⚠️ 컴포넌트 props 는 **읽기 전용** — 새 prop 이 필요하면 STOP 후 메인 보고(브리프 §2).
 * 본 파일은 props 를 import 하지 않고 **구조만 미러링**(스펙↔컴포넌트 동형성은 render-spec 이
 * 매핑 시점에 타입으로 보장 — render-spec.tsx 가 spec → props 로 컴파일 타임 확인).
 */

import { z } from 'zod'

// ─────────────────────────────────────────
// 공통 — 아이콘 어휘 (icons.tsx 의 IconName 과 동기)
// ─────────────────────────────────────────
/**
 * icons.tsx `IconName` 과 1:1. 새 아이콘 추가 시 양쪽 동기화 필요.
 * (icons.tsx 는 props 가 아니라 어휘 — 여기서 enum 으로 동결하면 LLM 출력 안전망.)
 */
export const IconNameSchema = z.enum([
  'target',
  'users',
  'rocket',
  'compass',
  'lightbulb',
  'trending-up',
  'check-circle',
  'layers',
  'handshake',
  'map-pin',
  'award',
  'briefcase',
  'flask',
  'presentation',
  'clipboard-check',
  'graduation',
  'building',
  'coins',
])
export type IconNameSpec = z.infer<typeof IconNameSchema>

// ─────────────────────────────────────────
// 공통 — 근거(EvidenceItem) ≅ rich/index EvidenceItem
// ─────────────────────────────────────────
export const EvidenceItemSchema = z.object({
  /** 정량 수치 — 예 "39%", "₩48억", "1:5" */
  figure: z.string().min(1),
  /** 이 수치가 무엇을 증명하는가 (so-what) */
  proves: z.string().min(1),
  /** 출처 — 기관·연도·문서 */
  source: z.string().min(1),
})
export type EvidenceItemSpec = z.infer<typeof EvidenceItemSchema>

/** 본문 슬라이드 공통 헤더 필드 (kicker + headline). */
const headerFields = {
  kicker: z.string().optional(),
  headline: z.string().min(1),
}

// ═════════════════════════════════════════════════════════════════
// 슬라이드 kind — DECK-1 리치 컴포넌트 8종
// ═════════════════════════════════════════════════════════════════

// 1. iconProcess ≅ IconProcessProps
export const IconProcessSpec = z.object({
  kind: z.literal('iconProcess'),
  ...headerFields,
  steps: z
    .array(
      z.object({
        icon: IconNameSchema,
        num: z.string().optional(),
        label: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .min(1),
})

// 2. iconCardGrid ≅ IconCardGridProps
export const IconCardGridSpec = z.object({
  kind: z.literal('iconCardGrid'),
  ...headerFields,
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  cards: z
    .array(
      z.object({
        icon: IconNameSchema,
        tag: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        highlight: z.boolean().optional(),
      }),
    )
    .min(1),
})

// 3. photoOrgGrid ≅ PhotoOrgGridProps
export const PhotoOrgGridSpec = z.object({
  kind: z.literal('photoOrgGrid'),
  ...headerFields,
  people: z
    .array(
      z.object({
        photo: z.string().min(1),
        name: z.string().min(1),
        role: z.string().min(1),
        tags: z.array(z.string()).optional(),
      }),
    )
    .min(1),
  columns: z.union([z.literal(3), z.literal(4)]).optional(),
})

// 4. partnerLogoGrid ≅ PartnerLogoGridProps
export const PartnerLogoGridSpec = z.object({
  kind: z.literal('partnerLogoGrid'),
  ...headerFields,
  partners: z
    .array(
      z.object({
        logo: z.string().optional(),
        name: z.string().min(1),
        note: z.string().optional(),
      }),
    )
    .min(1),
  columns: z.union([z.literal(4), z.literal(5), z.literal(6)]).optional(),
  fill: z.boolean().optional(),
})

// 5. badgeRow ≅ BadgeRowProps
export const BadgeRowSpec = z.object({
  kind: z.literal('badgeRow'),
  badges: z
    .array(
      z.object({
        icon: IconNameSchema.optional(),
        value: z.string().min(1),
        label: z.string().min(1),
      }),
    )
    .min(1),
})

// 6. bigNumberHero ≅ BigNumberHeroProps
export const BigNumberHeroSpec = z.object({
  kind: z.literal('bigNumberHero'),
  ...headerFields,
  bigNumber: z.string().min(1),
  bigCaption: z.string().min(1),
  supportingPoints: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .optional(),
})

// 7. annotatedImage ≅ AnnotatedImageProps
export const AnnotatedImageSpec = z.object({
  kind: z.literal('annotatedImage'),
  ...headerFields,
  image: z.string().min(1),
  annotations: z
    .array(z.object({ title: z.string().min(1), description: z.string().optional() }))
    .min(1),
})

// 8. milestoneTimeline ≅ MilestoneTimelineProps
export const MilestoneTimelineSpec = z.object({
  kind: z.literal('milestoneTimeline'),
  ...headerFields,
  milestones: z
    .array(
      z.object({
        icon: IconNameSchema,
        period: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .min(1),
})

// ═════════════════════════════════════════════════════════════════
// 슬라이드 kind — DECK-2 당선 밀도 컴포넌트 5종 (근거 밴드 layer)
// ═════════════════════════════════════════════════════════════════

// 9. evidenceBand ≅ EvidenceBandProps (단독 밴드 — 보통 다른 컴포넌트에 내장하지만 단독도 허용)
export const EvidenceBandSpec = z.object({
  kind: z.literal('evidenceBand'),
  label: z.string().optional(),
  items: z.array(EvidenceItemSchema).min(1),
})

// 10. coachDetailGrid ≅ CoachDetailGridProps (coaches[].* ≅ CoachDetail)
export const CoachDetailGridSpec = z.object({
  kind: z.literal('coachDetailGrid'),
  ...headerFields,
  coaches: z
    .array(
      z.object({
        photo: z.string().min(1),
        name: z.string().min(1),
        role: z.string().min(1),
        affiliation: z.string().min(1),
        bio: z.array(z.string().min(1)).min(1),
        stats: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) })).min(1),
        tracks: z.array(z.string()).optional(),
      }),
    )
    .min(1),
  evidence: z.array(EvidenceItemSchema).optional(),
  columns: z.union([z.literal(2), z.literal(4)]).optional(),
})

// 11. curriculumMatrix ≅ CurriculumMatrixProps (phases[].* ≅ CurriculumPhase)
export const CurriculumMatrixSpec = z.object({
  kind: z.literal('curriculumMatrix'),
  ...headerFields,
  phases: z
    .array(
      z.object({
        weeks: z.string().min(1),
        phase: z.string().min(1),
        activities: z.array(z.string().min(1)).min(1),
        deliverable: z.string().min(1),
        actionWeek: z.boolean().optional(),
      }),
    )
    .min(1),
  evidence: z.array(EvidenceItemSchema).optional(),
})

// 12. kpiWithLogic ≅ KpiWithLogicProps (kpis[].* ≅ KpiLogicItem)
export const KpiWithLogicSpec = z.object({
  kind: z.literal('kpiWithLogic'),
  ...headerFields,
  kpis: z
    .array(
      z.object({
        value: z.string().min(1),
        label: z.string().min(1),
        logic: z.string().min(1),
      }),
    )
    .min(1),
  evidence: z.array(EvidenceItemSchema).optional(),
})

// 13. strategyCanvas ≅ StrategyCanvasProps (zones[].* ≅ StrategyZone)
export const StrategyCanvasSpec = z.object({
  kind: z.literal('strategyCanvas'),
  ...headerFields,
  zones: z
    .array(
      z.object({
        icon: IconNameSchema,
        num: z.string().optional(),
        title: z.string().min(1),
        body: z.string().min(1),
        rationale: z.string().min(1),
        highlight: z.boolean().optional(),
      }),
    )
    .min(1),
  evidence: z.array(EvidenceItemSchema).optional(),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
})

// 14. beforeAfter ≅ BeforeAfterProps (diagrams/index) — 변화/패러다임 전환
export const BeforeAfterSpec = z.object({
  kind: z.literal('beforeAfter'),
  ...headerFields,
  before: z.object({
    label: z.string().min(1),
    description: z.string().optional(),
    metrics: z.array(z.string()).optional(),
  }),
  after: z.object({
    label: z.string().min(1),
    description: z.string().optional(),
    metrics: z.array(z.string()).optional(),
  }),
  fill: z.boolean().optional(),
})

// ═════════════════════════════════════════════════════════════════
// 슬라이드 kind — 표지 / 섹션 디바이더 / 마무리 (DECK-1 패턴 — deck-v3.tsx)
//   이 셋은 컴포넌트가 아니라 render-spec 이 SlideShell + 인라인 마크업으로 직접 렌더.
// ═════════════════════════════════════════════════════════════════

// cover — 사진 배경 표지 (deck-v3 슬라이드 1)
export const CoverSpec = z.object({
  kind: z.literal('cover'),
  /** en kicker 라벨 (예 "CHUNGNAM · 2026 YOUTH STARTUP ACADEMY") */
  eyebrow: z.string().optional(),
  /** 표지 대제목 (줄바꿈은 \n) */
  title: z.string().min(1),
  /** 부제 한 줄 */
  subtitle: z.string().optional(),
  /** 배경 이미지 절대경로/data URI (없으면 다크 cover) */
  backgroundImage: z.string().optional(),
  /** 하단 푸터 캡션 (예 "언더독스 · UNDERDOGS") */
  footnote: z.string().optional(),
})

// sectionDivider — 큰 번호 + 섹션명 (다크 배경)
export const SectionDividerSpec = z.object({
  kind: z.literal('sectionDivider'),
  /** en kicker (예 "SECTION 03") */
  eyebrow: z.string().optional(),
  /** 큰 번호/대제목 (예 "03") */
  display: z.string().min(1),
  /** 섹션명 (예 "교육 커리큘럼") */
  sectionName: z.string().min(1),
})

// closing — 마무리 (제안 요약 + CTA)
export const ClosingSpec = z.object({
  kind: z.literal('closing'),
  eyebrow: z.string().optional(),
  /** 마무리 대제목 */
  title: z.string().min(1),
  /** 한 줄 요약/CTA */
  subtitle: z.string().optional(),
  /** 배경 이미지 (없으면 다크) */
  backgroundImage: z.string().optional(),
  footnote: z.string().optional(),
})

// ═════════════════════════════════════════════════════════════════
// composite — 한 슬라이드에 컴포넌트 여러 개를 세로로 쌓기
//   deck-v3 슬라이드 2·6·8 패턴: 주 컴포넌트(빅넘버/로고그리드/Before-After) + 근거 밴드 등을
//   한 SlideShell 안에 flex column 으로 적층. evidence 가 없는 컴포넌트(partnerLogoGrid·badgeRow)에도
//   근거 밴드를 붙여 "모든 본문 근거 밴드" 합격선을 만족시킨다.
//   parts 는 비-composite·비-표지 슬라이드 본문(=리치 컴포넌트 spec)만 허용(중첩 금지).
// ═════════════════════════════════════════════════════════════════
const StackablePartSchema = z.discriminatedUnion('kind', [
  IconProcessSpec,
  IconCardGridSpec,
  PhotoOrgGridSpec,
  PartnerLogoGridSpec,
  BadgeRowSpec,
  BigNumberHeroSpec,
  AnnotatedImageSpec,
  MilestoneTimelineSpec,
  EvidenceBandSpec,
  CoachDetailGridSpec,
  CurriculumMatrixSpec,
  KpiWithLogicSpec,
  StrategyCanvasSpec,
  BeforeAfterSpec,
])
export type StackablePart = z.infer<typeof StackablePartSchema>

export const CompositeSpec = z.object({
  kind: z.literal('composite'),
  /** 세로로 쌓을 컴포넌트들. 가용 높이를 채우려면 중간 part 에 fill 권장. */
  parts: z.array(StackablePartSchema).min(2),
  /** 특정 part 를 flex:1 로 신장시킬 인덱스(0-base). 미지정 시 모두 자연 높이. */
  growIndex: z.number().int().min(0).optional(),
})

// ─────────────────────────────────────────
// 슬라이드 판별 유니온
// ─────────────────────────────────────────
export const SlideSpecSchema = z.discriminatedUnion('kind', [
  // 표지/디바이더/마무리
  CoverSpec,
  SectionDividerSpec,
  ClosingSpec,
  // DECK-1 리치 8종
  IconProcessSpec,
  IconCardGridSpec,
  PhotoOrgGridSpec,
  PartnerLogoGridSpec,
  BadgeRowSpec,
  BigNumberHeroSpec,
  AnnotatedImageSpec,
  MilestoneTimelineSpec,
  // DECK-2 밀도 5종 + beforeAfter
  EvidenceBandSpec,
  CoachDetailGridSpec,
  CurriculumMatrixSpec,
  KpiWithLogicSpec,
  StrategyCanvasSpec,
  BeforeAfterSpec,
  CompositeSpec,
])
export type SlideSpec = z.infer<typeof SlideSpecSchema>
export type SlideKind = SlideSpec['kind']

/** 본문이 아닌 슬라이드 kind (표지/디바이더/마무리). 검증·메트릭에서 비본문으로 취급. */
export const NON_BODY_KINDS: ReadonlySet<SlideKind> = new Set<SlideKind>([
  'cover',
  'sectionDivider',
  'closing',
])

// ─────────────────────────────────────────
// 슬라이드를 감싸는 shell 메타 (SlideShell 매핑) — 본문 슬라이드용
// ─────────────────────────────────────────
export const SlideMetaSchema = z.object({
  /** SlideShell kicker (예 "01 제안 배경 및 목적") — 표지/디바이더/마무리는 무시 */
  kicker: z.string().optional(),
  /** density tier — 본문은 'dense' 권장 */
  density: z.enum(['sparse', 'standard', 'dense']).optional(),
})
export type SlideMeta = z.infer<typeof SlideMetaSchema>

/** 1 슬라이드 = body(컴포넌트 spec) + meta(shell). */
export const DeckSlideSchema = z.object({
  /** 컴포넌트/표지 spec */
  body: SlideSpecSchema,
  /** shell 메타 (kicker·density) — 표지/디바이더/마무리는 생략 가능 */
  meta: SlideMetaSchema.optional(),
})
export type DeckSlide = z.infer<typeof DeckSlideSchema>

// ─────────────────────────────────────────
// DeckSpec — 덱 전체
// ─────────────────────────────────────────
export const DeckSpecSchema = z.object({
  /** 스펙 버전 (계약 동결용) */
  version: z.literal('deck-v3').default('deck-v3'),
  /** 덱 제목 (메타) */
  title: z.string().optional(),
  /** 채널 (B2G/B2B/renewal) — 메타 */
  channel: z.enum(['B2G', 'B2B', 'renewal']).optional(),
  /** 슬라이드 목록 (수평 논리: 표지 → 본문 → 마무리) */
  slides: z.array(DeckSlideSchema).min(1),
})
export type DeckSpec = z.infer<typeof DeckSpecSchema>

/**
 * DeckSpec 런타임 검증 — LLM 출력/fixture 안전망.
 * 실패 시 zod 에러를 그대로 throw (호출부가 메시지로 디버그).
 */
export function parseDeckSpec(input: unknown): DeckSpec {
  return DeckSpecSchema.parse(input)
}

/**
 * 안전 파싱 — 검증 실패 시 throw 대신 { ok:false, error } 반환.
 * (author.ts 가 부분 degrade 판단에 사용.)
 */
export function safeParseDeckSpec(
  input: unknown,
): { ok: true; deck: DeckSpec } | { ok: false; error: string } {
  const r = DeckSpecSchema.safeParse(input)
  if (r.success) return { ok: true, deck: r.data }
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}

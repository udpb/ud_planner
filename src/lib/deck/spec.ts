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

// ═════════════════════════════════════════════════════════════════
// per-kind 필드 계약 카탈로그 (DECK-3a — author 슬롯 충실도)
// ─────────────────────────────────────────────────────────────────
//   LLM-facing few-shot — 각 SlideKind 의 **정확한 필드 형태**를 보여 주는 최소 유효
//   DeckSlide 예시 1개씩. authorSlide 가 선택된 kind 의 예시만 프롬프트에 삽입해
//   LLM 이 올바른 필드명(display·sectionName·coaches[]·steps[]·kpis[].value/logic·
//   parts[]·evidence[].proves 등)을 쓰게 강제한다.
//
//   ⚠️ 이 객체들은 **반드시 spec 과 1:1 일치**(불일치 시 의미 없음) — `KIND_EXAMPLE`
//   전체가 `safeParseDeckSpec` 를 통과함을 결정론 유닛(scripts/_check-kind-catalog.ts)이
//   단언한다. 필드명을 바꾸면 그 유닛이 실패해 드리프트를 잡는다.
// ═════════════════════════════════════════════════════════════════

/** 근거 밴드 예시 items (figure/proves/source 3요소 — "출처 태그"만 금지). */
const _EVIDENCE_EXAMPLE: EvidenceItemSpec[] = [
  { figure: '39%', proves: '실행·판로 단절이 생존율 하락의 핵심 원인', source: '중기부 창업기업 실태조사 2025' },
  { figure: '1만+', proves: '코칭 데이터 기반 진단의 신뢰 기반', source: '언더독스 DOGS 누적 코칭 DB' },
]

/**
 * SlideKind → 최소 유효 DeckSlide 예시 (few-shot 계약).
 * 모든 kind 를 빠짐없이 커버(Record 타입이 강제) · 각 예시는 safeParseDeckSpec 통과.
 */
export const KIND_EXAMPLE: Record<SlideKind, DeckSlide> = {
  // ── 표지/디바이더/마무리 (비본문 — meta 생략 가능) ──
  cover: {
    body: {
      kind: 'cover',
      eyebrow: 'CHUNGNAM · 2026 YOUTH STARTUP ACADEMY',
      title: '실행이 더해질 때,\n청년의 아이디어는 지역의 비즈니스가 됩니다',
      subtitle: '충청남도 청년창업 사관학교 운영 제안',
      backgroundImage: '/design-kit/sample/cover-bg.svg',
      footnote: '언더독스 · UNDERDOGS',
    },
  },
  sectionDivider: {
    body: {
      kind: 'sectionDivider',
      eyebrow: 'SECTION 03',
      display: '03',
      sectionName: '교육 커리큘럼',
    },
  },
  closing: {
    body: {
      kind: 'closing',
      eyebrow: 'CLOSING',
      title: '검증된 실행으로,\n충남 청년창업의 다음을 함께 만들겠습니다',
      subtitle: '언더독스 액트프레너십 — 발굴부터 스케일업까지',
      footnote: '언더독스 · UNDERDOGS',
    },
  },
  // ── DECK-1 리치 8종 (본문 — meta.kicker 권장) ──
  iconProcess: {
    meta: { kicker: '02 추진 전략 및 방법론', density: 'dense' },
    body: {
      kind: 'iconProcess',
      kicker: 'PROCESS',
      headline: '발굴부터 스케일업까지 4단계로 실행을 설계합니다',
      steps: [
        { icon: 'target', num: '01', label: '문제 정의', description: 'Inside-Out 방식으로 시장 기회 도출' },
        { icon: 'lightbulb', num: '02', label: '솔루션 설계', description: 'BM 캔버스로 수익구조 구체화' },
        { icon: 'rocket', num: '03', label: '실행·검증', description: 'Action Week 기반 MVP 실고객 검증' },
        { icon: 'trending-up', num: '04', label: '스케일업', description: 'IR·판로·정부지원 연계' },
      ],
    },
  },
  iconCardGrid: {
    meta: { kicker: '02 추진 전략 및 방법론', density: 'dense' },
    body: {
      kind: 'iconCardGrid',
      kicker: 'STRATEGY',
      headline: '4개 축으로 실행 역량을 끌어올립니다',
      columns: 4,
      cards: [
        { icon: 'target', tag: 'AXIS 1', title: '진단', description: 'DOGS 성향 진단으로 출발점 정렬', highlight: true },
        { icon: 'flask', tag: 'AXIS 2', title: '실험', description: '주차별 MVP 가설 검증' },
        { icon: 'handshake', tag: 'AXIS 3', title: '연결', description: '코치·판로·투자 네트워크 연계' },
        { icon: 'trending-up', tag: 'AXIS 4', title: '확장', description: '데모데이·후속 투자로 스케일업' },
      ],
    },
  },
  photoOrgGrid: {
    meta: { kicker: '04 운영 체계 및 코치진', density: 'dense' },
    body: {
      kind: 'photoOrgGrid',
      kicker: 'TEAM',
      headline: '전담 운영 조직이 사업 전 과정을 책임집니다',
      columns: 4,
      people: [
        { photo: '/design-kit/sample/coach-1.svg', name: '김도윤', role: 'PM · 총괄', tags: ['운영'] },
        { photo: '/design-kit/sample/coach-2.svg', name: '이서연', role: '리드 코치', tags: ['코칭'] },
        { photo: '/design-kit/sample/coach-3.svg', name: '박지훈', role: '퍼실리테이터', tags: ['실행'] },
      ],
    },
  },
  partnerLogoGrid: {
    meta: { kicker: '05 수행 역량 및 실적', density: 'dense' },
    body: {
      kind: 'partnerLogoGrid',
      kicker: 'TRACK RECORD',
      headline: '중앙부처·지자체·대학과 함께한 창업 생태계 실적',
      columns: 5,
      fill: true,
      partners: [
        { name: '중소벤처기업부', note: '창업사관학교 운영' },
        { name: '창업진흥원', note: '예비창업패키지' },
        { name: '충청남도', note: '청년창업 지원' },
        { name: '천안시', note: '지역 창업 거점' },
        { name: '지역대학 LINC', note: '산학 연계' },
      ],
    },
  },
  badgeRow: {
    meta: { kicker: '05 수행 역량 및 실적', density: 'dense' },
    body: {
      kind: 'badgeRow',
      badges: [
        { icon: 'award', value: '120+', label: '정부·지자체 수행 사업' },
        { icon: 'users', value: '12,000+', label: '누적 교육 창업가' },
        { icon: 'briefcase', value: '715', label: '활성 코치풀' },
        { icon: 'check-circle', value: '94%', label: '평균 만족도' },
      ],
    },
  },
  bigNumberHero: {
    meta: { kicker: '01 제안 배경 및 목적', density: 'dense' },
    body: {
      kind: 'bigNumberHero',
      kicker: 'WHY NOW',
      headline: '청년 창업의 3년 생존율 39%, 실행 역량의 공백을 메웁니다',
      bigNumber: '39%',
      bigCaption: '충남 청년창업기업 3년 생존율 — 전국 평균(45%)을 밑도는 실행 단절이 핵심 원인입니다.',
      supportingPoints: [
        { value: '1만+', label: '누적 창업가 코칭 데이터' },
        { value: '7단계', label: '발굴→스케일업 프로세스' },
        { value: '24주', label: '집중 액션 러닝 기간' },
      ],
    },
  },
  annotatedImage: {
    meta: { kicker: '04 운영 체계 및 코치진', density: 'dense' },
    body: {
      kind: 'annotatedImage',
      kicker: 'SPACE',
      headline: '실전 몰입을 돕는 거점 공간을 운영합니다',
      image: '/design-kit/sample/space.svg',
      annotations: [
        { title: '코워킹 존', description: '팀별 상시 작업·코칭 공간' },
        { title: '실험실', description: 'MVP 프로토타이핑 장비' },
        { title: '피칭룸', description: 'IR·데모데이 리허설' },
      ],
    },
  },
  milestoneTimeline: {
    meta: { kicker: '03 교육 커리큘럼', density: 'dense' },
    body: {
      kind: 'milestoneTimeline',
      kicker: 'TIMELINE',
      headline: '24주 핵심 마일스톤을 일정으로 약속합니다',
      milestones: [
        { icon: 'flask', period: 'W1–8', title: '진단·문제정의', description: 'DOGS 진단·필드리서치' },
        { icon: 'rocket', period: 'W9–16', title: 'BM·MVP', description: 'BM 설계·MVP 실행' },
        { icon: 'trending-up', period: 'W17–24', title: '검증·IR', description: '시장 검증·데모데이' },
      ],
    },
  },
  // ── DECK-2 밀도 5종 + beforeAfter (본문 — evidence 권장) ──
  evidenceBand: {
    meta: { kicker: '01 제안 배경 및 목적', density: 'dense' },
    body: {
      kind: 'evidenceBand',
      label: '핵심 근거',
      items: _EVIDENCE_EXAMPLE,
    },
  },
  coachDetailGrid: {
    meta: { kicker: '04 운영 체계 및 코치진', density: 'dense' },
    body: {
      kind: 'coachDetailGrid',
      kicker: 'COACHES',
      headline: '현장 검증된 715명 코치풀에서 트랙별 전담 코치를 1:5로 배치합니다',
      columns: 2,
      coaches: [
        {
          photo: '/design-kit/sample/coach-1.svg',
          name: '김도윤',
          role: '리드 코치 · 스케일업',
          affiliation: '前 카카오벤처스 심사역 / 액셀러레이터 파트너',
          bio: ['초기·성장기 투자·보육 11년', 'B2G 사업화 연계 다수', '시리즈 A IR 멘토링 12건'],
          stats: [
            { value: '120팀', label: '누적 멘토링' },
            { value: '₩340억', label: '후속 투자 유치' },
          ],
          tracks: ['스케일업', 'B2G'],
        },
        {
          photo: '/design-kit/sample/coach-2.svg',
          name: '이서연',
          role: '비즈니스 코치 · BM/IR',
          affiliation: '前 토스 PO / 핀테크 2회 창업·1회 엑싯',
          bio: ['BM 설계·수익구조 검증', 'IR 코칭 90팀', '데모데이 우승팀 7개 배출'],
          stats: [
            { value: '90팀', label: 'IR 코칭' },
            { value: '68%', label: '투자 연계율' },
          ],
          tracks: ['BM 설계', 'IR'],
        },
      ],
      evidence: [
        { figure: '715명', proves: '트랙·산업별 최적 코치를 매칭할 수 있는 풀 규모', source: 'Supabase coaches_directory(활성)' },
        { figure: '1:5', proves: '코치 1인당 팀 수를 제한해 밀착 코칭 보장', source: '운영 표준 코치 배치 기준' },
      ],
    },
  },
  curriculumMatrix: {
    meta: { kicker: '03 교육 커리큘럼', density: 'dense' },
    body: {
      kind: 'curriculumMatrix',
      kicker: 'CURRICULUM',
      headline: '24주 6단계, 이론 3회 연속을 막는 Action Week를 의무 편성합니다',
      phases: [
        {
          weeks: 'W1–4',
          phase: '창업가 진단',
          activities: ['DOGS 성향·리더십 진단', '팀 빌딩 워크숍', '지역 자원 매핑'],
          deliverable: '개인 성향 리포트 · 팀 협업 규약',
        },
        {
          weeks: 'W13–16',
          phase: 'MVP 실행',
          activities: ['프로토타입 제작', '실고객 노출 테스트', '주간 스프린트 회고'],
          deliverable: '작동하는 MVP · 검증 로그',
          actionWeek: true,
        },
      ],
      evidence: [
        { figure: '60%', proves: 'Action Week로 실행 비중을 끌어올려 이론 편중을 차단', source: '커리큘럼 룰 R-002' },
        { figure: '30건', proves: '고객 인터뷰 의무량으로 문제 정의의 현장성 확보', source: '액트프레너십 표준 과정' },
      ],
    },
  },
  kpiWithLogic: {
    meta: { kicker: '06 기대 성과 및 임팩트', density: 'dense' },
    body: {
      kind: 'kpiWithLogic',
      kicker: 'IMPACT',
      headline: '24주 후, 충남 청년창업의 실행 격차를 정량으로 좁힙니다',
      kpis: [
        { value: '60팀', label: '창업팀 발굴·육성', logic: '연 2기 × 1기 30팀 = 60팀. 경쟁률 4:1 가정.' },
        { value: '×1.8', label: '3년 생존율 개선', logic: '실전 검증 코호트 70% ÷ 기존 39% ≈ 1.8배.' },
        { value: '2.4', label: 'SROI', logic: '편익 ₩48억 ÷ 투입 예산 ₩20억 = 2.4.' },
      ],
      evidence: [
        { figure: '70%', proves: '실전 검증 코호트의 목표 생존율(개선 근거)', source: '코칭 코호트 추적조사 2024–2025' },
        { figure: '2.4', proves: '투입 대비 사회·경제 편익 비율(SROI)', source: 'SROI 산출 모델 v2(보수적 가정)' },
      ],
    },
  },
  strategyCanvas: {
    meta: { kicker: '02 추진 전략 및 방법론', density: 'dense' },
    body: {
      kind: 'strategyCanvas',
      kicker: 'METHODOLOGY',
      headline: '근거가 받치는 4단계 실행 중심 방법론을 제안합니다',
      columns: 4,
      zones: [
        { icon: 'target', num: 'STEP 1', title: '문제 정의', body: 'Inside-Out으로 시장 기회 도출·ST Matrix 검증', rationale: '피벗 비용 42% 절감' },
        { icon: 'lightbulb', num: 'STEP 2', title: '솔루션 설계', body: 'BM 캔버스로 수익구조 구체화', rationale: 'IR 통과율 1.7배' },
        { icon: 'rocket', num: 'STEP 3', title: '실행·검증', body: 'Action Week MVP 실고객 검증', rationale: '3년 생존율 +31%p', highlight: true },
        { icon: 'trending-up', num: 'STEP 4', title: '스케일업', body: 'IR·판로·정부지원 연계', rationale: '평균 매출 ₩1.8억' },
      ],
      evidence: [
        { figure: '42%', proves: '문제 적합도 검증이 불필요한 피벗 비용을 줄임', source: '언더독스 프로그램 성과분석 2025' },
        { figure: '+31%p', proves: 'MVP 실전 검증이 생존율을 끌어올리는 핵심 레버', source: '코칭 코호트 추적조사 2024–2025' },
      ],
    },
  },
  beforeAfter: {
    meta: { kicker: '06 기대 성과 및 임팩트', density: 'dense' },
    body: {
      kind: 'beforeAfter',
      kicker: 'CHANGE',
      headline: '이론 중심 교육에서 실행 중심 액트프레너십으로의 전환',
      fill: true,
      before: {
        label: '강의실 중심 창업 교육',
        description: '지식 전달 위주, 실전 검증 부재로 수료 후 실행 단절',
        metrics: ['이론 비중 70%', '3년 생존율 39%', '코치 1:20 강의형'],
      },
      after: {
        label: 'Action Week 실행 중심 사관학교',
        description: '주차별 실전 미션·코치 밀착으로 시장에서 작동하는 솔루션 구축',
        metrics: ['실행 비중 60%', '코치 1:5 밀착', '3년 생존율 70% 목표'],
      },
    },
  },
  // ── composite — 주 컴포넌트 + 근거 밴드 적층 (parts ≥ 2) ──
  composite: {
    meta: { kicker: '01 제안 배경 및 목적', density: 'dense' },
    body: {
      kind: 'composite',
      growIndex: 0,
      parts: [
        {
          kind: 'bigNumberHero',
          kicker: 'WHY NOW',
          headline: '청년 창업의 3년 생존율 39%, 실행 역량의 공백을 메웁니다',
          bigNumber: '39%',
          bigCaption: '전국 평균(45%)을 밑도는 실행·판로 단절이 핵심 원인입니다.',
          supportingPoints: [
            { value: '1만+', label: '누적 코칭 데이터' },
            { value: '7단계', label: '발굴→스케일업 프로세스' },
          ],
        },
        {
          kind: 'evidenceBand',
          items: _EVIDENCE_EXAMPLE,
        },
      ],
    },
  },
}

/**
 * SlideKind → LLM-facing 필드 계약 문자열(예시 JSON pretty-print).
 * authorSlide 가 선택된 kind 의 것만 프롬프트에 삽입해 정확한 필드명을 강제한다.
 * (KIND_EXAMPLE 에서 파생 — 단일 진실, 드리프트 없음.)
 */
export const KIND_FIELD_SPEC: Record<SlideKind, string> = Object.fromEntries(
  (Object.keys(KIND_EXAMPLE) as SlideKind[]).map((k) => [k, JSON.stringify(KIND_EXAMPLE[k], null, 2)]),
) as Record<SlideKind, string>

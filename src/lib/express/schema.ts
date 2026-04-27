/**
 * Express Track 데이터 모델 (Phase L Wave L2, ADR-011)
 *
 * 단일 SSoT — 모든 챗봇 턴의 슬롯 검증·LLM 출력 검증·DB 저장 직전 검증이
 * 이 스키마 한 곳을 통과한다.
 *
 * 본 파일은 server/client 양쪽에서 import 가능 (zod + 타입만 사용).
 * Prisma·DB·AI 호출 등은 다른 파일에서.
 *
 * 관련 문서: docs/architecture/express-mode.md §1.1
 */

import { z } from 'zod'

// ─────────────────────────────────────────
// 1. 의도 — 사업의 한 문장 정체성
// ─────────────────────────────────────────

export const IntentSchema = z
  .string()
  .min(20, '의도는 최소 20자')
  .max(200, '의도는 1줄 (최대 200자)')

// ─────────────────────────────────────────
// 2. Before/After — 평가위원 머릿속 그림
// ─────────────────────────────────────────

export const BeforeAfterSchema = z.object({
  before: z.string().min(20, 'Before 는 최소 20자').max(300, 'Before 는 최대 300자'),
  after: z.string().min(20, 'After 는 최소 20자').max(300, 'After 는 최대 300자'),
})

// ─────────────────────────────────────────
// 3. 키 메시지 — 정확히 3개
// ─────────────────────────────────────────

export const KeyMessagesSchema = z
  .array(z.string().min(8, '키 메시지는 최소 8자').max(80, '키 메시지는 최대 80자'))
  .length(3, '키 메시지는 정확히 3개')

// ─────────────────────────────────────────
// 4. 차별화 자산 인용 — Asset Registry / Content Hub 의 자산 ID
// ─────────────────────────────────────────

export const AssetReferenceSchema = z.object({
  assetId: z.string(),
  sectionKey: z.enum([
    'proposal-background',
    'curriculum',
    'coaches',
    'budget',
    'impact',
    'org-team',
    'other',
  ]),
  narrativeSnippet: z.string().min(40, '인용 문구는 최소 40자').max(600, '인용 문구는 최대 600자'),
  acceptedByPm: z.boolean().default(false),
})

export const DifferentiatorsSchema = z
  .array(AssetReferenceSchema)
  .min(0)
  .max(7, '차별화는 7개를 넘기지 않음 (시각적 부하)')

// ─────────────────────────────────────────
// 5. 외부 리서치 근거
// ─────────────────────────────────────────

export const ExternalEvidenceSchema = z.object({
  topic: z.string().min(2).max(60),
  source: z.string().min(2).max(200),
  summary: z.string().min(20).max(400),
  fetchedVia: z.enum(['pm-direct', 'external-llm', 'auto-extract']),
  capturedAt: z.string().datetime().optional(),
})

export const EvidenceRefsSchema = z.array(ExternalEvidenceSchema).max(15)

// ─────────────────────────────────────────
// 6. 7 섹션 초안
// ─────────────────────────────────────────

export const SectionDraftSchema = z
  .string()
  .min(0)
  .max(2000, '섹션 초안은 최대 2000자')

export const SectionsSchema = z.object({
  '1': SectionDraftSchema.optional(), // 제안 배경 및 목적
  '2': SectionDraftSchema.optional(), // 추진 전략 및 방법론
  '3': SectionDraftSchema.optional(), // 교육 커리큘럼
  '4': SectionDraftSchema.optional(), // 운영 체계 및 코치진
  '5': SectionDraftSchema.optional(), // 예산 및 경제성
  '6': SectionDraftSchema.optional(), // 기대 성과 및 임팩트
  '7': SectionDraftSchema.optional(), // 수행 역량 및 실적
})

export type SectionKey = keyof z.infer<typeof SectionsSchema>

export const SECTION_LABELS: Record<SectionKey, string> = {
  '1': '제안 배경 및 목적',
  '2': '추진 전략 및 방법론',
  '3': '교육 커리큘럼',
  '4': '운영 체계 및 코치진',
  '5': '예산 및 경제성',
  '6': '기대 성과 및 임팩트',
  '7': '수행 역량 및 실적',
}

/** asset-registry 의 sectionKey ('proposal-background' 등) → SectionKey ('1') 매핑 */
export const ASSET_SECTION_TO_DRAFT: Record<
  z.infer<typeof AssetReferenceSchema>['sectionKey'],
  SectionKey
> = {
  'proposal-background': '1',
  curriculum: '3',
  coaches: '4',
  budget: '5',
  impact: '6',
  'org-team': '7',
  other: '2', // 추진 전략으로 폴백
}

// ─────────────────────────────────────────
// 7. 메타 — 진행·완성 추적
// ─────────────────────────────────────────

export const ExpressMetaSchema = z.object({
  startedAt: z.string().datetime(),
  lastUpdatedAt: z.string().datetime(),
  isCompleted: z.boolean().default(false),
  completedAt: z.string().datetime().optional(),
  /** 자동 결정된 적용 슬롯 (RFP 따라 유연 — active-slots.ts 참조) */
  activeSlots: z.array(z.string()).default([]),
  /** 자동 결정된 생략 슬롯 */
  skippedSlots: z.array(z.string()).default([]),
  /** AI 가 마지막으로 채운 슬롯 키 (디버깅) */
  lastFilledSlot: z.string().optional(),
})

// ─────────────────────────────────────────
// 8. 최상위 — Project.expressDraft Json 으로 저장
// ─────────────────────────────────────────

export const ExpressDraftSchema = z.object({
  intent: IntentSchema.optional(),
  beforeAfter: BeforeAfterSchema.partial().optional(),
  keyMessages: z.array(z.string()).max(3).optional(),
  differentiators: DifferentiatorsSchema.optional(),
  evidenceRefs: EvidenceRefsSchema.optional(),
  sections: SectionsSchema.optional(),
  meta: ExpressMetaSchema,
})

export type ExpressDraft = z.infer<typeof ExpressDraftSchema>
export type AssetReference = z.infer<typeof AssetReferenceSchema>
export type ExternalEvidence = z.infer<typeof ExternalEvidenceSchema>
export type ExpressMeta = z.infer<typeof ExpressMetaSchema>
export type BeforeAfter = z.infer<typeof BeforeAfterSchema>

// ─────────────────────────────────────────
// 9. 12 슬롯 정의
// ─────────────────────────────────────────

export type SlotKey =
  | 'intent'
  | 'beforeAfter.before'
  | 'beforeAfter.after'
  | 'keyMessages.0'
  | 'keyMessages.1'
  | 'keyMessages.2'
  | 'differentiators'
  | 'sections.1'
  | 'sections.2'
  | 'sections.3'
  | 'sections.4'
  | 'sections.6'

export const ALL_SLOTS: SlotKey[] = [
  'intent',
  'beforeAfter.before',
  'beforeAfter.after',
  'keyMessages.0',
  'keyMessages.1',
  'keyMessages.2',
  'differentiators',
  'sections.1',
  'sections.2',
  'sections.3',
  'sections.4',
  'sections.6',
]

export const SLOT_LABELS: Record<SlotKey, string> = {
  intent: '사업의 한 문장 정체성',
  'beforeAfter.before': '교육 전 모습 (Before)',
  'beforeAfter.after': '교육 후 모습 (After)',
  'keyMessages.0': '핵심 메시지 ①',
  'keyMessages.1': '핵심 메시지 ②',
  'keyMessages.2': '핵심 메시지 ③',
  differentiators: '차별화 자산 (3+)',
  'sections.1': '① 제안 배경 및 목적',
  'sections.2': '② 추진 전략 및 방법론',
  'sections.3': '③ 교육 커리큘럼',
  'sections.4': '④ 운영 체계 및 코치진',
  'sections.6': '⑥ 기대 성과 및 임팩트',
}

// ─────────────────────────────────────────
// 10. 슬롯 채움 여부 검사
// ─────────────────────────────────────────

export function isSlotFilled(draft: ExpressDraft, slot: string): boolean {
  if (slot === 'intent') return !!draft.intent && draft.intent.length >= 20
  if (slot === 'beforeAfter.before') return !!draft.beforeAfter?.before && draft.beforeAfter.before.length >= 20
  if (slot === 'beforeAfter.after') return !!draft.beforeAfter?.after && draft.beforeAfter.after.length >= 20
  if (slot.startsWith('keyMessages.')) {
    const idx = Number(slot.split('.')[1])
    return !!draft.keyMessages && draft.keyMessages.length > idx && draft.keyMessages[idx].length >= 8
  }
  if (slot === 'differentiators') {
    return (draft.differentiators?.filter((d) => d.acceptedByPm).length ?? 0) >= 3
  }
  if (slot.startsWith('sections.')) {
    const key = slot.split('.')[1] as SectionKey
    const text = draft.sections?.[key]
    return !!text && text.length >= 200
  }
  return false
}

export function listFilledSlots(draft: ExpressDraft): SlotKey[] {
  return ALL_SLOTS.filter((s) => isSlotFilled(draft, s))
}

export function listMissingSlots(draft: ExpressDraft, activeSlots?: string[]): string[] {
  const target = activeSlots ?? ALL_SLOTS
  return target.filter((s) => !isSlotFilled(draft, s))
}

// ─────────────────────────────────────────
// 11. 빈 Draft 생성
// ─────────────────────────────────────────

export function emptyDraft(): ExpressDraft {
  const now = new Date().toISOString()
  return {
    sections: {},
    differentiators: [],
    evidenceRefs: [],
    meta: {
      startedAt: now,
      lastUpdatedAt: now,
      isCompleted: false,
      activeSlots: [...ALL_SLOTS],
      skippedSlots: [],
    },
  }
}

// ─────────────────────────────────────────
// 12. 진행률 계산 (북극성 진행 바)
// ─────────────────────────────────────────

export interface DraftProgress {
  /** 5단계: rfp / intent / differentiators / sections / submit (각 0~100) */
  stages: { key: string; label: string; pct: number }[]
  overall: number
}

export function calcProgress(
  draft: ExpressDraft,
  hasRfp: boolean,
): DraftProgress {
  const intentPct = draft.intent ? 100 : 0
  const baFilled = (draft.beforeAfter?.before ? 50 : 0) + (draft.beforeAfter?.after ? 50 : 0)
  const kmFilled = ((draft.keyMessages?.length ?? 0) / 3) * 100

  const intentStage = Math.round((intentPct + baFilled + kmFilled) / 3)

  const accepted = draft.differentiators?.filter((d) => d.acceptedByPm).length ?? 0
  const diffStage = Math.min(100, Math.round((accepted / 3) * 100))

  const required: SectionKey[] = ['1', '2', '3', '4', '6']
  const filledSecs = required.filter((k) => {
    const t = draft.sections?.[k]
    return !!t && t.length >= 200
  }).length
  const sectionsStage = Math.round((filledSecs / required.length) * 100)

  const submitStage = draft.meta.isCompleted ? 100 : 0

  const stages = [
    { key: 'rfp', label: 'RFP', pct: hasRfp ? 100 : 0 },
    { key: 'intent', label: '의도', pct: intentStage },
    { key: 'differentiators', label: '차별화', pct: diffStage },
    { key: 'sections', label: '섹션', pct: sectionsStage },
    { key: 'submit', label: '1차본', pct: submitStage },
  ]
  const overall = Math.round(
    stages.reduce((s, x) => s + x.pct, 0) / stages.length,
  )
  return { stages, overall }
}

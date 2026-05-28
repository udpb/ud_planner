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
// 3.5 Message Hierarchy — Phase J (Brain 고도화, 2026-05-28)
// 청년마을 PDF + guidebook 학습 기반:
//   key 메시지 (1 선언) + sub 메시지 3 (구체화) + quantitative proofs 3 (정량 근거)
// 각 keyMessage 당 3-3 hierarchy → 평가위원 헤드라인 훑기 + 디테일 증명
// ─────────────────────────────────────────

export const MessageHierarchyItemSchema = z.object({
  /** 한 줄 선언적 키 메시지 (헤드라인 — One Page One Thesis 용) */
  key: z
    .string()
    .min(8, '키 메시지는 최소 8자')
    .max(80, '키 메시지는 최대 80자 (헤드라인용)'),
  /** 키 메시지를 구체화하는 sub 메시지 3개 (구조 · 단계 · 차별점 등) */
  sub: z
    .array(z.string().min(15, 'sub 메시지는 최소 15자').max(200, 'sub 메시지는 최대 200자'))
    .min(0)
    .max(5, 'sub 메시지는 최대 5개 (시각적 부하)'),
  /** 정량 근거 (수치·년도·기관명·증빙) 0~5건 — 정량 포화 패턴 */
  quantProofs: z
    .array(z.string().min(5, '정량 근거는 최소 5자').max(150, '정량 근거는 최대 150자'))
    .min(0)
    .max(5),
})

export const MessageHierarchySchema = z
  .array(MessageHierarchyItemSchema)
  .min(0)
  .max(5, '메시지 hierarchy 는 최대 5개')

export type MessageHierarchyItem = z.infer<typeof MessageHierarchyItemSchema>
export type MessageHierarchy = z.infer<typeof MessageHierarchySchema>

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
  // F3 (Wave V): 'auto-research' 추가 — AI 자동 리서치 (Tier 1 + 2) 로 가져온 evidence
  fetchedVia: z.enum(['pm-direct', 'external-llm', 'auto-extract', 'auto-research']),
  capturedAt: z.string().datetime().optional(),
})

export const EvidenceRefsSchema = z.array(ExternalEvidenceSchema).max(15)

// ─────────────────────────────────────────
// 5.5 Risk Mitigation — 평가위원 의심 능동 답변 (Wave U / U5, S3, ADR-014)
// ─────────────────────────────────────────

/**
 * 평가위원이 의심할 수 있는 risk + PM 의 능동 답변.
 * "평가위원이 의심할 수 있는 위험을 미리 답변" — 신뢰도의 핵심.
 *
 * severity 예시:
 *   critical: 사업 자체를 흔드는 risk (예산 부족·인력 부재·법규 충돌)
 *   major:    수행 품질을 떨어뜨릴 수 있는 risk (참가자 모집 어려움·운영 인원 부족)
 *   minor:    부분적 영향만 (특정 회차 출석률 변동·외부 장소 변경)
 */
export const RiskMitigationItemSchema = z.object({
  /** 평가위원이 의심할 수 있는 포인트 (한 문장 — "이런 risk 있지 않나?" 형) */
  risk: z.string().min(10, 'risk 는 최소 10자').max(200, 'risk 는 최대 200자'),
  /** PM 의 능동 답변 — 어떻게 완화하나 */
  mitigation: z.string().min(20, '완화 방안은 최소 20자').max(400, '완화 방안은 최대 400자'),
  /** 심각도 — UI 색상 결정 */
  severity: z.enum(['critical', 'major', 'minor']),
  /** AI 가 자동 제안했는지 vs PM 이 직접 작성 */
  source: z.enum(['ai-suggested', 'pm-direct']).default('pm-direct'),
  /** PM 이 수락했는가 (AI 제안 시) */
  acceptedByPm: z.boolean().default(false),
})

export const RiskMitigationsSchema = z
  .array(RiskMitigationItemSchema)
  .max(8, 'Risk 는 8개를 넘기지 않음 (시각적 부하)')

// ─────────────────────────────────────────
// 6. 7 섹션 초안
// ─────────────────────────────────────────

export const SectionDraftSchema = z
  .string()
  .min(0)
  .max(2000, '섹션 초안은 최대 2000자')

// Phase J — One Page One Thesis 패턴: 각 섹션에 별도 headline (선언적 한 줄)
// 청년마을 PDF 의 ["기본계획 1)" → ": 정책 목표" → "큰따옴표 헤드라인"] 패턴 흡수
export const SectionWithHeadlineSchema = z.object({
  /** 카테고리 부제목 (예: ": 정책 수요자 분석") */
  subtitle: z.string().max(80).optional(),
  /** 큰따옴표 헤드라인 — One Page One Thesis 의 핵심 선언 */
  headline: z.string().max(200).optional(),
  /** 본문 (기존 SectionDraftSchema 와 동일) */
  content: z.string().max(2000),
})

// 하위 호환: 기존 sections.N 는 string 으로 그대로 받되, 새 client 는 object 도 가능
export const SectionsSchema = z.object({
  '1': SectionDraftSchema.optional(), // 제안 배경 및 목적
  '2': SectionDraftSchema.optional(), // 추진 전략 및 방법론
  '3': SectionDraftSchema.optional(), // 교육 커리큘럼
  '4': SectionDraftSchema.optional(), // 운영 체계 및 코치진
  '5': SectionDraftSchema.optional(), // 예산 및 경제성
  '6': SectionDraftSchema.optional(), // 기대 성과 및 임팩트
  '7': SectionDraftSchema.optional(), // 수행 역량 및 실적
})

// Phase J — sections.N 의 headline/subtitle 별도 저장 (sectionMeta)
// hybrid: sections.N 는 body string 그대로 (호환), sectionMeta.N 는 헤드라인+부제목
export const SectionMetaSchema = z.object({
  '1': SectionWithHeadlineSchema.partial().optional(),
  '2': SectionWithHeadlineSchema.partial().optional(),
  '3': SectionWithHeadlineSchema.partial().optional(),
  '4': SectionWithHeadlineSchema.partial().optional(),
  '5': SectionWithHeadlineSchema.partial().optional(),
  '6': SectionWithHeadlineSchema.partial().optional(),
  '7': SectionWithHeadlineSchema.partial().optional(),
})

export type SectionMeta = z.infer<typeof SectionMetaSchema>

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

/** 채널 분류 (ADR-013 Express 2.0) */
export const ChannelSchema = z.enum(['B2G', 'B2B', 'renewal'])
export type Channel = z.infer<typeof ChannelSchema>

/** B2B 부서 분류 (프레임 진단) */
export const DepartmentSchema = z.enum(['csr', 'strategy', 'sales', 'tech'])
export type Department = z.infer<typeof DepartmentSchema>

/** AI 자동 진단 결과 (사이드바 AutoDiagnosisPanel 에 표시) */
export const AutoDiagnosisSchema = z.object({
  /** 채널 추론 (Express 진입 시 1회) */
  channel: z.object({
    detected: ChannelSchema,
    confidence: z.number().min(0).max(1),
    reasoning: z.array(z.string()),
    confirmedByPm: z.boolean().default(false),
  }).optional(),
  /** 프레임 진단 (B2B 우선 — sections.* 슬롯 채워질 때마다) */
  framing: z.object({
    detected: DepartmentSchema,
    intendedDepartment: DepartmentSchema.optional(),
    match: z.boolean(),
    evidence: z.array(z.string()),
    suggestion: z.string().optional(),
    diagnosedAt: z.string().datetime(),
  }).optional(),
  /** 논리 흐름 점검 (1차본 조립 직전) — Phase M1 확장 */
  logicChain: z.object({
    passed: z.boolean(),
    channel: ChannelSchema,
    passedSteps: z.number(),
    totalSteps: z.number(),
    breakpoints: z.array(z.object({
      stepKey: z.string(),
      stepLabel: z.string(),
      affectedSections: z.array(z.string()),
      reason: z.string(),
      suggestion: z.string(),
    })),
    mode: z.enum(['ai', 'heuristic']),
    diagnosedAt: z.string().datetime(),
  }).optional(),
  /** 팩트체크 (정규식 + AI 검증) — Phase M1 확장 */
  factCheck: z.object({
    totalFacts: z.number(),
    byCategory: z.object({
      'quant-stat': z.number(),
      'policy-cite': z.number(),
      'client-info': z.number(),
      'own-record': z.number(),
      'external-cite': z.number(),
    }),
    byStatus: z.object({
      verified: z.number(),
      suspicious: z.number(),
      unverifiable: z.number(),
      'needs-source': z.number(),
      outdated: z.number(),
    }),
    facts: z.array(z.object({
      category: z.enum(['quant-stat', 'policy-cite', 'client-info', 'own-record', 'external-cite']),
      excerpt: z.string(),
      source: z.string(),
      match: z.string(),
      status: z.enum(['verified', 'suspicious', 'unverifiable', 'needs-source', 'outdated']),
      note: z.string().optional(),
    })),
    mode: z.enum(['regex', 'ai+regex']),
    diagnosedAt: z.string().datetime(),
  }).optional(),
})
export type AutoDiagnosis = z.infer<typeof AutoDiagnosisSchema>

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
  /** 검수 결과 (Phase L5 — Inspector 7 렌즈) */
  inspectionResult: z.object({
    passed: z.boolean(),
    overallScore: z.number(),
    issues: z.array(z.object({
      severity: z.string(),
      lens: z.string(),
      issue: z.string(),
      suggestion: z.string(),
    })),
    nextAction: z.string(),
  }).optional(),
  /** ADR-013 Express 2.0 — AI 자동 진단 결과 */
  autoDiagnosis: AutoDiagnosisSchema.optional(),
  /** B2B 일 때 PM 이 지정한 목표 부서 (프레임 진단의 정답) */
  intendedDepartment: DepartmentSchema.optional(),
})

// ─────────────────────────────────────────
// 8. 최상위 — Project.expressDraft Json 으로 저장
// ─────────────────────────────────────────

export const ExpressDraftSchema = z.object({
  intent: IntentSchema.optional(),
  beforeAfter: BeforeAfterSchema.partial().optional(),
  keyMessages: z.array(z.string()).max(3).optional(),
  /**
   * Phase J — Message Hierarchy (key + sub + quantProofs)
   * 청년마을 PDF + guidebook 학습 기반 — keyMessages 의 진화 버전.
   * keyMessages 와 messageHierarchy 둘 다 optional, hierarchy 가 채워지면 우선 사용.
   */
  messageHierarchy: MessageHierarchySchema.optional(),
  differentiators: DifferentiatorsSchema.optional(),
  evidenceRefs: EvidenceRefsSchema.optional(),
  sections: SectionsSchema.optional(),
  /**
   * Phase J — sections.N 의 headline·subtitle 별도 저장.
   * 본문 (sections.N) 은 호환 유지, hierarchy 메타는 sectionMeta 에 분리.
   * .md 출력 시 sectionMeta.N.headline 있으면 큰 따옴표 헤드라인으로 표시.
   */
  sectionMeta: SectionMetaSchema.optional(),
  /** Wave U / U5 — Risk Mitigation (평가위원 의심 능동 답변, S3) */
  risks: RiskMitigationsSchema.optional(),
  meta: ExpressMetaSchema,
})

export type ExpressDraft = z.infer<typeof ExpressDraftSchema>
export type AssetReference = z.infer<typeof AssetReferenceSchema>
export type ExternalEvidence = z.infer<typeof ExternalEvidenceSchema>
export type ExpressMeta = z.infer<typeof ExpressMetaSchema>
export type BeforeAfter = z.infer<typeof BeforeAfterSchema>
export type RiskMitigation = z.infer<typeof RiskMitigationItemSchema>

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
  | 'sections.5'
  | 'sections.6'
  | 'sections.7'

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
  'sections.5',
  'sections.6',
  'sections.7',
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
  'sections.5': '⑤ 예산 및 경제성',
  'sections.6': '⑥ 기대 성과 및 임팩트',
  'sections.7': '⑦ 수행 역량 및 실적',
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

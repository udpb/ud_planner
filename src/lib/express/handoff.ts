/**
 * Express → Deep Track 인계 (Phase L Wave L2 stub, L6 에서 본격 구현)
 *
 * ExpressDraft → Project / PipelineContext 슬라이스 매핑.
 *
 * 관련 문서: docs/architecture/express-mode.md §7
 */

import 'server-only'

import { SECTION_LABELS, type ExpressDraft, type SectionKey } from './schema'

// ─────────────────────────────────────────
// 1. ExpressDraft → Project 필드 매핑
// ─────────────────────────────────────────

export interface DraftToProjectFields {
  proposalConcept?: string | null
  proposalBackground?: string | null
  keyPlanningPoints?: string[] | null
  acceptedAssetIds?: string[] | null
}

export function mapDraftToProjectFields(draft: ExpressDraft): DraftToProjectFields {
  const out: DraftToProjectFields = {}

  if (draft.intent) out.proposalConcept = draft.intent

  if (draft.beforeAfter?.before || draft.beforeAfter?.after) {
    const parts: string[] = []
    if (draft.beforeAfter?.before) parts.push(`[Before]\n${draft.beforeAfter.before}`)
    if (draft.beforeAfter?.after) parts.push(`[After]\n${draft.beforeAfter.after}`)
    out.proposalBackground = parts.join('\n\n')
  }

  if (draft.keyMessages && draft.keyMessages.length > 0) {
    out.keyPlanningPoints = draft.keyMessages.filter((m) => m.length >= 8)
  }

  if (draft.differentiators && draft.differentiators.length > 0) {
    out.acceptedAssetIds = draft.differentiators
      .filter((d) => d.acceptedByPm)
      .map((d) => d.assetId)
  }

  return out
}

// ─────────────────────────────────────────
// 2. ExpressDraft.sections → ProposalSection 초기값
// ─────────────────────────────────────────

export interface ProposalSectionSeed {
  sectionNo: number
  title: string
  content: string
}

export function mapDraftToProposalSections(draft: ExpressDraft): ProposalSectionSeed[] {
  const sections = draft.sections ?? {}
  return (Object.keys(SECTION_LABELS) as SectionKey[])
    .map((k) => {
      const text = sections[k]
      if (!text) return null
      return {
        sectionNo: Number(k),
        title: SECTION_LABELS[k],
        content: text,
      } satisfies ProposalSectionSeed
    })
    .filter((x): x is ProposalSectionSeed => x !== null)
}

// ─────────────────────────────────────────
// 3. Deep 정밀화 추천 (간단 룰)
// ─────────────────────────────────────────

export interface DeepSuggestion {
  targetStep: 'curriculum' | 'coaches' | 'budget' | 'impact' | 'proposal'
  reason: string
}

export function suggestDeepAreas(input: {
  draft: ExpressDraft
  totalBudgetVat?: number | null
  evalImpactWeight?: number | null
}): DeepSuggestion[] {
  const out: DeepSuggestion[] = []

  if ((input.evalImpactWeight ?? 0) >= 0.2) {
    out.push({ targetStep: 'impact', reason: '평가표 임팩트 가중치 ≥20% — SROI 정밀 산출 권장' })
  }

  if ((input.totalBudgetVat ?? 0) >= 500_000_000) {
    out.push({ targetStep: 'budget', reason: '예산 5억 이상 — PC/AC 정밀 분해 권장' })
  }

  // 커리큘럼은 항상 권장 (1차본은 큰 그림만)
  out.push({ targetStep: 'curriculum', reason: '회차별 설계 정밀화' })

  // 코치는 최소 권장
  out.push({ targetStep: 'coaches', reason: '코치 매칭·확정' })

  return out
}

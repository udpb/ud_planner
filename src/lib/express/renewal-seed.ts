/**
 * RenewalSeed — Express 2.0 (Phase M2, 2026-05-14)
 *
 * renewal 채널 전용 — 같은 발주처와의 직전 (COMPLETED 또는 IN_PROGRESS) 프로젝트
 * 산출물을 가져와 현재 ExpressDraft 의 비어있는 필드에 자동 시드.
 *
 * 시드 우선순위:
 *   1. ExpressDraft.intent (직전 프로젝트의 expressDraft.intent · 없으면 proposalConcept)
 *   2. ExpressDraft.beforeAfter (직전 프로젝트의 expressDraft.beforeAfter)
 *   3. ExpressDraft.keyMessages (직전 프로젝트의 expressDraft.keyMessages — renewal 강조 추가)
 *   4. ExpressDraft.sections.1·7 (제안 배경 + 수행 실적 — proposalSections 또는 expressDraft)
 *
 * 안전 정책:
 *   - 빈 필드만 시드 (PM 이 이미 작성한 건 덮어쓰지 않음)
 *   - intent 는 "직전 사업 ~ 연속" prefix 자동 추가
 *   - keyMessages 첫 번째에 "연속·재계약" 키워드 추가 (slack 사례 패턴)
 *   - DB write 는 호출자에서 — 본 모듈은 pure 매핑만
 *
 * 관련: docs/decisions/013-express-v2-auto-diagnosis.md §결정 §2 (renewal 채널 메커니즘)
 */

import 'server-only'
import { prisma } from '@/lib/prisma'
import { ExpressDraftSchema, type ExpressDraft } from './schema'

// ─────────────────────────────────────────
// 1. 타입
// ─────────────────────────────────────────

export interface PriorProjectSummary {
  id: string
  name: string
  client: string
  status: string
  startedAt: Date | null
  endedAt: Date | null
  hasExpressDraft: boolean
  hasProposalSections: boolean
}

export interface RenewalSeedProposal {
  /** 시드 원본 프로젝트 — UI 확인용 */
  source: PriorProjectSummary
  /** 시드될 ExpressDraft 부분만 (intent/beforeAfter/keyMessages/sections) */
  proposedFields: {
    intent?: string
    beforeAfter?: { before?: string; after?: string }
    keyMessages?: string[]
    sections?: Partial<ExpressDraft['sections']>
  }
  /** 이미 채워진 필드 — 시드 적용 안 함 */
  skippedFields: string[]
}

// ─────────────────────────────────────────
// 2. 직전 프로젝트 조회
// ─────────────────────────────────────────

/**
 * 같은 발주처 + COMPLETED/IN_PROGRESS + 자신 제외 의 직전 프로젝트 1건.
 * 가장 최근 업데이트 우선.
 */
export async function findPriorProject(args: {
  currentProjectId: string
  client: string
}): Promise<PriorProjectSummary | null> {
  const prior = await prisma.project.findFirst({
    where: {
      client: args.client,
      id: { not: args.currentProjectId },
      status: { in: ['COMPLETED', 'IN_PROGRESS'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      client: true,
      status: true,
      eduStartDate: true,
      eduEndDate: true,
      expressDraft: true,
      proposalSections: { select: { id: true }, take: 1 },
    },
  })
  if (!prior) return null

  return {
    id: prior.id,
    name: prior.name,
    client: prior.client,
    status: prior.status,
    startedAt: prior.eduStartDate,
    endedAt: prior.eduEndDate,
    hasExpressDraft: !!prior.expressDraft,
    hasProposalSections: prior.proposalSections.length > 0,
  }
}

// ─────────────────────────────────────────
// 3. 시드 제안 생성
// ─────────────────────────────────────────

/**
 * 직전 프로젝트 → 현재 ExpressDraft 에 시드할 필드 추출.
 * 현재 draft 가 이미 채워진 필드는 skip.
 */
export async function buildRenewalSeed(args: {
  currentDraft: ExpressDraft
  priorProjectId: string
}): Promise<RenewalSeedProposal | null> {
  const prior = await prisma.project.findUnique({
    where: { id: args.priorProjectId },
    select: {
      id: true,
      name: true,
      client: true,
      status: true,
      eduStartDate: true,
      eduEndDate: true,
      expressDraft: true,
      proposalBackground: true,
      proposalConcept: true,
      proposalSections: {
        orderBy: { sectionNo: 'asc' },
        select: { sectionNo: true, content: true },
      },
    },
  })
  if (!prior) return null

  // 직전 expressDraft 파싱 (있으면)
  let priorDraft: ExpressDraft | null = null
  if (prior.expressDraft) {
    const parsed = ExpressDraftSchema.safeParse(prior.expressDraft)
    if (parsed.success) priorDraft = parsed.data
  }

  const source: PriorProjectSummary = {
    id: prior.id,
    name: prior.name,
    client: prior.client,
    status: prior.status,
    startedAt: prior.eduStartDate,
    endedAt: prior.eduEndDate,
    hasExpressDraft: !!priorDraft,
    hasProposalSections: prior.proposalSections.length > 0,
  }

  const proposedFields: RenewalSeedProposal['proposedFields'] = {}
  const skipped: string[] = []

  // ── 1. intent
  if (!args.currentDraft.intent) {
    const priorIntent =
      priorDraft?.intent ?? prior.proposalConcept ?? prior.proposalBackground ?? null
    if (priorIntent && priorIntent.length >= 20) {
      // "직전 사업 ~ 연속" prefix
      const prefix = `[${prior.name} 연속] `
      const body = priorIntent.replace(/^\[[^\]]+\]\s*/, '').slice(0, 200 - prefix.length)
      proposedFields.intent = (prefix + body).slice(0, 200)
    }
  } else {
    skipped.push('intent')
  }

  // ── 2. beforeAfter
  if (!args.currentDraft.beforeAfter?.before && priorDraft?.beforeAfter?.before) {
    proposedFields.beforeAfter ??= {}
    proposedFields.beforeAfter.before = priorDraft.beforeAfter.before
  } else if (args.currentDraft.beforeAfter?.before) {
    skipped.push('beforeAfter.before')
  }
  if (!args.currentDraft.beforeAfter?.after && priorDraft?.beforeAfter?.after) {
    proposedFields.beforeAfter ??= {}
    proposedFields.beforeAfter.after = priorDraft.beforeAfter.after
  } else if (args.currentDraft.beforeAfter?.after) {
    skipped.push('beforeAfter.after')
  }

  // ── 3. keyMessages (연속·재계약 첫 번째로)
  const currentKms = args.currentDraft.keyMessages ?? []
  if (currentKms.length === 0 && priorDraft?.keyMessages && priorDraft.keyMessages.length > 0) {
    const seeded: string[] = []
    // 첫 메시지: 연속·재계약 강조 (slack 사례 패턴)
    const yearLabel = prior.eduEndDate
      ? `${prior.eduEndDate.getFullYear()}년 사업`
      : '직전 사업'
    seeded.push(`${yearLabel} 성과 위에 다음 사이클 확장`)
    // 이어서 직전 keyMessages 2개
    for (const km of priorDraft.keyMessages.slice(0, 2)) {
      if (seeded.length >= 3) break
      seeded.push(km)
    }
    proposedFields.keyMessages = seeded.slice(0, 3)
  } else if (currentKms.length > 0) {
    skipped.push('keyMessages')
  }

  // ── 4. sections.1 (제안 배경) + sections.7 (수행 실적)
  proposedFields.sections = {}
  if (!args.currentDraft.sections?.['1']) {
    // 우선순위: priorDraft.sections.1 > proposalSections[1] > proposalBackground
    const src =
      priorDraft?.sections?.['1'] ??
      prior.proposalSections.find((s) => s.sectionNo === 1)?.content ??
      prior.proposalBackground ??
      null
    if (src && src.length >= 100) {
      proposedFields.sections['1'] =
        `[${prior.name} 연속 사업 배경 — 발주처에서 직전 사이클 성과를 기반으로 확장 요청]\n\n` +
        src.slice(0, 1800)
    }
  } else {
    skipped.push('sections.1')
  }

  if (!args.currentDraft.sections?.['7']) {
    // 수행 실적 — 직전 사업 자체가 실적이므로 자동 생성 가능
    const start = prior.eduStartDate?.toISOString().slice(0, 7) ?? '?'
    const end = prior.eduEndDate?.toISOString().slice(0, 7) ?? '?'
    proposedFields.sections['7'] = `[직전 수행 실적]\n· ${prior.name} (${prior.client}, ${start} ~ ${end})\n· 상태: ${prior.status === 'COMPLETED' ? '완료' : '진행 중'}\n\n해당 사업의 운영 노하우·코치진·발주처 신뢰를 본 제안에 그대로 적용.`
  } else {
    skipped.push('sections.7')
  }

  if (Object.keys(proposedFields.sections ?? {}).length === 0) {
    delete proposedFields.sections
  }

  return {
    source,
    proposedFields,
    skippedFields: skipped,
  }
}

// ─────────────────────────────────────────
// 4. 시드 적용 — ExpressDraft 에 merge
// ─────────────────────────────────────────

export function applyRenewalSeed(
  draft: ExpressDraft,
  proposal: RenewalSeedProposal['proposedFields'],
): ExpressDraft {
  const next: ExpressDraft = {
    ...draft,
    meta: {
      ...draft.meta,
      lastUpdatedAt: new Date().toISOString(),
    },
  }

  if (proposal.intent && !next.intent) {
    next.intent = proposal.intent
  }
  if (proposal.beforeAfter) {
    next.beforeAfter = {
      ...(next.beforeAfter ?? {}),
      ...(proposal.beforeAfter.before && !next.beforeAfter?.before
        ? { before: proposal.beforeAfter.before }
        : {}),
      ...(proposal.beforeAfter.after && !next.beforeAfter?.after
        ? { after: proposal.beforeAfter.after }
        : {}),
    }
  }
  if (proposal.keyMessages && (!next.keyMessages || next.keyMessages.length === 0)) {
    next.keyMessages = proposal.keyMessages
  }
  if (proposal.sections) {
    next.sections = { ...(next.sections ?? {}) }
    for (const [k, v] of Object.entries(proposal.sections) as [
      keyof typeof proposal.sections,
      string | undefined,
    ][]) {
      if (v && !next.sections[k]) {
        next.sections[k] = v
      }
    }
  }
  return next
}

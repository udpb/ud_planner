/**
 * Partial Extraction — LLM 출력의 extractedSlots 를
 * ExpressDraft 에 안전하게 머지 (Phase L Wave L2, ADR-011)
 *
 * 각 슬롯 값이 zod 부분 검증 통과해야 채택. 실패 시 ValidationError 누적.
 *
 * 관련 문서: docs/architecture/express-mode.md §4.3
 */

import {
  IntentSchema,
  KeyMessagesSchema,
  ALL_SLOTS,
  type ExpressDraft,
  type SectionKey,
  type SlotKey,
} from './schema'
import type { ValidationError } from './conversation'

export interface MergeResult {
  draft: ExpressDraft
  validationErrors: ValidationError[]
  acceptedSlots: string[]
  rejectedSlots: string[]
}

/**
 * extractedSlots 객체의 각 키를 적절한 위치에 안전하게 머지.
 * 검증 실패한 슬롯은 ValidationError 로 누적.
 */
export function mergeExtractedSlots(
  draft: ExpressDraft,
  extracted: Record<string, unknown>,
): MergeResult {
  const errors: ValidationError[] = []
  const accepted: string[] = []
  const rejected: string[] = []
  const next: ExpressDraft = JSON.parse(JSON.stringify(draft)) // deep clone

  for (const [key, value] of Object.entries(extracted)) {
    if (value === null || value === undefined || value === '') continue

    // intent
    if (key === 'intent') {
      const r = IntentSchema.safeParse(value)
      if (r.success) {
        next.intent = r.data
        accepted.push(key)
      } else {
        rejected.push(key)
        errors.push({
          slotKey: key,
          zodIssue: r.error.issues[0]?.message ?? 'intent 검증 실패',
          remediation: '한 문장 (20~200자) 으로 사업 정체성을 작성해 주세요.',
        })
      }
      continue
    }

    // beforeAfter.before / .after
    if (key === 'beforeAfter.before' || key === 'beforeAfter.after') {
      const sub = key.split('.')[1] as 'before' | 'after'
      const text = String(value).trim()
      if (text.length >= 20 && text.length <= 300) {
        next.beforeAfter = {
          before: next.beforeAfter?.before ?? '',
          after: next.beforeAfter?.after ?? '',
          [sub]: text,
        } as ExpressDraft['beforeAfter']
        accepted.push(key)
      } else {
        rejected.push(key)
        errors.push({
          slotKey: key,
          zodIssue: `${sub} 는 20~300자 (현재 ${text.length}자)`,
          remediation: '교육 전/후 모습을 한두 문장으로 묘사해 주세요.',
        })
      }
      continue
    }

    // beforeAfter (객체로 들어온 경우)
    if (key === 'beforeAfter' && typeof value === 'object' && value !== null) {
      const obj = value as { before?: string; after?: string }
      const merged: ExpressDraft['beforeAfter'] = {
        before: obj.before ?? next.beforeAfter?.before ?? '',
        after: obj.after ?? next.beforeAfter?.after ?? '',
      }
      next.beforeAfter = merged
      if (obj.before) accepted.push('beforeAfter.before')
      if (obj.after) accepted.push('beforeAfter.after')
      continue
    }

    // keyMessages.0/1/2
    if (key.startsWith('keyMessages.')) {
      const idx = Number(key.split('.')[1])
      if (Number.isInteger(idx) && idx >= 0 && idx < 3) {
        const text = String(value).trim()
        if (text.length >= 8 && text.length <= 80) {
          const kms = next.keyMessages ?? ['', '', '']
          while (kms.length < 3) kms.push('')
          kms[idx] = text
          next.keyMessages = kms
          accepted.push(key)
        } else {
          rejected.push(key)
          errors.push({
            slotKey: key,
            zodIssue: `키 메시지는 8~80자 (현재 ${text.length}자)`,
            remediation: '한 줄 슬로건 형태로 8~80자 사이로 다듬어 주세요.',
          })
        }
      }
      continue
    }

    // keyMessages (배열로 들어온 경우)
    if (key === 'keyMessages' && Array.isArray(value)) {
      const arr = value
        .map((v) => String(v).trim())
        .filter((s) => s.length >= 8 && s.length <= 80)
      const r = KeyMessagesSchema.safeParse(arr)
      if (r.success) {
        next.keyMessages = r.data
        accepted.push('keyMessages.0', 'keyMessages.1', 'keyMessages.2')
      } else {
        // 부분 채움이라도 시도
        const partial = arr.slice(0, 3)
        const kms = next.keyMessages ?? ['', '', '']
        while (kms.length < 3) kms.push('')
        partial.forEach((t, i) => {
          kms[i] = t
          accepted.push(`keyMessages.${i}`)
        })
        next.keyMessages = kms
      }
      continue
    }

    // differentiators
    if (key === 'differentiators' && Array.isArray(value)) {
      const refs = value
        .map((v) => v as Record<string, unknown>)
        .filter((v) => typeof v === 'object' && v !== null)
        .filter((v) => typeof v.assetId === 'string' && typeof v.narrativeSnippet === 'string')
        .map((v) => ({
          assetId: String(v.assetId),
          sectionKey: (typeof v.sectionKey === 'string'
            ? v.sectionKey
            : 'other') as 'proposal-background' | 'curriculum' | 'coaches' | 'budget' | 'impact' | 'org-team' | 'other',
          narrativeSnippet: String(v.narrativeSnippet).slice(0, 600),
          acceptedByPm: Boolean(v.acceptedByPm ?? false),
        }))
      if (refs.length > 0) {
        next.differentiators = [
          ...(next.differentiators ?? []),
          ...refs.filter((r) => !next.differentiators?.some((x) => x.assetId === r.assetId)),
        ].slice(0, 7)
        accepted.push('differentiators')
      }
      continue
    }

    // sections.<n>
    if (key.startsWith('sections.')) {
      const sec = key.split('.')[1] as SectionKey
      if (['1', '2', '3', '4', '5', '6', '7'].includes(sec)) {
        const text = String(value).trim()
        if (text.length > 0 && text.length <= 2000) {
          next.sections = { ...(next.sections ?? {}), [sec]: text }
          accepted.push(key)
        } else if (text.length > 2000) {
          // 길이 초과 — truncate + 경고
          next.sections = { ...(next.sections ?? {}), [sec]: text.slice(0, 2000) }
          accepted.push(key)
          errors.push({
            slotKey: key,
            zodIssue: `${sec} 섹션 ${text.length}자 → 2000자로 잘림`,
            remediation: '핵심만 추려 다듬어 주세요.',
          })
        }
      }
      continue
    }

    // sections (객체로 들어온 경우)
    if (key === 'sections' && typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>
      const merged: ExpressDraft['sections'] = { ...(next.sections ?? {}) }
      for (const [sk, sv] of Object.entries(obj)) {
        if (['1', '2', '3', '4', '5', '6', '7'].includes(sk) && typeof sv === 'string') {
          merged[sk as SectionKey] = sv.slice(0, 2000)
          accepted.push(`sections.${sk}`)
        }
      }
      next.sections = merged
      continue
    }

    // evidenceRefs
    if (key === 'evidenceRefs' && Array.isArray(value)) {
      const refs = value
        .map((v) => v as Record<string, unknown>)
        .filter((v) => typeof v === 'object' && v !== null)
        .filter((v) => typeof v.topic === 'string' && typeof v.summary === 'string')
        .map((v) => ({
          topic: String(v.topic).slice(0, 60),
          source: String(v.source ?? '미상').slice(0, 200),
          summary: String(v.summary).slice(0, 400),
          fetchedVia: ((['pm-direct', 'external-llm', 'auto-extract'] as const).includes(
            v.fetchedVia as 'pm-direct',
          )
            ? v.fetchedVia
            : 'pm-direct') as 'pm-direct' | 'external-llm' | 'auto-extract',
          capturedAt: new Date().toISOString(),
        }))
      if (refs.length > 0) {
        next.evidenceRefs = [...(next.evidenceRefs ?? []), ...refs].slice(0, 15)
        accepted.push('evidenceRefs')
      }
      continue
    }

    // 알 수 없는 키
    rejected.push(key)
    errors.push({
      slotKey: key,
      zodIssue: `알 수 없는 슬롯 키: ${key}`,
    })
  }

  // 메타 갱신
  next.meta.lastUpdatedAt = new Date().toISOString()
  if (accepted.length > 0) {
    next.meta.lastFilledSlot = accepted[accepted.length - 1]
  }

  return {
    draft: next,
    validationErrors: errors,
    acceptedSlots: accepted,
    rejectedSlots: rejected,
  }
}

/**
 * AI 응답이 잘못된 슬롯 키를 만들지 못하도록 — 알려진 슬롯만 통과시키는 화이트리스트.
 * processTurn 에서 호출.
 */
const KNOWN_SLOT_PREFIXES = new Set<string>([
  'intent',
  'beforeAfter',
  'beforeAfter.before',
  'beforeAfter.after',
  'keyMessages',
  'keyMessages.0',
  'keyMessages.1',
  'keyMessages.2',
  'differentiators',
  'evidenceRefs',
  'sections',
  'sections.1',
  'sections.2',
  'sections.3',
  'sections.4',
  'sections.5',
  'sections.6',
  'sections.7',
])

export function filterKnownSlots(
  extracted: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(extracted)) {
    if (KNOWN_SLOT_PREFIXES.has(k)) out[k] = v
  }
  return out
}

/**
 * 12 슬롯 카운트 (UI 진행 표시용)
 */
export function countFilledSlots(draft: ExpressDraft): { filled: number; total: number } {
  // schema.ts 의 isSlotFilled 와 ALL_SLOTS 를 활용 — circular import 방지 위해 직접 구현
  let filled = 0
  for (const slot of ALL_SLOTS) {
    if (isSlotFilledLocal(draft, slot)) filled += 1
  }
  return { filled, total: ALL_SLOTS.length }
}

function isSlotFilledLocal(draft: ExpressDraft, slot: SlotKey): boolean {
  if (slot === 'intent') return !!draft.intent && draft.intent.length >= 20
  if (slot === 'beforeAfter.before')
    return !!draft.beforeAfter?.before && draft.beforeAfter.before.length >= 20
  if (slot === 'beforeAfter.after')
    return !!draft.beforeAfter?.after && draft.beforeAfter.after.length >= 20
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

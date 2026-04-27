/**
 * Asset Match → ExpressDraft.differentiators 변환 (Phase L Wave L2, ADR-011)
 *
 * Phase G·H 의 matchAssetsToRfp 결과 (AssetMatch[]) 를
 * ExpressDraft.differentiators[] (AssetReference[]) 로 매핑.
 *
 * server-only — asset-registry 가 prisma 의존성 가짐.
 *
 * 관련 문서: docs/architecture/express-mode.md §6
 */

import 'server-only'

import {
  ASSET_SECTION_TO_DRAFT,
  type AssetReference,
  type ExpressDraft,
  type SectionKey,
} from './schema'
import type { AssetMatch } from '@/lib/asset-registry'

// ─────────────────────────────────────────
// 1. AssetMatch → AssetReference 변환
// ─────────────────────────────────────────

export function assetMatchesToReferences(matches: AssetMatch[]): AssetReference[] {
  const out: AssetReference[] = []
  for (const m of matches) {
    const asset = m.asset
    if (!asset?.id || !asset.narrativeSnippet) continue
    const sectionKey = m.section
    const mappedSection: AssetReference['sectionKey'] = isValidSectionKey(sectionKey)
      ? sectionKey
      : 'other'
    out.push({
      assetId: asset.id,
      sectionKey: mappedSection,
      narrativeSnippet: asset.narrativeSnippet.slice(0, 600),
      acceptedByPm: false as boolean, // 기본은 PM 검토 대기
    })
  }
  return out
}

function isValidSectionKey(s: unknown): s is AssetReference['sectionKey'] {
  return (
    typeof s === 'string' &&
    [
      'proposal-background',
      'curriculum',
      'coaches',
      'budget',
      'impact',
      'org-team',
      'other',
    ].includes(s)
  )
}

// ─────────────────────────────────────────
// 2. AssetReference → sections 에 narrativeSnippet 주입
// ─────────────────────────────────────────

/**
 * acceptedByPm=true 인 AssetReference 의 narrativeSnippet 을
 * 해당 섹션 텍스트에 추가 (이미 있으면 skip).
 */
export function pourAssetsIntoSections(draft: ExpressDraft): ExpressDraft {
  if (!draft.differentiators || draft.differentiators.length === 0) return draft

  const accepted = draft.differentiators.filter((d) => d.acceptedByPm)
  if (accepted.length === 0) return draft

  const sections: ExpressDraft['sections'] = { ...(draft.sections ?? {}) }

  for (const ref of accepted) {
    const sectionKey: SectionKey = ASSET_SECTION_TO_DRAFT[ref.sectionKey]
    const existing = sections[sectionKey] ?? ''
    // 이미 같은 narrativeSnippet 이 있으면 skip
    if (existing.includes(ref.narrativeSnippet.slice(0, 80))) continue
    const addition = `\n\n[자산 인용] ${ref.narrativeSnippet}`
    const merged = existing + addition
    sections[sectionKey] = merged.slice(0, 2000) // 캡
  }

  return {
    ...draft,
    sections,
  }
}

// ─────────────────────────────────────────
// 3. 자산 매칭 결과를 자동으로 differentiators 에 시드
//    (PM 이 아직 검토 안 한 상태 — acceptedByPm=false)
// ─────────────────────────────────────────

export function seedDifferentiatorsFromMatches(
  draft: ExpressDraft,
  matches: AssetMatch[],
  maxNew = 5,
): ExpressDraft {
  if (matches.length === 0) return draft
  const existing = new Set((draft.differentiators ?? []).map((d) => d.assetId))
  const newRefs = assetMatchesToReferences(matches)
    .filter((r) => !existing.has(r.assetId))
    .slice(0, maxNew)

  if (newRefs.length === 0) return draft

  return {
    ...draft,
    differentiators: [...(draft.differentiators ?? []), ...newRefs].slice(0, 7),
  }
}

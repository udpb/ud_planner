/**
 * RFP 따라 유연한 적용 슬롯 결정 (Phase L Wave L2, ADR-011 §7)
 *
 * RFP 평가표 가중치·ProgramProfile 11축에 따라 12 슬롯 중 일부 강조/생략.
 * 결과는 draft.meta.activeSlots 에 저장.
 *
 * 관련 문서: docs/architecture/express-mode.md §9
 */

import { ALL_SLOTS, type SlotKey } from './schema'
import type { RfpParsed } from '@/lib/claude'
import type { ProgramProfile } from '@/lib/program-profile'

export interface ActiveSlotResult {
  active: SlotKey[]
  skipped: SlotKey[]
  reasons: Record<string, string>
}

/**
 * 보수적 default: 12 슬롯 모두 활성, skip 없음.
 * RFP·ProgramProfile 단서가 있으면 추가 강조/skip 룰 적용.
 */
export function computeActiveSlots(
  rfp?: RfpParsed,
  profile?: ProgramProfile,
): ActiveSlotResult {
  const active = new Set<SlotKey>(ALL_SLOTS)
  const skipped = new Set<SlotKey>()
  const reasons: Record<string, string> = {}

  // 룰 1: RFP eval 가중치 임팩트가 매우 낮으면 sections.6 의 우선순위 낮춤
  // (현재는 skip 까진 안 함 — 1차본 단계라 모두 채우는 게 안전)

  // 룰 2: ProgramProfile.methodology.primary 가 '글로벌진출' 이면
  //       additional evidence slot 권장 (이건 evidenceRefs 로 별도 처리)
  if (profile?.methodology?.primary === '글로벌진출') {
    reasons['global'] = 'ProgramProfile = 글로벌진출 — 외부 LLM 카드로 시장 자료 수집 권장'
  }

  // 룰 3: RFP totalBudgetVat < 1억 이면 sections.5 (예산) 비중 줄임
  // (현재 1차본은 모두 채움 — 추후 룰 추가 가능)

  return {
    active: [...active],
    skipped: [...skipped],
    reasons,
  }
}

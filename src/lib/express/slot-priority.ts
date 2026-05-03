/**
 * 슬롯 우선순위 룰 (Phase L Wave L2, ADR-011)
 *
 * intent → beforeAfter → keyMessages → differentiators → sections 순서.
 * sections 내부는 RFP 평가표 가중치 순.
 *
 * 관련 문서: docs/architecture/express-mode.md §2.2
 */

import {
  ALL_SLOTS,
  isSlotFilled,
  type ExpressDraft,
  type SectionKey,
  type SlotKey,
} from './schema'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

const SECTION_DEFAULT_ORDER: SectionKey[] = ['1', '2', '3', '4', '6']

/**
 * RFP 의 evalCriteria 또는 evalStrategy.sectionWeights 가 있으면 가중치 순,
 * 없으면 기본 순서 (1→2→3→4→6).
 */
function orderSectionsByEvalWeight(rfp: RfpParsed | undefined): SectionKey[] {
  // evalCriteria.weight 가 있으면 사용
  const ec = rfp?.evalCriteria
  if (Array.isArray(ec) && ec.length > 0) {
    // RFP eval criteria 의 카테고리 → SectionKey 매핑 (휴리스틱)
    const labelToSection: Record<string, SectionKey> = {
      배경: '1',
      목적: '1',
      전략: '2',
      방법: '2',
      추진전략: '2',
      커리큘럼: '3',
      교육과정: '3',
      운영: '4',
      코치: '4',
      예산: '5',
      경제성: '5',
      성과: '6',
      임팩트: '6',
      kpi: '6',
      실적: '7',
      역량: '7',
    }

    const weighted: { sec: SectionKey; w: number }[] = []
    for (const c of ec) {
      const item = String((c as { item?: string }).item ?? '')
      const w = Number((c as { score?: number }).score ?? 0)
      for (const [k, v] of Object.entries(labelToSection)) {
        if (item.toLowerCase().includes(k.toLowerCase())) {
          weighted.push({ sec: v, w })
          break
        }
      }
    }
    if (weighted.length > 0) {
      const sumByKey = new Map<SectionKey, number>()
      for (const x of weighted) {
        sumByKey.set(x.sec, (sumByKey.get(x.sec) ?? 0) + x.w)
      }
      const sorted = SECTION_DEFAULT_ORDER.slice().sort(
        (a, b) => (sumByKey.get(b) ?? 0) - (sumByKey.get(a) ?? 0),
      )
      return sorted
    }
  }
  return SECTION_DEFAULT_ORDER
}

/**
 * 다음으로 채울 슬롯 1개를 골라 반환.
 *  - 모든 활성 슬롯이 채워져 있으면 null (= 종료 가능 상태)
 *  - activeSlots 가 주어지면 그 안에서만 고름
 */
export function selectNextSlot(
  draft: ExpressDraft,
  rfp?: RfpParsed,
  activeSlots?: string[],
): SlotKey | null {
  const target = activeSlots ?? draft.meta.activeSlots ?? ALL_SLOTS

  // 1단계: intent
  if (target.includes('intent') && !isSlotFilled(draft, 'intent')) return 'intent'

  // 2단계: beforeAfter
  if (target.includes('beforeAfter.before') && !isSlotFilled(draft, 'beforeAfter.before'))
    return 'beforeAfter.before'
  if (target.includes('beforeAfter.after') && !isSlotFilled(draft, 'beforeAfter.after'))
    return 'beforeAfter.after'

  // 3단계: keyMessages 0,1,2
  for (let i = 0; i < 3; i += 1) {
    const key = `keyMessages.${i}` as SlotKey
    if (target.includes(key) && !isSlotFilled(draft, key)) return key
  }

  // 4단계: differentiators (자산 매칭 결과 PM 검토)
  if (target.includes('differentiators') && !isSlotFilled(draft, 'differentiators'))
    return 'differentiators'

  // 5단계: sections (평가표 가중치 순)
  const order = orderSectionsByEvalWeight(rfp)
  for (const sec of order) {
    const key = `sections.${sec}` as SlotKey
    if (target.includes(key) && !isSlotFilled(draft, key)) return key
  }

  return null
}

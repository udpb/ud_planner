/**
 * Express 프롬프트 컨텍스트 포맷터 (Phase 2.2 단순화, 2026-05-03)
 *
 * 작은 헬퍼 함수들 — turn / first-turn 프롬프트가 공통으로 사용.
 * (이전: src/lib/express/prompts.ts 단일 파일에서 분리)
 */

import {
  ALL_SLOTS,
  SLOT_LABELS,
  isSlotFilled,
  type ExpressDraft,
} from '../schema'
import type { Turn } from '../conversation'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'
import type { AssetMatch } from '@/lib/asset-registry'

export function listFilledSlotsText(draft: ExpressDraft): string {
  const filled = ALL_SLOTS.filter((s) => isSlotFilled(draft, s))
  if (filled.length === 0) return '아직 채워진 슬롯 없음'
  return filled.map((s) => `- ${s} (${SLOT_LABELS[s]})`).join('\n')
}

export function formatRfpBrief(rfp: RfpParsed | undefined): string {
  if (!rfp) return '(아직 RFP 미파싱)'
  const lines: string[] = []
  if (rfp.projectName) lines.push(`제목: ${rfp.projectName}`)
  if (rfp.client) lines.push(`발주: ${rfp.client}`)
  if (rfp.totalBudgetVat) lines.push(`예산(VAT 포함): ${rfp.totalBudgetVat.toLocaleString()}원`)
  if (rfp.objectives && rfp.objectives.length > 0) {
    lines.push('목적:')
    for (const o of rfp.objectives.slice(0, 5)) lines.push(`  - ${o}`)
  }
  if (rfp.keywords && rfp.keywords.length > 0) {
    lines.push(`키워드: ${rfp.keywords.slice(0, 8).join(', ')}`)
  }
  if (rfp.evalCriteria && rfp.evalCriteria.length > 0) {
    lines.push('평가표:')
    for (const c of rfp.evalCriteria.slice(0, 6)) {
      lines.push(`  - ${c.item} (배점 ${c.score}점)`)
    }
  }
  return lines.join('\n')
}

export function formatProfile(profile: ProgramProfile | undefined): string {
  if (!profile) return '(ProgramProfile 미설정)'
  const m = profile.methodology
  const parts: string[] = []
  const domains = profile.targetSegment?.businessDomain ?? []
  if (domains.length > 0) parts.push(`사업영역: ${domains.join(', ')}`)
  if (profile.targetStage) parts.push(`대상 단계: ${profile.targetStage}`)
  if (m?.primary) parts.push(`방법론: ${m.primary}`)
  if (profile.delivery?.mode) parts.push(`전달방식: ${profile.delivery.mode}`)
  return parts.join(' | ') || '(데이터 부족)'
}

export function formatAssetMatches(matches: AssetMatch[] | undefined): string {
  if (!matches || matches.length === 0) return '(매칭된 자산 없음)'
  // Phase H2 — narrativeSnippet 전체 + 자산 ID + applicableSections + keyNumbers 풍부 노출
  // LLM 이 sections 본문에 narrativeSnippet 을 글자 그대로 인용할 수 있게 충분한 정보 제공
  return matches
    .slice(0, 5)
    .map((m, i) => {
      const score = m.matchScore ?? 0
      const asset = m.asset
      if (!asset) return `${i + 1}. (이름 없음, 점수 ${score.toFixed(2)})`

      const name = asset.name ?? '(이름 없음)'
      const id = asset.id ?? ''
      const snip = asset.narrativeSnippet ?? ''
      const sections = (asset as { applicableSections?: string[] }).applicableSections ?? []
      const keyNums = (asset as { keyNumbers?: unknown[] }).keyNumbers ?? []
      const keyNumsStr = keyNums.length > 0
        ? keyNums
            .map((k) => (typeof k === 'object' && k !== null && 'value' in k ? (k as { value: string }).value : String(k)))
            .slice(0, 5)
            .join(' · ')
        : ''

      const lines = [
        `[${i + 1}] ${name} (assetId="${id}" · 점수 ${score.toFixed(2)})`,
      ]
      if (sections.length > 0) lines.push(`   ▷ 적용 섹션: ${sections.join(', ')}`)
      if (keyNumsStr) lines.push(`   ▷ 핵심 수치: ${keyNumsStr}`)
      if (snip) lines.push(`   ▷ narrativeSnippet (sections 본문에 글자 그대로 인용):\n   "${snip}"`)
      return lines.join('\n')
    })
    .join('\n\n')
}

export function formatRecentTurns(turns: Turn[], limit = 5): string {
  if (turns.length === 0) return '(첫 턴)'
  return turns
    .slice(-limit)
    .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
    .join('\n\n')
}

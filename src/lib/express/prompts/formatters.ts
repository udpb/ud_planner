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
  // Phase H2 + J1/J4 — narrativeSnippet (요약) + originalQuote (직인용) + originalParagraph
  // LLM 이 sections 본문에 voice 보존된 원본 직인용 가능하도록 풍부한 정보 제공
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

      // Phase J1 — sourceReferences 의 originalQuote / originalParagraph 추출
      const srRaw = (asset as { sourceReferences?: unknown }).sourceReferences
      let originalQuote: string | undefined
      let originalParagraph: string | undefined
      if (srRaw && typeof srRaw === 'object' && !Array.isArray(srRaw)) {
        const sr = srRaw as Record<string, unknown>
        if (typeof sr.originalQuote === 'string') originalQuote = sr.originalQuote
        if (typeof sr.originalParagraph === 'string') originalParagraph = sr.originalParagraph
      }

      const lines = [
        `[${i + 1}] ${name} (assetId="${id}" · 점수 ${score.toFixed(2)})`,
      ]
      if (sections.length > 0) lines.push(`   ▷ 적용 섹션: ${sections.join(', ')}`)
      if (keyNumsStr) lines.push(`   ▷ 핵심 수치: ${keyNumsStr}`)
      // ⭐ originalQuote / originalParagraph 가 있으면 가장 먼저 표시 — voice 보존 직인용용
      if (originalQuote) {
        lines.push(`   ▷ **★ originalQuote (sections 본문에 글자 그대로 인용 — voice 보존)**:\n   「${originalQuote}」`)
      }
      if (originalParagraph) {
        lines.push(`   ▷ **★ originalParagraph (단락 통째 인용 가능)**:\n   ${originalParagraph.slice(0, 400)}${originalParagraph.length > 400 ? '...' : ''}`)
      }
      if (snip) lines.push(`   ▷ narrativeSnippet (요약 — 매칭/표시용. 본문 인용 시 originalQuote 우선):\n   "${snip}"`)
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

/**
 * K7 — PM 이 입력한 통화/코치/평가위원 정보를 prompt 에 주입.
 * 빈 입력 (모두 비어있음) 이면 빈 문자열 반환 → 호출자에서 ""PM 보완 권장"" 안내 가능.
 */
export function formatPmInputs(
  pmInputs:
    | {
        callNotes?: { date?: string; contact?: string; summary: string }[]
        assignedCoaches?: { name: string; role?: string; background?: string }[]
        evaluators?: { name: string; affiliation?: string; focus?: string }[]
        freeNotes?: string
      }
    | null
    | undefined,
): string {
  if (!pmInputs) return ''
  const parts: string[] = []

  const calls = pmInputs.callNotes ?? []
  if (calls.length > 0) {
    parts.push(`▷ 발주처 통화/미팅 결과 (${calls.length}건):`)
    for (const c of calls.slice(0, 5)) {
      const head = [c.date, c.contact].filter(Boolean).join(' · ') || '통화'
      parts.push(`  - [${head}] ${c.summary}`)
    }
  }

  const coaches = pmInputs.assignedCoaches ?? []
  if (coaches.length > 0) {
    parts.push(`\n▷ 본 사업 전담 코치 (${coaches.length}명):`)
    for (const c of coaches.slice(0, 10)) {
      const role = c.role ? ` [${c.role}]` : ''
      const bg = c.background ? ` — ${c.background}` : ''
      parts.push(`  - ${c.name}${role}${bg}`)
    }
  }

  const evals = pmInputs.evaluators ?? []
  if (evals.length > 0) {
    parts.push(`\n▷ 평가위원 정보 (${evals.length}명, 본문에 실명 노출 X — 관심사만 반영):`)
    for (const e of evals.slice(0, 10)) {
      const aff = e.affiliation ? ` (${e.affiliation})` : ''
      const focus = e.focus ? ` — 관심: ${e.focus}` : ''
      parts.push(`  - ${e.name}${aff}${focus}`)
    }
  }

  if (pmInputs.freeNotes && pmInputs.freeNotes.trim().length > 0) {
    parts.push(`\n▷ PM 추가 메모 (참고만, 본문에 그대로 X):\n  ${pmInputs.freeNotes.slice(0, 500)}`)
  }

  return parts.length > 0 ? parts.join('\n') : ''
}

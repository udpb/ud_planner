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
  // P5 — 사업 유형·지역: 커리큘럼·전략이 사업 성격에 맞게 적응하도록
  const typeRegion = [rfp.projectType, rfp.region].filter(Boolean).join(' · ')
  if (typeRegion) lines.push(`유형/지역: ${typeRegion}`)
  if (rfp.totalBudgetVat) lines.push(`예산(VAT 포함): ${rfp.totalBudgetVat.toLocaleString()}원`)
  // ⭐ P5 — 대상·인원·창업단계: 커리큘럼/운영이 "누구를·몇 명·어느 단계" 인지하고 설계하도록.
  //   (이전: formatRfpBrief 가 이 3개를 누락 → 커리큘럼이 대상 모른 채 생성되던 갭)
  if (rfp.targetAudience) lines.push(`대상: ${rfp.targetAudience}`)
  const stageCount = [
    rfp.targetStage && rfp.targetStage.length > 0 ? `단계 ${rfp.targetStage.join('·')}` : '',
    rfp.targetCount ? `정원 ${rfp.targetCount}명` : '',
  ].filter(Boolean).join(' / ')
  if (stageCount) lines.push(`참여: ${stageCount}`)
  if (rfp.objectives && rfp.objectives.length > 0) {
    lines.push('목적:')
    for (const o of rfp.objectives.slice(0, 5)) lines.push(`  - ${o}`)
  }
  if (rfp.deliverables && rfp.deliverables.length > 0) {
    lines.push(`산출물: ${rfp.deliverables.slice(0, 5).join(' / ')}`)
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
  // P5 — 11축 중 4축만 노출하던 것을 확장. 생성이 사업 성격에 맞게 적응하도록.
  //   특히 formats(데모데이·IR·네트워킹 = 행사)·tasks(행사_운영 등)·externalSpeakers(연사 풀)
  //   는 '사업 풀니스'(장소·행사·연사) 생성을 위한 핵심 신호 (P6).
  const m = profile.methodology
  const parts: string[] = []
  const domains = profile.targetSegment?.businessDomain ?? []
  if (domains.length > 0) parts.push(`사업영역: ${domains.join(', ')}`)
  const geo = profile.targetSegment?.geography
  if (geo) parts.push(`지역: ${geo}`)
  if (profile.targetStage) parts.push(`대상 단계: ${profile.targetStage}`)
  // 규모 — 예산티어·참여규모·기간 (커리큘럼 회차·코호트 크기 적응)
  const sc = profile.scale
  if (sc) {
    const scaleStr = [
      sc.budgetTier ? `예산 ${sc.budgetTier}` : '',
      sc.participants ? `규모 ${sc.participants}` : '',
      sc.durationMonths ? `${sc.durationMonths}개월` : '',
    ].filter(Boolean).join(' · ')
    if (scaleStr) parts.push(`규모: ${scaleStr}`)
  }
  // 과업 유형 (모객·심사·교류·멘토링·컨설팅·행사_운영) — 사업 구성요소
  const tasks = profile.supportStructure?.tasks ?? []
  if (tasks.length > 0) parts.push(`과업: ${tasks.join('·')}`)
  // 포맷 (데모데이·IR·네트워킹 등) — 행사 구체성 신호
  const formats = profile.formats ?? []
  if (formats.length > 0) parts.push(`행사/포맷: ${formats.join('·')}`)
  // 연사 풀 (외부 연사 활용 — '코치만이 아님')
  const ss = profile.supportStructure
  if (ss?.externalSpeakers) {
    parts.push(`외부 연사 활용${ss.externalSpeakerCount ? ` (~${ss.externalSpeakerCount}명)` : ''}`)
  }
  if (ss?.fourLayerSupport) parts.push('4중 지원체계(멘토+컨설턴트+전담코치+동료)')
  if (m?.primary) parts.push(`방법론: ${m.primary}`)
  if (profile.delivery?.mode) parts.push(`전달방식: ${profile.delivery.mode}`)
  if (profile.channel?.type) {
    parts.push(`채널: ${profile.channel.type}${profile.channel.isRenewal ? '(연속사업)' : ''}`)
  }
  const impacts = profile.primaryImpact ?? []
  if (impacts.length > 0) parts.push(`주임팩트: ${impacts.join('·')}`)
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

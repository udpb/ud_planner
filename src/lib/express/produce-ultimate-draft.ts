/**
 * Produce Ultimate Draft — Phase H6 (2026-05-28)
 *
 * RFP + PM 키워드 입력 → 13~14 LLM 호출 → 발주처 제출 가능 1차본 .md 자동 생성.
 *
 * 핵심: 단순 슬롯 채움이 아니라 **Brain의 모든 capability 를 orchestrate** 해서
 * "PM 1차본 초안 (60~70%)" 수준이 아닌 "발주처 제출 가능 (95%+)" 으로 도약.
 *
 * 흐름:
 *   1. fetchClientContext (H1) — 발주처 unique context 1 LLM
 *   2. matchAssetsToRfp — Brain 의 자산 매칭 (DB query, no LLM)
 *   3. 슬롯별 turn × N — buildTurnPrompt 에 (H1 ctx + H2 asset narrative + H3 차별점) 모두 주입
 *   4. produceRisks (H4) — 평가위원 의문 4~6개 능동 답변 1 LLM
 *   5. coherencePass (H5) — 7 sections narrative arc 보강 1 LLM
 *   6. inspectDraft — 11-lens 최종 점수 1 LLM
 *
 * 토큰 사용량 (예상): ~80~100K (per draft)
 * 시간 (예상): 8~12 분
 * 결과: ExpressDraft (full hierarchy + sectionMeta + risks + sourceTrace + inspection) + .md
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { buildTurnPrompt } from './prompts'
import { filterKnownSlots, mergeExtractedSlots } from './extractor'
import { emptyDraft, ExpressDraftSchema } from './schema'
import type { ExpressDraft, RiskMitigation } from './schema'
import { fetchClientContext } from './client-context'
import type { ClientContext } from './client-context'
import { produceRisks } from './produce-risks'
import { coherencePass } from './coherence-pass'
import { inspectDraft } from './inspector'
import type { InspectorReport } from './inspector'
import { matchAssetsToRfp } from '@/lib/asset-registry'
import type { AssetMatch } from '@/lib/asset-registry'
import type { RfpParsed } from '@/lib/ai/parse-rfp'
import type { ProgramProfile } from '@/lib/program-profile'
// Phase I — 자동 채움 capabilities
import { generateTrackRecord } from './track-record'
import { inferBudgetBreakdown } from './infer-budget'
import { fetchExternalEvidence, formatResearchForPrompt } from './deep-research'
import type { DeepResearchOutput } from './deep-research'
// L4 — fact-check 2차 LLM 검증
import { verifyExternalEvidence } from './verify-research'
import type { VerifiedResearchOutput } from './verify-research'
// Phase J2 — tonePatterns 활성화
import { buildToneProfile, formatToneProfileForPrompt } from './tone-patterns'
import type { ToneProfile } from './tone-patterns'
// K7 — PM inputs (통화·코치·평가위원)
import { formatPmInputs } from './prompts/formatters'
import type { PmInputs } from './schema'

export interface UltimateDraftInput {
  rfp: RfpParsed
  profile?: ProgramProfile | null
  channel: 'B2G' | 'B2B' | 'renewal'
  /** 슬롯별 PM 입력 (또는 generic placeholder — AI 자동 보완) */
  slotInputs: Array<{ slot: string; pmInput: string }>
  /** K7 — PM 이 입력한 외부 reality (통화·코치·평가위원) */
  pmInputs?: PmInputs | null
  /** 진행 상황 콜백 (CLI 출력용) */
  onProgress?: (step: string, detail: string) => void
}

export interface UltimateDraftOutput {
  draft: ExpressDraft
  clientContext: ClientContext
  matchedAssets: AssetMatch[]
  /** Phase I3 — 외부 딥리서치 결과 (L4 fact-check 적용 후) */
  externalResearch: DeepResearchOutput | VerifiedResearchOutput | null
  /** L4 — fact-check 검증 결과 (verified/uncertain/fabricated 분포) */
  verificationSummary: VerifiedResearchOutput['verification'] | null
  /** Phase I1 — 자동 생성된 sections.7 (수행 실적) 의 인용 사업 */
  trackRecordSources: string[]
  /** Phase I2 — 자동 산출 예산 비목 */
  budgetBreakdown: Array<{ category: string; amount: number; percentage: number }>
  /** Phase J2 — 채널·도메인 ToneProfile (voice 일관성) */
  toneProfile: ToneProfile
  risks: RiskMitigation[]
  coherenceReasoning: string | null
  inspection: InspectorReport | null
  metrics: {
    totalLlmCalls: number
    totalElapsedSec: number
    callsBySource: Record<string, number>
  }
}

export async function produceUltimateDraft(
  input: UltimateDraftInput,
): Promise<UltimateDraftOutput> {
  const { rfp, profile, channel, slotInputs, onProgress } = input
  const startT = Date.now()
  let llmCalls = 0
  const callsBySource: Record<string, number> = {}
  const bump = (s: string) => {
    llmCalls++
    callsBySource[s] = (callsBySource[s] ?? 0) + 1
  }
  const progress = (step: string, detail: string) => onProgress?.(step, detail)

  // ────────────────────────────────────
  // Step 1: 발주처 컨텍스트 fetch (1 LLM)
  // ────────────────────────────────────
  progress('1/6', '발주처 컨텍스트 fetch...')
  const t1 = Date.now()
  const clientContext = await fetchClientContext({
    client: rfp.client ?? '미상',
    projectName: rfp.projectName,
    channel,
    rfpSummary: rfp.summary,
  })
  bump('client-context')
  progress('1/6', `완료 ${((Date.now() - t1) / 1000).toFixed(1)}s · lowConfidence=${clientContext.lowConfidence}`)

  // ────────────────────────────────────
  // Step 2: 자산 매칭 (no LLM, DB)
  // ────────────────────────────────────
  progress('2/6', 'Brain 자산 매칭...')
  const t2 = Date.now()
  let matchedAssets: AssetMatch[] = []
  try {
    matchedAssets = await matchAssetsToRfp({
      rfp,
      profile: profile ?? undefined,
      limit: 10,
    })
  } catch (e) {
    console.warn('[ultimate-draft] 자산 매칭 실패 (DB 미연결?):', e instanceof Error ? e.message : e)
  }
  progress('2/6', `완료 ${((Date.now() - t2) / 1000).toFixed(1)}s · ${matchedAssets.length} 자산`)

  // ────────────────────────────────────
  // Step 2.4: Tone Profile (Phase J2, DB only — no LLM)
  // ────────────────────────────────────
  progress('2.4/9', '채널·도메인 ToneProfile 추출...')
  const t24 = Date.now()
  const toneProfile = await buildToneProfile({
    channel,
    keywords: (rfp.keywords ?? []).slice(0, 8),
    limit: 3,
  })
  progress('2.4/9', `완료 ${((Date.now() - t24) / 1000).toFixed(1)}s · openings ${toneProfile.openings?.length ?? 0} · avoidedWords ${toneProfile.avoidedWords?.length ?? 0}`)

  // ────────────────────────────────────
  // Step 2.5: 외부 딥리서치 (Phase I3, 1 LLM)
  // ────────────────────────────────────
  progress('2.5/9', '외부 자료 딥리서치...')
  const t2_5 = Date.now()
  const rawResearch = await fetchExternalEvidence({ rfp, channel })
  bump('deep-research')
  progress('2.5/9', `완료 ${((Date.now() - t2_5) / 1000).toFixed(1)}s · ${rawResearch.evidence.length} 자료 · domainInsight ${rawResearch.domainInsight ? '있음' : '없음'}`)

  // ────────────────────────────────────
  // Step 2.6: 외부 자료 fact-check (L4, 2차 LLM — skeptical reviewer)
  // ────────────────────────────────────
  progress('2.6/9', '외부 자료 fact-check (skeptical reviewer)...')
  const t2_6 = Date.now()
  let externalResearch: VerifiedResearchOutput | DeepResearchOutput = rawResearch
  let verificationSummary: VerifiedResearchOutput['verification'] | null = null
  if (rawResearch.evidence.length > 0) {
    try {
      const verified = await verifyExternalEvidence(rawResearch)
      externalResearch = verified
      verificationSummary = verified.verification
      bump('verify-research')
      progress(
        '2.6/9',
        `완료 ${((Date.now() - t2_6) / 1000).toFixed(1)}s · verified ${verified.verification.verifiedCount} · uncertain ${verified.verification.uncertainCount} · fabricated ${verified.verification.fabricatedCount}`,
      )
    } catch (e) {
      console.warn('[ultimate-draft] fact-check 실패 → raw research 사용:', e instanceof Error ? e.message : e)
      progress('2.6/9', '실패 — raw research 그대로 사용 (검증 안 됨)')
    }
  } else {
    progress('2.6/9', 'skip — evidence 없음')
  }

  // ────────────────────────────────────
  // Step 3: 슬롯별 turn (N LLM)
  // ────────────────────────────────────
  progress('3/9', `슬롯 ${slotInputs.length}개 자동 채움...`)
  const t3 = Date.now()
  let draft = emptyDraft()

  // 외부 딥리서치 결과를 evidenceRefs 에 미리 누적 (LLM 이 sections.1 에 inline 인용 가능)
  if (externalResearch.evidenceRefs.length > 0) {
    draft.evidenceRefs = [...(draft.evidenceRefs ?? []), ...externalResearch.evidenceRefs]
  }

  // Phase J2 — toneProfile 을 모든 sections turn 의 pmInput 에 부가
  const toneSection = formatToneProfileForPrompt(toneProfile)
  // K7 — pmInputs (통화·코치·평가위원) 을 한 번만 formatting
  const pmInputsSection = formatPmInputs(input.pmInputs ?? null)
  for (const sin of slotInputs) {
    // 외부 리서치 결과를 pmInput 에 부가 (LLM 이 활용)
    let augmentedInput = sin.pmInput
    if (externalResearch.evidence.length > 0 && sin.slot.startsWith('sections.1')) {
      augmentedInput = `${augmentedInput}\n\n[외부 리서치 결과 — 본문에 inline citation 으로 박을 것]\n${formatResearchForPrompt(externalResearch)}`
    }
    // Phase J2 — sections 슬롯에 ToneProfile 주입 (voice 일관성)
    if (toneSection && sin.slot.startsWith('sections.')) {
      augmentedInput = `${augmentedInput}\n\n[채널·도메인 ToneProfile (이전 수주 사업 어휘 패턴 — 본문에 자연스럽게 활용)]\n${toneSection}`
    }
    // K7 — PM 외부 reality 주입 (모든 sections 슬롯)
    //   sections.1 = 발주처 통화 결과 (의사결정자 의중)
    //   sections.4 = 전담 코치 명단 (실명)
    //   sections.6/7 = 평가위원 관심사 (KPI · 실적 톤)
    //   모든 sections.* 에 일괄 주입 — LLM 이 알아서 해당 영역에 반영
    if (pmInputsSection && sin.slot.startsWith('sections.')) {
      augmentedInput = `${augmentedInput}\n\n[PM 입력 외부 reality — LLM 단독으로 모르는 정보. 본문에 적극 반영]\n${pmInputsSection}`
    }
    const prompt = buildTurnPrompt({
      state: { turns: [], currentSlot: sin.slot, validationErrors: [] } as any,
      draft,
      rfp,
      profile: profile ?? undefined,
      matchedAssets: matchedAssets.slice(0, 5),
      pmInput: augmentedInput,
      currentSlot: sin.slot,
      clientContext,
    })
    try {
      const r = await invokeAi({
        prompt,
        maxTokens: AI_TOKENS.STANDARD,
        temperature: 0.4,
        label: `ultimate-${sin.slot}`,
      })
      bump('slot-turn')
      const payload = safeParseJson<any>(r.raw, sin.slot)
      const filtered = filterKnownSlots(payload.extractedSlots ?? {})
      const merged = mergeExtractedSlots(draft, filtered)
      draft = merged.draft
      progress('3/6', `${sin.slot} ✓ ${merged.acceptedSlots.length} 슬롯 채움`)
    } catch (e) {
      console.warn(`[ultimate-draft] ${sin.slot} 실패:`, e instanceof Error ? e.message : e)
    }
  }
  progress('3/9', `완료 ${((Date.now() - t3) / 1000).toFixed(1)}s`)

  // ────────────────────────────────────
  // Step 3.5: sections.7 자동 (Phase I1, 1 LLM)
  // ────────────────────────────────────
  progress('3.5/9', '수행 실적 자동 매핑 (sections.7)...')
  const t35 = Date.now()
  let trackRecordSources: string[] = []
  try {
    const tr = await generateTrackRecord({ rfp, channel, limit: 5 })
    bump('track-record')
    if (tr.sectionText && tr.sectionText.length > 100) {
      draft.sections = { ...(draft.sections ?? {}), '7': tr.sectionText }
      // sectionMeta.7 도 보강
      const meta = (draft.sectionMeta ?? {}) as Record<string, any>
      meta['7'] = {
        ...(meta['7'] ?? {}),
        subtitle: ': 11년 누적 운영 + 유사 사업 검증 실적',
        headline: tr.similarProjects[0]?.sourceProject
          ? `누적 ${tr.similarProjects.length}건 유사 ${channel} 사업 검증 + 11년 운영 인프라`
          : '11년 누적 검증 운영 인프라',
      }
      draft.sectionMeta = meta as ExpressDraft['sectionMeta']
      trackRecordSources = tr.citedSources
    }
  } catch (e) {
    console.warn('[ultimate-draft] track record 실패:', e instanceof Error ? e.message : e)
  }
  progress('3.5/9', `완료 ${((Date.now() - t35) / 1000).toFixed(1)}s · ${trackRecordSources.length} 사업 인용`)

  // ────────────────────────────────────
  // Step 3.6: sections.5 예산 자동 (Phase I2, 1 LLM)
  // ────────────────────────────────────
  progress('3.6/9', '예산 비목 자동 추론 (sections.5)...')
  const t36 = Date.now()
  let budgetBreakdown: Array<{ category: string; amount: number; percentage: number }> = []
  try {
    const bb = await inferBudgetBreakdown({ rfp, channel })
    bump('infer-budget')
    if (bb.sectionText && bb.sectionText.length > 50) {
      draft.sections = { ...(draft.sections ?? {}), '5': bb.sectionText }
      const meta = (draft.sectionMeta ?? {}) as Record<string, any>
      meta['5'] = {
        ...(meta['5'] ?? {}),
        subtitle: ': 4비목 자동 산출 (유사 사업 평균)',
        headline:
          bb.breakdown.length > 0
            ? `${bb.breakdown.map((b) => `${b.category} ${b.percentage}%`).join(' · ')} (유사 ${bb.citedSources.length}건 평균)`
            : '예산 4비목 자동 산출',
      }
      draft.sectionMeta = meta as ExpressDraft['sectionMeta']
      budgetBreakdown = bb.breakdown.map((b) => ({ category: b.category, amount: b.amount, percentage: b.percentage }))
    }
  } catch (e) {
    console.warn('[ultimate-draft] budget infer 실패:', e instanceof Error ? e.message : e)
  }
  progress('3.6/9', `완료 ${((Date.now() - t36) / 1000).toFixed(1)}s · ${budgetBreakdown.length} 비목`)

  // ────────────────────────────────────
  // Step 4: Risks 자동 채움 (1 LLM)
  // ────────────────────────────────────
  progress('4/9', '평가위원 risks 능동 답변...')
  const t4 = Date.now()
  const risks = await produceRisks({
    draft,
    rfp,
    clientContext,
    matchedAssets: matchedAssets.slice(0, 5),
    channel,
  })
  bump('produce-risks')
  draft.risks = risks
  progress('4/9', `완료 ${((Date.now() - t4) / 1000).toFixed(1)}s · ${risks.length} risks`)

  // ────────────────────────────────────
  // Step 5: Coherence Pass (1 LLM)
  // ────────────────────────────────────
  progress('5/9', 'Narrative arc 보강...')
  const t5 = Date.now()
  const coherenceOut = await coherencePass({
    draft,
    projectName: rfp.projectName ?? undefined,
  })
  bump('coherence-pass')
  draft.sections = coherenceOut.updatedSections as ExpressDraft['sections']
  progress('5/9', `완료 ${((Date.now() - t5) / 1000).toFixed(1)}s · ${coherenceOut.result.changes?.length ?? 0} 변경`)

  // ────────────────────────────────────
  // Step 6: Inspector (1 LLM)
  // ────────────────────────────────────
  progress('6/9', 'Inspector 11-lens 검수...')
  const t6 = Date.now()
  let inspection: InspectorReport | null = null
  try {
    inspection = await inspectDraft(draft, { channel })
    bump('inspector')
    if (inspection) {
      draft.meta.inspectionResult = {
        passed: inspection.passed,
        overallScore: inspection.overallScore,
        issues: inspection.issues.map((i) => ({
          severity: i.severity,
          lens: i.lens,
          issue: i.issue,
          suggestion: i.suggestion,
        })),
        nextAction: inspection.nextAction,
      }
    }
  } catch (e) {
    console.warn('[ultimate-draft] inspect 실패:', e instanceof Error ? e.message : e)
  }
  progress('6/9', `완료 ${((Date.now() - t6) / 1000).toFixed(1)}s · score=${inspection?.overallScore ?? '?'}`)

  // 최종 schema validate
  const validated = ExpressDraftSchema.safeParse(draft)
  if (!validated.success) {
    console.warn('[ultimate-draft] 최종 schema 검증 실패:', validated.error.issues[0]?.message)
  }

  const totalElapsedSec = (Date.now() - startT) / 1000

  return {
    draft,
    clientContext,
    matchedAssets,
    externalResearch,
    verificationSummary,
    trackRecordSources,
    budgetBreakdown,
    toneProfile,
    risks,
    coherenceReasoning: coherenceOut.result.reasoning ?? null,
    inspection,
    metrics: {
      totalLlmCalls: llmCalls,
      totalElapsedSec,
      callsBySource,
    },
  }
}

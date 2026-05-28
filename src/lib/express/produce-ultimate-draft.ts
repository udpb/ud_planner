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

export interface UltimateDraftInput {
  rfp: RfpParsed
  profile?: ProgramProfile | null
  channel: 'B2G' | 'B2B' | 'renewal'
  /** 슬롯별 PM 입력 (또는 generic placeholder — AI 자동 보완) */
  slotInputs: Array<{ slot: string; pmInput: string }>
  /** 진행 상황 콜백 (CLI 출력용) */
  onProgress?: (step: string, detail: string) => void
}

export interface UltimateDraftOutput {
  draft: ExpressDraft
  clientContext: ClientContext
  matchedAssets: AssetMatch[]
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
  // Step 3: 슬롯별 turn (N LLM)
  // ────────────────────────────────────
  progress('3/6', `슬롯 ${slotInputs.length}개 자동 채움...`)
  const t3 = Date.now()
  let draft = emptyDraft()

  for (const sin of slotInputs) {
    const prompt = buildTurnPrompt({
      state: { turns: [], currentSlot: sin.slot, validationErrors: [] } as any,
      draft,
      rfp,
      profile: profile ?? undefined,
      matchedAssets: matchedAssets.slice(0, 5),
      pmInput: sin.pmInput,
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
  progress('3/6', `완료 ${((Date.now() - t3) / 1000).toFixed(1)}s`)

  // ────────────────────────────────────
  // Step 4: Risks 자동 채움 (1 LLM)
  // ────────────────────────────────────
  progress('4/6', '평가위원 risks 능동 답변...')
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
  progress('4/6', `완료 ${((Date.now() - t4) / 1000).toFixed(1)}s · ${risks.length} risks`)

  // ────────────────────────────────────
  // Step 5: Coherence Pass (1 LLM)
  // ────────────────────────────────────
  progress('5/6', 'Narrative arc 보강...')
  const t5 = Date.now()
  const coherenceOut = await coherencePass({
    draft,
    projectName: rfp.projectName ?? undefined,
  })
  bump('coherence-pass')
  draft.sections = coherenceOut.updatedSections as ExpressDraft['sections']
  progress('5/6', `완료 ${((Date.now() - t5) / 1000).toFixed(1)}s · ${coherenceOut.result.changes?.length ?? 0} 변경`)

  // ────────────────────────────────────
  // Step 6: Inspector (1 LLM)
  // ────────────────────────────────────
  progress('6/6', 'Inspector 11-lens 검수...')
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
  progress('6/6', `완료 ${((Date.now() - t6) / 1000).toFixed(1)}s · score=${inspection?.overallScore ?? '?'}`)

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

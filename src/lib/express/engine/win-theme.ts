/**
 * win-theme — typed WinTheme + proof chain 강제 (EX-2, Tech Spec §5 G6·§6.2, ADR-019)
 *
 * "증명 못 하면 말하지 마라" — 각 win-theme 는 `proof[]` ≥1 (자산·당선청크·SROI 근거)
 * 가 강제된다. proof 가 비면 그 win-theme 를 **드롭**(hard rule). 전부 드롭되면 경고 로깅.
 * 금지어("최고 수준"·"world-class"·"풍부한 경험" 등) 포함 시 제거(재생성 1회 요청).
 *
 * 모델: `modelFor('engine.wintheme')` — **Pro 승격**(ADR-022 §4-B, EVAL-1 후 3번째 Pro 키).
 *   win-theme 의 discriminator/proof 품질이 differentiation 렌즈에 직결되므로 Pro 로 올렸다.
 *   proof 강제·금지어 차단은 그대로 결정론 품질 게이트 역할(불변).
 *
 * 직접 SDK 금지 — invokeAi. JSON = safeParseJson. retrieve() 로 근거 확보.
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS, modelFor } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import { retrieve } from '@/lib/retrieval'
import { scoringCategoryFor } from '@/lib/workstream/types'
import type { ExpressDraft } from '../schema'
import type { EngineInput, EvidencePool } from './types'
import type { RetrievedChunk } from '@/lib/retrieval/types'

// ─────────────────────────────────────────
// 타입 (schema.prisma WinTheme.proof 주석 형태)
// ─────────────────────────────────────────

/** 근거 1건 — 자산·당선청크·SROI·정량. WinTheme/KeyPoint.proof 의 원소(Json 저장). */
export interface ProofRef {
  kind: 'quant' | 'past_perf' | 'testimonial' | 'institutional'
  assetId?: string
  winningChunkId?: string
  sroi?: number
  /** 근거 텍스트 발췌 (인용 가능 한 줄) */
  text: string
}

/** typed WinTheme (DB persist 직전 형태 — id·projectId 는 라우트가 부여). */
export interface WinThemeDraft {
  discriminator: string
  benefit: string
  quantified?: string
  proof: ProofRef[]
  hotButton?: string
  rank: number
}

// ─────────────────────────────────────────
// 금지어 사전 (가변 — Tech Spec §6.2)
// ─────────────────────────────────────────

/** 카탈로그 톤·근거 없는 과장 표현. 포함 시 해당 win-theme 텍스트에서 제거·재생성 요청. */
export const BANNED_PHRASES: string[] = [
  '최고 수준',
  '최고의',
  '업계 최고',
  'world-class',
  'world class',
  '월드클래스',
  '풍부한 경험',
  '풍부한 노하우',
  '최상의',
  '독보적',
  '국내 최고',
]

/** 텍스트에 금지어가 있으면 매칭 목록 반환(없으면 빈 배열). */
function findBannedPhrases(text: string): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  return BANNED_PHRASES.filter((p) => lower.includes(p.toLowerCase()))
}

// ─────────────────────────────────────────
// proof 매핑 — retrieve() citation → ProofRef
// ─────────────────────────────────────────

/** RetrievedChunk → ProofRef (citation 종류로 kind/id 결정). */
function chunkToProof(c: RetrievedChunk): ProofRef {
  const text = c.text.replace(/\s+/g, ' ').slice(0, 150)
  if (c.citation.assetId) {
    return { kind: 'institutional', assetId: c.citation.assetId, text }
  }
  if (c.citation.docId || c.citation.chunkId) {
    return {
      kind: 'past_perf',
      winningChunkId: c.citation.chunkId ?? c.citation.docId,
      text,
    }
  }
  return { kind: 'past_perf', text }
}

/** win-theme discriminator/benefit 로 근거 검색 → ProofRef[] (최대 maxProof). */
async function gatherProof(
  input: EngineInput,
  query: string,
  maxProof = 3,
): Promise<ProofRef[]> {
  try {
    const chunks = await retrieve(
      { text: query.slice(0, 400), channel: input.channel },
      { topN: maxProof },
    )
    return chunks.map(chunkToProof)
  } catch (e) {
    log.warn('engine.win-theme', 'proof retrieve 실패 → 빈 proof', {
      err: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

// ─────────────────────────────────────────
// 컨텍스트 포매팅
// ─────────────────────────────────────────

function workstreamSummary(input: EngineInput): string {
  if (input.workstreams.length === 0) return '(과업 미정 — 교육 1종)'
  return input.workstreams
    .slice(0, 8)
    .map((ws) => {
      const scoring = ws.scoringCategory || scoringCategoryFor(ws.type) || ''
      return `- ${ws.type}${scoring ? ` (배점: ${scoring})` : ''}`
    })
    .join('\n')
}

function draftSnippet(draft: ExpressDraft): string {
  const sections = draft.sections ?? {}
  return (['2', '3', '6', '7'] as const)
    .map((k) => {
      const t = sections[k]
      return t ? `[§${k}] ${t.slice(0, 300)}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function evidenceSnippet(evidence: EvidencePool): string {
  const pooled: RetrievedChunk[] = []
  for (const arr of evidence.bySection.values()) pooled.push(...arr)
  const seen = new Set<string>()
  const uniq = pooled.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
  return uniq
    .slice(0, 6)
    .map((c, i) => `(${i + 1}) ${c.text.replace(/\s+/g, ' ').slice(0, 200)}`)
    .join('\n')
}

// ─────────────────────────────────────────
// generateWinThemes
// ─────────────────────────────────────────

/** LLM 1차 산출 (proof 매핑 전). */
interface RawWinTheme {
  discriminator?: string
  benefit?: string
  quantified?: string
  hotButton?: string
}

/**
 * typed WinTheme 3~5개 생성 + proof chain 강제.
 *
 * 1) LLM 으로 후보 5개 추론(차별점·편익·정량·hot button).
 * 2) 금지어 포함 후보 제거.
 * 3) 각 후보별 retrieve() 로 proof 확보 — proof 0건이면 **드롭**.
 * 4) rank 부여 후 ≤5 반환. 전부 드롭되면 경고.
 */
export async function generateWinThemes(
  input: EngineInput,
  evidence: EvidencePool,
  draft: ExpressDraft,
): Promise<WinThemeDraft[]> {
  const { rfp } = input
  const prompt = `
당신은 한국 정부·기업 RFP 제안서의 **win-theme(당선 테마)** 전략가입니다.
아래 사업·과업·본문·근거를 보고, 평가위원을 설득할 win-theme 후보 **5개**를 뽑으세요.
각 win-theme = 차별점(discriminator) + 그것이 주는 고객 편익(benefit) + (가능하면) 정량 가치(quantified) + 발주처 hot button 연결(hotButton).

[본 사업]
사업명: ${rfp.projectName ?? '(미상)'} · 발주처: ${rfp.client ?? '(미상)'} · 채널: ${input.channel}
목표: ${(rfp.objectives ?? []).slice(0, 4).join(' / ') || '(미상)'}
평가배점: ${(rfp.evalCriteria ?? []).map((c) => `${c.item}(${c.score})`).join(' · ') || '(미상)'}

[과업 구성]
${workstreamSummary(input)}

[본문 발췌]
${draftSnippet(draft) || '(본문 부족)'}

[검색된 당선 근거·자산]
${evidenceSnippet(evidence) || '(근거 부족 — RFP·과업 기반 추론)'}

[규칙]
1. 정확히 5개. 각 discriminator 는 **이름 붙은 구체적·검증가능한 차별점**(추상 슬로건 금지). 가능하면 본 사업 과업·자산에서 도출되는 named 장치로 명명하세요(예: "4중 지원 체계", "Action Week(실행 주간)", "코치 N명 1:1 매칭", "실습-피드백 루프"). 막연한 "전문성·체계성" 은 차별점이 아닙니다.
2. **ghosting**: benefit 을 쓸 때 통상적인 약한 접근(예: "이론 강의 중심·실행 전환 장치 없는 프로그램")과 **이름 없이 대비**해 왜 본 차별점이 더 나은 결과를 내는지 드러내세요. 단, 회사명·경쟁사 직접 비교는 절대 금지.
3. **금지 표현**: "최고 수준"·"world-class"·"풍부한 경험"·"독보적" 등 근거 없는 과장 절대 금지.
4. quantified 는 [검색된 당선 근거]에 실제 수치가 있을 때만(없으면 생략 — 지어내지 말 것).
5. hotButton 은 발주처가 가장 신경 쓸 평가배점·정책 목표에 연결.

[출력 JSON]
{ "winThemes": [ { "discriminator": "...", "benefit": "...", "quantified": "...(선택)", "hotButton": "...(선택)" }, ... 5개 ] }
JSON 만. 마크다운 펜스·설명·trailing comma 금지.
`.trim()

  let raw: { winThemes?: RawWinTheme[] } | null = null
  try {
    const r = await invokeAi({
      prompt,
      model: modelFor('engine.wintheme'),
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.5,
      label: 'engine.generateWinThemes',
    })
    raw = safeParseJson<{ winThemes?: RawWinTheme[] }>(r.raw, 'engine.generateWinThemes')
  } catch (e) {
    log.warn('engine.win-theme', 'generateWinThemes LLM 실패 → 빈 결과', {
      err: e instanceof Error ? e.message : String(e),
    })
    return []
  }

  const candidates = (raw?.winThemes ?? [])
    .filter((w) => typeof w?.discriminator === 'string' && typeof w?.benefit === 'string')
    .slice(0, 5)

  const accepted: WinThemeDraft[] = []
  let droppedBanned = 0
  let droppedNoProof = 0

  for (const c of candidates) {
    const discriminator = (c.discriminator ?? '').trim().slice(0, 200)
    const benefit = (c.benefit ?? '').trim().slice(0, 300)
    if (discriminator.length < 4 || benefit.length < 4) continue

    // 금지어 차단 — discriminator·benefit·quantified 어디든 포함 시 드롭(재생성 대신 제거)
    const banned = [
      ...findBannedPhrases(discriminator),
      ...findBannedPhrases(benefit),
      ...findBannedPhrases(c.quantified ?? ''),
    ]
    if (banned.length > 0) {
      droppedBanned++
      log.warn('engine.win-theme', 'win-theme 금지어 → 드롭', {
        discriminator: discriminator.slice(0, 40),
        banned,
      })
      continue
    }

    // proof chain 강제 — discriminator+benefit 로 근거 검색, 0건이면 드롭
    const proof = await gatherProof(input, `${discriminator} ${benefit}`)
    if (proof.length === 0) {
      droppedNoProof++
      log.warn('engine.win-theme', 'proof 0건 → win-theme 드롭 ("증명 못 하면 말하지 마라")', {
        discriminator: discriminator.slice(0, 40),
      })
      continue
    }

    accepted.push({
      discriminator,
      benefit,
      quantified: c.quantified?.trim() ? c.quantified.trim().slice(0, 200) : undefined,
      proof,
      hotButton: c.hotButton?.trim() ? c.hotButton.trim().slice(0, 200) : undefined,
      rank: 0, // 아래에서 부여
    })
  }

  // rank 부여 (proof 개수 내림차순 → 정량 보유 우선)
  accepted.sort((a, b) => {
    const pf = b.proof.length - a.proof.length
    if (pf !== 0) return pf
    return (b.quantified ? 1 : 0) - (a.quantified ? 1 : 0)
  })
  const ranked = accepted.slice(0, 5).map((w, i) => ({ ...w, rank: i + 1 }))

  if (ranked.length === 0) {
    log.warn('engine.win-theme', '모든 win-theme 드롭 — proof/금지어 게이트 통과 0건', {
      candidates: candidates.length,
      droppedBanned,
      droppedNoProof,
    })
  } else {
    log.info('engine.win-theme', 'win-theme 생성 완료', {
      accepted: ranked.length,
      droppedBanned,
      droppedNoProof,
      proofCounts: ranked.map((w) => w.proof.length),
    })
  }

  return ranked
}

/**
 * verify — 결정론 faithfulness gate (EX-2, Tech Spec §5 G10·§5.4, 환각 25→12%)
 *
 * 흐름 (claim 多 → Flash, 배치):
 *   1. 각 섹션에서 **사실 주장 추출** (특히 수치·실적·당선 주장) — Flash 1콜(전 섹션 배치).
 *   2. 주장별 `retrieve(claim)` 로 근거 확보 — 병렬.
 *   3. entailment 판정(근거가 주장을 지지하나? yes/no/partial) — Flash 배치(여러 주장 1콜).
 *   4. **미지지 처리(조작 0)**:
 *        - 수치 주장이 근거에 없으면(verdict=no) → 해당 문장 **제거**.
 *        - 일반 주장 미지지면 그대로 두되 인용 부착 안 함(약화).
 *      partial/yes 주장은 retrieve citation 을 draft.evidenceRefs 에 부착.
 *   5. report: {총 주장, 지지/부분/미지지, 제거 건}.
 *
 * 모델: `modelFor('engine.verify')` — Flash(주장 多·RPD 10K). 결정론 임계로 게이트.
 * 직접 SDK 금지 — invokeAi. JSON = safeParseJson. retrieve() 인자.
 *
 * ⚠️ ExpressDraftSchema 구조 불변: 인용은 기존 `evidenceRefs`(ExternalEvidence[]) 에 부착.
 *    수치 미지지 문장만 sections 본문에서 제거(스키마 구조·키 불변, 텍스트만).
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS, modelFor } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import { SECTION_LABELS } from '../schema'
import type { ExpressDraft, SectionKey, ExternalEvidence } from '../schema'
import type { retrieve as RetrieveFn } from '@/lib/retrieval'
import type { RetrievedChunk } from '@/lib/retrieval/types'

const SECTION_KEYS: SectionKey[] = ['1', '2', '3', '4', '5', '6', '7']

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────

type Verdict = 'yes' | 'partial' | 'no'

interface ExtractedClaim {
  /** 섹션 키 */
  section: SectionKey
  /** 주장 원문 문장 (제거 시 본문에서 매칭) */
  sentence: string
  /** 수치/실적 주장인가 (true 면 미지지 시 제거 — 조작 0) */
  isNumeric: boolean
  /** 본문에서 verbatim(공백 정규화) 위치 가능한가 — 미지지 수치 제거 가능 여부 */
  locatable: boolean
}

/** 공백 정규화 (NBSP 포함) — LLM 의 사소한 공백 변형 흡수. */
function normWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** 본문에서 문장이 (공백 정규화 후) 위치 가능한가. 짧은 문장은 전체, 긴 문장은 앞 40자. */
function isLocatable(body: string, sentence: string): boolean {
  if (!body || sentence.length < 8) return false
  const nb = normWs(body)
  const ns = normWs(sentence)
  if (nb.includes(ns)) return true
  return nb.includes(ns.slice(0, Math.min(ns.length, 40)))
}

/** 추출 환각 차단용 — 문장의 수치 토큰 하나라도 본문에 있으면 관련 claim 으로 인정. */
function sharesNumericToken(body: string, sentence: string): boolean {
  if (!body) return false
  const nums = sentence.match(/\d[\d,.]*/g) ?? []
  return nums.some((n) => n.length >= 2 && body.includes(n))
}

interface ClaimVerification extends ExtractedClaim {
  evidence: RetrievedChunk[]
  verdict: Verdict
}

export interface VerifyReport {
  totalClaims: number
  supported: number // yes
  partial: number
  unsupported: number // no
  /** 제거된 수치 미지지 문장 수 */
  removed: number
  /** 인용 부착된(지지·부분) 주장 수 */
  citationsAttached: number
}

// ─────────────────────────────────────────
// 1. claim 추출 (Flash, 전 섹션 1콜 배치)
// ─────────────────────────────────────────

interface RawExtract {
  claims?: { section?: string; sentence?: string; isNumeric?: boolean }[]
}

function sectionsBlock(draft: ExpressDraft): string {
  const sections = draft.sections ?? {}
  return SECTION_KEYS.filter((k) => sections[k])
    .map((k) => `### §${k} ${SECTION_LABELS[k]}\n${sections[k]!.slice(0, 900)}`)
    .join('\n\n')
}

async function extractClaims(draft: ExpressDraft): Promise<ExtractedClaim[]> {
  const block = sectionsBlock(draft)
  if (!block.trim()) return []

  const prompt = `
당신은 제안서 **팩트체크 추출기**입니다. 아래 7섹션 본문에서 **검증 대상 사실 주장**만 뽑으세요.
특히 수치·실적·당선·기관명·연도가 들어간 주장(검증 가능한 fact)을 우선합니다.
의견·전략 서술·일반론은 제외.

[본문]
${block}

[규칙]
- 각 claim 은 본문에 실제로 나온 **문장 그대로**(sentence) 발췌 — 변형 금지(나중에 매칭·제거에 사용).
- section: 그 문장이 속한 섹션 키('1'~'7').
- isNumeric: 수치·금액·비율·건수·연도·실적 수치가 핵심이면 true, 아니면 false.
- 섹션당 최대 4개, 전체 최대 20개.

[출력 JSON]
{ "claims": [ { "section": "6", "sentence": "...", "isNumeric": true }, ... ] }
JSON 만. 마크다운 펜스·설명·trailing comma 금지.
`.trim()

  try {
    const r = await invokeAi({
      prompt,
      model: modelFor('engine.verify'),
      maxTokens: AI_TOKENS.STANDARD,
      temperature: 0.1,
      label: 'engine.verify.extractClaims',
    })
    const raw = safeParseJson<RawExtract>(r.raw, 'engine.verify.extractClaims')
    const sections = draft.sections ?? {}
    return (raw?.claims ?? [])
      .filter(
        (c) =>
          typeof c?.section === 'string' &&
          (SECTION_KEYS as string[]).includes(c.section) &&
          typeof c?.sentence === 'string' &&
          c.sentence.trim().length >= 8,
      )
      .slice(0, 20)
      .map((c) => {
        const sentence = c.sentence!.trim()
        const sectionKey = c.section as SectionKey
        const body = sections[sectionKey] ?? ''
        return {
          section: sectionKey,
          sentence,
          isNumeric: c.isNumeric === true,
          // 본문에서 verbatim 위치 가능한가 (가능해야만 수치 미지지 시 제거 — 조작 0).
          // whitespace 정규화 후 prefix 매칭(LLM 의 사소한 공백 변형 흡수).
          locatable: isLocatable(body, sentence),
        }
      })
      // 본문과 무관한(추출 환각) claim 만 제외 — locatable 이거나, 핵심 토큰이 본문에 있으면 통과.
      .filter((c) => c.locatable || sharesNumericToken(sections[c.section] ?? '', c.sentence))
  } catch (e) {
    log.warn('engine.verify', 'extractClaims 실패 → 빈 claim', {
      err: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

// ─────────────────────────────────────────
// 2. 주장별 근거 검색 (병렬)
// ─────────────────────────────────────────

async function retrieveForClaims(
  claims: ExtractedClaim[],
  retrieve: typeof RetrieveFn,
  channel: string,
): Promise<Map<number, RetrievedChunk[]>> {
  const out = new Map<number, RetrievedChunk[]>()
  await Promise.all(
    claims.map(async (c, i) => {
      try {
        const chunks = await retrieve(
          { text: c.sentence.slice(0, 300), channel },
          { topN: 3 },
        )
        out.set(i, chunks)
      } catch (e) {
        log.warn('engine.verify', `claim ${i} retrieve 실패 → 빈 근거`, {
          err: e instanceof Error ? e.message : String(e),
        })
        out.set(i, [])
      }
    }),
  )
  return out
}

// ─────────────────────────────────────────
// 3. entailment 판정 (Flash 배치 — 여러 주장 1콜)
// ─────────────────────────────────────────

interface RawEntail {
  verdicts?: { index?: number; verdict?: string }[]
}

function normVerdict(v: unknown): Verdict {
  return v === 'yes' || v === 'partial' || v === 'no' ? v : 'no'
}

/** Flash thinking 모델이 출력 예산을 thinking 과 나눠 긴 배열이 잘림 → 청크당 ≤8 주장. */
const ENTAIL_CHUNK = 8

async function judgeChunk(
  chunk: { index: number; sentence: string; evidence: string }[],
  result: Map<number, Verdict>,
): Promise<void> {
  const block = chunk
    .map((t) => `[#${t.index}]\n주장: ${t.sentence}\n근거:\n${t.evidence}`)
    .join('\n\n')

  const prompt = `
당신은 엄격한 **사실 검증관**입니다. 각 주장에 대해, 첨부된 근거가 그 주장을 지지하는지 판정하세요.
관대하지 말 것 — 근거에 직접 뒷받침이 없으면 'no'. 특히 **수치는 근거에 동일·근접 수치가 있어야 'yes'**.

[판정값]
- yes     = 근거가 주장(수치 포함)을 직접 지지
- partial = 주제는 맞으나 핵심(특히 수치)이 근거에 없음
- no      = 근거가 주장을 지지하지 않음 / 무관

${block}

[출력 JSON — 위 주장 전부, 다른 텍스트 절대 금지]
{ "verdicts": [ { "index": 0, "verdict": "yes" } ] }
JSON 만. 마크다운 펜스·설명·trailing comma 금지.
`.trim()

  try {
    const r = await invokeAi({
      prompt,
      model: modelFor('engine.verify'),
      maxTokens: AI_TOKENS.STANDARD, // thinking 모델 — 출력 잘림 방지(LIGHT 는 부족)
      temperature: 0.1,
      label: 'engine.verify.entailment',
    })
    const raw = safeParseJson<RawEntail>(r.raw, 'engine.verify.entailment')
    for (const v of raw?.verdicts ?? []) {
      if (typeof v?.index === 'number' && result.has(v.index) === false) {
        result.set(v.index, normVerdict(v.verdict))
      }
    }
  } catch (e) {
    log.warn('engine.verify', 'entailment 청크 실패 → 해당 청크 partial', {
      err: e instanceof Error ? e.message : String(e),
    })
  }
  // 청크 내 응답 누락분은 보수적으로 'partial' (제거 안 하되 인용도 안 붙임)
  for (const t of chunk) {
    if (!result.has(t.index)) result.set(t.index, 'partial')
  }
}

async function entailmentBatch(
  claims: ExtractedClaim[],
  evidenceByIdx: Map<number, RetrievedChunk[]>,
): Promise<Map<number, Verdict>> {
  const result = new Map<number, Verdict>()
  if (claims.length === 0) return result

  // 근거가 아예 없는 주장은 LLM 콜 없이 즉시 'no' (결정론 — 근거 없으면 미지지)
  const toJudge: { index: number; sentence: string; evidence: string }[] = []
  claims.forEach((c, i) => {
    const ev = evidenceByIdx.get(i) ?? []
    if (ev.length === 0) {
      result.set(i, 'no')
      return
    }
    toJudge.push({
      index: i,
      sentence: c.sentence,
      evidence: ev.map((e, j) => `(${j + 1}) ${e.text.replace(/\s+/g, ' ').slice(0, 220)}`).join('\n'),
    })
  })

  if (toJudge.length === 0) return result

  // 청크별 순차(429 회피) — 각 청크 ≤8 주장으로 출력 잘림 방지
  for (let i = 0; i < toJudge.length; i += ENTAIL_CHUNK) {
    await judgeChunk(toJudge.slice(i, i + ENTAIL_CHUNK), result)
  }
  return result
}

// ─────────────────────────────────────────
// 4. verifyDraft — 조립
// ─────────────────────────────────────────

/** RetrievedChunk → ExternalEvidence(인용). evidenceRefs 부착용. */
function chunkToEvidence(c: RetrievedChunk): ExternalEvidence {
  const src =
    c.citation.assetId
      ? `asset:${c.citation.assetId}`
      : c.citation.docId
        ? `당선:${c.citation.docId}${c.citation.chunkId ? `#${c.citation.chunkId}` : ''}`
        : 'retrieved'
  return {
    topic: c.text.replace(/\s+/g, ' ').slice(0, 40) || '근거',
    source: src.slice(0, 200),
    summary: c.text.replace(/\s+/g, ' ').slice(0, 380),
    fetchedVia: 'auto-extract',
    capturedAt: new Date().toISOString(),
  }
}

/** 본문에서 문장 제거 — verbatim 우선, 없으면 공백 정규화 매칭. 못 찾으면 null(미변경). */
function removeSentence(body: string | undefined, sentence: string): string | null {
  if (!body) return null
  if (body.includes(sentence)) {
    return body.replace(sentence, '').replace(/\s{2,}/g, ' ').trim()
  }
  // 공백 정규화 후 매칭 — 원본 인덱스 복원이 어려우므로 정규화본을 반환(본문 텍스트만 변경).
  const nb = normWs(body)
  const ns = normWs(sentence)
  if (nb.includes(ns)) {
    return nb.replace(ns, '').replace(/\s{2,}/g, ' ').trim()
  }
  return null
}

/**
 * faithfulness gate. 검증된 draft + report 반환.
 * 수치 미지지 문장은 본문에서 제거(조작 0). 지지·부분 주장은 인용을 evidenceRefs 에 부착.
 */
export async function verifyDraft(
  draft: ExpressDraft,
  retrieve: typeof RetrieveFn,
  channel = 'B2G',
): Promise<{ draft: ExpressDraft; report: VerifyReport }> {
  const claims = await extractClaims(draft)
  const emptyReport: VerifyReport = {
    totalClaims: claims.length,
    supported: 0,
    partial: 0,
    unsupported: 0,
    removed: 0,
    citationsAttached: 0,
  }
  if (claims.length === 0) {
    return { draft, report: emptyReport }
  }

  const evidenceByIdx = await retrieveForClaims(claims, retrieve, channel)
  const verdicts = await entailmentBatch(claims, evidenceByIdx)

  const verified: ClaimVerification[] = claims.map((c, i) => ({
    ...c,
    evidence: evidenceByIdx.get(i) ?? [],
    verdict: verdicts.get(i) ?? 'no',
  }))

  // draft 복제 (sections 텍스트만 수정 — 구조·키 불변)
  const sections: Record<string, string> = { ...(draft.sections as Record<string, string>) }
  const newEvidence: ExternalEvidence[] = [...(draft.evidenceRefs ?? [])]

  const report: VerifyReport = { ...emptyReport }

  for (const v of verified) {
    if (v.verdict === 'yes') report.supported++
    else if (v.verdict === 'partial') report.partial++
    else report.unsupported++

    // 수치 주장 + 미지지(no) + 근거를 실제로 검색했는데 지지 안 됨 + verbatim 위치 가능
    // → 본문에서 문장 제거 (조작 0, A3).
    //   ⚠️ 근거 0건(검색 결과 없음)은 "조작"이 아니라 "검증 불가"이므로 제거하지 않는다
    //      (RET-1 로컬 코퍼스 얕음 — 근거 없음으로 합법 수치까지 깎으면 evidence 밀도 손실).
    //      코퍼스가 채워지면 근거 대비 모순 판정이 늘어 제거가 자연히 활성화됨.
    //   locatable 가 아니면(패러프레이즈) 제거하지 않음 — 엉뚱한 텍스트 훼손 방지.
    if (v.verdict === 'no' && v.isNumeric && v.locatable && v.evidence.length > 0) {
      const body = sections[v.section]
      const removed = removeSentence(body, v.sentence)
      if (removed !== null) {
        sections[v.section] = removed
        report.removed++
        log.warn('engine.verify', '수치 미지지 주장 제거 (조작 0)', {
          section: v.section,
          sentence: v.sentence.slice(0, 80),
        })
      }
    }

    // 지지·부분 주장 → 인용 부착 (evidenceRefs, 최대 1건/주장, 중복 회피)
    if ((v.verdict === 'yes' || v.verdict === 'partial') && v.evidence.length > 0) {
      const ev = chunkToEvidence(v.evidence[0])
      if (newEvidence.length < 15 && !newEvidence.some((e) => e.source === ev.source)) {
        newEvidence.push(ev)
        report.citationsAttached++
      }
    }
  }

  const outDraft: ExpressDraft = {
    ...draft,
    sections: sections as ExpressDraft['sections'],
    evidenceRefs: newEvidence.slice(0, 15),
    meta: { ...draft.meta, lastUpdatedAt: new Date().toISOString() },
  }

  log.info('engine.verify', 'faithfulness gate 완료', {
    totalClaims: report.totalClaims,
    supported: report.supported,
    partial: report.partial,
    unsupported: report.unsupported,
    removed: report.removed,
    citationsAttached: report.citationsAttached,
  })

  return { draft: outDraft, report }
}

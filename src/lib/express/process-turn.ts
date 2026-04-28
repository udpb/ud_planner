/**
 * processTurn — Express 챗봇 1턴 처리 오케스트레이터
 * (Phase L Wave L2, ADR-011)
 *
 *  PM 입력 → invokeAi → safeParseJson → mergeExtractedSlots → 다음 슬롯 결정
 *
 * server-only — invokeAi · prisma 호출 포함.
 *
 * 관련 문서: docs/architecture/express-mode.md §2.1 / §4.3
 */

import 'server-only'

import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJsonExternal, JsonParseError, type RfpParsed } from '@/lib/claude'
import type { ProgramProfile } from '@/lib/program-profile'
import type { AssetMatch } from '@/lib/asset-registry'

import { buildTurnPrompt, buildFirstTurnPrompt } from './prompts'
import { TurnResponseSchema, type TurnResponse, type ConversationState, type Turn, newTurnId } from './conversation'
import { mergeExtractedSlots, filterKnownSlots } from './extractor'
import { selectNextSlot } from './slot-priority'
import type { ExpressDraft } from './schema'

// ─────────────────────────────────────────
// 1. 입출력 타입
// ─────────────────────────────────────────

export interface ProcessTurnInput {
  state: ConversationState
  draft: ExpressDraft
  rfp?: RfpParsed
  profile?: ProgramProfile
  matchedAssets?: AssetMatch[]
  pmInput: string
  /** 현재 슬롯 강제 (없으면 selectNextSlot 결과) */
  forceSlot?: string | null
  /** 첫 턴 (RFP 업로드 직후) 모드 */
  firstTurn?: boolean
}

export interface ProcessTurnResult {
  ok: boolean
  draft: ExpressDraft
  state: ConversationState
  aiTurn: Turn
  pmTurn?: Turn
  nextSlot: string | null
  validationErrors: { slotKey: string; zodIssue: string; remediation?: string }[]
  externalLookupNeeded: TurnResponse['externalLookupNeeded']
  /** AI 가 막혀서 placeholder 답을 보냈을 때 */
  fellbackToPlaceholder: boolean
  aiProvider?: 'gemini' | 'claude'
  aiModel?: string
}

// ─────────────────────────────────────────
// 2. 메인 함수
// ─────────────────────────────────────────

export async function processTurn(input: ProcessTurnInput): Promise<ProcessTurnResult> {
  const currentSlot = input.forceSlot !== undefined
    ? input.forceSlot
    : selectNextSlot(input.draft, input.rfp)

  const prompt = input.firstTurn && input.rfp
    ? buildFirstTurnPrompt({
        rfp: input.rfp,
        profile: input.profile,
        matchedAssets: input.matchedAssets,
      })
    : buildTurnPrompt({
        state: input.state,
        draft: input.draft,
        rfp: input.rfp,
        profile: input.profile,
        matchedAssets: input.matchedAssets,
        pmInput: input.pmInput,
        currentSlot,
      })

  const pmTurn: Turn | undefined = input.pmInput
    ? {
        id: newTurnId(),
        role: 'pm',
        text: input.pmInput,
        createdAt: new Date().toISOString(),
      }
    : undefined

  // 1차 호출
  let aiResp: { raw: string; provider: 'gemini' | 'claude'; model: string }
  try {
    const r = await invokeAi({
      prompt,
      maxTokens: 8192,
      temperature: 0.5,
      label: input.firstTurn ? 'express-first-turn' : 'express-turn',
    })
    aiResp = { raw: r.raw, provider: r.provider, model: r.model }
  } catch (err: unknown) {
    // AI 호출 자체 실패 → fallback message
    const errMsg = err instanceof Error ? err.message : String(err)
    const aiTurn: Turn = {
      id: newTurnId(),
      role: 'ai',
      text:
        '죄송해요, AI 호출에 실패했어요. 잠시 후 다시 시도해 주세요.\n' +
        `(에러: ${errMsg.slice(0, 100)})`,
      targetSlot: currentSlot ?? undefined,
      createdAt: new Date().toISOString(),
    }
    return {
      ok: false,
      draft: input.draft,
      state: appendTurns(input.state, pmTurn, aiTurn, true),
      aiTurn,
      pmTurn,
      nextSlot: currentSlot,
      validationErrors: [],
      externalLookupNeeded: null,
      fellbackToPlaceholder: true,
    }
  }

  // JSON 파싱 — 1회 재시도 포함
  let parsed: TurnResponse
  try {
    const raw = safeParseJsonExternal<unknown>(aiResp.raw, 'express-turn')
    const validated = TurnResponseSchema.safeParse(raw)
    if (!validated.success) {
      // 1차 검증 실패 — 부분 채움 시도
      console.warn('[express-turn] zod 검증 실패 — 부분 채움 시도:', validated.error.message)
      parsed = coerceToTurnResponse(raw)
    } else {
      parsed = validated.data
    }
  } catch (err: unknown) {
    if (err instanceof JsonParseError) {
      // 다른 모델로 1회 재시도
      try {
        const r2 = await invokeAi({
          prompt: prompt + '\n\n[중요] 이전 응답이 JSON 파싱 실패. JSON 만 출력하세요.',
          maxTokens: 8192,
          temperature: 0.3,
          label: 'express-turn-retry',
          preferredProvider: aiResp.provider === 'gemini' ? 'claude' : 'gemini',
        })
        const raw2 = safeParseJsonExternal<unknown>(r2.raw, 'express-turn-retry')
        const validated2 = TurnResponseSchema.safeParse(raw2)
        parsed = validated2.success ? validated2.data : coerceToTurnResponse(raw2)
        aiResp = { raw: r2.raw, provider: r2.provider, model: r2.model }
      } catch (err2: unknown) {
        const aiTurn: Turn = {
          id: newTurnId(),
          role: 'ai',
          text:
            '응답 파싱이 두 번 모두 실패했어요. PM 의 답을 좀 더 짧게 또는 한 슬롯만 다뤄 주세요.',
          targetSlot: currentSlot ?? undefined,
          createdAt: new Date().toISOString(),
        }
        return {
          ok: false,
          draft: input.draft,
          state: appendTurns(input.state, pmTurn, aiTurn, true),
          aiTurn,
          pmTurn,
          nextSlot: currentSlot,
          validationErrors: [],
          externalLookupNeeded: null,
          fellbackToPlaceholder: true,
        }
      }
    } else {
      throw err
    }
  }

  // ─────────────────────────────────────────
  // Markdown fallback — AI 가 nextQuestion 에 sections 본문을 토해낸 경우
  // 자동으로 sections.* 슬롯에 매핑 (사용자 피드백 4번 대응, 2026-04-28)
  // ─────────────────────────────────────────
  const mdSections = extractMarkdownSections(parsed.nextQuestion)
  if (Object.keys(mdSections).length > 0) {
    console.warn(
      `[express-turn] AI 가 markdown 으로 ${Object.keys(mdSections).length}개 섹션 출력 → 자동 매핑`,
    )
    for (const [k, v] of Object.entries(mdSections)) {
      const slotKey = `sections.${k}`
      if (!(parsed.extractedSlots as Record<string, unknown>)[slotKey]) {
        ;(parsed.extractedSlots as Record<string, unknown>)[slotKey] = v
      }
    }
    // nextQuestion 자체는 짧게 자르고 다음 단계 안내
    parsed.nextQuestion =
      '1차본 초안이 자동으로 채워졌어요. 우측 미리보기에서 확인하시고 보완할 섹션을 말씀해 주세요.'
    if (!parsed.quickReplies || parsed.quickReplies.length === 0) {
      parsed.quickReplies = [
        '② 추진 전략 보강',
        '③ 커리큘럼 보강',
        '⑥ 기대 성과·KPI 보강',
        '차별화 자산 더 추가',
      ]
    }
  }

  // 외부 LLM 카드 운영 로그 (Phase L L3)
  if (parsed.externalLookupNeeded) {
    const c = parsed.externalLookupNeeded
    console.log(
      `[express-turn] 🔔 ${c.type} card → "${c.topic}"` +
        (c.type === 'external-llm' ? ` (prompt ${c.generatedPrompt?.length ?? 0}b)` : '') +
        (c.type === 'pm-direct' ? ` (checklist ${c.checklistItems?.length ?? 0})` : ''),
    )
  } else if (input.state.turns.length >= 4 && input.state.turns.length % 4 === 0) {
    // PM 이 4턴 이상 진행 중인데 외부 카드 한 번도 없으면 prompts 튜닝 신호
    const hasExternalEver = input.state.turns.some((t) => !!t.externalLookupNeeded)
    if (!hasExternalEver) {
      console.warn(
        `[express-turn] ⚠️ ${input.state.turns.length}턴 진행 중 외부 카드 0건 — prompts 튜닝 검토 신호`,
      )
    }
  }

  // 슬롯 머지
  const filteredExtracted = filterKnownSlots(parsed.extractedSlots ?? {})
  const merge = mergeExtractedSlots(input.draft, filteredExtracted)

  const aiTurn: Turn = {
    id: newTurnId(),
    role: 'ai',
    text: parsed.nextQuestion || '(추가 질문 없음 — 다음 슬롯으로 넘어가요)',
    extractedSlots: filteredExtracted,
    externalLookupNeeded: parsed.externalLookupNeeded ?? undefined,
    quickReplies: parsed.quickReplies && parsed.quickReplies.length > 0 ? parsed.quickReplies : undefined,
    targetSlot: parsed.recommendedNextSlot ?? currentSlot ?? undefined,
    aiModel: aiResp.model,
    createdAt: new Date().toISOString(),
  }

  // 다음 슬롯 결정
  const recommended = parsed.recommendedNextSlot ?? null
  const nextSlot = recommended && typeof recommended === 'string'
    ? recommended
    : selectNextSlot(merge.draft, input.rfp)

  // ConversationState 갱신
  const newState: ConversationState = {
    ...input.state,
    turns: [...input.state.turns],
    currentSlot: nextSlot,
    pendingExternalLookup: parsed.externalLookupNeeded ?? undefined,
    validationErrors: [
      ...input.state.validationErrors,
      ...merge.validationErrors,
      ...(parsed.validationErrors ?? []).map((v) => ({
        slotKey: v.slotKey,
        zodIssue: v.issue,
        remediation: v.remediation,
      })),
    ].slice(-10), // 최근 10개만 유지
  }
  if (pmTurn) newState.turns.push(pmTurn)
  newState.turns.push(aiTurn)

  return {
    ok: true,
    draft: merge.draft,
    state: newState,
    aiTurn,
    pmTurn,
    nextSlot,
    validationErrors: [
      ...merge.validationErrors,
      ...(parsed.validationErrors ?? []).map((v) => ({
        slotKey: v.slotKey,
        zodIssue: v.issue,
        remediation: v.remediation,
      })),
    ],
    externalLookupNeeded: parsed.externalLookupNeeded ?? null,
    fellbackToPlaceholder: false,
    aiProvider: aiResp.provider,
    aiModel: aiResp.model,
  }
}

// ─────────────────────────────────────────
// 3. 헬퍼
// ─────────────────────────────────────────

function appendTurns(
  state: ConversationState,
  pmTurn: Turn | undefined,
  aiTurn: Turn,
  fallback: boolean,
): ConversationState {
  const turns = [...state.turns]
  if (pmTurn) turns.push(pmTurn)
  turns.push(aiTurn)
  return {
    ...state,
    turns,
    fallbackCount: state.fallbackCount + (fallback ? 1 : 0),
  }
}

/**
 * AI 응답이 zod 검증 실패해도 부분 채움 시도.
 */
function coerceToTurnResponse(raw: unknown): TurnResponse {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    extractedSlots: (obj.extractedSlots && typeof obj.extractedSlots === 'object'
      ? (obj.extractedSlots as Record<string, unknown>)
      : {}),
    nextQuestion: typeof obj.nextQuestion === 'string' ? obj.nextQuestion : '',
    quickReplies: Array.isArray(obj.quickReplies)
      ? (obj.quickReplies as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    externalLookupNeeded:
      obj.externalLookupNeeded && typeof obj.externalLookupNeeded === 'object'
        ? (obj.externalLookupNeeded as TurnResponse['externalLookupNeeded'])
        : null,
    validationErrors: Array.isArray(obj.validationErrors)
      ? (obj.validationErrors as { slotKey: string; issue: string; remediation?: string }[])
      : [],
    recommendedNextSlot:
      typeof obj.recommendedNextSlot === 'string' ? obj.recommendedNextSlot : null,
  }
}

// ─────────────────────────────────────────
// Markdown 섹션 추출 휴리스틱
// AI 가 마크다운으로 1차본 7 섹션을 토해낸 경우 sections.{1..7} 로 자동 매핑.
// 패턴 인식:
//   - "### I. 제안 배경"  /  "### 1. 제안 배경"  /  "## 1. 제안 배경"
//   - "[1장. 제안 배경]"  /  "**[1장. 제안 배경]**"
//   - "### IV. 사업 관리"  →  로마 숫자도 처리
// ─────────────────────────────────────────

const ROMAN_TO_NUM: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
}

function extractMarkdownSections(text: string): Record<string, string> {
  if (!text) return {}
  // 너무 짧으면 정상 nextQuestion — 추출 안 함
  if (text.length < 400) return {}

  // 섹션 헤더 패턴: 줄 시작에 `###` 또는 `##` 또는 `**[N장`
  // 캡처: 그룹1=숫자(아라비아) 또는 그룹2=로마, 그룹3=섹션 제목, 그룹4=본문 (다음 헤더 전까지)
  // 단순화: 헤더 위치만 먼저 뽑고 사이 텍스트로 본문 만들기
  const headerRegex =
    /^(?:#{2,4}\s+|\*?\*?\[)\s*(?:([1-7])|(I{1,3}|IV|V|VI{0,2}|VII))[\.\장]?\s*([^\n\]]*?)(?:\]?\*?\*?)\s*$/gm

  const headers: { idx: number; secNo: number; titleHint: string }[] = []
  let m: RegExpExecArray | null
  while ((m = headerRegex.exec(text))) {
    let secNo: number | null = null
    if (m[1]) secNo = Number(m[1])
    else if (m[2]) secNo = ROMAN_TO_NUM[m[2]] ?? null
    if (!secNo || secNo < 1 || secNo > 7) continue
    headers.push({ idx: m.index, secNo, titleHint: (m[3] ?? '').trim() })
  }

  if (headers.length === 0) return {}

  const out: Record<string, string> = {}
  for (let i = 0; i < headers.length; i += 1) {
    const h = headers[i]
    const start = h.idx
    const end = i + 1 < headers.length ? headers[i + 1].idx : text.length
    const body = text.slice(start, end).trim()
    // 너무 짧은 본문은 skip (헤더만 있고 내용 없음)
    if (body.length < 80) continue
    // 1500자 캡
    out[String(h.secNo)] = body.slice(0, 1500)
  }
  return out
}

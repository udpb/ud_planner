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

  // 슬롯 머지
  const filteredExtracted = filterKnownSlots(parsed.extractedSlots ?? {})
  const merge = mergeExtractedSlots(input.draft, filteredExtracted)

  const aiTurn: Turn = {
    id: newTurnId(),
    role: 'ai',
    text: parsed.nextQuestion || '(추가 질문 없음 — 다음 슬롯으로 넘어가요)',
    extractedSlots: filteredExtracted,
    externalLookupNeeded: parsed.externalLookupNeeded ?? undefined,
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

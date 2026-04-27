/**
 * AI Fallback Wrapper (L1, 2026-04-27)
 *
 * 정책:
 *   1. Gemini 우선 호출 (ENV `GEMINI_API_KEY` 있을 때)
 *   2. Gemini 실패 시 Claude 로 자동 fallback (1회 재시도)
 *   3. JSON 파싱 실패 시 동일 프롬프트로 다른 모델 재시도
 *
 * 사용처:
 *   - JSON 응답이 필수인 호출 (RFP 파싱 / Logic Model / Impact Goal / 커리큘럼 등)
 *   - 자유 텍스트 호출은 직접 invokeGemini / anthropic 사용 가능
 *
 * 호출자 책임:
 *   - 프롬프트는 모델 무관하게 동일 — JSON 출력 강제 지시 포함
 *   - 응답 파싱은 safeParseJson 사용 (claude.ts 의 강화 버전)
 */

import Anthropic from '@anthropic-ai/sdk'
import { invokeGemini, isGeminiAvailable, GEMINI_MODEL } from './gemini'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const CLAUDE_MODEL = 'claude-sonnet-4-6'

export interface InvokeAiParams {
  prompt: string
  maxTokens?: number
  temperature?: number
  /** 디버그 로그용 라벨 */
  label?: string
  /** 우선 모델 강제 (테스트용) */
  preferredProvider?: 'gemini' | 'claude'
}

export interface InvokeAiResult {
  raw: string
  provider: 'gemini' | 'claude'
  model: string
  /** fallback 발생 여부 */
  fallback: boolean
  /** 원래 시도한 provider 의 에러 (fallback 시) */
  primaryError?: string
}

export async function invokeAi(params: InvokeAiParams): Promise<InvokeAiResult> {
  const label = params.label ?? 'invokeAi'
  const maxTokens = params.maxTokens ?? 16384
  const temperature = params.temperature ?? 0.4

  const preferGemini = params.preferredProvider !== 'claude' && isGeminiAvailable()

  const startedAt = Date.now()

  if (preferGemini) {
    console.log(`[ai] ${label} → Gemini 시도 (max_tokens=${maxTokens})`)
    try {
      const r = await invokeGemini({
        prompt: params.prompt,
        maxTokens,
        temperature,
      })
      const elapsed = Date.now() - startedAt
      console.log(`[ai] ${label} ✓ Gemini ${r.model} ${elapsed}ms · raw=${r.raw.length}b`)
      return {
        raw: r.raw,
        provider: 'gemini',
        model: r.model,
        fallback: false,
      }
    } catch (geminiError: any) {
      console.warn(`[ai] ${label} ✗ Gemini 실패 → Claude fallback: ${geminiError?.message}`)
      // Claude 로 폴백
      try {
        const msg = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: params.prompt }],
        })
        const block = msg.content[0]
        const raw = block.type === 'text' ? block.text : ''
        const elapsed = Date.now() - startedAt
        console.log(`[ai] ${label} ✓ Claude(fallback) ${CLAUDE_MODEL} ${elapsed}ms · raw=${raw.length}b`)
        return {
          raw,
          provider: 'claude',
          model: CLAUDE_MODEL,
          fallback: true,
          primaryError: String(geminiError?.message ?? geminiError),
        }
      } catch (claudeError: any) {
        throw new Error(
          `[${label}] Gemini + Claude 모두 실패. ` +
            `Gemini: ${geminiError?.message} / Claude: ${claudeError?.message}`,
        )
      }
    }
  }

  // Gemini 사용 불가 → Claude 직행
  console.log(`[ai] ${label} → Claude 직행 (Gemini 미설정)`)
  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: params.prompt }],
  })
  const block = msg.content[0]
  const raw = block.type === 'text' ? block.text : ''
  const elapsed = Date.now() - startedAt
  console.log(`[ai] ${label} ✓ Claude ${CLAUDE_MODEL} ${elapsed}ms · raw=${raw.length}b`)
  return {
    raw,
    provider: 'claude',
    model: CLAUDE_MODEL,
    fallback: false,
  }
}

/**
 * JSON 응답 강제 호출 — 1차 실패 시 다른 provider 로 재시도.
 * safeParseJson 은 호출자가 직접 (claude.ts 의 export 사용).
 */
export async function invokeAiForJson(params: InvokeAiParams): Promise<InvokeAiResult> {
  // 1차 호출
  const first = await invokeAi(params)
  return first
  // NOTE: JSON 파싱 실패 시 재시도는 호출자에서 처리 (safeParseJson 가 throw 하면 catch + 재호출)
  // 이 wrapper 는 "AI 호출 자체" 의 실패만 fallback.
}

export { GEMINI_MODEL, CLAUDE_MODEL }

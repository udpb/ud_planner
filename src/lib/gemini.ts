/**
 * Gemini 통합 모듈 (L1, 2026-04-27 · @google/genai 마이그레이션 ADR-023, 2026-06-01)
 *
 * 역할:
 *   - Google Gen AI SDK(`@google/genai`, GA) 래핑 — 구 `@google/generative-ai`(EOL) 대체
 *   - 기본 모델: gemini-3.1-pro-preview (사용자 지정, ENV `GEMINI_MODEL` 로 override)
 *   - `invokeAi`(ai-fallback) 가 이 모듈을 단일 진입점으로 사용. 2-tier 라우팅은
 *     `params.model` override 로 Flash 호출(ADR-022).
 *
 * ENV:
 *   GEMINI_API_KEY  필수 — 미설정 시 모듈 사용 시 throw
 *   GEMINI_MODEL    선택 — 기본 'gemini-3.1-pro-preview'
 *
 * thinking 모델 주의:
 *   Gemini 3.x 는 thinking 모델 — 출력 예산을 thinking 과 나눈다. maxOutputTokens 를
 *   충분히 주지 않으면 빈 응답이 나온다(thinking 만 하고 답을 못 냄). usageMetadata 의
 *   thoughtsTokenCount 를 로깅해 모니터링.
 */

import { GoogleGenAI } from '@google/genai'
import { AI_TOKENS } from './ai/config'
import { log } from './logger'

/**
 * 기본 모델 (2026-04-27).
 * 사용자 의도 = "Gemini 3.1 Pro" → 실제 API 모델명은 `gemini-3.1-pro-preview`.
 *
 * ENV `GEMINI_MODEL` 로 override 가능. 후보:
 *   - `gemini-3.1-pro-preview` (default, 최신 preview)
 *   - `gemini-pro-latest`      (Google 자동 최신 매핑, 안정+최신)
 *   - `gemini-2.5-pro`         (preview 아닌 production)
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-pro-preview'

let _client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (_client) return _client
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('[gemini] GEMINI_API_KEY 환경변수 미설정. .env 에 추가하세요.')
  }
  _client = new GoogleGenAI({ apiKey })
  return _client
}

/**
 * Gemini 단일 호출 — 텍스트 입력 → 텍스트 출력.
 */
export interface GeminiInvokeParams {
  prompt: string
  /** 최대 출력 토큰 (기본 AI_TOKENS.LARGE) */
  maxTokens?: number
  /** 온도 (기본 0.4) */
  temperature?: number
  /** 모델명 override (2-tier·Flash 라우팅) */
  model?: string
}

export interface GeminiInvokeResult {
  raw: string
  /** 사용 토큰 (정확치 X, usageMetadata 기반) */
  inputTokens?: number
  outputTokens?: number
  model: string
}

export async function invokeGemini(params: GeminiInvokeParams): Promise<GeminiInvokeResult> {
  const modelName = params.model ?? GEMINI_MODEL
  const ai = getClient()

  const res = await ai.models.generateContent({
    model: modelName,
    contents: params.prompt,
    config: {
      // thinking 모델 — 충분한 출력 예산으로 빈 응답 방지
      maxOutputTokens: params.maxTokens ?? AI_TOKENS.LARGE,
      temperature: params.temperature ?? 0.4,
    },
  })

  const text = res.text ?? ''
  const usage = res.usageMetadata

  // thinking 모델 모니터링 — thoughtsTokenCount 가 출력 예산을 잠식하면 빈 응답 위험
  if (usage?.thoughtsTokenCount) {
    log.debug('ai', 'Gemini thinking 토큰', {
      model: modelName,
      thoughts: usage.thoughtsTokenCount,
      output: usage.candidatesTokenCount,
    })
  }

  return {
    raw: text,
    inputTokens: usage?.promptTokenCount,
    outputTokens: usage?.candidatesTokenCount,
    model: modelName,
  }
}

/**
 * Gemini 가 사용 가능한지 (ENV 체크).
 */
export function isGeminiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

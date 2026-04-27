/**
 * Gemini 통합 모듈 (L1, 2026-04-27)
 *
 * 역할:
 *   - Google Generative AI SDK 래핑
 *   - 기본 모델: gemini-3.1-pro (사용자 지정, ENV `GEMINI_MODEL` 로 override)
 *   - Claude 와 동일 인터페이스 — 호출자가 wrapper(ai-fallback)에서 자동 전환 가능
 *
 * ENV:
 *   GEMINI_API_KEY  필수 — 미설정 시 모듈 사용 시 throw
 *   GEMINI_MODEL    선택 — 기본 'gemini-3.1-pro'
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-pro'

let _client: GoogleGenerativeAI | null = null

function getClient(): GoogleGenerativeAI {
  if (_client) return _client
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('[gemini] GEMINI_API_KEY 환경변수 미설정. .env 에 추가하세요.')
  }
  _client = new GoogleGenerativeAI(apiKey)
  return _client
}

/**
 * Gemini 단일 호출 — 텍스트 입력 → 텍스트 출력.
 * Claude wrapper 와 동일 시그니처.
 */
export interface GeminiInvokeParams {
  prompt: string
  /** 최대 출력 토큰 (기본 16384 — Claude 와 동일 정책) */
  maxTokens?: number
  /** 온도 (기본 0.4) */
  temperature?: number
  /** 모델명 override */
  model?: string
}

export interface GeminiInvokeResult {
  raw: string
  /** 사용 토큰 추정 (정확치 X) */
  inputTokens?: number
  outputTokens?: number
  model: string
}

export async function invokeGemini(params: GeminiInvokeParams): Promise<GeminiInvokeResult> {
  const modelName = params.model ?? GEMINI_MODEL
  const client = getClient()
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: params.maxTokens ?? 16384,
      temperature: params.temperature ?? 0.4,
    },
  })

  const result = await model.generateContent(params.prompt)
  const response = result.response
  const text = response.text()

  return {
    raw: text,
    inputTokens: response.usageMetadata?.promptTokenCount,
    outputTokens: response.usageMetadata?.candidatesTokenCount,
    model: modelName,
  }
}

/**
 * Gemini 가 사용 가능한지 (ENV 체크).
 * Claude fallback 결정 시 호출.
 */
export function isGeminiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

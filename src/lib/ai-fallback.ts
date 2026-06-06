/**
 * AI 호출 단일 진입점 (L1, 2026-04-27 · Gemini 단일화 ADR-023, 2026-06-01)
 *
 * 정책 (ADR-023):
 *   - LLM = Gemini 단일화. Anthropic/Claude 제거(死폴백이었음 — 키 미설정).
 *   - intra-Gemini 폴백 (RPD-aware, ADR-022 §4): Pro(`GEMINI_MODEL`) 실패/429 →
 *     `gemini-2.5-pro`(별도 RPD 1K) → Flash(`FLASH_MODEL`, RPD 10K). 전부 실패 시 throw.
 *     키 1개로 실질 가용성 확보.
 *   - `invokeAi` 는 라우팅·로깅·재시도·구조화출력·thinking 설정의 단일 지점.
 *
 * 사용처:
 *   - JSON 응답이 필수인 호출 (RFP 파싱 / Logic Model / Impact Goal / 커리큘럼 등)
 *   - 자유 텍스트 호출도 동일하게 이 진입점 사용.
 *
 * 호출자 책임:
 *   - 응답 파싱은 safeParseJson 사용 (ai/parser.ts 의 강화 버전)
 */

import { invokeGemini, isGeminiAvailable, GEMINI_MODEL } from './gemini'
import { AI_TOKENS, FLASH_MODEL } from './ai/config'
import { log } from './logger'
import { expBackoffDelay, is429, isPrepaymentExhausted } from './util/limit'

/**
 * intra-Gemini 폴백 체인 — 1차(기본 3.1 Pro) 실패/429 시 순서대로 시도 (ADR-022 §4, ADR-023).
 *
 * RPD-aware: `gemini-pro-latest` 는 3.1 Pro 와 **같은 RPD 버킷**(매핑 동일)이라 429 폴백으로 무용 →
 * 별도 RPD(1K)를 가진 `gemini-2.5-pro` 로 교체. 즉 체인 =
 *   3.1 Pro(RPD 250) → 2.5 Pro(RPD 1K) → 3.5 Flash(RPD 10K).
 * 429 RESOURCE_EXHAUSTED 포함 에러 시 graceful 강등 (Pro 품질 우선 → 그다음 Flash).
 */
const FALLBACK_MODELS = ['gemini-2.5-pro', FLASH_MODEL] as const

/**
 * 429 백오프 재시도 정책 (QUAL-THROTTLE, 2026-06-06).
 *
 * gather 가 7섹션 retrieve(임베딩+rerank)를 거의 동시에 쏘면 Gemini 분당 한도(429
 * RESOURCE_EXHAUSTED)를 버스트로 친다. 같은 모델을 폴백 체인 진입 *전에* 지수 백오프로
 * 몇 번 재시도하면 일시적 버스트는 대부분 흡수된다(분당 한도는 시간이 지나면 회복).
 *
 *   - 일반 429       : 최대 MAX_429_ATTEMPTS 회(첫 시도 포함) 같은 모델 재시도.
 *   - prepay 소진 429 : 시간 지나도 안 풀리므로 재시도 1회만(즉시 폴백).
 *   - 429 아닌 에러   : 재시도 없이 즉시 throw(호출부에서 폴백 체인으로).
 */
const MAX_429_ATTEMPTS = 3
const BACKOFF_BASE_MS = 800

/** sleep — 백오프 대기. (테스트는 이 경로를 타지 않음 — 순수 delay 계산만 검증.) */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 단일 모델 호출 + 429 지수 백오프 재시도. 429 가 아니면 즉시 throw(폴백 체인으로).
 * prepay-소진 429 는 재시도하지 않고 throw(시간으로 안 풀림).
 */
async function invokeGeminiWithBackoff(
  args: { prompt: string; maxTokens: number; temperature: number; model: string },
  label: string,
): Promise<Awaited<ReturnType<typeof invokeGemini>>> {
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_429_ATTEMPTS; attempt++) {
    try {
      return await invokeGemini(args)
    } catch (err: unknown) {
      lastErr = err
      const rateLimited = is429(err)
      const prepay = rateLimited && isPrepaymentExhausted(err)
      const isLast = attempt >= MAX_429_ATTEMPTS - 1
      // 429 아님 → 재시도 의미 없음(품질·할당과 무관한 실패). 즉시 폴백.
      // prepay 소진 429 → 시간으로 안 풀림. 재시도 안 함.
      if (!rateLimited || prepay || isLast) {
        if (rateLimited) {
          log.warn('ai', '429 — 같은 모델 백오프 종료(폴백으로)', {
            label,
            model: args.model,
            attempt: attempt + 1,
            prepay,
          })
        }
        throw err
      }
      const delay = expBackoffDelay(attempt, { base: BACKOFF_BASE_MS })
      log.warn('ai', '429 — 같은 모델 백오프 재시도', {
        label,
        model: args.model,
        attempt: attempt + 1,
        nextDelayMs: Math.round(delay),
      })
      await sleep(delay)
    }
  }
  throw lastErr
}

export interface InvokeAiParams {
  prompt: string
  maxTokens?: number
  temperature?: number
  /** 디버그 로그용 라벨 */
  label?: string
  /**
   * 우선 provider (테스트/재시도 호환용).
   * Gemini 단일화(ADR-023) 이후 LLM provider 는 항상 Gemini 이므로 실질적으로 무시되지만,
   * 호출부(예: express/process-turn 의 재시도) 시그니처 호환을 위해 보존한다.
   */
  preferredProvider?: 'gemini' | 'claude'
  /** 모델명 override (2-tier·Flash 라우팅). 미지정 시 GEMINI_MODEL(Pro). */
  model?: string
}

export interface InvokeAiResult {
  raw: string
  /**
   * provider — Gemini 단일화(ADR-023) 이후 항상 'gemini'.
   * 타입 union('gemini' | 'claude')은 호출부 호환(.provider 참조 51곳)을 위해 보존.
   */
  provider: 'gemini' | 'claude'
  model: string
  /** intra-Gemini 폴백 발생 여부 (Pro → latest → Flash). */
  fallback: boolean
  /** 폴백 발생 시 1차(Pro) 시도의 에러. */
  primaryError?: string
}

export async function invokeAi(params: InvokeAiParams): Promise<InvokeAiResult> {
  const label = params.label ?? 'invokeAi'
  const maxTokens = params.maxTokens ?? AI_TOKENS.LARGE
  const temperature = params.temperature ?? 0.4

  // E2E mock 모드 (Phase 4-coach-integration, 2026-05-03)
  // 환경변수 PLAYWRIGHT_MOCK_AI=true 일 때 실제 호출 X — fixture JSON 반환.
  // 운영 / dev 에서는 영향 없음 (env 미설정).
  if (process.env.PLAYWRIGHT_MOCK_AI === 'true') {
    log.info('ai', 'MOCK 응답 반환 (PLAYWRIGHT_MOCK_AI=true)', { label })
    const { getMockResponse } = await import('./ai-mock')
    return {
      raw: getMockResponse(label),
      provider: 'gemini',
      model: 'mock-gemini',
      fallback: false,
    }
  }

  if (!isGeminiAvailable()) {
    throw new Error(`[${label}] GEMINI_API_KEY 미설정 — Gemini 호출 불가 (ADR-023: Gemini 단일화).`)
  }

  const startedAt = Date.now()
  const primaryModel = params.model ?? GEMINI_MODEL

  // 1차 — 지정 모델(기본 Pro). 429 는 같은 모델 백오프 재시도 후 폴백.
  try {
    const r = await invokeGeminiWithBackoff(
      { prompt: params.prompt, maxTokens, temperature, model: primaryModel },
      label,
    )
    const elapsed = Date.now() - startedAt
    log.info('ai', 'Gemini 성공', {
      label,
      model: r.model,
      ms: elapsed,
      rawBytes: r.raw.length,
    })
    return {
      raw: r.raw,
      provider: 'gemini',
      model: r.model,
      fallback: false,
    }
  } catch (primaryError: unknown) {
    const primaryMsg = String(
      (primaryError as { message?: string })?.message ?? primaryError,
    )
    log.warn('ai', 'Gemini 1차 실패 → intra-Gemini 폴백', {
      label,
      model: primaryModel,
      primaryError: primaryMsg.slice(0, 200),
    })

    // intra-Gemini 폴백 체인 (Pro → gemini-2.5-pro → Flash, RPD-aware)
    for (const fbModel of FALLBACK_MODELS) {
      if (fbModel === primaryModel) continue // 이미 시도한 모델 skip
      try {
        const r = await invokeGeminiWithBackoff(
          { prompt: params.prompt, maxTokens, temperature, model: fbModel },
          label,
        )
        const elapsed = Date.now() - startedAt
        log.info('ai', 'Gemini(fallback) 성공', {
          label,
          model: r.model,
          ms: elapsed,
          rawBytes: r.raw.length,
        })
        return {
          raw: r.raw,
          provider: 'gemini',
          model: r.model,
          fallback: true,
          primaryError: primaryMsg,
        }
      } catch (fbError: unknown) {
        log.warn('ai', 'Gemini 폴백 모델 실패', {
          label,
          model: fbModel,
          error: String((fbError as { message?: string })?.message ?? fbError).slice(0, 200),
        })
      }
    }

    log.error('ai', 'Gemini 모든 모델 실패', {
      label,
      primaryError: primaryMsg.slice(0, 200),
    })
    throw new Error(
      `[${label}] Gemini 호출 실패 (Pro + 폴백 모두). primary(${primaryModel}): ${primaryMsg}`,
    )
  }
}

/**
 * JSON 응답 강제 호출 — 1차 실패 시 폴백은 invokeAi 내부(intra-Gemini)에서 처리.
 * safeParseJson 은 호출자가 직접 (ai/parser.ts 의 export 사용).
 */
export async function invokeAiForJson(params: InvokeAiParams): Promise<InvokeAiResult> {
  // 1차 호출 — JSON 파싱 실패 시 재시도는 호출자에서 처리
  // (safeParseJson 가 throw 하면 catch + 재호출).
  // 이 wrapper 는 "AI 호출 자체" 의 실패만 폴백.
  const first = await invokeAi(params)
  return first
}

export { GEMINI_MODEL }

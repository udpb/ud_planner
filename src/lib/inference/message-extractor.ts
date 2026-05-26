/**
 * Sphere 2 — Message Extractor (LLM #1)
 *
 * PRD-v11.0 §4.3 — extract-tuple 의 첫 번째 LLM 호출.
 *
 * 제안서 본문 → Message tuple (slogan + keyMessages + beforeAfter + tonePatterns).
 * 단어 단위 X — 의미 단위 + 표현 패턴 학습.
 *
 * 비용: Gemini 3.1 Pro · 400 토큰 out · ~$0.003/건.
 */

// server-only 의도 — invokeAi 가 client bundle 에서 자연 fail.

import { invokeAi } from '@/lib/ai-fallback'
import { safeParseJson } from '@/lib/ai/parser'
import { log } from '@/lib/logger'
import {
  MessageSchema,
  TonePatternsSchema,
  type Message,
  type TonePatterns,
  type Channel,
} from './types'
import { z } from 'zod'

const MessageExtractResponseSchema = z.object({
  message: MessageSchema,
  tonePatterns: TonePatternsSchema,
  confidence: z.number().min(0).max(1),
})

export interface MessageExtractInput {
  proposalText: string
  sourceProject: string
  channel: Channel
}

export interface MessageExtractResult {
  message: Message
  tonePatterns: TonePatterns
  confidence: number
  tokensUsed: number
}

const SYSTEM_PROMPT = `당신은 언더독스의 수주 사례 분석 전문가입니다.
제안서 본문을 받아 "메시지" 와 "톤 패턴" 을 추출합니다.

**메시지 (의미 단위 — 단어 X)**:
- slogan: 핵심 1줄 슬로건 (20~120자) — 평가위원이 5초에 읽는 한 줄
- keyMessages: 3개 (각 8~80자) — 차별화 메시지 3개
- beforeAfter: { before: 현 상태, after: 우리가 만들 변화 }

**톤 패턴 (표현 다양성 — 반복 방지의 핵심)**:
- openings: 섹션 시작 표현 패턴 (예: "우리는 ··· 합니다")
- transitions: 전환 표현 (예: "따라서", "이를 위해")
- closingPhrases: 마무리 표현
- avoidedWords: 이 제안서가 의도적으로 회피한 진부한 표현 (예: "최선을 다하여", "다양한")
- signatureNumbers: 시그니처 수치 ({ value: "20,211명", context: "누적 양성" })

⚠️ 중요:
1. 단어 매몰 X — 같은 의미의 다른 표현도 포함 (의도/방향성/메시지 모두 같은 의미)
2. avoidedWords 는 "원문에 안 쓰인 진부 표현" — 추론 결과
3. confidence: 본문 품질 + 추출 명확도 (0.5 이하 = 본문 불완전)

JSON 만 출력. 마크다운 펜스·설명 없이.`

function buildPrompt(input: MessageExtractInput): string {
  return `${SYSTEM_PROMPT}

[제안서 정보]
- 사업명: ${input.sourceProject}
- 채널: ${input.channel}

[제안서 본문 — ~10K자 발췌]
${input.proposalText.slice(0, 10000)}

[출력 JSON 스키마]
{
  "message": {
    "slogan": "...",
    "keyMessages": ["...", "...", "..."],
    "beforeAfter": { "before": "...", "after": "..." }
  },
  "tonePatterns": {
    "openings": ["...", "..."],
    "transitions": ["...", "..."],
    "closingPhrases": ["...", "..."],
    "avoidedWords": ["...", "..."],
    "signatureNumbers": [
      { "value": "20,211명", "context": "누적 양성" }
    ]
  },
  "confidence": 0.85
}

JSON 만 출력.`
}

/**
 * 제안서 본문 → Message + TonePatterns.
 *
 * 실패 시:
 * - JSON 파싱 실패: invokeAi 의 자동 retry (Gemini → Claude) 후에도 실패 → throw
 * - schema 검증 실패: zod issue 로깅 후 throw
 */
export async function extractMessage(
  input: MessageExtractInput,
): Promise<MessageExtractResult> {
  const startedAt = Date.now()
  const prompt = buildPrompt(input)

  const aiResult = await invokeAi({
    prompt,
    // Gemini 3.x thinking 모드 — thinking budget 이 maxOutputTokens 일부 사용.
    // 작은 값 (1024) 으로 잡으면 thinking 후 output 잘림. STANDARD (8192) 안전.
    maxTokens: 8192,
    temperature: 0.3, // 일관성 우선
    label: `message-extract:${input.sourceProject}`,
  })

  let parsed: unknown
  try {
    parsed = safeParseJson(aiResult.raw, `message-extract:${input.sourceProject}`)
  } catch (e) {
    log.error('inference', '[message-extract] JSON 파싱 실패', {
      sourceProject: input.sourceProject,
      err: e instanceof Error ? e.message : String(e),
    })
    throw e
  }

  const validated = MessageExtractResponseSchema.safeParse(parsed)
  if (!validated.success) {
    log.error('inference', '[message-extract] 스키마 검증 실패', {
      sourceProject: input.sourceProject,
      issues: validated.error.issues.slice(0, 5),
    })
    throw new Error(
      `[message-extract] schema 검증 실패: ${validated.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .slice(0, 3)
        .join(' / ')}`,
    )
  }

  log.info('inference', `[message-extract] 완료`, {
    sourceProject: input.sourceProject,
    confidence: validated.data.confidence,
    ms: Date.now() - startedAt,
    provider: aiResult.provider,
  })

  return {
    message: validated.data.message,
    tonePatterns: validated.data.tonePatterns,
    confidence: validated.data.confidence,
    tokensUsed: aiResult.raw.length, // 근사치 — 실제 토큰 수는 provider 에서 안 줌
  }
}

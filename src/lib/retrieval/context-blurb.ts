/**
 * Contextual Retrieval blurb 유틸 (RET-1, Tech Spec §4.1, ADR-022).
 *
 * Anthropic Contextual Retrieval: 각 청크 앞에 문서 전체 맥락을 요약한 50~100토큰
 * blurb 를 prepend 한 뒤 임베딩·인덱싱하면 top-k 실패율이 크게 줄어든다(−49%).
 *
 * 본 브리프는 **유틸만** 제공한다 — 실제 ingest 시 호출은 BR/ingest 브리프 담당.
 * 여기서 실행(인덱싱·DB write)하지 않는다.
 *
 * 모델: **Flash**(plumbing). invokeGemini({ model: FLASH_MODEL }) 직접 호출.
 * 실패 시 빈 문자열 반환(graceful — 호출부는 blurb 없이 청크만 인덱싱).
 */

import 'server-only'

import { invokeGemini } from '@/lib/gemini'
import { FLASH_MODEL, AI_TOKENS } from '@/lib/ai/config'
import { log } from '@/lib/logger'

/** blurb 가 과도하게 길어지지 않도록 출력 trim (대략 100토큰 ≈ 250자). */
const MAX_BLURB_CHARS = 280

/**
 * 청크 + 문서 제목을 받아 50~100토큰 맥락 blurb 를 Flash 로 생성.
 * ingest 시 `blurb + "\n" + chunkText` 를 임베딩하는 데 사용(호출부 책임).
 *
 * @param chunkText 청크 본문
 * @param docTitle 청크가 속한 문서 제목(맥락 단서)
 * @returns 맥락 blurb (실패 시 '')
 */
export async function generateContextBlurb(
  chunkText: string,
  docTitle: string,
): Promise<string> {
  const chunk = chunkText.trim()
  if (chunk.length < 10) return ''
  try {
    const r = await invokeGemini({
      model: FLASH_MODEL,
      maxTokens: AI_TOKENS.LIGHT,
      temperature: 0.2,
      prompt:
        '아래 문서에서 발췌한 청크입니다. 이 청크가 전체 문서에서 어떤 맥락에 위치하는지 ' +
        '한국어 1~2문장(50~100토큰)으로 요약하세요. 검색 정확도를 위한 맥락 prepend 용이므로 ' +
        '청크 내용을 반복하지 말고 "무엇에 대한 어느 부분인지" 를 압축합니다. 맥락 문장만 출력.\n\n' +
        `문서 제목: ${docTitle}\n\n청크:\n${chunk.slice(0, 2000)}\n\n맥락 요약:`,
    })
    return r.raw.trim().slice(0, MAX_BLURB_CHARS)
  } catch (e) {
    log.warn('ret.context-blurb', 'blurb 생성 실패 → 빈 blurb', {
      err: e instanceof Error ? e.message : String(e),
    })
    return ''
  }
}

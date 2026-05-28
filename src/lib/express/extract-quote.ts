/**
 * Extract Quote — Phase K2 (2026-05-29)
 *
 * narrativeSnippet 에서 가장 임팩트 있는 1 문장 휴리스틱 추출.
 *
 * 한계 (정직 인정):
 *   narrativeSnippet 은 이미 LLM 재구성된 텍스트라서, 이 함수가 추출하는 문장은
 *   "원본 voice" 가 아닌 "LLM voice 중 가장 강한 문장" 임. 진짜 voice 보존은
 *   원본 PDF/PPT/DOC 재읽기 필요 (별도 cron + Drive API 작업).
 *
 * 이 함수는 그 stopgap 으로, narrativeSnippet 내에서 정량·강한동사·UD 시그니처
 * 가 풍부한 문장을 골라 originalQuote 으로 저장. 평가위원 직인용 시 효과 일부 있음.
 *
 * 사용:
 *   scripts/migrate-quotes.ts 에서 일괄 호출 (DB 1,765 자산).
 */

// 강한 종결 동사 (당선 사업 분석 기반 — guidebook + 청년마을 패턴)
const STRONG_VERBS = [
  '견인', '달성', '완성', '확보', '구축', '실현', '추진', '강화',
  '도약', '돌파', '극대화', '극복', '연결', '동행', '주도',
  '검증', '입증', '증명', '담보', '보장',
]

// 회피 어휘 (저신뢰 표현 — 발견 시 점수 차감)
const WEAK_WORDS = [
  '다양한', '최선', '노력하겠', '성실', '유익', '일반적인', '형식적',
]

// 정량 수치 패턴
const NUMERIC_PATTERNS = [
  /\d+%/, // % 비율
  /\d+(\.\d+)?[명건회개점월년주일]/, // 명/건/회/개/점 단위
  /\d+(\,\d+)+(원|명)/, // 8,000명 / 1,000,000원
  /\d+(\.\d+)?(만|억|조)/, // 만/억/조
  /\d+(\.\d+)?[xX]/, // 2x, 1.5X
  /\d+:\d+/, // 1:1 비율
]

// UD 시그니처 어휘 (방법론 고유)
const UD_SIGNATURES = [
  '액트프러너', 'ACTT', 'IMPACT 6단계', 'IMPACT 18모듈', '5D',
  'ACT Canvas', '데이터 허브', '하이브리드 코칭', 'UCA',
  '글로벌 표준', '4차원 자동 평가', 'AI Co-founder',
]

export interface ExtractQuoteResult {
  /** 추출된 문장 (10~400자) — 없으면 null */
  quote: string | null
  /** 점수 (0~10) — 디버깅용 */
  score: number
  /** 추출 출처 — 향후 'original-pdf' 마이그레이션 시 'heuristic' 인 것만 재처리 */
  source: 'heuristic' | 'none'
}

/**
 * narrativeSnippet 에서 가장 임팩트 있는 1 문장 추출.
 *
 * 점수 계산:
 *   - 정량 수치 +2 each (max +4)
 *   - 강한 동사 +1 each (max +2)
 *   - UD 시그니처 +2 each (max +4)
 *   - 회피 어휘 -2 each
 *   - 길이 30~150 자 → +1, 150~300 → +0.5, else -1
 *
 * 최저 점수 (≥ 3) 미달 시 quote=null 반환.
 */
export function extractQuoteFromNarrative(narrative: string): ExtractQuoteResult {
  if (!narrative || narrative.length < 30) {
    return { quote: null, score: 0, source: 'none' }
  }

  // 한국어 문장 분할 — . / ! / ? / 줄바꿈 + 한국어 어말 '.'
  const sentences = narrative
    .split(/(?<=[다요죠습니다]\.)\s+|(?<=[\.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 400)

  if (sentences.length === 0) {
    return { quote: null, score: 0, source: 'none' }
  }

  let bestSentence: string | null = null
  let bestScore = 0

  for (const s of sentences) {
    let score = 0

    // 정량 수치
    let numericCount = 0
    for (const pat of NUMERIC_PATTERNS) {
      if (pat.test(s)) numericCount += 1
    }
    score += Math.min(numericCount * 2, 4)

    // 강한 동사
    let verbCount = 0
    for (const v of STRONG_VERBS) {
      if (s.includes(v)) verbCount += 1
    }
    score += Math.min(verbCount, 2)

    // UD 시그니처
    let sigCount = 0
    for (const sig of UD_SIGNATURES) {
      if (s.includes(sig)) sigCount += 1
    }
    score += Math.min(sigCount * 2, 4)

    // 회피 어휘
    let weakCount = 0
    for (const w of WEAK_WORDS) {
      if (s.includes(w)) weakCount += 1
    }
    score -= weakCount * 2

    // 길이
    if (s.length >= 30 && s.length <= 150) score += 1
    else if (s.length > 150 && s.length <= 300) score += 0.5
    else score -= 1

    if (score > bestScore) {
      bestScore = score
      bestSentence = s
    }
  }

  // 임계 미달
  if (bestSentence === null || bestScore < 3) {
    return { quote: null, score: bestScore, source: 'none' }
  }

  // 너무 길면 cut
  const trimmed = bestSentence.length > 400 ? bestSentence.slice(0, 397) + '...' : bestSentence
  return { quote: trimmed, score: bestScore, source: 'heuristic' }
}

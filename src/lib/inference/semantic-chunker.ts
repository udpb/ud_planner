/**
 * Sphere 2 — Semantic Chunker
 *
 * PRD-v11.0 §4.3 — Content tuple 의 hierarchical chunking.
 *
 * 일반 RAG 의 fixed-size chunking (예: 500 토큰 X) 와 다름.
 * 의미 boundary 우선:
 *   1차: 섹션 boundary (### / 1. / 2. / [장:N] 등)
 *   2차: 단락 boundary (\n\n)
 *   3차: 길이 boundary (min 200자, max 800자)
 *
 * pure 함수 — server/client 양쪽 사용 가능.
 */

const MIN_CHUNK_CHARS = 200
const MAX_CHUNK_CHARS = 800
const SAFE_MAX = 1500 // 절대 한계 — 이 이상이면 강제 분할

// ─────────────────────────────────────────
// 1. 섹션 boundary 감지
// ─────────────────────────────────────────

/**
 * 섹션 헤더 패턴.
 *
 * 매칭:
 *   - "### " (markdown H3)
 *   - "## " (H2)
 *   - "1. " / "2. " (번호 매기기)
 *   - "[1장]" / "[제 1 장]" (한글 장)
 *   - "1)" / "(1)" (괄호 번호)
 *
 * 캡처: line text 전체
 */
const SECTION_BOUNDARY = /^(#{2,3}\s+|[1-9][0-9]?\.\s+|\[[제]?\s*[1-9][0-9]?\s*[장절]\]\s*|\([1-9][0-9]?\)\s*)/m

/**
 * 본문 → 섹션 단위 split.
 * 섹션 헤더 자체가 다음 섹션의 시작 부분.
 */
function splitBySections(text: string): string[] {
  const lines = text.split('\n')
  const sections: string[] = []
  let current: string[] = []

  for (const line of lines) {
    if (SECTION_BOUNDARY.test(line) && current.length > 0) {
      // 새 섹션 시작 — 이전 섹션 마무리
      sections.push(current.join('\n').trim())
      current = [line]
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) sections.push(current.join('\n').trim())

  return sections.filter((s) => s.length > 0)
}

// ─────────────────────────────────────────
// 2. 단락 boundary 감지
// ─────────────────────────────────────────

function splitByParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/) // 빈 줄로 단락 분리
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

// ─────────────────────────────────────────
// 3. 길이 보정 (병합·분할)
// ─────────────────────────────────────────

/**
 * chunk 가 너무 작으면 다음 것과 병합. 너무 크면 문장 단위로 분할.
 */
function adjustLength(chunks: string[]): string[] {
  const result: string[] = []
  let buffer = ''

  for (const chunk of chunks) {
    // 너무 큰 chunk → 문장 분할
    if (chunk.length > MAX_CHUNK_CHARS) {
      // 기존 버퍼 flush
      if (buffer.length > 0) {
        result.push(buffer)
        buffer = ''
      }
      // 문장 단위 (.!? 또는 \n) 로 분할
      const sentences = chunk.split(/(?<=[.!?。])\s+|\n/)
      let subBuffer = ''
      for (const s of sentences) {
        if (subBuffer.length + s.length > MAX_CHUNK_CHARS && subBuffer.length >= MIN_CHUNK_CHARS) {
          result.push(subBuffer.trim())
          subBuffer = s
        } else {
          subBuffer = subBuffer ? subBuffer + ' ' + s : s
        }
        // 절대 한계 초과 시 강제 분할
        if (subBuffer.length > SAFE_MAX) {
          result.push(subBuffer.slice(0, SAFE_MAX).trim())
          subBuffer = subBuffer.slice(SAFE_MAX)
        }
      }
      if (subBuffer.trim().length > 0) result.push(subBuffer.trim())
      continue
    }

    // 작은 chunk → 버퍼와 합침
    if (buffer.length + chunk.length < MIN_CHUNK_CHARS) {
      buffer = buffer ? buffer + '\n\n' + chunk : chunk
    } else if (buffer.length === 0) {
      // 적정 크기 단독
      if (chunk.length >= MIN_CHUNK_CHARS) {
        result.push(chunk)
      } else {
        buffer = chunk
      }
    } else {
      // 버퍼 + chunk 가 너무 큰 경우 — 버퍼 flush 후 chunk 새로 시작
      result.push(buffer)
      buffer = chunk
    }

    // 버퍼가 적정 크기 도달 → flush
    if (buffer.length >= MIN_CHUNK_CHARS) {
      result.push(buffer)
      buffer = ''
    }
  }

  if (buffer.length > 0) {
    // 마지막 잔여물 — 너무 작으면 직전 chunk 에 append
    if (buffer.length < MIN_CHUNK_CHARS && result.length > 0) {
      result[result.length - 1] = result[result.length - 1] + '\n\n' + buffer
    } else {
      result.push(buffer)
    }
  }

  return result
}

// ─────────────────────────────────────────
// 4. 메인 export
// ─────────────────────────────────────────

export interface ChunkOptions {
  /** 기본 800. 이 이상이면 분할 */
  maxChars?: number
  /** 기본 200. 이 이하면 다음 chunk 와 병합 */
  minChars?: number
}

/**
 * 본문 → semantic chunks.
 *
 * 단계:
 *   1. 섹션 boundary 로 1차 split
 *   2. 각 섹션이 너무 크면 단락 boundary 로 2차 split
 *   3. 각 단락이 너무 크면 문장 boundary 로 3차 split
 *   4. 너무 작은 chunk 는 인접한 것과 병합
 *
 * 출력: chunk 배열 (각 200~800자, 최대 1500자).
 */
export function semanticChunk(text: string, _options: ChunkOptions = {}): string[] {
  if (!text || text.trim().length === 0) return []

  // 1. 섹션 단위 split
  const sections = splitBySections(text)

  // 2. 각 섹션 → 단락 단위 split (큰 섹션만)
  const paragraphs: string[] = []
  for (const section of sections) {
    if (section.length > MAX_CHUNK_CHARS) {
      paragraphs.push(...splitByParagraphs(section))
    } else {
      paragraphs.push(section)
    }
  }

  // 3. 길이 보정 — 너무 큰 것 분할 + 너무 작은 것 병합
  return adjustLength(paragraphs)
}

/**
 * chunk 의 sectionHint 추정 — 헤더 line 의 번호 또는 키워드 매칭.
 *
 * 7 섹션 매핑 휴리스틱:
 *   - "배경" / "필요성" / "시장" → '1'
 *   - "추진" / "전략" / "방법" → '2'
 *   - "커리큘럼" / "교육" / "프로그램" → '3'
 *   - "운영" / "체계" / "조직" → '4'
 *   - "예산" / "비용" / "투자" → '5'
 *   - "성과" / "기대" / "KPI" / "임팩트" → '6'
 *   - "리스크" / "위험" / "대응" → '7'
 */
export function inferSectionHint(chunk: string): string | undefined {
  const first200 = chunk.slice(0, 200).toLowerCase()

  if (/배경|필요성|시장|문제\s*정의/.test(first200)) return '1'
  if (/추진\s*전략|전략|방법론|차별화/.test(first200)) return '2'
  if (/커리큘럼|교육\s*과정|프로그램\s*구성/.test(first200)) return '3'
  if (/운영\s*체계|조직\s*구성|코치/.test(first200)) return '4'
  if (/예산|비용|투자|단가/.test(first200)) return '5'
  if (/기대\s*성과|성과|kpi|임팩트/.test(first200)) return '6'
  if (/리스크|위험\s*요소|대응\s*방안/.test(first200)) return '7'

  return undefined
}

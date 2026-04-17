/**
 * PDF 섹션 분할기 — 제안서 PDF 텍스트를 7개 표준 섹션으로 매핑
 *
 * Phase D1: proposal-ingest 워커가 사용.
 * - unpdf 로 텍스트 추출 (기존 parse-rfp/route.ts 패턴 재활용)
 * - 7개 표준 섹션 매핑 heuristic (heading regex + keyword)
 * - 매핑 안 되는 섹션은 "other" 로 기록
 *
 * 관련 문서: docs/architecture/ingestion.md §3.1
 */

import type { ProposalSectionKey } from '@/lib/pipeline-context'

// ─────────────────────────────────────────
// 공개 타입
// ─────────────────────────────────────────

export type SplitSectionKey = ProposalSectionKey | 'other'

export interface SplitSection {
  sectionKey: SplitSectionKey
  heading: string
  body: string
}

// ─────────────────────────────────────────
// 섹션 키워드 매핑 (brief Step 1 정의)
// ─────────────────────────────────────────

interface SectionRule {
  key: ProposalSectionKey
  /** heading 또는 본문에 이 키워드 중 하나라도 포함되면 매핑 */
  keywords: string[]
}

const SECTION_RULES: SectionRule[] = [
  {
    key: 'proposal-background',
    keywords: ['제안 배경', '제안배경', '목적', '사업 개요', '사업개요', '추진 배경', '추진배경', '필요성'],
  },
  {
    key: 'org-team',
    keywords: ['추진 전략', '추진전략', '방법론', '차별화', '전략', '추진 체계', '추진체계'],
  },
  {
    key: 'curriculum',
    keywords: ['커리큘럼', '교육 과정', '교육과정', '프로그램', '세부 내용', '세부내용', '교육 내용', '교육내용'],
  },
  {
    key: 'coaches',
    keywords: ['조직', '인력', '코치', '강사', '전문가', '운영 체계', '운영체계', '투입 인력', '투입인력'],
  },
  {
    key: 'budget',
    keywords: ['예산', '산출', '경제성', '비용', '소요 예산', '소요예산', '사업비'],
  },
  {
    key: 'impact',
    keywords: ['성과', '임팩트', '측정', '평가', 'KPI', '지표', '기대 효과', '기대효과', '성과 관리', '성과관리'],
  },
  {
    key: 'other',
    keywords: ['실적', '포트폴리오', '레퍼런스', '수행 실적', '수행실적', '유사 사업', '유사사업'],
  },
]

// ─────────────────────────────────────────
// PDF 텍스트 추출
// ─────────────────────────────────────────

/**
 * PDF Buffer 로부터 전체 텍스트를 추출합니다.
 * unpdf 패턴 재활용 (src/app/api/ai/parse-rfp/route.ts 와 동일).
 */
export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const { extractText } = await import('unpdf')
  const result = await extractText(new Uint8Array(buffer))
  return (result.text ?? []).join('\n\n')
}

// ─────────────────────────────────────────
// 섹션 분할 로직
// ─────────────────────────────────────────

/**
 * heading 패턴 — 한국어 제안서의 일반적인 목차/제목 패턴
 *
 * 예시:
 *   1. 제안 배경 및 목적
 *   가. 사업 개요
 *   제1장 추진 전략
 *   I. 제안 배경
 *   [1] 사업 개요
 *   ● 교육 커리큘럼
 *
 * 50자 이상인 줄은 heading 이 아닌 본문으로 간주.
 */
const HEADING_PATTERN = /^(?:(?:\d+[.\)]\s*)|(?:[가-힣][.\)]\s*)|(?:제?\d+[장절]\s*)|(?:[IVX]+[.\)]\s*)|(?:\[\d+\]\s*)|(?:[●■□◆▶]\s*))(.+)/

function isHeadingLine(line: string): { isHeading: boolean; headingText: string } {
  const trimmed = line.trim()
  if (trimmed.length > 60 || trimmed.length < 2) {
    return { isHeading: false, headingText: '' }
  }

  const match = HEADING_PATTERN.exec(trimmed)
  if (match) {
    return { isHeading: true, headingText: trimmed }
  }

  // 짧은 줄 (5~40자) 이면서 문장 종결이 아닌 것도 heading 후보
  if (trimmed.length >= 3 && trimmed.length <= 40 && !trimmed.endsWith('.') && !trimmed.endsWith('다')) {
    return { isHeading: true, headingText: trimmed }
  }

  return { isHeading: false, headingText: '' }
}

/**
 * heading 텍스트 + 본문 첫 200자를 키워드 매핑해서 섹션 키를 결정합니다.
 */
function classifySection(heading: string, bodyPreview: string): SplitSectionKey {
  const combined = `${heading} ${bodyPreview}`.toLowerCase()

  for (const rule of SECTION_RULES) {
    for (const kw of rule.keywords) {
      if (combined.includes(kw.toLowerCase())) {
        return rule.key
      }
    }
  }

  return 'other'
}

// ─────────────────────────────────────────
// 메인 함수
// ─────────────────────────────────────────

/**
 * PDF 텍스트를 7개 표준 섹션 + other 로 분할합니다.
 *
 * 알고리즘:
 * 1. 줄 단위로 heading 패턴 탐지
 * 2. heading 사이의 텍스트를 하나의 chunk 로 묶음
 * 3. 각 chunk 를 keyword heuristic 으로 ProposalSectionKey 에 매핑
 * 4. 같은 sectionKey 의 chunk 들은 병합
 *
 * @param fullText - PDF 에서 추출한 전체 텍스트
 * @returns SplitSection[] (최소 1개 보장)
 */
export function splitTextIntoSections(fullText: string): SplitSection[] {
  const lines = fullText.split('\n')
  const chunks: Array<{ heading: string; bodyLines: string[] }> = []
  let currentHeading = '(서두)'
  let currentBodyLines: string[] = []

  for (const line of lines) {
    const { isHeading, headingText } = isHeadingLine(line)
    if (isHeading && currentBodyLines.length > 0) {
      // 이전 chunk 저장
      chunks.push({ heading: currentHeading, bodyLines: currentBodyLines })
      currentHeading = headingText
      currentBodyLines = []
    } else if (isHeading && currentBodyLines.length === 0) {
      // 연속 heading — heading 갱신
      currentHeading = headingText
    } else {
      const trimmed = line.trim()
      if (trimmed) {
        currentBodyLines.push(trimmed)
      }
    }
  }

  // 마지막 chunk
  if (currentBodyLines.length > 0) {
    chunks.push({ heading: currentHeading, bodyLines: currentBodyLines })
  }

  // chunk 가 없으면 전체를 "other" 로
  if (chunks.length === 0) {
    return [{
      sectionKey: 'other',
      heading: '(전체)',
      body: fullText.trim(),
    }]
  }

  // 각 chunk 를 섹션으로 분류 후 같은 키끼리 병합
  const sectionMap = new Map<SplitSectionKey, { headings: string[]; bodies: string[] }>()

  for (const chunk of chunks) {
    const body = chunk.bodyLines.join('\n')
    const preview = body.slice(0, 200)
    const key = classifySection(chunk.heading, preview)

    const existing = sectionMap.get(key)
    if (existing) {
      existing.headings.push(chunk.heading)
      existing.bodies.push(body)
    } else {
      sectionMap.set(key, { headings: [chunk.heading], bodies: [body] })
    }
  }

  const result: SplitSection[] = []
  for (const [key, data] of sectionMap.entries()) {
    result.push({
      sectionKey: key,
      heading: data.headings[0] ?? '',
      body: data.bodies.join('\n\n'),
    })
  }

  return result
}

/**
 * PDF Buffer 로부터 섹션 분할까지 한 번에 수행합니다.
 */
export async function splitPdfIntoSections(buffer: Buffer): Promise<SplitSection[]> {
  const text = await extractTextFromPdfBuffer(buffer)
  if (!text || text.trim().length < 50) {
    throw new Error('PDF에서 추출된 텍스트가 너무 짧습니다. 스캔 PDF이거나 빈 파일일 수 있습니다.')
  }
  return splitTextIntoSections(text)
}

/**
 * File Ingester — PDF / PPTX / DOCX / XLSX → 자산 후보 (Wave N3, 2026-05-15)
 *
 * 흐름:
 *   1. extractTextFromBuffer(buffer, mimeOrExt) — 파일 → 평문 본문
 *   2. proposeAssetsFromFile(text, fileName, opts) — 짧은 파일은 단건,
 *      긴 파일 (≥ 8K 자) 은 슬라이드/페이지 단위로 끊어 다건 후보 제안
 *
 * 지원 포맷:
 *  - .pdf  (pdf-parse)
 *  - .pptx (officeparser)
 *  - .docx (officeparser)
 *  - .xlsx (officeparser — 시트별 텍스트 합침)
 *  - .txt / .md (그대로)
 *
 * HWP 는 지원 안 함 (LibreOffice headless 변환은 별도 인프라 필요).
 * 변환 가이드만 메시지로 안내.
 */

// 'server-only' 가드 미사용 — CLI 스크립트와 공유.
import { z } from 'zod'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'
import { AssetProposalSchema, type AssetProposal } from './web-ingester'

// ─────────────────────────────────────────
// 1. 파일 추출
// ─────────────────────────────────────────

export interface ExtractedFile {
  text: string
  /** 페이지/슬라이드 분할 — PPTX 만 의미 있음 */
  pages?: string[]
  /** 추출에 사용된 라이브러리 */
  by: 'pdf-parse' | 'officeparser' | 'utf8' | 'unsupported'
  /** 길이 절단 여부 */
  truncated: boolean
  charCount: number
}

const MAX_TEXT_LEN = 40_000

export async function extractTextFromBuffer(
  buffer: Buffer,
  fileNameOrExt: string,
): Promise<ExtractedFile> {
  const ext = inferExt(fileNameOrExt)

  if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    const result = await parser.getText()
    const text = clean(result.text)
    const truncated = text.length > MAX_TEXT_LEN
    return {
      text: truncated ? text.slice(0, MAX_TEXT_LEN) : text,
      by: 'pdf-parse',
      truncated,
      charCount: text.length,
    }
  }

  if (ext === 'pptx' || ext === 'docx' || ext === 'xlsx') {
    const { OfficeParser } = await import('officeparser')
    const ast = await OfficeParser.parseOffice(buffer)
    const text = ast.toText()
    const cleaned = clean(text)

    // PPTX 는 슬라이드 구분이 통상 명시 안 됨 — officeparser 의 newSlide 옵션 활용
    //   여기선 결과 텍스트에서 빈 줄 2개 이상으로 분할 (휴리스틱)
    let pages: string[] | undefined
    if (ext === 'pptx') {
      pages = cleaned
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 30) // 너무 짧은 슬라이드 제외
    }

    const truncated = cleaned.length > MAX_TEXT_LEN
    return {
      text: truncated ? cleaned.slice(0, MAX_TEXT_LEN) : cleaned,
      pages,
      by: 'officeparser',
      truncated,
      charCount: cleaned.length,
    }
  }

  if (ext === 'txt' || ext === 'md') {
    const text = clean(buffer.toString('utf8'))
    const truncated = text.length > MAX_TEXT_LEN
    return {
      text: truncated ? text.slice(0, MAX_TEXT_LEN) : text,
      by: 'utf8',
      truncated,
      charCount: text.length,
    }
  }

  // HWP, RTF 등 미지원
  return { text: '', by: 'unsupported', truncated: false, charCount: 0 }
}

function inferExt(s: string): string {
  const lower = s.toLowerCase()
  const m = lower.match(/\.([a-z0-9]+)$/)
  if (m) return m[1]
  // mime 패턴
  if (lower.includes('pdf')) return 'pdf'
  if (lower.includes('presentation')) return 'pptx'
  if (lower.includes('wordprocessingml')) return 'docx'
  if (lower.includes('spreadsheetml')) return 'xlsx'
  return lower
}

function clean(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─────────────────────────────────────────
// 2. 자산 후보 다건 추출 (긴 파일 → 슬라이드/섹션별)
// ─────────────────────────────────────────

export const MultiAssetProposalSchema = z.object({
  proposals: z.array(AssetProposalSchema).max(15),
  /** 파일 전체에 대한 한 줄 요약 (담당자 컨텍스트) */
  summary: z.string().optional(),
})

export interface MultiProposeOptions {
  /** 컨텍스트 hint */
  hint?: string
  /** 파일이 수주 제안서일 때 true — wonProject hint 로 narrative 강조 */
  wasWon?: boolean
  /** 슬라이드별 추출 모드 (PPTX 권장). false 면 파일 전체를 단건 자산화 */
  perSlide?: boolean
  /** 단건 자산화 시 결과 1건만 — false 면 다건 */
  singleOnly?: boolean
}

export async function proposeAssetsFromFile(
  extracted: ExtractedFile,
  fileName: string,
  opts: MultiProposeOptions = {},
): Promise<AssetProposal[]> {
  if (!extracted.text || extracted.text.length < 100) {
    return []
  }

  // 단건 vs 다건 모드 결정
  const useMulti = !opts.singleOnly && extracted.text.length > 4000

  const prompt = useMulti
    ? buildMultiPrompt(extracted, fileName, opts)
    : buildSinglePrompt(extracted, fileName, opts)

  const r = await invokeAi({
    prompt,
    maxTokens: useMulti ? AI_TOKENS.LARGE : AI_TOKENS.STANDARD,
    temperature: 0.4,
    label: useMulti ? 'file-ingest-multi' : 'file-ingest-single',
  })

  if (useMulti) {
    const raw = safeParseJson<unknown>(r.raw, 'file-ingest-multi')
    const v = MultiAssetProposalSchema.safeParse(raw)
    if (!v.success) {
      console.warn('[file-ingester] multi zod 실패:', v.error.message.slice(0, 200))
      return []
    }
    // rejection 항목 제외
    return v.data.proposals.filter(
      (p): p is AssetProposal => !('rejected' in p && p.rejected === true),
    )
  } else {
    const raw = safeParseJson<unknown>(r.raw, 'file-ingest-single')
    const v = AssetProposalSchema.safeParse(raw)
    if (!v.success) {
      console.warn('[file-ingester] single zod 실패:', v.error.message.slice(0, 200))
      return []
    }
    if ('rejected' in v.data && v.data.rejected === true) return []
    return [v.data as AssetProposal]
  }
}

function buildSinglePrompt(
  ext: ExtractedFile,
  fileName: string,
  opts: MultiProposeOptions,
): string {
  return `
당신은 언더독스 콘텐츠 큐레이터입니다. 아래 문서를 보고 **언더독스 제안서 작성용 자산**
으로 가치 있는지 판단하고, JSON 한 건으로 후보 제안.

[필드 가이드]
- category: methodology · content · product · human · data · framework
- evidenceType: quantitative · structural · case · methodology
- applicableSections: proposal-background · curriculum · coaches · budget · impact · org-team
- valueChainStage: impact · input · output · activity · outcome
- narrativeSnippet: 제안서 본문 1~2 문장 한국어 요약 (원문 인용 X)
- keyNumbers: 본문 핵심 숫자·연도
- keywords: RFP 매칭용 5~10개

부적절: {"rejected": true, "rejectionReason": "..."}

${opts.wasWon ? '※ 이 문서는 **수주에 성공한 제안서** 입니다. 수주 성공의 핵심 메시지·차별화를 narrativeSnippet 에 담아주세요.\n' : ''}
${opts.hint ? `[추가 컨텍스트]\n${opts.hint}\n\n` : ''}
[파일]
이름: ${fileName}

본문:
${ext.text}

JSON 만 출력.
`.trim()
}

function buildMultiPrompt(
  ext: ExtractedFile,
  fileName: string,
  opts: MultiProposeOptions,
): string {
  const pageHint =
    opts.perSlide && ext.pages
      ? `슬라이드/페이지 ${ext.pages.length}개 감지됨. 각각 별개 자산이 될 수 있음.`
      : '문서 안에서 의미 단위로 끊어 자산 후보 추출.'

  return `
당신은 언더독스 콘텐츠 큐레이터입니다. 아래 문서를 보고 **언더독스 제안서 작성용 자산**
후보를 **다건** 추출하세요. ${pageHint}

[자산화 가치 판단]
다음 중 하나면 자산:
  - 사회적 임팩트 사례·알럼나이 변화 (case + before/after)
  - 시장·정책 통계 (quantitative + data)
  - 자체 콘텐츠·프로덕트
  - 검증된 프레임워크·방법론
  - 사업 실적·수주 사례

너무 짧거나 (< 50자) 인사·간지·목차 페이지는 제외.

[출력]
{
  "summary": "파일 전체 1줄 요약",
  "proposals": [
    {
      "name": "...",
      "category": "methodology|content|product|human|data|framework",
      "evidenceType": "quantitative|structural|case|methodology",
      "applicableSections": ["proposal-background"|"curriculum"|...],
      "valueChainStage": "impact|input|output|activity|outcome",
      "narrativeSnippet": "제안서 본문 1~2 문장 한국어",
      "keyNumbers": ["..."],
      "keywords": ["..."]
    },
    ...최대 15건
  ]
}

부적절 페이지는 결과에 안 넣음.

${opts.wasWon ? '※ 이 문서는 수주에 성공한 제안서 — 수주 신호 (메시지·차별화·증거) 위주로 추출.\n\n' : ''}
${opts.hint ? `[추가 컨텍스트]\n${opts.hint}\n\n` : ''}
[파일]
이름: ${fileName}

본문:
${ext.text}

JSON 만 출력. 마크다운 펜스 없이.
`.trim()
}

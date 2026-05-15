/**
 * Web Ingester — URL → ContentAsset 후보 (Wave N2, 2026-05-15)
 *
 * 흐름:
 *   1. fetchPageText(url) — HTML → 정제된 plain text (cheerio + 노이즈 제거)
 *   2. proposeAssetFromText(text, url) — Gemini 한 번 호출해 자산 후보 JSON 추출
 *   3. (호출자가) 담당자 UI 로 prefill → ContentAsset 저장
 *
 * 정책:
 *  - JS 렌더링 SPA 페이지는 Playwright fallback (별도 함수 fetchPageTextWithBrowser)
 *  - 본문 길이 30K 이상 시 절단 (Gemini 입력 부담)
 *  - 한국어/영어 모두 지원
 *  - robots.txt 준수는 호출자 책임 (지금은 자체 자산 사이트 대상이라 생략)
 */

import 'server-only'
import * as cheerio from 'cheerio'
import { z } from 'zod'

import { invokeAi } from '@/lib/ai-fallback'
import { AI_TOKENS } from '@/lib/ai/config'
import { safeParseJson } from '@/lib/ai/parser'

// ─────────────────────────────────────────
// 1. 페이지 fetch → 본문 추출
// ─────────────────────────────────────────

export interface FetchedPage {
  url: string
  title: string
  description?: string
  /** noscript·script·style·nav·footer 제거 후 정제된 본문 */
  text: string
  /** og:image / 첫 main img */
  ogImage?: string
  /** 페이지 언어 (html lang) */
  lang?: string
  /** 길이 절단 여부 */
  truncated: boolean
}

const MAX_TEXT_LEN = 30_000
const FETCH_TIMEOUT_MS = 15_000
const USER_AGENT =
  'UD-Ops-Ingester/0.1 (+https://underdogs.co.kr; contact: udpb@udimpact.ai)'

export async function fetchPageText(url: string): Promise<FetchedPage> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
  let html: string
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
      signal: ac.signal,
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`)
    }
    html = await res.text()
  } finally {
    clearTimeout(timer)
  }
  return extractFromHtml(html, url)
}

export function extractFromHtml(html: string, url: string): FetchedPage {
  const $ = cheerio.load(html)

  // 메타
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    url
  const description =
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    undefined
  const ogImage = $('meta[property="og:image"]').attr('content') || undefined
  const lang = $('html').attr('lang') || undefined

  // 본문 추출 — main → article → body 우선순위, 노이즈 제거
  $('script, style, noscript, nav, footer, header, aside, form, button, svg').remove()

  let root = $('main').first()
  if (!root.length) root = $('article').first()
  if (!root.length) root = $('body').first()

  // 줄바꿈 기반 정제
  const rawText = root
    .text()
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
  const collapsed = rawText.replace(/\n{3,}/g, '\n\n')

  const truncated = collapsed.length > MAX_TEXT_LEN
  const text = truncated ? collapsed.slice(0, MAX_TEXT_LEN) : collapsed

  return { url, title, description, text, ogImage, lang, truncated }
}

// ─────────────────────────────────────────
// 2. Sitemap 발견 (bulk import 도구용)
// ─────────────────────────────────────────

export async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const res = await fetch(sitemapUrl, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/xml,text/xml' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${sitemapUrl}`)
  const xml = await res.text()

  const urls: string[] = []
  // sitemap index (자식 sitemap 들 가리킴)
  const childSitemaps = [...xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1],
  )
  if (childSitemaps.length > 0) {
    // 재귀 fetch — 깊이 1단계만
    for (const child of childSitemaps.slice(0, 20)) {
      try {
        const childUrls = await fetchSitemapUrls(child)
        urls.push(...childUrls)
      } catch {
        // ignore 자식 실패
      }
    }
    return urls
  }
  // 일반 sitemap
  const locMatches = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)]
  for (const m of locMatches) urls.push(m[1])
  return urls
}

// ─────────────────────────────────────────
// 3. 자산 후보 추출 (AI)
// ─────────────────────────────────────────

export const AssetProposalSchema = z.object({
  name: z.string().min(2).max(120),
  category: z.enum([
    'methodology',
    'content',
    'product',
    'human',
    'data',
    'framework',
  ]),
  evidenceType: z.enum(['quantitative', 'structural', 'case', 'methodology']),
  applicableSections: z.array(
    z.enum([
      'proposal-background',
      'curriculum',
      'coaches',
      'budget',
      'impact',
      'org-team',
    ]),
  ),
  valueChainStage: z.enum([
    'impact',
    'input',
    'output',
    'activity',
    'outcome',
  ]),
  narrativeSnippet: z.string().min(20).max(500),
  keyNumbers: z.array(z.string()).max(8),
  keywords: z.array(z.string()).max(15),
  /** 자산화 자체가 부적절한 페이지 (회사 소개 인사말 등) — true 면 호출자가 스킵 */
  rejected: z.boolean().optional(),
  rejectionReason: z.string().optional(),
})

export type AssetProposal = z.infer<typeof AssetProposalSchema>

interface ProposeOptions {
  /** 추가 컨텍스트 (이 페이지 collection 의 성격 등) */
  hint?: string
}

export async function proposeAssetFromText(
  page: FetchedPage,
  opts: ProposeOptions = {},
): Promise<AssetProposal | null> {
  const prompt = buildProposalPrompt(page, opts)
  const r = await invokeAi({
    prompt,
    maxTokens: AI_TOKENS.STANDARD,
    temperature: 0.4,
    label: 'web-ingest-propose',
  })
  const raw = safeParseJson<unknown>(r.raw, 'web-ingest-propose')
  const validated = AssetProposalSchema.safeParse(raw)
  if (!validated.success) {
    console.warn('[web-ingester] zod 실패:', validated.error.message.slice(0, 200))
    return null
  }
  if (validated.data.rejected) return null
  return validated.data
}

function buildProposalPrompt(page: FetchedPage, opts: ProposeOptions): string {
  return `
당신은 언더독스 (UD) 의 콘텐츠 큐레이터입니다. 아래 웹 페이지를 보고
이것이 **언더독스 제안서 작성용 자산 (ContentAsset)** 으로 가치 있는지
판단하고, 가치 있으면 등록 후보로 JSON 을 만들어주세요.

[자산 가치 판단 기준]
다음 중 하나 이상에 해당하면 자산화 가치 있음:
  - 사회적 임팩트 사례 / 알럼나이 변화 스토리 (case + before/after)
  - 시장·산업 통계 또는 정책 수치 (quantitative + data)
  - 자체 보유 콘텐츠·프로덕트 (LMS · Coach Finder · IMPACT 모듈 등)
  - 검증된 프레임워크 / 방법론 (UOR · ACT · 5D 등)
  - 사업 실적·수주 사례 (case + structural)

자산화 부적절:
  - 단순 회사 소개 / 인사말 / 채용 공고
  - 외부 뉴스 단순 링크 모음
  - 너무 짧거나 (< 50자) 본문이 메타정보 위주

부적절하면 {"rejected": true, "rejectionReason": "..."} 만 반환.

[필드 가이드]
- category: 무엇으로 구성된 자산인가
  · methodology: 방법론·프레임워크 (IMPACT/ACT)
  · content: 교육 콘텐츠·강의·코스
  · product: 자체 프로덕트·서비스
  · human: 인적 자원 (코치 풀 등 — 개인 이름 X)
  · data: 데이터셋·통계·DB
  · framework: 추상 개념 프레임
- evidenceType: 제안서에서 어떻게 작동
  · quantitative: 수치/통계 인용
  · structural: 구조·프로세스 설명
  · case: 사례·스토리
  · methodology: 방법론 작동 원리
- applicableSections: 7 섹션 중 어디서 쓸 수 있는가 (1~3개 권장)
  proposal-background / curriculum / coaches / budget / impact / org-team
- valueChainStage: Impact Value Chain 5 단계 중
  impact / input / output / activity / outcome
- narrativeSnippet: 제안서 본문에 자연스럽게 들어갈 1~2 문장 한국어
  (페이지 본문 인용 X — 요약·재구성 필요)
- keyNumbers: 본문에 나오는 핵심 숫자·연도 ('25,000명', '2024년', '92%' 등)
- keywords: RFP 키워드 매칭용 (5~10개 권장)

[페이지]
URL: ${page.url}
Title: ${page.title}
${page.description ? `Description: ${page.description}\n` : ''}Lang: ${page.lang ?? 'unknown'}

본문:
${page.text}
${opts.hint ? `\n[추가 컨텍스트]\n${opts.hint}\n` : ''}

위 분석 후 JSON 만 출력. 마크다운 펜스 없이.
`.trim()
}

/**
 * Winning Reference — P9 consumption (2026-05-31)
 *
 * 학습한 당선 제안서 full-text(WinningProposalDoc)에서 본 RFP 와 유사한 1건을 골라
 * **목차(섹션 구조)와 핵심 발췌**를 추출 → 생성에 "당선본은 이렇게 썼다" 구조 레퍼런스로 투입.
 *
 * 목적: 베끼기 X. 당선 제안서의 **구성·논리 흐름·운영관리(과업관리·보고체계)·행사 구성**
 * 같은 골격을 학습해 1차본 구조를 당선 패턴에 맞춤. (사용자: '사업을 잘 만든다')
 *
 * PII/저작권 안전: 목차 + 짧은 발췌(≤1200자)만. 원문 통째 복사 X.
 */

import 'server-only'

import { prisma } from '@/lib/prisma'
import type { RfpParsed } from '@/lib/ai/parse-rfp'

export interface WinningReference {
  projectName: string
  channel: string | null
  /** 추출된 섹션 목차 (대제목·소제목) — 구조 레퍼런스 */
  outline: string[]
  /** 본 RFP 키워드와 가장 관련된 발췌 (≤1200자) */
  excerpt: string
  /** P11 RAG — 의미검색으로 가져온 당선 passage (여러 제안서 횡단) */
  passages: { projectName: string; sectionHint: string | null; text: string; similarity: number }[]
  /** 프롬프트에 바로 박는 블록 (없으면 '') */
  promptBlock: string
}

const EMPTY: WinningReference = { projectName: '', channel: null, outline: [], excerpt: '', passages: [], promptBlock: '' }

// ── P11 RAG — 당선 passage 의미검색 ──
interface ChunkRow {
  projectName: string
  channel: string | null
  sectionHint: string | null
  chunkText: string
  embedding: number[]
}
// 채널별 청크 임베딩 메모리 캐시 (TTL 10분) — 매 생성마다 49MB 재로드 방지
const chunkCache = new Map<string, { at: number; rows: ChunkRow[] }>()
const CACHE_TTL = 10 * 60 * 1000

async function loadChunks(channel?: string): Promise<ChunkRow[]> {
  const key = channel ?? '_all'
  const hit = chunkCache.get(key)
  // Date.now() 회피 불가 — 캐시 TTL 용. 서버 런타임에서만 동작(스크립트 1회성은 캐시 무의미).
  const now = Date.now()
  if (hit && now - hit.at < CACHE_TTL) return hit.rows
  const rows = (await prisma.winningProposalChunk.findMany({
    where: channel ? { channel } : {},
    select: { projectName: true, channel: true, sectionHint: true, chunkText: true, embedding: true },
  })) as ChunkRow[]
  chunkCache.set(key, { at: now, rows })
  return rows
}

/**
 * 본 RFP 질의와 의미 유사한 당선 passage top-K 검색 (여러 제안서 횡단).
 * 데이터(청크) 없거나 임베딩 실패 시 [] (호출부 graceful).
 */
export async function retrieveWinningPassages(
  query: string,
  opts: { channel?: 'B2G' | 'B2B' | 'renewal'; topK?: number } = {},
): Promise<{ projectName: string; sectionHint: string | null; text: string; similarity: number }[]> {
  const topK = opts.topK ?? 4
  try {
    if (!query || query.trim().length < 4) return []
    const rows = await loadChunks(opts.channel)
    if (rows.length === 0) return []
    const { generateEmbedding, cosineSimilarity } = await import('@/lib/ai/embedding')
    const qv = await generateEmbedding(query.slice(0, 8000))
    const scored = rows
      .filter((r) => Array.isArray(r.embedding) && r.embedding.length === qv.length)
      .map((r) => ({ r, sim: cosineSimilarity(qv, r.embedding) }))
      .sort((a, b) => b.sim - a.sim)
    // 같은 제안서 과다 편중 방지 — 제안서당 최대 2개
    const perDoc = new Map<string, number>()
    const out: { projectName: string; sectionHint: string | null; text: string; similarity: number }[] = []
    for (const { r, sim } of scored) {
      if (sim <= 0) break
      const n = perDoc.get(r.projectName) ?? 0
      if (n >= 2) continue
      perDoc.set(r.projectName, n + 1)
      out.push({ projectName: r.projectName, sectionHint: r.sectionHint, text: r.chunkText.slice(0, 900), similarity: Math.round(sim * 100) / 100 })
      if (out.length >= topK) break
    }
    return out
  } catch (e) {
    console.warn('[winning-reference] passage 검색 실패 → skip:', e instanceof Error ? e.message : e)
    return []
  }
}

/** 당선 제안서 목차 추출 — '01. / 1. / 가. / 제N장 / ■' 패턴 */
function extractOutline(text: string): string[] {
  const lines = text.split('\n')
  const out: string[] = []
  const headRe = /^\s*((?:0?\d{1,2}\.)|(?:[가-힣]\.)|(?:제\s*\d+\s*[장절])|(?:[ⅠⅡⅢⅣⅤ]\.)|[■□●◆▶])\s*\S/
  for (const ln of lines) {
    const t = ln.trim()
    if (t.length < 4 || t.length > 40) continue
    if (headRe.test(t)) {
      out.push(t.slice(0, 40))
      if (out.length >= 24) break
    }
  }
  // 중복 제거
  return Array.from(new Set(out))
}

/** 키워드가 가장 많이 등장하는 구간(±600자) 발췌 */
function bestExcerpt(text: string, keywords: string[]): string {
  if (keywords.length === 0) return text.slice(0, 1200)
  let bestIdx = -1
  let bestHits = 0
  const lower = text.toLowerCase()
  for (const kw of keywords) {
    const k = kw.toLowerCase().trim()
    if (k.length < 2) continue
    const idx = lower.indexOf(k)
    if (idx >= 0) {
      // 그 주변 1200자 윈도우의 키워드 적중 수
      const win = lower.slice(Math.max(0, idx - 200), idx + 1000)
      const hits = keywords.filter((q) => win.includes(q.toLowerCase().trim())).length
      if (hits > bestHits) { bestHits = hits; bestIdx = idx }
    }
  }
  if (bestIdx < 0) return text.slice(0, 1200)
  return text.slice(Math.max(0, bestIdx - 200), bestIdx + 1000).trim().slice(0, 1200)
}

/**
 * 본 RFP 와 가장 유사한 학습 당선 제안서 1건의 구조 레퍼런스 반환.
 * 데이터 없으면 EMPTY (호출부 graceful skip).
 */
export async function findWinningReference(
  rfp: RfpParsed,
  opts: { channel?: 'B2G' | 'B2B' | 'renewal' } = {},
): Promise<WinningReference> {
  try {
    const keywords = (rfp.keywords ?? []).slice(0, 8)
    // 채널 우선 매칭 (있으면) — 없으면 전체에서. 충분한 본문만(lowText 제외).
    const candidates = await prisma.winningProposalDoc.findMany({
      where: {
        won: true,
        charCount: { gt: 1500 },
        ...(opts.channel ? { channel: opts.channel } : {}),
        ...(keywords.length > 0
          ? {
              OR: keywords.flatMap((kw) => [
                { projectName: { contains: kw, mode: 'insensitive' as const } },
                { fullText: { contains: kw, mode: 'insensitive' as const } },
              ]),
            }
          : {}),
      },
      select: { projectName: true, channel: true, fullText: true },
      take: 8,
    })
    if (candidates.length === 0) return EMPTY

    // 키워드 적중 수로 스코어
    const scored = candidates
      .map((c) => {
        const lower = c.fullText.toLowerCase()
        const hits = keywords.reduce((a, kw) => a + (lower.includes(kw.toLowerCase().trim()) ? 1 : 0), 0)
        return { c, hits }
      })
      .sort((a, b) => b.hits - a.hits)
    const top = scored[0].c

    const outline = extractOutline(top.fullText)
    const excerpt = bestExcerpt(top.fullText, keywords)

    // P11 RAG — 의미검색 passage (키워드 매칭 보완: 여러 당선본 횡단 관련 구절)
    const query = [rfp.projectName, ...(rfp.objectives ?? []).slice(0, 3), ...keywords].filter(Boolean).join(' ')
    const passages = await retrieveWinningPassages(query, { channel: opts.channel, topK: 4 })

    const passageBlock = passages.length > 0
      ? '의미검색 당선 구절(여러 제안서):\n' +
        passages.map((p, i) => `  ${i + 1}. [${p.projectName.slice(0, 24)}${p.sectionHint ? ` · ${p.sectionHint.slice(0, 16)}` : ''}] ${p.text.slice(0, 300)}`).join('\n')
      : ''

    const promptBlock = outline.length > 0 || excerpt || passageBlock
      ? [
          `[유사 당선 제안서 참고 — "${top.projectName}" (${top.channel ?? '채널 미상'}), 베끼지 말고 흐름·구성·표현만 학습]`,
          outline.length > 0 ? `목차: ${outline.join(' / ')}` : '',
          excerpt ? `핵심 발췌: ${excerpt}` : '',
          passageBlock,
        ].filter(Boolean).join('\n')
      : ''

    return { projectName: top.projectName, channel: top.channel, outline, excerpt, passages, promptBlock }
  } catch (e) {
    console.warn('[winning-reference] 조회 실패 → skip:', e instanceof Error ? e.message : e)
    return EMPTY
  }
}

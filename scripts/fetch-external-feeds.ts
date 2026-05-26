/**
 * scripts/fetch-external-feeds.ts — W29 (Phase D, Auto-Ingest)
 *
 * 외부 공개 source 에서 신규 RFP·공고 자동 fetch.
 *
 * 지원 source (확장 가능):
 *   1. Bizinfo (bizinfo.go.kr) — 공공 지원사업 공고 RSS·HTML
 *   2. 정부 통계 (통계청 공개 API) — 추가 가능
 *   3. K-Startup (k-startup.go.kr) — 창업 지원 공고
 *
 * 동작:
 *   1. 등록된 source 각각 fetch
 *   2. 최근 7일 이내 새 공고만 추출
 *   3. IngestionJob (kind='external-rfp', status='queued') 로 저장
 *   4. metadata 에 source · publishedAt · title · url · summary 저장
 *   5. dry-run 모드 지원
 *
 * 인증:
 *   - Bizinfo RSS: 인증 불필요 (공개)
 *   - 다른 API 가 필요해지면 BIZINFO_API_KEY 환경변수 추가
 *
 * 사용:
 *   npx tsx scripts/fetch-external-feeds.ts --dry-run
 *   npx tsx scripts/fetch-external-feeds.ts --source bizinfo
 *   npx tsx scripts/fetch-external-feeds.ts --since-hours 48
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

const argv = process.argv.slice(2)
function arg(flag: string, dflt: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const DRY_RUN = argv.includes('--dry-run')
const SOURCE_FILTER = arg('--source', '')
const SINCE_HOURS = parseInt(arg('--since-hours', '168'), 10) // 1주
const MAX_PER_SOURCE = parseInt(arg('--max-per-source', '30'), 10)

interface ExternalFeedItem {
  source: string
  externalId: string // dedupe 키
  title: string
  url: string
  summary?: string
  publishedAt?: Date
  meta?: Record<string, unknown>
}

interface FeedSource {
  name: string
  fetch: (sinceMs: number, maxItems: number) => Promise<ExternalFeedItem[]>
}

// ─────────────────────────────────────────
// 1. Bizinfo (bizinfo.go.kr) — 공개 RSS
// ─────────────────────────────────────────

const BIZINFO_RSS_URL = 'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/rss.do'

async function fetchBizinfo(sinceMs: number, maxItems: number): Promise<ExternalFeedItem[]> {
  const cutoff = Date.now() - sinceMs
  try {
    const res = await fetch(BIZINFO_RSS_URL, {
      headers: {
        'User-Agent': 'UD-Brain/1.0 (+https://ud-planner.vercel.app)',
        Accept: 'application/rss+xml, application/xml',
      },
      // 30초 타임아웃
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const xml = await res.text()

    // 간단 RSS 파서 (의존성 X)
    const items: ExternalFeedItem[] = []
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g)
    for (const m of itemMatches) {
      if (items.length >= maxItems) break
      const block = m[1]
      const title = pickXml(block, 'title')
      const link = pickXml(block, 'link')
      const desc = pickXml(block, 'description')
      const pubDate = pickXml(block, 'pubDate')
      if (!title || !link) continue
      const publishedAt = pubDate ? new Date(pubDate) : undefined
      if (publishedAt && publishedAt.getTime() < cutoff) continue
      // externalId = URL 경로의 마지막 segment 또는 query 의 pblancId
      const idMatch = link.match(/pblancId=([\w\d-]+)/) || link.match(/\/(\w+)$/)
      const externalId = idMatch ? idMatch[1] : link
      items.push({
        source: 'bizinfo',
        externalId,
        title: cleanText(title),
        url: link,
        summary: cleanText(desc || '').slice(0, 800),
        publishedAt,
      })
    }
    return items
  } catch (e) {
    console.error(`  ✗ bizinfo fetch fail: ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

// ─────────────────────────────────────────
// 2. K-Startup (k-startup.go.kr) — RSS placeholder
// ─────────────────────────────────────────

const KSTARTUP_RSS_URL = 'https://www.k-startup.go.kr/api/portal/rss/rss_main.do?bbs_id=announce'

async function fetchKStartup(sinceMs: number, maxItems: number): Promise<ExternalFeedItem[]> {
  const cutoff = Date.now() - sinceMs
  try {
    const res = await fetch(KSTARTUP_RSS_URL, {
      headers: {
        'User-Agent': 'UD-Brain/1.0',
        Accept: 'application/rss+xml, application/xml',
      },
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()

    const items: ExternalFeedItem[] = []
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g)
    for (const m of itemMatches) {
      if (items.length >= maxItems) break
      const block = m[1]
      const title = pickXml(block, 'title')
      const link = pickXml(block, 'link')
      const desc = pickXml(block, 'description')
      const pubDate = pickXml(block, 'pubDate')
      if (!title || !link) continue
      const publishedAt = pubDate ? new Date(pubDate) : undefined
      if (publishedAt && publishedAt.getTime() < cutoff) continue
      const externalId = link
      items.push({
        source: 'kstartup',
        externalId,
        title: cleanText(title),
        url: link,
        summary: cleanText(desc || '').slice(0, 800),
        publishedAt,
      })
    }
    return items
  } catch (e) {
    console.error(`  ✗ kstartup fetch fail: ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function pickXml(block: string, tag: string): string {
  // CDATA 또는 plain
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i')
  const m = block.match(re)
  return m ? m[1].trim() : ''
}

function cleanText(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ') // strip HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// ─────────────────────────────────────────
// Source registry
// ─────────────────────────────────────────

const SOURCES: FeedSource[] = [
  { name: 'bizinfo', fetch: fetchBizinfo },
  { name: 'kstartup', fetch: fetchKStartup },
]

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

async function main() {
  const { prisma } = await import('../src/lib/prisma')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('▶ W29 — External Feed Auto-Fetch')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(
    `Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'} · since=${SINCE_HOURS}h · max-per-source=${MAX_PER_SOURCE}`,
  )
  console.log(`Sources: ${SOURCE_FILTER || 'all'}`)
  console.log('')

  const sinceMs = SINCE_HOURS * 60 * 60 * 1000

  // 1. 각 source fetch
  const allItems: ExternalFeedItem[] = []
  for (const src of SOURCES) {
    if (SOURCE_FILTER && src.name !== SOURCE_FILTER) continue
    console.log(`📡 fetching ${src.name}...`)
    const startedAt = Date.now()
    const items = await src.fetch(sinceMs, MAX_PER_SOURCE)
    const elapsed = Math.round((Date.now() - startedAt) / 1000)
    console.log(`   ${src.name}: ${items.length} items · ${elapsed}s`)
    allItems.push(...items)
  }

  console.log('')
  console.log(`📦 총 ${allItems.length} 신규 후보`)

  if (allItems.length === 0) {
    console.log('  (신규 공고 없음)')
    await prisma.$disconnect()
    return
  }

  // 2. dedupe — IngestionJob.metadata.externalId 와 비교
  const existingJobs = await prisma.ingestionJob.findMany({
    where: {
      kind: 'external-rfp',
      // 최근 30일 이내 만
      uploadedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    select: { metadata: true },
  })
  const existingExternalIds = new Set<string>()
  for (const j of existingJobs) {
    const meta = (j.metadata as Record<string, unknown>) || {}
    if (meta.externalId) existingExternalIds.add(String(meta.externalId))
  }
  const newItems = allItems.filter((it) => !existingExternalIds.has(it.externalId))
  console.log(`📦 신규 (dedupe 후): ${newItems.length}건`)
  console.log('')

  // 3. sample 출력
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📋 신규 공고 sample (top 10)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const it of newItems.slice(0, 10)) {
    const pubDate = it.publishedAt
      ? it.publishedAt.toISOString().slice(0, 10)
      : '-'
    console.log(`\n▶ [${it.source.padEnd(9)}] ${pubDate} ${it.title.slice(0, 80)}`)
    console.log(`   ${it.url}`)
    if (it.summary) console.log(`   ${it.summary.slice(0, 120)}...`)
  }
  if (newItems.length > 10) console.log(`\n  ... +${newItems.length - 10} more`)
  console.log('')

  if (DRY_RUN) {
    console.log('✓ dry-run — DB 변경 X')
    await prisma.$disconnect()
    return
  }

  // 4. IngestionJob 저장
  let saved = 0
  let failed = 0
  for (const it of newItems) {
    try {
      await prisma.ingestionJob.create({
        data: {
          kind: 'external-rfp',
          sourceUrl: it.url,
          status: 'queued',
          uploadedBy: 'cron-w29',
          metadata: {
            source: it.source,
            externalId: it.externalId,
            title: it.title,
            summary: it.summary ?? '',
            publishedAt: it.publishedAt?.toISOString() ?? null,
            ...(it.meta ?? {}),
          },
        },
      })
      saved++
    } catch (e) {
      failed++
      console.error(
        `  ✗ save fail ${it.externalId}: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`,
      )
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Fetched:    ${allItems.length}`)
  console.log(`New:        ${newItems.length}`)
  console.log(`Saved:      ${saved}`)
  console.log(`Failed:     ${failed}`)
  console.log('')
  console.log('✓ external feed cron 완료')
  console.log('  → 이어서: npx tsx scripts/cron-rfp-concept.ts (Concept 매핑 + 신규 도메인 감지)')

  await prisma.$disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e))
  process.exit(1)
})

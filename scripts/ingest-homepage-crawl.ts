/**
 * scripts/ingest-homepage-crawl.ts — Wave N2 보조 (2026-05-15)
 *
 * sitemap.xml 이 없는 사이트용. 홈페이지 → 내부 링크 추출 → 일괄 ingest.
 *
 * 사용:
 *   npx tsx scripts/ingest-homepage-crawl.ts \
 *     --root https://underdogs.global/ko \
 *     --limit 30 \
 *     --auto-save \
 *     --hint "언더독스 글로벌 한국 사이트"
 *
 * 깊이 1 — root 페이지에서 추출한 같은 호스트 링크만.
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })
// .env.local 의 E2E mock 모드를 강제로 끔 (실제 Gemini 호출)
delete process.env.PLAYWRIGHT_MOCK_AI
delete process.env.E2E_SECRET

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as cheerio from 'cheerio'
import {
  fetchPageText,
  proposeAssetFromText,
} from '../src/lib/ingest/web-ingester'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

interface Args {
  root: string
  limit: number
  autoSave: boolean
  hint?: string
  include?: string
  exclude?: string
  dryRun: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`)
    if (i < 0) return undefined
    return argv[i + 1]
  }
  const has = (name: string) => argv.includes(`--${name}`)
  const root = get('root')
  if (!root) {
    console.error('사용법: --root <url> [--limit 30] [--auto-save] [--hint "..."] [--include regex] [--exclude regex] [--dry-run]')
    process.exit(1)
  }
  return {
    root,
    limit: Number(get('limit') ?? '30'),
    autoSave: has('auto-save'),
    hint: get('hint'),
    include: get('include'),
    exclude: get('exclude'),
    dryRun: has('dry-run'),
  }
}

const USER_AGENT =
  'UD-Ops-Ingester/0.1 (+https://underdogs.co.kr; contact: udpb@udimpact.ai)'

async function fetchHomepageLinks(rootUrl: string): Promise<string[]> {
  const res = await fetch(rootUrl, {
    headers: { 'user-agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${rootUrl}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  const base = new URL(rootUrl)
  const host = base.host
  const seen = new Set<string>()

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    try {
      const u = new URL(href, base)
      if (u.host !== host) return // 외부 링크 제외
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return
      // 정렬 + 쿼리 제거 (anchor 도 제거)
      u.hash = ''
      const clean = u.toString().replace(/\/$/, '')
      if (clean === rootUrl.replace(/\/$/, '')) return // 자기 자신 제외
      seen.add(clean)
    } catch {
      // ignore
    }
  })
  return Array.from(seen)
}

async function main() {
  const args = parseArgs()
  console.log('▶ Homepage Crawl 시작')
  console.log('  root      :', args.root)
  console.log('  limit     :', args.limit)
  console.log('  auto-save :', args.autoSave)
  console.log('  dry-run   :', args.dryRun)
  console.log('  include   :', args.include ?? '(no filter)')
  console.log('  exclude   :', args.exclude ?? '(no filter)')
  console.log('  hint      :', args.hint ?? '(none)')
  console.log('')

  let urls = await fetchHomepageLinks(args.root)
  console.log(`◇ 홈페이지에서 ${urls.length}개 내부 링크 추출`)

  if (args.include) {
    const re = new RegExp(args.include)
    urls = urls.filter((u) => re.test(u))
  }
  if (args.exclude) {
    const re = new RegExp(args.exclude)
    urls = urls.filter((u) => !re.test(u))
  }
  console.log(`  filter 후 : ${urls.length}개`)
  const total = urls.length
  urls = urls.slice(0, args.limit)
  console.log(`  처리할 것: ${urls.length}개`)
  console.log('')

  let saved = 0
  let proposed = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    const prefix = `[${i + 1}/${urls.length}]`
    try {
      const page = await fetchPageText(url)
      if (!page.text || page.text.length < 100) {
        console.log(`${prefix} ⊘ ${url} — 본문 너무 짧음 (${page.text.length}자)`)
        skipped++
        continue
      }
      const proposal = await proposeAssetFromText(page, { hint: args.hint })
      if (!proposal) {
        console.log(`${prefix} ⊘ ${url} — AI 부적절 판단`)
        skipped++
        continue
      }

      if (args.dryRun) {
        console.log(`${prefix} ▶ ${url}`)
        console.log(`    [DRY] ${proposal.name} (${proposal.category}·${proposal.evidenceType})`)
        proposed++
        continue
      }

      if (args.autoSave) {
        const created = await prisma.contentAsset.create({
          data: {
            name: proposal.name,
            category: proposal.category,
            applicableSections: proposal.applicableSections as unknown as object,
            valueChainStage: proposal.valueChainStage,
            evidenceType: proposal.evidenceType,
            keywords: proposal.keywords as unknown as object,
            narrativeSnippet: proposal.narrativeSnippet,
            keyNumbers: proposal.keyNumbers as unknown as object,
            status: 'developing',
            version: 1,
            sourceReferences: [url] as unknown as object,
            lastReviewedAt: new Date(),
          },
          select: { id: true },
        })
        console.log(`${prefix} ✓ ${url}`)
        console.log(`    saved: ${proposal.name} (id=${created.id})`)
        saved++
      } else {
        console.log(`${prefix} ▶ ${url}`)
        console.log(`    proposal: ${proposal.name}`)
        proposed++
      }

      await new Promise((r) => setTimeout(r, 300))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`${prefix} ✗ ${url} — ${msg.slice(0, 120)}`)
      errors++
    }
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Homepage Crawl 완료')
  console.log(`  found url    : ${total}`)
  console.log(`  saved        : ${saved}`)
  console.log(`  proposed     : ${proposed} (dry-run)`)
  console.log(`  skipped      : ${skipped}`)
  console.log(`  errors       : ${errors}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('치명적 에러:', err)
  prisma.$disconnect()
  process.exit(1)
})

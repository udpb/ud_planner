/**
 * scripts/ingest-underdogs.ts — Wave N2 (2026-05-15)
 *
 * underdogs.global (또는 다른 sitemap 기반 사이트) 의 페이지를
 * 일괄 ingestion → ContentAsset (status='developing') 으로 저장.
 *
 * 사용법:
 *   npx tsx scripts/ingest-underdogs.ts \
 *     --sitemap https://underdogs.global/sitemap.xml \
 *     --limit 30 \
 *     --include "/case|/impact|/program" \
 *     --exclude "/login|/admin" \
 *     --auto-save
 *
 * 저장된 자산은 status=developing 으로 들어가 /admin/content-hub 에서
 * 담당자가 검토 후 status=stable 로 승격. 시드 자산을 덮어쓰지 않음.
 *
 * 환경변수 필요: DATABASE_URL · GOOGLE_GENERATIVE_AI_KEY · ANTHROPIC_API_KEY (fallback)
 */

import { config as loadDotenv } from 'dotenv'
loadDotenv({ path: '.env' })
loadDotenv({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'
import {
  fetchPageText,
  fetchSitemapUrls,
  proposeAssetFromText,
} from '../src/lib/ingest/web-ingester'

const prisma = new PrismaClient()

interface Args {
  sitemap: string
  limit: number
  include?: string
  exclude?: string
  autoSave: boolean
  hint?: string
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

  const sitemap = get('sitemap')
  if (!sitemap) {
    console.error('사용법: --sitemap <url> [--limit 30] [--include regex] [--exclude regex] [--auto-save] [--hint "..."] [--dry-run]')
    process.exit(1)
  }
  return {
    sitemap,
    limit: Number(get('limit') ?? '30'),
    include: get('include'),
    exclude: get('exclude'),
    autoSave: has('auto-save'),
    hint: get('hint'),
    dryRun: has('dry-run'),
  }
}

async function main() {
  const args = parseArgs()
  console.log('▶ Ingest 시작')
  console.log('  sitemap   :', args.sitemap)
  console.log('  limit     :', args.limit)
  console.log('  include   :', args.include ?? '(no filter)')
  console.log('  exclude   :', args.exclude ?? '(no filter)')
  console.log('  auto-save :', args.autoSave)
  console.log('  dry-run   :', args.dryRun)
  console.log('  hint      :', args.hint ?? '(none)')
  console.log('')

  // 1) sitemap → url
  let urls = await fetchSitemapUrls(args.sitemap)
  if (args.include) {
    const re = new RegExp(args.include)
    urls = urls.filter((u) => re.test(u))
  }
  if (args.exclude) {
    const re = new RegExp(args.exclude)
    urls = urls.filter((u) => !re.test(u))
  }
  const total = urls.length
  urls = urls.slice(0, args.limit)
  console.log(`◇ sitemap 총 ${total} url (filter 후), ${urls.length}개 처리`)
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
        console.log(`${prefix} ⊘ ${url} — 본문 너무 짧음`)
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

      await new Promise((r) => setTimeout(r, 250))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`${prefix} ✗ ${url} — ${msg.slice(0, 120)}`)
      errors++
    }
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Ingest 완료')
  console.log(`  saved   : ${saved}`)
  console.log(`  proposed: ${proposed} (dry-run)`)
  console.log(`  skipped : ${skipped}`)
  console.log(`  errors  : ${errors}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('치명적 에러:', err)
  prisma.$disconnect()
  process.exit(1)
})
